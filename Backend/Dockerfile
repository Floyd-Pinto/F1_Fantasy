FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json prisma.config.js ./
COPY prisma ./prisma
RUN npm ci --omit=dev

COPY . .
EXPOSE 4000
# Apply pending migrations, load/refresh real F1 data, then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.js && node index.js"]
