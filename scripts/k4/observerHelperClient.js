function createObserverHelperClient({ baseUrl = "http://observer-helper:8080", token, fetchFn = fetch } = {}) {
  if (!token) throw new Error("run-scoped observer helper token is required");
  const request = async (operation, payload) => {
    const response = await fetchFn(`${baseUrl}/${operation}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`observer helper ${operation} rejected: ${response.status}`);
    return response.json();
  };
  return {
    metrics: (payload) => request("metrics", payload),
    identity: (payload) => request("identity", payload),
    logs: (payload) => request("logs", payload),
    stats: (payload) => request("stats", payload),
    runnerCgroup: (payload) => request("runner-cgroup", payload),
  };
}

module.exports = { createObserverHelperClient };
