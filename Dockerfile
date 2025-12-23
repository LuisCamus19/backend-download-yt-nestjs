FROM node:20-alpine

RUN apk add --no-cache python3 ffmpeg curl && \
    ln -sf python3 /usr/bin/python

RUN apk add --no-cache -X http://dl-cdn.alpinelinux.org/alpine/edge/testing deno

RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp

RUN chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start:prod"]