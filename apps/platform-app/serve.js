// Production SPA server (Express). Serves dist/ with SPA rewrites for client-side routing.
// Used in the platform-app Railway container.
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? 5173;
const DIST = path.resolve(__dirname, "dist");

const app = express();

app.disable("x-powered-by");

// long cache for hashed assets, no-cache for index.html
app.use(
  express.static(DIST, {
    setHeaders(res, filePath) {
      if (/\/assets\//.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }),
);

// SPA fallback
app.get("*", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(path.join(DIST, "index.html"));
});

app.listen(PORT, () => {
  console.log(`platform-app serving on :${PORT}`);
});
