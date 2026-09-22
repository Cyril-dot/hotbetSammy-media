import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const upstreamApiBaseUrl = (
  process.env.API_BASE_URL ??
  "https://futballbackend-production-ee88.up.railway.app"
).replace(/\/+$/, "");

const proxyHeadersToSkip = new Set([
  "connection",
  "content-length",
  "content-encoding",
  "host",
  "origin",
  "referer",
  "transfer-encoding",
]);
function minimumDepositError(path: string, method: string, body: any): string | null {
  if (method !== "POST" || !path.startsWith("/api/wallet/deposit/")) return null;
  const amount = Number(body?.amount);
  if (Number.isFinite(amount) && amount < 300) return "The minimum deposit is GHS 300.";
  return null;
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // The browser talks to this app's origin. Forwarding the request server-side
  // avoids the Railway API rejecting the deployed site's CORS preflight.
  app.use(express.json({ limit: "2mb" }));
  app.use("/api", async (req, res) => {
    const minimumError = minimumDepositError(req.originalUrl, req.method, req.body);
    if (minimumError) { res.status(400).json({ success: false, message: minimumError }); return; }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(req.headers)) {
        if (proxyHeadersToSkip.has(name.toLowerCase()) || value == null) continue;
        headers[name] = Array.isArray(value) ? value.join(", ") : value;
      }

      const hasBody = !["GET", "HEAD"].includes(req.method) && req.body !== undefined;
      const upstream = await fetch(`${upstreamApiBaseUrl}${req.originalUrl}`, {
        method: req.method,
        headers,
        body: hasBody ? JSON.stringify(req.body) : undefined,
        signal: controller.signal,
      });

      res.status(upstream.status);
      upstream.headers.forEach((value, name) => {
        if (!proxyHeadersToSkip.has(name.toLowerCase())) {
          res.setHeader(name, value);
        }
      });
      res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upstream API request failed";
      res.status(502).json({ success: false, message });
    } finally {
      clearTimeout(timeout);
    }
  });

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
