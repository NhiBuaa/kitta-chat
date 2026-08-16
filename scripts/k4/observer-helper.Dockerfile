FROM node:22.14.0-bookworm-slim

WORKDIR /opt/k4
COPY dockerEngineClient.js dockerObservationAdapters.js ./
COPY observerHelperPolicy.js observerHelperServer.js ./
COPY observerHelperRuntime.js ./

CMD ["node", "observerHelperRuntime.js"]
