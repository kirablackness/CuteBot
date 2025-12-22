import { Telegraf, Input } from "telegraf";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";
import { storage } from "./storage";

const execAsync = promisify(exec);

// ============ SETTINGS ============
const TEMP_DIR = os.tmpdir();
const COOLDOWN_SECONDS = 30;
const userCooldown = new Map();
let isDownloading = false;

export function setupBot() {
  if (!process.env.BOT_TOKEN) {
    console.log("Skipping bot setup: BOT_TOKEN not found");
    return;
  }

  const bot = new Telegraf(process.env.BOT_TOKEN);

  // ============ COMMANDS ============
  bot.command("start", (ctx) => {
    ctx.reply(`🎬 Media Download Bot

📦 Supports:
🎵 Yandex.Music (tracks, albums)
🎬 YouTube (video, shorts)
📱 TikTok (all videos)
📸 Instagram (reels, posts)

⚡ Automatic detection:
• Just send a link!
• Or type a song name to search on YouTube.

⏱ Limit: 1 request every ${COOLDOWN_SECONDS} seconds

Commands:
/start - start
/help - help
/search <name> - search song
/status - check status`);
  });

  bot.command("help", (ctx) => {
    ctx.reply(`📖 How to use:

1. Send link from:
   • Yandex.Music, YouTube, TikTok, Instagram
   
2. Or just type the song name (e.g. "Imagine Dragons Believer")

👥 Group Chat:
Add the bot to a group and give it admin permissions. It will automatically detect links.

⚠️ Yandex.Music note:
If a link doesn't work, try searching by name instead.`);
  });

  bot.command("search", async (ctx) => {
    const query = ctx.message.text.split(" ").slice(1).join(" ");
    if (!query) return ctx.reply("Введите название: /search <песня>");
    return handleDownload(ctx, query, "search");
  });

  bot.command("status", async (ctx) => {
    try {
      const { stdout } = await execAsync("yt-dlp --version");
      ctx.reply(
        `✅ Bot working\n📦 yt-dlp: ${stdout.trim()}\n👥 Active users: ${userCooldown.size}`,
      );
    } catch (err) {
      ctx.reply("⚠️ yt-dlp not installed");
    }
  });

  // ============ MAIN HANDLER ============
  bot.on("text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;

    const text = ctx.message.text;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlRegex);

    if (urls) {
      const url = urls[0];
      const platform = detectPlatform(url);
      if (platform) {
        return handleDownload(ctx, url, platform);
      } else if (ctx.chat.type === "private") {
        await ctx.reply("❌ Unsupported platform");
      }
    } else if (ctx.chat.type === "private") {
      // Treat text as search query in private chat
      return handleDownload(ctx, text, "search");
    }
  });

  async function handleDownload(ctx: any, input: string, platform: string) {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    const now = Math.floor(Date.now() / 1000);
    const lastRequest = userCooldown.get(userId);

    if (lastRequest && now - lastRequest < COOLDOWN_SECONDS) {
      if (ctx.chat.type === "private") {
        await ctx.reply(`⏳ Wait ${COOLDOWN_SECONDS - (now - lastRequest)}s`);
      }
      return;
    }

    if (isDownloading) {
      if (ctx.chat.type === "private") {
        await ctx.reply("📥 Already downloading. Please wait...");
      }
      return;
    }

    userCooldown.set(userId, now);
    isDownloading = true;
    
    const statusMsg = await ctx.reply(platform === "search" ? "🔍 Searching..." : `🔍 Detecting ${platform}...`, {
      reply_to_message_id: ctx.message.message_id
    });

    try {
      await ctx.telegram.editMessageText(chatId, statusMsg.message_id, undefined, "⏬ Downloading...");
      
      const result = await downloadMedia(input, platform);
      if (!result.success || !result.filepath) throw new Error(result.error || "Failed");

      const stats = fs.statSync(result.filepath);
      const fileSizeMB = stats.size / (1024 * 1024);

      await ctx.telegram.editMessageText(chatId, statusMsg.message_id, undefined, `🚀 Sending ${fileSizeMB.toFixed(1)}MB...`);

      // Log to DB
      try {
        await storage.createDownload({
          platform: platform === "search" ? "youtube" : platform,
          url: input,
          fileSizeMb: fileSizeMB.toFixed(1),
          status: "completed",
        });
      } catch (e) { console.error(e); }

      const isAudio = platform === "yandexmusic" || platform === "search" || result.filepath.endsWith(".mp3");

      if (isAudio) {
        await ctx.replyWithAudio(Input.fromLocalFile(result.filepath), {
          caption: `🎵 ${result.title}\n📦 ${fileSizeMB.toFixed(1)}MB\n🔗 ${input.startsWith('http') ? input : 'Search'}`,
        });
      } else {
        await ctx.replyWithVideo(Input.fromLocalFile(result.filepath), {
          caption: `🎬 ${result.title}\n📦 ${fileSizeMB.toFixed(1)}MB\n🔗 ${input}`,
        });
      }

      await ctx.telegram.deleteMessage(chatId, statusMsg.message_id);
      fs.unlinkSync(result.filepath);
    } catch (error: any) {
      console.error("Error:", error);
      await ctx.telegram.editMessageText(chatId, statusMsg.message_id, undefined, `❌ Error: ${error.message}`);
      try {
        await storage.createDownload({ platform, url: input, status: "failed" });
      } catch (e) { console.error(e); }
    } finally {
      isDownloading = false;
    }
  }

  bot.launch()
    .then(() => console.log("✅ Bot started!"))
    .catch((err) => console.error("❌ Bot launch failed:", err));

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

function detectPlatform(url: string): string | null {
  if (url.includes("music.yandex.ru") || url.includes("music.yandex.com")) return "yandexmusic";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("tiktok.com")) return "tiktok";
  if (url.includes("instagram.com")) return "instagram";
  return null;
}

async function downloadMedia(input: string, platform: string) {
  const timestamp = Date.now();
  const isAudio = platform === "yandexmusic" || platform === "search";
  const ext = isAudio ? "mp3" : "mp4";
  const filepath = path.join(TEMP_DIR, `${platform}_${timestamp}.${ext}`);

  try {
    let command;
    if (platform === "search") {
      command = `yt-dlp "ytsearch1:${input}" --extract-audio --audio-format mp3 --audio-quality 320K -o "${filepath}"`;
    } else if (platform === "yandexmusic") {
      const cookieFile = path.join(process.cwd(), "cookies.txt");
      const cookieParam = fs.existsSync(cookieFile) ? `--cookies "${cookieFile}"` : "";
      command = `yt-dlp ${cookieParam} --extract-audio --audio-format mp3 --audio-quality 320K -o "${filepath}" "${input}"`;
    } else if (platform === "youtube") {
      command = `yt-dlp -f "best[height<=1080]" -o "${filepath}" "${input}"`;
    } else {
      command = `yt-dlp -f "best" -o "${filepath}" "${input}"`;
    }

    console.log("Running:", command);
    await execAsync(command, { timeout: 300000 });

    const { stdout: info } = await execAsync(`yt-dlp --get-title --no-warnings ${platform === "search" ? `"ytsearch1:${input}"` : `"${input}"`}`);

    return { success: true, filepath, title: info.trim() || "Media" };
  } catch (error: any) {
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    return { success: false, error: "Download failed. Try search by name instead." };
  }
}
