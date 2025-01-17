FROM node:18-alpine

WORKDIR /www/certservice

RUN apk update

RUN apk add certbot

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]