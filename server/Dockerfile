FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js *.mjs ./
EXPOSE 3000
CMD ["npm","start"]
