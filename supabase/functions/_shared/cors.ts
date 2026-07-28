// @ts-ignore: Deno global is provided by the Edge runtime.
declare const Deno: { env: { get: (key: string) => string | undefined } };

const ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type";
const ALLOWED_METHODS = "POST, OPTIONS";

// Capacitor's WebView issues requests from these origins on Android/iOS.
const NATIVE_APP_ORIGINS = ["capacitor://localhost", "http://localhost", "https://localhost"];

function allowlist() {
  return (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": ALLOWED_HEADERS,
  "Access-Control-Allow-Methods": ALLOWED_METHODS,
  "Content-Type": "application/json"
};

/**
 * CORS headers for privileged endpoints (staff-admin).
 *
 * Set the ALLOWED_ORIGINS secret to a comma-separated list of your own origins
 * to activate origin pinning, e.g.
 *   supabase secrets set ALLOWED_ORIGINS="https://the-taste.vercel.app,https://pos.example.com"
 *
 * While ALLOWED_ORIGINS is unset this falls back to "*" so existing deployments
 * keep working. Requests are still authenticated by Bearer token either way —
 * this narrows which pages a browser will let read the response.
 */
export function restrictedCorsHeaders(req: Request) {
  const configured = allowlist();
  if (!configured.length) return corsHeaders;

  const origin = req.headers.get("origin") || "";
  const permitted = [...configured, ...NATIVE_APP_ORIGINS];
  const match = permitted.includes(origin) ? origin : configured[0];

  return {
    "Access-Control-Allow-Origin": match,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Vary": "Origin",
    "Content-Type": "application/json"
  };
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = corsHeaders) {
  return new Response(JSON.stringify(body), { status, headers });
}
