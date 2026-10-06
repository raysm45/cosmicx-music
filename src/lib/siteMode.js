const DEFAULT_SERVER_DOWN_MODE = "manual";

export const SERVER_DOWN_INFO = {
  eta: "± 1 hari",
  updatedAt: "10:56:27 WIB",
};

const VALID_MODES = ["auto", "manual", "off"];

function resolveMode() {
  const fromEnv = String(import.meta.env?.VITE_SERVER_DOWN_MODE || "").trim().toLowerCase();
  if (VALID_MODES.includes(fromEnv)) return fromEnv;
  return VALID_MODES.includes(DEFAULT_SERVER_DOWN_MODE) ? DEFAULT_SERVER_DOWN_MODE : "auto";
}

export const SERVER_DOWN_MODE = resolveMode();