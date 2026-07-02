FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Ensure the app dir and deps are owned by the non-root runtime user (uid 1000),
# so bind-mounted source and the node_modules volume stay writable.
RUN chown -R 1000:1000 /app

EXPOSE 3000

CMD ["npm", "run", "dev"]
