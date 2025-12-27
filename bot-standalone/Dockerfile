FROM node:20-alpine

# Install ffmpeg and download yt-dlp binary directly
RUN apk add --no-cache ffmpeg curl \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Verify yt-dlp is installed
RUN yt-dlp --version

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY bot.js ./

ENV NODE_ENV=production

CMD ["node", "bot.js"]
