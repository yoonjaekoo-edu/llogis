# Backend Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
# devDependencies (@types/*) are required for `tsc` during image build
RUN npm install --include=dev

COPY . .
RUN npm run build

EXPOSE 5000

CMD ["npm", "start"]
