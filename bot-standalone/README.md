# Telegram Media Download Bot

Telegram bot for downloading media from YouTube, TikTok, Instagram, and Yandex.Music.

## Features

- Download videos from YouTube, TikTok, Instagram
- Download audio from Yandex.Music
- Search songs by name (YouTube search)
- Queue system for multiple requests
- Works in private chats and groups

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | Yes | Your Telegram bot token from @BotFather |
| `BOT_USERNAME` | No | Bot username (default: lashmedia_pro_bot) |

## Deploy with Docker

```bash
docker build -t media-bot .
docker run -d -e BOT_TOKEN=your_token_here media-bot
```

## Deploy without Docker

Requires: Node.js 18+, yt-dlp, ffmpeg

```bash
npm install
BOT_TOKEN=your_token_here node bot.js
```

## Commands

- `/start` - Start the bot
- `/help` - Show help
- `/search <name>` - Search song by name
- `/status` - Check bot status

## Usage

- Send a link from YouTube, TikTok, Instagram, or Yandex.Music
- Or just type a song name to search on YouTube
- In groups: use `!songname` or `@botusername songname`
