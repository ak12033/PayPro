# syntax=docker/dockerfile:1

# ── build ────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_* at BUILD time, not run time — so these must be present
# here, and a change to any of them requires a rebuild, not just a restart.
ARG VITE_BACKEND_URL
ARG VITE_FASTAPI_URL
ARG VITE_RAZORPAY_KEY_ID
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_VAPID_KEY

RUN npm run build

# ── serve ────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
