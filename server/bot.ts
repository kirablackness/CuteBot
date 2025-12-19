import { Telegraf, File } from "telegraf";
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
• Video → sent as file (up to 2GB)
• Audio → sent as music (up to 50MB)

🎯 Just send a link!

⏱ Limit: 1 request every ${COOLDOWN_SECONDS} seconds

Commands:
/start - start
/help - help
/test - test links
/status - check status`);
  });

  bot.command("help", (ctx) => {
    ctx.reply(`📖 How to use:

1. Send link from:
   • Yandex.Music: music.yandex.ru/album/.../track/...
   • YouTube: youtube.com/watch?v=... or youtu.be/...
   • TikTok: tiktok.com/@user/video/...
   • Instagram: instagram.com/reel/...

2. Wait 1-5 minutes
3. Get file in Telegram
`);
  });

  bot.command("test", (ctx) => {
    ctx.reply(`🧪 Test links:

🎵 Yandex.Music:
https://music.yandex.ru/album/6478262/track/57446829

🎬 YouTube:
https://youtu.be/dQw4w9WgXcQ

📱 TikTok:
https://www.tiktok.com/@willsmith/video/7078969024029322538`);
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

    const userId = ctx.from.id;
    const text = ctx.message.text;
    const chatId = ctx.chat.id;

    // Cooldown check
    const now = Math.floor(Date.now() / 1000);
    const lastRequest = userCooldown.get(userId);

    if (lastRequest && now - lastRequest < COOLDOWN_SECONDS) {
      const waitTime = COOLDOWN_SECONDS - (now - lastRequest);
      await ctx.reply(`⏳ Wait ${waitTime} seconds`);
      return;
    }

    // Simple concurrency check (per instance)
    if (isDownloading) {
      await ctx.reply("📥 Already downloading. Please wait...");
      return;
    }

    userCooldown.set(userId, now);

    // Find URL
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlRegex);

    if (!urls) {
      await ctx.reply("❌ No links found");
      return;
    }

    const url = urls[0];

    // Check platform
    const platform = detectPlatform(url);
    if (!platform) {
      await ctx.reply("❌ Supported: Yandex.Music, YouTube, TikTok, Instagram");
      return;
    }

    isDownloading = true;
    const statusMsg = await ctx.reply(`🔍 Detecting ${platform}...`);

    try {
      // Step 1: Info
      await ctx.telegram.editMessageText(
        chatId,
        statusMsg.message_id,
        undefined,
        "📊 Getting info...",
      );

      // Step 2: Download
      await ctx.telegram.editMessageText(
        chatId,
        statusMsg.message_id,
        undefined,
        "⏬ Downloading...",
      );

      const result = await downloadMedia(url, platform);

      if (!result.success || !result.filepath) {
        throw new Error(result.error || "Download failed");
      }

      // Step 3: Send
      const stats = fs.statSync(result.filepath);
      const fileSizeMB = stats.size / (1024 * 1024);

      await ctx.telegram.editMessageText(
        chatId,
        statusMsg.message_id,
        undefined,
        `✅ ${fileSizeMB.toFixed(1)}MB\n🚀 Sending...`,
      );

      // Log to DB
      try {
        await storage.createDownload({
          platform,
          url,
          fileSizeMb: fileSizeMB.toFixed(1),
          status: "completed",
        });
      } catch (e) {
        console.error("Failed to log download to DB:", e);
      }

      const isAudio =
        platform === "yandexmusic" || result.filepath.endsWith(".mp3");

      if (isAudio) {
        await ctx.replyWithAudio(new File(result.filepath), {
          caption: `🎵 ${result.title || "Track"}\n📦 ${fileSizeMB.toFixed(1)}MB\n🔗 ${url}`,
          // reply_to_message_id: ctx.message.message_id,
        });
      } else {
        await ctx.replyWithDocument(new File(result.filepath), {
          caption: `🎬 ${result.title || "Video"}\n📦 ${fileSizeMB.toFixed(1)}MB\n🔗 ${url}`,

          // reply_to_message_id: ctx.message.message_id,
        });
      }

      // Cleanup
      await ctx.telegram.deleteMessage(chatId, statusMsg.message_id);
      fs.unlinkSync(result.filepath);

      await ctx.reply("✅ Done!");
    } catch (error: any) {
      console.error("Error:", error);
      await ctx.telegram.editMessageText(
        chatId,
        statusMsg.message_id,
        undefined,
        `❌ Error: ${error.message}`,
      );

      try {
        await storage.createDownload({
          platform,
          url,
          status: "failed",
        });
      } catch (e) {
        console.error(e);
      }
    } finally {
      isDownloading = false;
    }
  });

  bot
    .launch()
    .then(() => console.log("✅ Bot started!"))
    .catch((err) => console.error("❌ Bot launch failed:", err));

  // Enable graceful stop
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

function detectPlatform(url: string): string | null {
  if (url.includes("music.yandex.ru") || url.includes("music.yandex.com"))
    return "yandexmusic";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("tiktok.com")) return "tiktok";
  if (url.includes("instagram.com")) return "instagram";
  return null;
}

async function downloadMedia(url: string, platform: string) {
  const timestamp = Date.now();
  const ext = platform === "yandexmusic" ? "mp3" : "mp4";
  const filepath = path.join(TEMP_DIR, `${platform}_${timestamp}.${ext}`);

  try {
    let command;

    if (platform === "yandexmusic") {
      command = `yt-dlp --extract-audio --audio-format mp3 --audio-quality 320K -o "${filepath}" "${url}"`;
    } else if (platform === "youtube") {
      command = `yt-dlp -f "best[height<=1080]" -o "${filepath}" "${url}"`;
    } else {
      command = `yt-dlp -f "best" -o "${filepath}" "${url}"`;
    }

    console.log("Running:", command);
    await execAsync(command, { timeout: 300000 });

    // Get title
    const { stdout: info } = await execAsync(
      `yt-dlp --get-title --no-warnings "${url}"`,
    );

    return {
      success: true,
      filepath: filepath,
      title: info.trim() || "File",
    };
  } catch (error: any) {
    console.error("Download error:", error);

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    return {
      success: false,
      error: error.message.includes("Private")
        ? "Content is private"
        : error.message.includes("Not found")
          ? "Not found"
          : "Download failed",
    };
  }
}
