const { Telegraf, Input } = require("telegraf");
const { exec } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const os = require("os");
const path = require("path");

const execAsync = promisify(exec);

const TEMP_DIR = os.tmpdir();
const COOLDOWN_SECONDS = 30;
const userCooldown = new Map();

const BOT_USERNAME = (process.env.BOT_USERNAME || "lashmedia_pro_bot")
  .replace(/^@/, "")
  .toLowerCase();

const GROUP_SEARCH_PREFIX = "!";

const downloadQueue = [];
let isProcessingQueue = false;

async function handleDownloadTask(ctx, input, platform) {
  let statusMsg;
  const chatId = ctx.chat.id;

  try {
    statusMsg = await ctx
      .reply(
        platform === "search"
          ? "Searching..."
          : `Detecting ${platform}...`,
        { reply_to_message_id: ctx.message?.message_id },
      )
      .catch(() => null);
  } catch {
    statusMsg = await ctx
      .reply(
        platform === "search"
          ? "Searching..."
          : `Detecting ${platform}...`,
      )
      .catch(() => null);
  }

  const updateStatus = async (text) => {
    if (!statusMsg) return;
    try {
      await ctx.telegram.editMessageText(
        chatId,
        statusMsg.message_id,
        undefined,
        text,
      );
    } catch (e) {
      console.error("Failed to update status:", e);
    }
  };

  try {
    await updateStatus("Downloading...");

    const result = await downloadMedia(input, platform);
    if (!result.success || !result.filepath) {
      throw new Error(result.error || "Failed to download media");
    }

    const stats = fs.statSync(result.filepath);
    const fileSizeMB = stats.size / (1024 * 1024);

    await updateStatus(`Sending ${fileSizeMB.toFixed(1)}MB...`);

    const isAudio =
      platform === "yandexmusic" ||
      platform === "search" ||
      result.filepath.endsWith(".mp3");
    const link = input.startsWith("http") ? input : "";
    const safeHref = escapeHtmlAttr(link);
    const safeTitle = escapeHtml(result.title);
    const caption = `${isAudio ? "Audio" : "Video"}: ${safeTitle}\nSize: ${fileSizeMB.toFixed(1)}MB\n<a href="${safeHref}">${input.startsWith("http") ? "Open link" : "From Search"}</a>`;

    if (isAudio) {
      let tgTitle = (result.title || "Audio").trim();
      tgTitle = tgTitle.replace(/^\s*[^-–—]{2,50}\s*[-–—]\s*/u, "");
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

    if (statusMsg) {
      await ctx.telegram
        .deleteMessage(chatId, statusMsg.message_id)
        .catch(console.error);
    }
    fs.unlinkSync(result.filepath);
  } catch (error) {
    console.error("Download error:", error);
    await updateStatus(`Error: ${error.message}`);
    throw error;
  }
}

async function processQueue() {
  if (isProcessingQueue || downloadQueue.length === 0) return;

  isProcessingQueue = true;
  const task = downloadQueue[0];

  try {
    await handleDownloadTask(task.ctx, task.input, task.platform);
    downloadQueue.shift();
    task.resolve();
  } catch (error) {
    downloadQueue.shift();
    console.error("Queue processing error:", error);
    task.reject(error);
  } finally {
    isProcessingQueue = false;
    if (downloadQueue.length > 0) {
      setImmediate(processQueue);
    }
  }
}

function addToQueue(ctx, input, platform) {
  return new Promise((resolve, reject) => {
    const position = downloadQueue.length;
    downloadQueue.push({ ctx, input, platform, resolve, reject });

    if (position === 0) {
      processQueue();
    } else {
      ctx
        .reply(`Added to queue. Position: ${position}. Please wait...`)
        .catch(console.error);
    }
  });
}

function extractMentionQuery(text) {
  if (!BOT_USERNAME) return null;
  const re = new RegExp(`@${BOT_USERNAME}\\b`, "ig");
  if (!re.test(text)) return null;

  const q = text.replace(re, "").replace(/\s+/g, " ").trim();
  return q || null;
}

function isReplyToBot(ctx) {
  const u = ctx?.message?.reply_to_message?.from?.username;
  return typeof u === "string" && u.toLowerCase() === BOT_USERNAME;
}

function detectPlatform(url) {
  if (url.includes("music.yandex.")) return "yandexmusic";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("tiktok.com")) return "tiktok";
  if (url.includes("instagram.com")) return "instagram";
  return null;
}

function findDownloadedFile(basePattern) {
  const dir = path.dirname(basePattern);
  const baseName = path.basename(basePattern).replace(/\.[^.]+$/, "");
  
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.startsWith(baseName)) {
        return path.join(dir, file);
      }
    }
  } catch (e) {
    console.error("Error finding file:", e);
  }
  return null;
}

async function downloadMedia(input, platform) {
  const timestamp = Date.now();
  const isAudio = platform === "yandexmusic" || platform === "search";
  const ext = isAudio ? "mp3" : "mp4";
  const baseFilepath = path.join(TEMP_DIR, `${platform}_${timestamp}`);
  const outputTemplate = `${baseFilepath}.%(ext)s`;

  try {
    let command;
    if (platform === "search") {
      command = `yt-dlp "ytsearch1:${input}" --no-playlist -x --audio-format mp3 --audio-quality 0 -o "${outputTemplate}"`;
    } else if (platform === "yandexmusic") {
      const cookieFile = path.join(process.cwd(), "cookies.txt");
      const cookieParam = fs.existsSync(cookieFile)
        ? `--cookies "${cookieFile}"`
        : "";
      command = `yt-dlp ${cookieParam} -x --audio-format mp3 --audio-quality 0 -o "${outputTemplate}" "${input}"`;
    } else if (platform === "youtube") {
      command = `yt-dlp -f "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best" --merge-output-format mp4 -o "${outputTemplate}" "${input}"`;
    } else {
      command = `yt-dlp -f "best" -o "${outputTemplate}" "${input}"`;
    }

    console.log("Running:", command);
    const { stdout, stderr } = await execAsync(command, { timeout: 300000 });
    console.log("yt-dlp stdout:", stdout);
    if (stderr) console.log("yt-dlp stderr:", stderr);

    // Find the actual downloaded file
    const actualFile = findDownloadedFile(baseFilepath);
    if (!actualFile || !fs.existsSync(actualFile)) {
      console.error("File not found. Looking for:", baseFilepath);
      console.error("Temp dir contents:", fs.readdirSync(TEMP_DIR).filter(f => f.includes(String(timestamp))));
      throw new Error("Downloaded file not found");
    }
    
    console.log("Found file:", actualFile);

    // Get title
    let title = "Media";
    try {
      const { stdout: info } = await execAsync(
        `yt-dlp --get-title --no-warnings ${platform === "search" ? `"ytsearch1:${input}"` : `"${input}"`}`,
        { timeout: 30000 }
      );
      title = info.trim() || "Media";
    } catch (e) {
      console.error("Failed to get title:", e);
    }

    return { success: true, filepath: actualFile, title };
  } catch (error) {
    console.error("Download error details:", error);
    // Cleanup any partial files
    const files = fs.readdirSync(TEMP_DIR).filter(f => f.includes(String(timestamp)));
    files.forEach(f => {
      try { fs.unlinkSync(path.join(TEMP_DIR, f)); } catch {}
    });
    return {
      success: false,
      error: error.message || "Download failed. Try search by name instead.",
    };
  }
}

function sanitizeFilename(name, maxLen = 80) {
  return (name || "audio")
    .replace(/[\/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttr(text) {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

function setupBot() {
  if (!process.env.BOT_TOKEN) {
    console.error("BOT_TOKEN not found!");
    process.exit(1);
  }

  const bot = new Telegraf(process.env.BOT_TOKEN);

  bot.command("start", (ctx) => {
    ctx.reply(`Media Download Bot

Supports:
- Yandex.Music (tracks, albums)
- YouTube (video, shorts)
- TikTok (all videos)
- Instagram (reels, posts)

Automatic detection:
- Just send a link!
- Or type a song name to search on YouTube.

Limit: 1 request every ${COOLDOWN_SECONDS} seconds

Commands:
/start - start
/help - help
/search <name> - search song
/status - check status`);
  });

  bot.command("help", (ctx) => {
    ctx.reply(`How to use:

1. Send a link:
   - Yandex.Music, YouTube, TikTok, Instagram

2. Or just type the song name (e.g. "Imagine Dragons Believer")

Group Chat:
Add the bot to a group and give it admin permissions. It will automatically detect links.

Yandex.Music note:
If a link doesn't work, try searching by name instead.`);
  });

  bot.command("search", async (ctx) => {
    const query = ctx.message.text.split(" ").slice(1).join(" ");
    if (!query) return ctx.reply("Usage: /search <song name>");
    return handleDownload(ctx, query, "search");
  });

  bot.command("status", async (ctx) => {
    try {
      const { stdout } = await execAsync("yt-dlp --version");
      ctx.reply(
        `Bot working\nyt-dlp: ${stdout.trim()}\nActive users: ${userCooldown.size}\nQueue: ${downloadQueue.length} pending downloads`,
      );
    } catch (err) {
      ctx.reply("yt-dlp not installed");
    }
  });

  bot.on("text", async (ctx) => {
    const raw = ctx.message.text;
    if (!raw || raw.startsWith("/")) return;

    const chatType = ctx.chat.type;
    const isGroup = chatType === "group" || chatType === "supergroup";
    const text = raw.trim();

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlRegex);

    if (urls) {
      const url = urls[0];
      const platform = detectPlatform(url);
      if (platform) return handleDownload(ctx, url, platform);
      if (ctx.chat.type === "private")
        await ctx.reply("Unsupported platform");
      return;
    }

    if (!isGroup) {
      return handleDownload(ctx, text, "search");
    }

    const mentionQuery = extractMentionQuery(text);
    if (mentionQuery) {
      return handleDownload(ctx, mentionQuery, "search");
    }

    if (text.startsWith(GROUP_SEARCH_PREFIX)) {
      const q = text.slice(GROUP_SEARCH_PREFIX.length).trim();
      if (q) return handleDownload(ctx, q, "search");
      return;
    }

    if (isReplyToBot(ctx)) {
      return handleDownload(ctx, text, "search");
    }
  });

  async function handleDownload(ctx, input, platform) {
    const userId = ctx.from.id;
    const now = Math.floor(Date.now() / 1000);
    const lastRequest = userCooldown.get(userId);

    if (lastRequest && now - lastRequest < COOLDOWN_SECONDS) {
      await ctx.reply(`Wait ${COOLDOWN_SECONDS - (now - lastRequest)}s`);
      return;
    }

    userCooldown.set(userId, now);

    addToQueue(ctx, input, platform).catch((error) => {
      console.error("Error in queue processing:", error);
      ctx.reply("An error occurred while processing your request");
    });
  }

  bot
    .launch()
    .then(() => console.log("Bot started!"))
    .catch((err) => console.error("Bot launch failed:", err));

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

setupBot();
