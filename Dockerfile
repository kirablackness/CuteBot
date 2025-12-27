FROM node:20-alpine

# Install dependencies and yt-dlp
RUN apk add --no-cache ffmpeg python3 py3-pip curl \
    && pip3 install --break-system-packages yt-dlp \
    && yt-dlp --version

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY bot.js ./

ENV NODE_ENV=production

CMD ["node", "bot.js"]
