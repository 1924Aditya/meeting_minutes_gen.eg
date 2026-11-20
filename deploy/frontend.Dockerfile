FROM node:20-bookworm-slim AS build

WORKDIR /app
ARG VITE_BACKEND_WS_URL=ws://localhost:3001/ws
ENV VITE_BACKEND_WS_URL=$VITE_BACKEND_WS_URL

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
RUN npm ci --workspace=frontend

COPY frontend frontend
RUN npm run build --workspace=frontend

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
