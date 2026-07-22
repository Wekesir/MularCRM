FROM node:20-alpine

# mysql-client on Alpine is MariaDB's client; mariadb-connector-c provides
# caching_sha2_password.so so dumps can authenticate against MySQL 8.
RUN apk add --no-cache mysql-client mariadb-connector-c

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Ensure the app dir and deps are owned by the non-root runtime user (uid 1000),
# so bind-mounted source and the node_modules volume stay writable.
RUN chown -R 1000:1000 /app

EXPOSE 3000

CMD ["npm", "run", "dev"]
