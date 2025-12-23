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

const BOT_USERNAME = (process.env.BOT_USERNAME || "lashmedia_pro_bot")
  .replace(/^@/, "")
  .toLowerCase();

const GROUP_SEARCH_PREFIX = "!"; // например: "!олег газманов парами"

function extractMentionQuery(text: string) {
  if (!BOT_USERNAME) return null;
  const re = new RegExp(`@${BOT_USERNAME}\\b`, "ig");
  if (!re.test(text)) return null;

  const q = text.replace(re, "").replace(/\s+/g, " ").trim();

  return q || null;
}

function isReplyToBot(ctx: any) {
  const u = ctx?.message?.reply_to_message?.from?.username;
  return typeof u === "string" && u.toLowerCase() === BOT_USERNAME;
}

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
    const raw = ctx.message.text;
    if (!raw) return;
    if (raw.startsWith("/")) return;

    const chatType = ctx.chat.type;
    const isGroup = chatType === "group" || chatType === "supergroup";

    const text = raw.trim();

    // 1) Ссылки — всегда без тега (как у тебя уже работает)
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlRegex);

    if (urls) {
      const url = urls[0];
      const platform = detectPlatform(url);
      if (platform) return handleDownload(ctx, url, platform);
      if (ctx.chat.type === "private")
        await ctx.reply("❌ Unsupported platform");
      return;
    }

    // 2) Личка — любой текст = поиск
    if (!isGroup) {
      return handleDownload(ctx, text, "search");
    }

    // 3) Группа — поиск удобными триггерами

    // 3.1) если тегнули бота где угодно
    const mentionQuery = extractMentionQuery(text);
    if (mentionQuery) {
      return handleDownload(ctx, mentionQuery, "search");
    }

    // 3.2) если сообщение начинается с "!"
    if (text.startsWith(GROUP_SEARCH_PREFIX)) {
      const q = text.slice(GROUP_SEARCH_PREFIX.length).trim();
      if (q) return handleDownload(ctx, q, "search");
      return;
    }

    // 3.3) если ответили на бота
    if (isReplyToBot(ctx)) {
      return handleDownload(ctx, text, "search");
    }

    // иначе — молчим (чтобы не спамить на любой текст)
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

    let statusMsg: any;
    try {
      statusMsg = await ctx.reply(
        platform === "search" ? "🔍 Searching..." : `🔍 Detecting ${platform}...`,
        {
          reply_to_message_id: ctx.message.message_id,
        },
      );
    } catch {
      // Fallback: reply without reply_to_message_id if it fails (in groups)
      statusMsg = await ctx.reply(
        platform === "search" ? "🔍 Searching..." : `🔍 Detecting ${platform}...`,
      );
    }

    try {
      await ctx.telegram.editMessageText(
        chatId,
        statusMsg.message_id,
        undefined,
        "⏬ Downloading...",
      );

      const result = await downloadMedia(input, platform);
      if (!result.success || !result.filepath)
        throw new Error(result.error || "Failed");

      const stats = fs.statSync(result.filepath);
      const fileSizeMB = stats.size / (1024 * 1024);

      await ctx.telegram.editMessageText(
        chatId,
        statusMsg.message_id,
        undefined,
        `🚀 Sending ${fileSizeMB.toFixed(1)}MB...`,
      );

      // Log to DB
      try {
        await storage.createDownload({
          platform: platform === "search" ? "youtube" : platform,
          url: input,
          fileSizeMb: fileSizeMB.toFixed(1),
          status: "completed",
        });
      } catch (e) {
        console.error(e);
      }

      const isAudio =
        platform === "yandexmusic" ||
        platform === "search" ||
        result.filepath.endsWith(".mp3");

      const link = input.startsWith("http") ? input : "";
      const safeHref = escapeHtmlAttr(link);
      const safeTitle = escapeHtml(result.title);

      // const caption = isAudio
      // ? `🎵 ${safeTitle}\n📦 ${fileSizeMB.toFixed(1)}MB\n🔗 <a href="${safeHref}">Открыть</a>`
      // : `🎬 ${safeTitle}\n📦 ${fileSizeMB.toFixed(1)}MB\n🔗 <a href="${safeHref}">Открыть</a>`;

      const caption = `${isAudio ? "🎵" : "🎬"} ${safeTitle}\n📦 ${fileSizeMB.toFixed(1)}MB\n🔗 <a href="${safeHref}">${input.startsWith("http") ? "Открыть" : "From Search"}</a>`;

      if (isAudio) {
        // await ctx.replyWithAudio(Input.fromLocalFile(result.filepath), {
        //   caption,
        //   parse_mode: "HTML",
        // });

        let tgTitle = (result.title || "Audio").trim();
        tgTitle = tgTitle.replace(/^\s*[^-–—]{2,50}\s*[-–—]\s*/u, ""); // срежет "Артист - "
        const safeName = sanitizeFilename(tgTitle);

        await ctx.replyWithAudio(
          {
            source: fs.createReadStream(result.filepath),
            filename: `${safeName}.mp3`,
          },
          {
            title: tgTitle,
            caption,
            parse_mode: "HTML",
          },
        );
      } else {
        await ctx.replyWithVideo(Input.fromLocalFile(result.filepath), {
          caption,
          parse_mode: "HTML",
        });
      }

      await ctx.telegram.deleteMessage(chatId, statusMsg.message_id);
      fs.unlinkSync(result.filepath);
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
          url: input,
          status: "failed",
        });
      } catch (e) {
        console.error(e);
      }
    } finally {
      isDownloading = false;
    }
  }

  bot
    .launch()
    .then(() => console.log("✅ Bot started!"))
    .catch((err) => console.error("❌ Bot launch failed:", err));

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

async function downloadMedia(input: string, platform: string) {
  const timestamp = Date.now();
  const isAudio = platform === "yandexmusic" || platform === "search";
  const ext = isAudio ? "mp3" : "mp4";
  const filepath = path.join(TEMP_DIR, `${platform}_${timestamp}.${ext}`);

  try {
    let command;
    if (platform === "search") {
      command = `yt-dlp "ytsearch1:${input}" --no-playlist --extract-audio --audio-format mp3 --audio-quality 320K --add-metadata -o "${filepath}"`;
    } else if (platform === "yandexmusic") {
      const cookieFile = path.join(process.cwd(), "cookies.txt");
      const cookieParam = fs.existsSync(cookieFile)
        ? `--cookies "${cookieFile}"`
        : "";
      command = `yt-dlp ${cookieParam} --extract-audio --audio-format mp3 --audio-quality 320K -o "${filepath}" "${input}"`;
    } else if (platform === "youtube") {
      command = `yt-dlp -f "best[height<=1080]" -o "${filepath}" "${input}"`;
    } else {
      command = `yt-dlp -f "best" -o "${filepath}" "${input}"`;
    }

    console.log("Running:", command);
    await execAsync(command, { timeout: 300000 });

    const { stdout: info } = await execAsync(
      `yt-dlp --get-title --no-warnings ${platform === "search" ? `"ytsearch1:${input}"` : `"${input}"`}`,
    );

    return { success: true, filepath, title: info.trim() || "Media" };
  } catch (error: any) {
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    return {
      success: false,
      error: "Download failed. Try search by name instead.",
    };
  }
}

function sanitizeFilename(name: string, maxLen = 80) {
  return (name || "audio")
    .replace(/[\/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlAttr(text: string) {
  return escapeHtml(text).replaceAll('"', "&quot;");
}

function isReplyToBot(ctx: any): boolean {
  if (!ctx.message?.reply_to_message) return false;
  const repliedTo = ctx.message.reply_to_message;
  // Check if the replied message is from the bot
  return repliedTo.from?.is_bot === true;
}
