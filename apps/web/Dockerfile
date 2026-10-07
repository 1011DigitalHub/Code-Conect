# syntax=docker/dockerfile:1

# ---- build: compiles the production bundle ----
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
# The workspace install also runs apps/api's postinstall (prisma generate),
# even though this image never uses it — it needs its schema present to
# succeed at all. See apps/api/Dockerfile's identical comment.
COPY apps/api/prisma ./apps/api/prisma
RUN pnpm install --frozen-lockfile

COPY apps/web ./apps/web
# VITE_API_URL is a build-time value (Vite inlines import.meta.env.* into
# the bundle) — pass the real one with --build-arg at build time. The CSP's
# connect-src, by contrast, is read at container *start* time (see
# default.conf.template): that one env var genuinely changes per
# environment without rebuilding the image.
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm --filter web build

# ---- runtime: nginx serving the static build, non-root ----
FROM nginx:alpine
# Alpine's nginx package already creates the nginx:nginx user/group (and
# /var/cache/nginx, /var/run etc. are already writable by it) — this image
# runs entirely as that user instead of nginx dropping root privileges
# internally via the `user` directive, so nginx.conf below has no `user`
# line at all.
COPY --chown=nginx:nginx apps/web/nginx.conf /etc/nginx/nginx.conf
COPY --chown=nginx:nginx apps/web/default.conf.template /etc/nginx/templates/default.conf.template
COPY --chown=nginx:nginx --from=build /app/apps/web/dist /usr/share/nginx/html

# The official entrypoint's envsubst step (which turns
# default.conf.template into conf.d/default.conf at container start) runs
# as whichever user the container itself runs as — since that's nginx
# (USER below) for the whole lifetime, not just a privilege-drop inside
# nginx's own master process, conf.d must already be writable by it.
# Directory ownership alone isn't enough: the base image ships its own
# root-owned conf.d/default.conf, and the entrypoint's `envsubst > ...`
# redirect opens that *existing* file for truncation, which needs write
# permission on the file itself, not just on the directory it's in — so it
# has to go, not just be writable-around.
RUN rm -f /etc/nginx/conf.d/default.conf \
 && chown nginx:nginx /etc/nginx/conf.d

USER nginx
EXPOSE 8080

# Same signal-forwarding reasoning as apps/api/Dockerfile: the official
# image's own entrypoint already execs nginx as PID 1 (no dumb-init
# needed here), and nginx's master process forwards SIGTERM to its workers
# and exits cleanly on its own.
CMD ["nginx", "-g", "daemon off;"]
