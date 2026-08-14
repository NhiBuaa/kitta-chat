const http = require("node:http");

function createDockerEngineClient({ socketPath = "/var/run/docker.sock" } = {}) {
  return {
    request({ method = "GET", path }) {
      return new Promise((resolve, reject) => {
        const request = http.request({ socketPath, method, path }, (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => {
            const body = Buffer.concat(chunks);
            if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`Docker Engine request failed: ${response.statusCode}`));
            const contentType = response.headers["content-type"] || "";
            if (contentType.includes("application/json")) {
              try { return resolve(JSON.parse(body.toString("utf8"))); } catch (error) { return reject(error); }
            }
            resolve(body);
          });
        });
        request.on("error", reject);
        request.end();
      });
    },
  };
}

module.exports = { createDockerEngineClient };
