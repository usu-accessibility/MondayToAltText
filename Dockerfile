FROM node:18

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ENV PORT=3004

EXPOSE 3004

CMD ["node", "index.js"]
