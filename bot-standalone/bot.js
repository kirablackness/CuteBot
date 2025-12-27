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
const downloadQueue = [];
let isProcessing = false;

const BOT_USERNAME = (process.env.BOT_USERNAME || "lashmedia_pro_bot").replace(/^@/, "").toLowerCase();

function detectPlatform(url) {
  if (url.includes("music.yandex.")) return "yandexmusic";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("tiktok.com")) return "tiktok";
  if (url.includes("instagram.com")) return "instagram";
  return null;
}

function findFile(basePattern) {
  const dir = path.dirname(basePattern);
  const baseName = path.basename(basePattern).replace(/\.[^.]+$/, "");
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.startsWith(baseName)) return path.join(dir, file);
    }
  } catch {}
  return null;
}

async function downloadMedia(input, platform) {
  const timestamp = Date.now();
  const isAudio = platform === "yandexmusic" || platform === "search";
  const basePath = path.join(TEMP_DIR, `${platform}_${timestamp}`);
  const template = `${basePath}.%(ext)s`;

  try {
    let cmd;
    if (platform === "search") {
      cmd = `yt-dlp "ytsearch1:${input}" --no-playlist -x --audio-format mp3 --audio-quality 0 -o "${template}"`;
    } else if (platform === "yandexmusic") {
      const cookies = fs.existsSync("cookies.txt") ? '--cookies "cookies.txt"' : "";
      cmd = `yt-dlp ${cookies} -x --audio-format mp3 --audio-quality 0 -o "${template}" "${input}"`;
    } else if (platform === "youtube") {
      cmd = `yt-dlp -f "bestvideo[height<=1080]+bestaudio/best" --merge-output-format mp4 -o "${template}" "${input}"`;
    } else {
      cmd = `yt-dlp -f "best" -o "${template}" "${input}"`;
    }

    console.log("Команда:", cmd);
    await execAsync(cmd, { timeout: 300000 });

    const file = findFile(basePath);
    if (!file) throw new Error("Файл не найден");

    let title = "Медиа";
    try {
      const { stdout } = await execAsync(
        `yt-dlp --get-title --no-warnings ${platform === "search" ? `"ytsearch1:${input}"` : `"${input}"`}`,
        { timeout: 30000 }
      );
      title = stdout.trim() || "Медиа";
    } catch {}

    return { success: true, filepath: file, title };
  } catch (error) {
    console.error("Ошибка скачивания:", error.message);
    return { success: false, error: error.message || "Ошибка скачивания" };
  }
}

async function processTask(ctx, input, platform) {
  const chatId = ctx.chat.id;
  let statusMsg;

  try {
    statusMsg = await ctx.reply(platform === "search" ? "Ищу..." : "Скачиваю...", {
      reply_to_message_id: ctx.message?.message_id
    }).catch(() => null);
  } catch {
    statusMsg = await ctx.reply("Скачиваю...").catch(() => null);
  }

  const updateStatus = async (text) => {
    if (!statusMsg) return;
    try {
      await ctx.telegram.editMessageText(chatId, statusMsg.message_id, undefined, text);
    } catch {}
  };

  try {
    const result = await downloadMedia(input, platform);
    if (!result.success) throw new Error(result.error);

    const stats = fs.statSync(result.filepath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    await updateStatus(`Отправляю ${sizeMB}МБ...`);

    const isAudio = platform === "yandexmusic" || platform === "search" || result.filepath.endsWith(".mp3");
    const caption = `${isAudio ? "Аудио" : "Видео"}: ${result.title}\nРазмер: ${sizeMB}МБ`;

    if (isAudio) {
      await ctx.replyWithAudio({ source: fs.createReadStream(result.filepath) }, { caption });
    } else {
      await ctx.replyWithVideo(Input.fromLocalFile(result.filepath), { caption });
    }

    if (statusMsg) await ctx.telegram.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
    fs.unlinkSync(result.filepath);
  } catch (error) {
    console.error("Ошибка:", error.message);
    await updateStatus(`Ошибка: ${error.message}`);
  }
}

async function processQueue() {
  if (isProcessing || downloadQueue.length === 0) return;
  isProcessing = true;

  const task = downloadQueue.shift();
  try {
    await processTask(task.ctx, task.input, task.platform);
  } catch (e) {
    console.error("Ошибка очереди:", e.message);
  }

  isProcessing = false;
  if (downloadQueue.length > 0) setImmediate(processQueue);
}

function addToQueue(ctx, input, platform) {
  const pos = downloadQueue.length;
  downloadQueue.push({ ctx, input, platform });
  if (pos === 0) processQueue();
  else ctx.reply(`В очереди. Позиция: ${pos}`).catch(() => {});
}

function handleDownload(ctx, input, platform) {
  const userId = ctx.from.id;
  const now = Math.floor(Date.now() / 1000);
  const last = userCooldown.get(userId);

  if (last && now - last < COOLDOWN_SECONDS) {
    ctx.reply(`Подождите ${COOLDOWN_SECONDS - (now - last)} сек`);
    return;
  }

  userCooldown.set(userId, now);
  addToQueue(ctx, input, platform);
}

function setupBot() {
  if (!process.env.BOT_TOKEN) {
    console.error("BOT_TOKEN не найден!");
    process.exit(1);
  }

  const bot = new Telegraf(process.env.BOT_TOKEN);

  bot.command("start", (ctx) => {
    ctx.reply(`Бот для скачивания медиа

Поддерживает:
• Яндекс.Музыка
• YouTube
• TikTok  
• Instagram

Просто отправьте ссылку или название песни!

Команды:
/start - начало
/help - помощь
/search <название> - поиск песни
/status - статус бота`);
  });

  bot.command("help", (ctx) => {
    ctx.reply(`Как пользоваться:

1. Отправьте ссылку с YouTube, TikTok, Instagram или Яндекс.Музыки

2. Или просто напишите название песни

В группах: используйте !название или @${BOT_USERNAME} название`);
  });

  bot.command("search", (ctx) => {
    const query = ctx.message.text.split(" ").slice(1).join(" ");
    if (!query) return ctx.reply("Использование: /search название песни");
    handleDownload(ctx, query, "search");
  });

  bot.command("status", async (ctx) => {
    try {
      const { stdout } = await execAsync("yt-dlp --version");
      ctx.reply(`Бот работает\nyt-dlp: ${stdout.trim()}\nВ очереди: ${downloadQueue.length}`);
    } catch {
      ctx.reply("yt-dlp не установлен");
    }
  });

  bot.on("text", (ctx) => {
    const text = ctx.message.text?.trim();
    if (!text || text.startsWith("/")) return;

    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    const urlMatch = text.match(/(https?:\/\/[^\s]+)/);

    if (urlMatch) {
      const platform = detectPlatform(urlMatch[0]);
      if (platform) return handleDownload(ctx, urlMatch[0], platform);
      if (!isGroup) ctx.reply("Платформа не поддерживается");
      return;
    }

    if (!isGroup) return handleDownload(ctx, text, "search");

    if (text.includes(`@${BOT_USERNAME}`)) {
      const query = text.replace(new RegExp(`@${BOT_USERNAME}`, "gi"), "").trim();
      if (query) return handleDownload(ctx, query, "search");
    }

    if (text.startsWith("!")) {
      const query = text.slice(1).trim();
      if (query) return handleDownload(ctx, query, "search");
    }
  });

  bot.launch().then(() => console.log("Бот запущен!"));
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

setupBot();
