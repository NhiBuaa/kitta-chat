export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 30;
export const displayNamePattern = /^[A-Za-zÀ-ÖØ-öø-ÿ\u0100-\u1EFF\s]+$/u;

export const isValidDisplayName = (value) => (
  typeof value === "string"
  && value.length >= DISPLAY_NAME_MIN_LENGTH
  && value.length <= DISPLAY_NAME_MAX_LENGTH
  && displayNamePattern.test(value)
  && value.trim().length > 0
);
