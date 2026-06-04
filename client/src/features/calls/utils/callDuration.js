export const getCallDurationSeconds = ({ answeredAt, now = new Date() } = {}) => {
  if (!answeredAt) return 0;

  const answeredAtMs = new Date(answeredAt).getTime();
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();

  if (!Number.isFinite(answeredAtMs) || !Number.isFinite(nowMs)) return 0;

  return Math.max(0, Math.floor((nowMs - answeredAtMs) / 1000));
};

export const getDelayToNextDurationTick = ({ answeredAt, now = new Date() } = {}) => {
  if (!answeredAt) return 1000;

  const answeredAtMs = new Date(answeredAt).getTime();
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();

  if (!Number.isFinite(answeredAtMs) || !Number.isFinite(nowMs) || nowMs < answeredAtMs) return 1000;

  const elapsedMs = nowMs - answeredAtMs;
  const remainder = elapsedMs % 1000;

  return remainder === 0 ? 1000 : 1000 - remainder;
};
export const getPopupDurationSeconds = ({ displayStartedAt, now = new Date() } = {}) =>
  getCallDurationSeconds({ answeredAt: displayStartedAt, now });