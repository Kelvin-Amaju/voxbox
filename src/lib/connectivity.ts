let cachedOnline: boolean | null = null;
let lastChecked = 0;
const TTL_MS = 60_000;

export async function isOnline(force = false): Promise<boolean> {
  const now = Date.now();
  if (!force && cachedOnline !== null && now - lastChecked < TTL_MS) {
    return cachedOnline;
  }

  let online = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      method: "GET",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY || ""}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    online = res.ok;
  } catch {
    online = false;
  }

  cachedOnline = online;
  lastChecked = now;
  return online;
}
