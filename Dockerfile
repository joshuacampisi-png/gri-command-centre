FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci
RUN npx playwright install --with-deps chromium

COPY . .
RUN npm run build

EXPOSE 8787
CMD ["node", "server/index.js"]
