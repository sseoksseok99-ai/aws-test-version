FROM node:20-alpine

WORKDIR /app

COPY app/package.json ./package.json

# 의존성 최소(샘플이라 dependencies 없음)
RUN npm -s install --omit=dev || true

COPY app/server.js ./server.js

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm","run","start"]

