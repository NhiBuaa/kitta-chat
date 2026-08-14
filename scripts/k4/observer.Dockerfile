FROM node:22.14.0-bookworm-slim

WORKDIR /opt/k4
COPY observerHelperClient.js ./
COPY observerRequestContract.js ./
COPY observerRequest.js ./

USER node
CMD ["node", "-e", "setInterval(() => {}, 2147483647)"]
