# CarKeeper frontend image. Targets:
#   deps  - node_modules plus the source, used for the Jest unit tests
#   build - the production React build
#   e2e   - the Playwright end-to-end suite, in Microsoft's browser image
#   web   - the built site served by nginx (default, last stage)
# See docs/DOCKER.md.

# ---- deps -------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
# Browsers are only needed by the e2e target, which ships its own.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# ---- build ------------------------------------------------------------------
FROM deps AS build
# Create React App bakes REACT_APP_* values into the JavaScript bundle at build
# time, so the API address is a build argument rather than a runtime setting.
# The browser calls it from the host, which is why it's localhost, not "api".
ARG REACT_APP_API_BASE=http://localhost:5001
ENV REACT_APP_API_BASE=$REACT_APP_API_BASE
RUN npm run build

# ---- e2e --------------------------------------------------------------------
# Must match the @playwright/test version in package-lock.json, so the image's
# browsers are the ones the test runner expects.
FROM mcr.microsoft.com/playwright:v1.63.0-noble AS e2e
WORKDIR /app
ENV CI=true \
    BROWSER=none
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# playwright.config.js starts the React dev server itself (webServer) and every
# spec stubs the API with page.route, so this needs no backend container.
CMD ["npx", "playwright", "test", "--project=chromium", "--project=firefox", "--project=webkit"]

# ---- web (default) ----------------------------------------------------------
FROM nginx:1.27-alpine AS web
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=5s --timeout=3s --retries=12 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1/"]
