FROM node:24-alpine
WORKDIR /mcp
COPY package.json package-lock.json ./
# npm ci runs postinstall, which compiles TypeScript and generates .bin/mcp-server-filesystem
RUN npm ci
USER node
# Keeps the container alive to receive `docker exec -i` calls
CMD ["tail", "-f", "/dev/null"]
