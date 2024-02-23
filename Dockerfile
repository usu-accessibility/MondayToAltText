FROM node:18

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ENV PORT=3003

EXPOSE 3003

CMD ["node", "index.js"]
