import { createElement } from "react";

import { useRuntimeConfig } from "./RuntimeConfigProvider.js";

const RuntimeConfigBoundary = ({ children }) => {
  const { status } = useRuntimeConfig();

  if (status === "loading") {
    return createElement(
      "div",
      {
        "data-runtime-config-state": "loading",
        role: "status",
      },
      "Đang tải cấu hình bản demo...",
    );
  }

  if (status !== "ready") {
    return createElement(
      "div",
      {
        "data-runtime-config-state": "error",
        role: "alert",
      },
      "Bản demo hiện chưa khả dụng. Vui lòng thử lại sau.",
    );
  }

  return children;
};

const RuntimeCapabilityGate = ({ capability, children, fallback = null }) => {
  const { status, capabilities } = useRuntimeConfig();
  return status === "ready" && capabilities[capability] === true
    ? children
    : fallback;
};

const RuntimeCapabilityUnavailable = ({ capability }) => createElement(
  "main",
  {
    "data-capability-unavailable": capability,
    role: "alert",
  },
  "Tính năng này không khả dụng trong bản demo hiện tại.",
);

const RuntimeCapabilityRoute = ({ capability, children }) => createElement(
  RuntimeCapabilityGate,
  {
    capability,
    fallback: createElement(RuntimeCapabilityUnavailable, { capability }),
  },
  children,
);

export {
  RuntimeCapabilityGate,
  RuntimeCapabilityRoute,
  RuntimeCapabilityUnavailable,
  RuntimeConfigBoundary,
};
