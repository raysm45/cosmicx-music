const DEFAULT_SERVER_DOWN_MODE = "manual";

export const SERVER_DOWN_INFO = {
  eta: "± 3 jam",
  updatedAt: "21:54:00 WIB",
};

const VALID_MODES = ["auto", "manual", "off"];

function resolveMode() {
  const fromEnv = String(import.meta.env?.VITE_SERVER_DOWN_MODE || "").trim().toLowerCase();
  if (VALID_MODES.includes(fromEnv)) return fromEnv;
  return VALID_MODES.includes(DEFAULT_SERVER_DOWN_MODE) ? DEFAULT_SERVER_DOWN_MODE : "auto";
}

export const SERVER_DOWN_MODE = resolveMode();