FROM node:22.14.0-bookworm-slim

WORKDIR /opt/k4
COPY scripts/k4/dockerEngineClient.js scripts/k4/dockerObservationAdapters.js ./
COPY scripts/k4/observerHelperPolicy.js scripts/k4/observerHelperServer.js ./
COPY scripts/k4/observerHelperRuntime.js ./

CMD ["node", "observerHelperRuntime.js"]
