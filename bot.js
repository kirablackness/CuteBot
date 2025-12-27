const { Telegraf, Input, Markup } = require("telegraf");
const { exec } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const os = require("os");
const path = require("path");

const execAsync = promisify(exec);
const TEMP_DIR = os.tmpdir();

// Настройки
const COOLDOWN_SECONDS = 30;
const MAX_QUEUE_SIZE = 10;
const MAX_USER_QUEUE = 2;
const MAX_FILE_SIZE_MB = 50;
const MAX_DURATION_MINUTES = 15;

const userCooldown = new Map();
const downloadQueue = [];
const searchCache = new Map();
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

function parseDuration(durationStr) {
  if (!durationStr || durationStr === "?:??") return 0;
  const parts = durationStr.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function getUserQueueCount(userId) {
  return downloadQueue.filter(task => task.userId === userId).length;
}

async function searchYouTube(query, count = 5) {
  try {
    const cmd = `yt-dlp "ytmsearch${count}:${query}" --flat-playlist --print "%(id)s|||%(title)s|||%(duration_string)s" --no-warnings`;
    const { stdout } = await execAsync(cmd, { timeout: 30000 });
    
    const results = stdout.trim().split("\n").filter(Boolean).map((line) => {
      const [id, title, duration] = line.split("|||");
      return { id, title: title || "Без названия", duration: duration || "?:??" };
    });
    
    return results.slice(0, 5);
  } catch (error) {
    console.error("Ошибка поиска:", error.message);
    return [];
  }
}

async function checkDuration(url, platform, videoId = null) {
  try {
    let checkUrl = url;
    if (videoId) checkUrl = `https://www.youtube.com/watch?v=${videoId}`;
    else if (platform === "search") return { ok: true };
    
    const { stdout } = await execAsync(
      `yt-dlp --get-duration --no-warnings "${checkUrl}"`,
      { timeout: 15000 }
    );
    
    const durationSec = parseDuration(stdout.trim());
    const maxSec = MAX_DURATION_MINUTES * 60;
    
    if (durationSec > maxSec) {
      return { ok: false, error: `Видео слишком длинное (${Math.floor(durationSec/60)} мин). Максимум: ${MAX_DURATION_MINUTES} мин` };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

async function downloadMedia(input, platform, videoId = null) {
  const timestamp = Date.now();
  const isAudio = platform === "yandexmusic" || platform === "search";
  const basePath = path.join(TEMP_DIR, `${platform}_${timestamp}`);
  const template = `${basePath}.%(ext)s`;

  try {
    let cmd;
    let url = input;
    
    if (videoId) {
      url = `https://www.youtube.com/watch?v=${videoId}`;
    }
    
    if (platform === "search") {
      if (videoId) {
        cmd = `yt-dlp "${url}" --no-playlist -x --audio-format mp3 --audio-quality 0 -o "${template}"`;
      } else {
        cmd = `yt-dlp "ytmsearch1:${input}" --no-playlist -x --audio-format mp3 --audio-quality 0 -o "${template}"`;
      }
    } else if (platform === "yandexmusic") {
      const cookies = fs.existsSync("cookies.txt") ? '--cookies "cookies.txt"' : "";
      cmd = `yt-dlp ${cookies} -x --audio-format mp3 --audio-quality 0 -o "${template}" "${url}"`;
    } else if (platform === "youtube") {
      cmd = `yt-dlp -f "bestvideo[height<=720]+bestaudio/best[height<=720]/best" --merge-output-format mp4 -o "${template}" "${url}"`;
    } else {
      cmd = `yt-dlp -f "best" -o "${template}" "${url}"`;
    }

    console.log("Команда:", cmd);
    await execAsync(cmd, { timeout: 300000 });

    const file = findFile(basePath);
    if (!file) throw new Error("Файл не найден");

    const stats = fs.statSync(file);
    const sizeMB = stats.size / 1024 / 1024;
    
    if (sizeMB > MAX_FILE_SIZE_MB) {
      fs.unlinkSync(file);
      throw new Error(`Файл слишком большой (${sizeMB.toFixed(1)}МБ). Лимит Telegram: ${MAX_FILE_SIZE_MB}МБ`);
    }

    let title = "Медиа";
    try {
      const titleCmd = videoId 
        ? `yt-dlp --get-title --no-warnings "https://www.youtube.com/watch?v=${videoId}"`
        : `yt-dlp --get-title --no-warnings ${platform === "search" ? `"ytmsearch1:${input}"` : `"${input}"`}`;
      const { stdout } = await execAsync(titleCmd, { timeout: 30000 });
      title = stdout.trim() || "Медиа";
    } catch {}

    return { success: true, filepath: file, title };
  } catch (error) {
    console.error("Ошибка скачивания:", error.message);
    return { success: false, error: error.message || "Ошибка скачивания" };
  }
}

async function processTask(ctx, input, platform, videoId = null) {
  const chatId = ctx.chat?.id || ctx.callbackQuery?.message?.chat?.id;
  let statusMsg;

  try {
    if (ctx.reply) {
      statusMsg = await ctx.reply("⏳ Скачиваю...", {
        reply_to_message_id: ctx.message?.message_id
      }).catch(() => null);
    }
  } catch {
    statusMsg = null;
  }

  const updateStatus = async (text) => {
    if (!statusMsg) return;
    try {
      await ctx.telegram.editMessageText(chatId, statusMsg.message_id, undefined, text);
    } catch {}
  };

  try {
    const durationCheck = await checkDuration(input, platform, videoId);
    if (!durationCheck.ok) {
      await updateStatus(durationCheck.error);
      return;
    }

    const result = await downloadMedia(input, platform, videoId);
    if (!result.success) throw new Error(result.error);

    const stats = fs.statSync(result.filepath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    await updateStatus(`📤 Отправляю ${sizeMB}МБ...`);

    const isAudio = platform === "yandexmusic" || platform === "search" || result.filepath.endsWith(".mp3");
    const caption = `${isAudio ? "🎵" : "🎬"} ${result.title}`;

    if (isAudio) {
      let performer = "";
      let title = result.title;
      if (result.title.includes(" - ")) {
        const parts = result.title.split(" - ");
        performer = parts[0].trim();
        title = parts.slice(1).join(" - ").trim();
      }
      await ctx.telegram.sendAudio(chatId, { source: fs.createReadStream(result.filepath) }, { 
        caption,
        title,
        performer
      });
    } else {
      await ctx.telegram.sendVideo(chatId, Input.fromLocalFile(result.filepath), { caption });
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
    await processTask(task.ctx, task.input, task.platform, task.videoId);
  } catch (e) {
    console.error("Ошибка очереди:", e.message);
  }

  isProcessing = false;
  if (downloadQueue.length > 0) setImmediate(processQueue);
}

function addToQueue(ctx, input, platform, videoId = null) {
  const userId = ctx.from?.id || ctx.callbackQuery?.from?.id;
  
  if (downloadQueue.length >= MAX_QUEUE_SIZE) {
    ctx.reply(`Очередь переполнена (${MAX_QUEUE_SIZE}). Попробуйте позже.`).catch(() => {});
    return false;
  }
  
  if (getUserQueueCount(userId) >= MAX_USER_QUEUE) {
    ctx.reply(`У вас уже ${MAX_USER_QUEUE} запроса в очереди. Дождитесь их выполнения.`).catch(() => {});
    return false;
  }

  const pos = downloadQueue.length;
  downloadQueue.push({ ctx, input, platform, videoId, userId });
  
  if (pos === 0) {
    processQueue();
  } else {
    ctx.reply(`В очереди. Позиция: ${pos + 1} из ${downloadQueue.length}`).catch(() => {});
  }
  return true;
}

async function handleSearch(ctx, query) {
  const userId = ctx.from.id;
  const now = Math.floor(Date.now() / 1000);
  const last = userCooldown.get(userId);

  if (last && now - last < COOLDOWN_SECONDS) {
    ctx.reply(`Подождите ${COOLDOWN_SECONDS - (now - last)} сек`);
    return;
  }

  userCooldown.set(userId, now);

  const statusMsg = await ctx.reply("🔍 Ищу на YouTube Music...").catch(() => null);
  
  const results = await searchYouTube(query);
  
  if (results.length === 0) {
    if (statusMsg) {
      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, "Ничего не найдено. Попробуйте другой запрос.");
    }
    return;
  }

  const cacheKey = `${userId}_${Date.now()}`;
  searchCache.set(cacheKey, results);
  
  setTimeout(() => searchCache.delete(cacheKey), 300000);

  const buttons = results.map((item, index) => {
    const shortTitle = item.title.length > 35 ? item.title.substring(0, 32) + "..." : item.title;
    const durationSec = parseDuration(item.duration);
    const tooLong = durationSec > MAX_DURATION_MINUTES * 60;
    const label = tooLong 
      ? `${index + 1}. ${shortTitle} [${item.duration}] (слишком длинное)`
      : `${index + 1}. ${shortTitle} [${item.duration}]`;
    return [Markup.button.callback(label.substring(0, 60), tooLong ? `toolong_${index}` : `dl_${cacheKey}_${index}`)];
  });

  buttons.push([Markup.button.callback("Отмена", `cancel_${cacheKey}`)]);

  if (statusMsg) {
    await ctx.telegram.editMessageText(
      ctx.chat.id, 
      statusMsg.message_id, 
      undefined, 
      `Результаты поиска "${query}":\n\nВыберите трек:`,
      Markup.inlineKeyboard(buttons)
    );
  }
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
    ctx.reply(`🎬 Media Download Bot

📦 Поддерживает:
🎵 Яндекс.Музыка (треки, альбомы)
🎬 YouTube (видео, shorts)
📱 TikTok (все видео)
📸 Instagram (reels, посты)

Просто отправьте ссылку или название песни!
При поиске покажу список - выберите нужный трек.

⚠️ Ограничения:
• Максимум ${MAX_DURATION_MINUTES} минут
• Размер до ${MAX_FILE_SIZE_MB}МБ
• ${COOLDOWN_SECONDS} сек между запросами

📋 Команды:
/start - начало
/help - помощь
/search <название> - поиск с выбором
/status - статус бота`);
  });

  bot.command("help", (ctx) => {
    ctx.reply(`📖 Как пользоваться:

1️⃣ Отправьте ссылку с YouTube, TikTok, Instagram или Яндекс.Музыки

2️⃣ Или напишите название песни - покажу список результатов, выберите нужный

👥 В группах: используйте !название или @${BOT_USERNAME} название

⚠️ Ограничения:
• Видео до ${MAX_DURATION_MINUTES} минут
• Файлы до ${MAX_FILE_SIZE_MB}МБ
• Очередь: максимум ${MAX_QUEUE_SIZE} запросов
• На пользователя: ${MAX_USER_QUEUE} запроса одновременно`);
  });

  bot.command("search", (ctx) => {
    const query = ctx.message.text.split(" ").slice(1).join(" ");
    if (!query) return ctx.reply("Использование: /search название песни");
    handleSearch(ctx, query);
  });

  bot.command("status", async (ctx) => {
    try {
      const { stdout } = await execAsync("yt-dlp --version");
      ctx.reply(`✅ Бот работает
🔧 yt-dlp: ${stdout.trim()}
📊 В очереди: ${downloadQueue.length}/${MAX_QUEUE_SIZE}
⚙️ Лимиты: ${MAX_DURATION_MINUTES} мин, ${MAX_FILE_SIZE_MB}МБ`);
    } catch {
      ctx.reply("❌ yt-dlp не установлен");
    }
  });

  bot.action(/^dl_(.+)_(\d+)$/, async (ctx) => {
    const cacheKey = ctx.match[1];
    const index = parseInt(ctx.match[2]);
    
    const results = searchCache.get(cacheKey);
    if (!results || !results[index]) {
      await ctx.answerCbQuery("Результаты устарели. Попробуйте поиск заново.");
      return;
    }

    const selected = results[index];
    await ctx.answerCbQuery(`Скачиваю: ${selected.title.substring(0, 30)}...`);
    
    await ctx.editMessageText(`Скачиваю: ${selected.title}`);
    
    addToQueue(ctx, selected.title, "search", selected.id);
  });

  bot.action(/^toolong_/, async (ctx) => {
    await ctx.answerCbQuery(`Видео длиннее ${MAX_DURATION_MINUTES} минут. Выберите другое.`);
  });

  bot.action(/^cancel_(.+)$/, async (ctx) => {
    const cacheKey = ctx.match[1];
    searchCache.delete(cacheKey);
    await ctx.answerCbQuery("Отменено");
    await ctx.editMessageText("Поиск отменён.");
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

    if (!isGroup) return handleSearch(ctx, text);

    if (text.includes(`@${BOT_USERNAME}`)) {
      const query = text.replace(new RegExp(`@${BOT_USERNAME}`, "gi"), "").trim();
      if (query) return handleSearch(ctx, query);
    }

    if (text.startsWith("!")) {
      const query = text.slice(1).trim();
      if (query) return handleSearch(ctx, query);
    }
  });

  bot.launch().then(() => console.log("Бот запущен!"));
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

setupBot();
