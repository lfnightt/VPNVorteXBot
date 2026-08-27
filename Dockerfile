FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p data

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
