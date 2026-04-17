### Этап 1: сборка React-приложения
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# VITE_API_URL передаётся как build arg, чтобы фронт знал адрес бэка при сборке
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

### Этап 2: раздача статики через nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# nginx-конфиг: все пути → index.html (SPA)
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
