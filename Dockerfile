# Image de production : dépendances d'exécution seulement, utilisateur sans privilège.
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY public ./public
USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
