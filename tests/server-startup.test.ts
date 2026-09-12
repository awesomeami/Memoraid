import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import { expect, it } from "vitest";

it("starts the unbundled Vercel API in native Node and returns JSON from health and protected routes", () => {
  // Vite/esbuild resolve extensionless imports that native Node ESM rejects.
  // Emit separate JS files, then load the actual API entry without a bundler or TS loader.
  const root = process.cwd();
  const output = mkdtempSync(join(root, "node_modules", ".memoraid-startup-"));
  try {
    const program = ts.createProgram([resolve(root, "api/index.ts")], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      esModuleInterop: true, skipLibCheck: true, strict: true,
      rootDir: root, outDir: output, noEmitOnError: true,
    });
    const emitted = program.emit();
    expect(emitted.emitSkipped, ts.formatDiagnosticsWithColorAndContext(emitted.diagnostics, {
      getCanonicalFileName: name => name, getCurrentDirectory: () => root, getNewLine: () => "\n",
    })).toBe(false);
    writeFileSync(join(output, "package.json"), '{"type":"module"}');
    const entry = pathToFileURL(join(output, "api/index.js")).href;
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
      import assert from "node:assert/strict";
      const { default: app } = await import(${JSON.stringify(entry)});
      const server = await new Promise(resolve => {
        const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
      });
      try {
        const base = "http://127.0.0.1:" + server.address().port;
        const health = await fetch(base + "/api/health");
        assert.equal(health.status, 200);
        assert.ok(health.headers.get("content-type").includes("application/json"));
        assert.equal((await health.json()).firebaseAdminInitialized, false);
        for (const route of ["generate", "ocr-extract", "validate-key"]) {
          const response = await fetch(base + "/api/mnemonic/" + route, {
            method: "POST", headers: { "Content-Type": "application/json", "X-User-Gemini-Key": "fixture" }, body: "{}",
          });
          assert.equal(response.status, 401, route);
          assert.equal(typeof (await response.json()).error, "string", route);
        }
        console.log("Native API startup and JSON routes verified");
      } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      }
    `], {
      cwd: root,
      // Deliberately unconfigured Firebase: startup must work without accessing real services.
      env: { ...process.env, NODE_ENV: "production", FIREBASE_SERVICE_ACCOUNT_KEY: "{}" },
      encoding: "utf8", timeout: 20_000,
    });
    expect(result.status, result.stderr || result.error?.message).toBe(0);
    expect(result.stdout).toContain("Native API startup and JSON routes verified");
  } finally {
    if (!resolve(output).startsWith(resolve(root, "node_modules") + sep)) throw new Error("Unsafe test cleanup path");
    rmSync(output, { recursive: true, force: true });
  }
}, 30_000);
