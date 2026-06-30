# ---- Build ----
FROM node:22-alpine AS build
WORKDIR /app

# Instala dependências (usa o lockfile para build reproduzível)
COPY package*.json ./
RUN npm ci

# Variáveis do Vite são embutidas no build (prefixo VITE_).
# No EasyPanel, preencha como "Build Args" se for usar o Supabase.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY . .
RUN npm run build

# ---- Serve (Nginx estático) ----
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
