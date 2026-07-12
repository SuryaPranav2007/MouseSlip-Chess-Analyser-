# Stage 1: Build the React application
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Serve using Nginx
FROM nginx:alpine

# Copy built assets to Nginx default folder
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration if any
# We'll use docker-compose to manage general routing, but standard config is fine here
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
