FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --no-fund --no-audit
COPY . .
ENV VITE_API_BASE_URL=http://localhost:3000
EXPOSE 5173
CMD ["npm","run","dev","--","--host","0.0.0.0"]
