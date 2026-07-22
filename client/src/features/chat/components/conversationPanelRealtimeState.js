const normalizeMemberId = (member) => {
  if (!member) return null;
  if (typeof member === "object") {
    return member._id ? String(member._id) : null;
  }
  return String(member);
};

export const shouldRefreshDirectCommonGroups = ({
  action,
  group,
  currentUserId,
  peerUserId,
  panelKind,
}) => {
  if (
    action !== "created" ||
    panelKind !== "direct" ||
    !currentUserId ||
    !peerUserId ||
    !Array.isArray(group?.members)
  ) {
    return false;
  }

  const memberIds = new Set(group.members.map(normalizeMemberId).filter(Boolean));
  return memberIds.has(String(currentUserId)) && memberIds.has(String(peerUserId));
};
