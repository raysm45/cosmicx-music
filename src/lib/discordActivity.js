import { useEffect, useCallback } from "react";
import { Api, setAuthToken } from "./api.js";
import { IS_DISCORD_ACTIVITY, DISCORD_HOST_CLIENT_ID, debug, note, restoreDiscordQuery } from "./discordEnv.js";

export { IS_DISCORD_ACTIVITY };

let sessionPromise = null;
let sessionSdk = null;
let pendingActivity = null;

export function bootDiscordActivity() {
  if (!IS_DISCORD_ACTIVITY) return Promise.resolve(null);
  if (sessionPromise) return sessionPromise;

  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID || DISCORD_HOST_CLIENT_ID;
  debug.clientId = clientId || null;

  sessionPromise = (async () => {
    if (!clientId) throw new Error("VITE_DISCORD_CLIENT_ID kosong dan host bukan *.discordsays.com");
    restoreDiscordQuery();
    const { DiscordSDK } = await import("@discord/embedded-app-sdk");
    const sdk = new DiscordSDK(clientId);
    await sdk.ready();
    note("sdk.ready", true);

    const { code } = await sdk.commands.authorize({
      client_id: clientId,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: ["identify", "rpc.activities.write"],
    });
    note("authorize", true);

    const tokenRes = await Api.discordActivityToken(code);
    if (!tokenRes?.access_token) throw new Error("backend tidak mengembalikan access_token");
    if (tokenRes.token) setAuthToken(tokenRes.token);
    note("token-exchange", true);

    await sdk.commands.authenticate({ access_token: tokenRes.access_token });
    note("authenticate", true);

    sessionSdk = sdk;
    if (pendingActivity) pushActivity(sdk, pendingActivity);
    return sdk;
  })();
  sessionPromise.catch((e) => note("boot", false, e));
  return sessionPromise;
}

async function pushActivity(sdk, activity) {
  try {
    await sdk.commands.setActivity({ activity });
    note("setActivity", true);
  } catch (e) {
    note("setActivity", false, e);
    const { assets, type, ...rest } = activity;
    try {
      await sdk.commands.setActivity({ activity: { ...rest, type: 0 } });
      note("setActivity(fallback)", true);
    } catch (e2) {
      note("setActivity(fallback)", false, e2);
    }
  }
}

export function useDiscordActivity() {
  useEffect(() => {
    if (IS_DISCORD_ACTIVITY) bootDiscordActivity().catch(() => {});
  }, []);

  const updateActivity = useCallback(({ title, artist, cover, isPlaying }) => {
    if (!title) return;
    const status = isPlaying ? "Mendengarkan" : "Dijeda";
    const activity = {
      type: 2,
      details: title.slice(0, 128),
      state: (artist ? `${status} · ${artist}` : status).slice(0, 128),
      assets: cover ? { large_image: cover, large_text: title.slice(0, 128) } : undefined,
      timestamps: isPlaying ? { start: Date.now() } : undefined,
    };
    pendingActivity = activity;
    if (sessionSdk) pushActivity(sessionSdk, activity);
  }, []);

  return { updateActivity, isInsideDiscord: IS_DISCORD_ACTIVITY };
}