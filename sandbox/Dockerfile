# syntax=docker/dockerfile:1
# Phase 45 (TFP-228, Decision 2): the image model-written tests run in. It's Microsoft's Playwright image, pinned to
# the version package-lock.json resolves for @playwright/test and to its digest, with that same @playwright/test
# installed at /sandbox. The image carries the browsers but not the package, and a spec imports '@playwright/test'.
# Installing it here means no part of the repo (node_modules included) is mounted into the container.
#
# Built on first use by src/lib/sandbox/image.ts, which passes both build arguments from its own constants:
# src/lib/sandbox/sandbox.test.ts fails if they, this folder's lockfile and the repo's disagree, so a Playwright
# upgrade moves the pin in the same commit. Ubuntu 26.04 ("resolute"), as in Mr Onion's own image and CI.
ARG BASE_IMAGE
FROM ${BASE_IMAGE}
ARG PLAYWRIGHT_VERSION

WORKDIR /sandbox
# Exactly the repo's lockfile entries, integrity hashes included (scripts/sandbox/sync-lock.mjs writes these two files
# from it), through `npm ci`, with no install scripts: the browsers are already in the image, at
# PLAYWRIGHT_BROWSERS_PATH (/ms-playwright). The check after it fails the build if anything else resolved.
COPY package.json package-lock.json ./
RUN test -n "$PLAYWRIGHT_VERSION" \
    && npm ci --no-audit --no-fund --ignore-scripts \
    && node -e "for (const p of ['@playwright/test', 'playwright', 'playwright-core']) { const v = require(p + '/package.json').version; if (v !== process.env.PLAYWRIGHT_VERSION) { console.error(p + ' resolved ' + v); process.exit(1) } }" \
    && rm -rf /root/.npm /tmp/* \
    && mkdir -p /sandbox/specs /sandbox/out

# Never root. The run passes --user too (the image's pwuser, or the host's own user on Linux so the output folder
# stays writable), and a read-only root filesystem.
USER pwuser
ENV HOME=/tmp
# A sandbox run replaces this with `timeout -s KILL <limit>` around the same command (src/lib/sandbox/sandbox.ts).
ENTRYPOINT ["/sandbox/node_modules/.bin/playwright", "test"]
