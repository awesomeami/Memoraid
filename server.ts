import express from "express";
import { app } from "./src/server-app.js";
import path from "path";
import { createServer as createViteServer } from "vite";

const PORT = 3000;

async function startServer() {
  // Serve static assets in production
  if (process.env.NODE_ENV === "production") {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Production static assets and index.html fallback mounted successfully.");
  } else {
    // Vite middleware for dev mode
    console.log("Starting Vite development server middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development server middleware mounted successfully.");
  }

  console.log("Express API routes and Vite/static middleware successfully mounted.");

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Standalone Express server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("FATAL STARTUP ERROR:", err);
  process.exit(1);
});
