import compression from "compression";
import { randomBytes } from "crypto";
import express from "express";
import helmet from "helmet";
import path from "path";

const LONG_CACHE_ASSET_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".avif",
  ".ico",
  ".woff",
  ".woff2"
]);

const REVALIDATED_ASSET_EXTENSIONS = new Set([
  ".css",
  ".js",
  ".mjs",
  ".webmanifest"
]);

export function applyHttpDefaults(app, { publicDir, rootDir }) {
  const staticMiddleware = express.static(publicDir, {
    etag: true,
    index: false,
    maxAge: 0,
    setHeaders(res, filePath) {
      const extension = path.extname(filePath).toLowerCase();
      const fileName = path.basename(filePath).toLowerCase();

      if (fileName === "sw.js" || REVALIDATED_ASSET_EXTENSIONS.has(extension)) {
        res.setHeader("Cache-Control", "no-cache");
        return;
      }

      if (LONG_CACHE_ASSET_EXTENSIONS.has(extension)) {
        res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
      }
    }
  });
  const bypassStaticPaths = new Set(["/", "/index.html", "/robots.txt", "/sitemap.xml"]);

  app.set("trust proxy", true);
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.locals.cspNonce = randomBytes(16).toString("base64");
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          formAction: ["'self'"],
          frameAncestors: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          manifestSrc: ["'self'"],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'", (_req, res) => `'nonce-${res.locals.cspNonce}'`],
          scriptSrcAttr: ["'none'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          workerSrc: ["'self'"]
        }
      },
      crossOriginEmbedderPolicy: false
    })
  );
  app.use(compression());
  app.use(express.json({ limit: "256kb" }));

  app.get("/vendor/lucide.min.js", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(rootDir, "node_modules", "lucide", "dist", "umd", "lucide.min.js"));
  });

  app.use((req, res, next) => {
    if (bypassStaticPaths.has(req.path)) {
      next();
      return;
    }
    staticMiddleware(req, res, next);
  });
}
