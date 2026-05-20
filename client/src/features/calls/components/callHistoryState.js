const isValidCall = (call) => call && call._id;

const uniqueCalls = (calls = []) => {
  const seen = new Set();
  const result = [];

  for (const call of calls) {
    if (!isValidCall(call)) continue;
    const id = String(call._id);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(call);
  }

  return result;
};

export const mergeCallHistoryPage = ({
  previousCalls = [],
  incomingCalls = [],
  reset = false,
} = {}) => {
  if (reset) return uniqueCalls(incomingCalls);

  return uniqueCalls([...previousCalls, ...incomingCalls]);
};

