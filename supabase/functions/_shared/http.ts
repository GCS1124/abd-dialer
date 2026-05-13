export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retry-count",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

export function optionsResponse() {
  return new Response("ok", { headers: corsHeaders });
}

export function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}
