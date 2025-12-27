# Telegram бот для скачивания медиа

Скачивает видео и музыку с YouTube, TikTok, Instagram и Яндекс.Музыки.

## Файлы

```
bot.js       - код бота
package.json - зависимости
Dockerfile   - для Docker-деплоя
```

## Переменные окружения

| Переменная | Обязательная | Описание |
|------------|--------------|----------|
| BOT_TOKEN | Да | Токен бота от @BotFather |
| BOT_USERNAME | Нет | Имя бота (по умолчанию: lashmedia_pro_bot) |

## Деплой с Docker

```bash
docker build -t media-bot .
docker run -d -e BOT_TOKEN=ваш_токен media-bot
```

## Деплой без Docker

Требуется: Node.js 18+, yt-dlp, ffmpeg

```bash
npm install
BOT_TOKEN=ваш_токен node bot.js
```

## Команды бота

- `/start` - Начало работы
- `/help` - Помощь
- `/search <название>` - Поиск песни
- `/status` - Статус бота

## Использование

- Отправьте ссылку с YouTube, TikTok, Instagram или Яндекс.Музыки
- Или просто напишите название песни
- В группах: `!название` или `@botusername название`
