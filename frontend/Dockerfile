# UDSM Student Support Assistant — frontend image (build + nginx serve)
FROM node:22-alpine AS build

WORKDIR /app

# The API base URL is baked in at build time (Vite env). docker-compose passes
# the host-reachable backend URL so the browser can call it.
ARG VITE_API_BASE_URL=http://localhost:8000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# --- Serve stage ---
FROM nginx:alpine AS serve
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
