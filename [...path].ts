// Vercel fallback for deployments that do not run server/index.ts.
// It keeps the Railway API server-side so the browser never hits its CORS
// restriction directly.

const upstreamApiBaseUrl = (
  process.env.API_BASE_URL ??
  "https://futballbackend-production-f14d.up.railway.app"
).replace(/\/+$/, "");

const skippedHeaders = new Set([
  "connection",
  "content-length",
  "content-encoding",
  "host",
  "origin",
  "referer",
  "transfer-encoding",
]);

export default async function handler(req: any, res: any) {
  const requestUrl = typeof req.url === "string" ? req.url : "/api";
  // Vercel normally keeps /api in req.url, but some adapters pass the
  // function-relative path. The Railway service expects the /api prefix in
  // both cases.
  const upstreamPath = requestUrl.startsWith("/api")
    ? requestUrl
    : `/api${requestUrl.startsWith("/") ? requestUrl : `/${requestUrl}`}`;
  const headers: Record<string, string> = {};

  for (const [name, value] of Object.entries(req.headers ?? {})) {
    if (skippedHeaders.has(name.toLowerCase()) || value == null) continue;
    headers[name] = Array.isArray(value) ? value.join(", ") : String(value);
  }

  const method = String(req.method ?? "GET").toUpperCase();
  const body =
    method === "GET" || method === "HEAD" || req.body === undefined
      ? undefined
      : typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body);

  try {
    const upstream = await fetch(`${upstreamApiBaseUrl}${upstreamPath}`, {
      method,
      headers,
      body,
    });

    upstream.headers.forEach((value, name) => {
      if (!skippedHeaders.has(name.toLowerCase())) res.setHeader(name, value);
    });
    res.status(upstream.status).end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upstream API request failed";
    res.status(502).json({ success: false, message });
  }
}