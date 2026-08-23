const baseDocument = () => ({
  schemaVersion: 1,
  target: "public-demo",
  capabilities: {
    directChat: true,
    groupChat: true,
    realtimeSidebar: true,
    calls: false,
    selfSignup: true,
    seededDemoAccounts: true,
    upload: false,
    recovery: false,
    googleLogin: false,
    metricsExport: false,
    issue61Measurement: false,
  },
  webrtc: {
    iceServers: [{ urls: "stun:stun.example.test:3478" }],
  },
});

const fixtureFactories = Object.freeze({
  "valid-disabled": () => ({ kind: "json", document: baseDocument() }),
  "valid-upload-enabled": () => {
    const document = baseDocument();
    document.capabilities.upload = true;
    return { kind: "json", document };
  },
  missing: () => ({ kind: "missing" }),
  malformed: () => ({ kind: "raw", body: "{malformed-json" }),
  "old-version": () => {
    const document = baseDocument();
    document.schemaVersion = 0;
    return { kind: "json", document };
  },
  "future-version": () => {
    const document = baseDocument();
    document.schemaVersion = 2;
    return { kind: "json", document };
  },
  "wrong-target": () => {
    const document = baseDocument();
    document.target = "production";
    return { kind: "json", document };
  },
});

const getK6PreviewFixture = (name) => {
  const createFixture = fixtureFactories[name];
  if (!createFixture) {
    throw new Error(`Unknown K6 target-config fixture: ${name}`);
  }
  return createFixture();
};

export { getK6PreviewFixture };
