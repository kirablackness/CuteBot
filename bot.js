const { Telegraf } = require("telegraf");
const { exec } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");

const execAsync = promisify(exec);

const COOLDOWN_SECONDS = 10;
const userCooldown = new Map();
const downloadQueue = [];

function detectPlatform(url) {
  if (url.includes("music.yandex")) return "yandex";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("tiktok.com")) return "tiktok";
  if (url.includes("instagram.com")) return "instagram";
  return null;
}

async function handleDownload(ctx, input, platform) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const now = Date.now();
  const lastRequest = userCooldown.get(userId) || 0;
  const timePassed = (now - lastRequest) / 1000;

  if (timePassed < COOLDOWN_SECONDS) {
    const remaining = Math.ceil(COOLDOWN_SECONDS - timePassed);
    return ctx.reply(`Wait ${remaining} seconds before next request`);
  }

  userCooldown.set(userId, now);

  const statusMsg = await ctx.reply("Processing...");

  try {
    const tmpDir = "/tmp/downloads";
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const outputTemplate = path.join(tmpDir, `${userId}_%(title)s.%(ext)s`);
    let cmd = "";

    if (platform === "search") {
      cmd = `yt-dlp -x --audio-format mp3 --audio-quality 0 -o "${outputTemplate}" "ytsearch1:${input}"`;
    } else if (platform === "yandex") {
      cmd = `yt-dlp -x --audio-format mp3 --audio-quality 0 -o "${outputTemplate}" "${input}"`;
    } else {
      cmd = `yt-dlp -f "bestvideo[height<=720]+bestaudio/best[height<=720]" --merge-output-format mp4 -o "${outputTemplate}" "${input}"`;
    }

    await execAsync(cmd, { timeout: 300000 });

    const files = fs.readdirSync(tmpDir).filter((f) => f.startsWith(`${userId}_`));
    
    for (const file of files) {
      const filePath = path.join(tmpDir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.size > 50 * 1024 * 1024) {
        await ctx.reply("File too large (>50MB)");
        fs.unlinkSync(filePath);
        continue;
      }

      if (file.endsWith(".mp3") || file.endsWith(".m4a")) {
        await ctx.replyWithAudio({ source: filePath });
      } else {
        await ctx.replyWithVideo({ source: filePath });
      }

      fs.unlinkSync(filePath);
    }

    await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
  } catch (err) {
    console.error("Download error:", err);
    await ctx.reply("Download failed. Try again later.");
  }
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

Just send a link or type a song name to search.

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

2. Or just type the song name

Group Chat:
Add the bot to a group and give it admin permissions.`);
  });

  bot.command("search", async (ctx) => {
    const query = ctx.message.text.split(" ").slice(1).join(" ");
    if (!query) return ctx.reply("Usage: /search <song name>");
    return handleDownload(ctx, query, "search");
  });

  bot.command("status", async (ctx) => {
    try {
      const { stdout } = await execAsync("yt-dlp --version");
      ctx.reply(`Bot working\nyt-dlp: ${stdout.trim()}\nActive users: ${userCooldown.size}`);
    } catch (err) {
      ctx.reply("yt-dlp not installed");
    }
  });

  bot.on("text", async (ctx) => {
    const raw = ctx.message.text;
    if (!raw || raw.startsWith("/")) return;

    const text = raw.trim();
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlRegex);

    if (urls) {
      const url = urls[0];
      const platform = detectPlatform(url);
      if (platform) return handleDownload(ctx, url, platform);
      if (ctx.chat.type === "private") await ctx.reply("Unsupported platform");
      return;
    }

    if (ctx.chat.type === "private") {
      return handleDownload(ctx, text, "search");
    }
  });

  bot.launch();
  console.log("Bot started!");

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

setupBot();
