FROM node:22.14.0-bookworm-slim

WORKDIR /opt/k4
COPY scripts/k4/observerHelperClient.js ./
COPY scripts/k4/observerRequestContract.js ./
COPY scripts/k4/observerRequest.js ./

USER node
CMD ["node", "-e", "setInterval(() => {}, 2147483647)"]
