#!/usr/bin/env node
/**
 * Headless-browser boot smoke for the prod web launcher path (#1615).
 *
 * `smoke:web` only asserts GET / serves HTML with the injected token — it
 * never executes the React app in a real browser. This script starts the same
 * prod `mcp-inspector --web` server, opens the built SPA in headless Chromium,
 * asserts the first meaningful UI frame renders (the "Add Servers" control),
 * and fails on uncaught page errors — in particular Node built-ins that leaked
 * into the browser bundle (`Module "node:*" has been externalized for browser
 * compatibility`).
 *
 * Expects `clients/web/dist` and `clients/launcher/build` to be built first —
 * the validate / CI ordering guarantees this, same as `smoke:web`.
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const requireFromWeb = createRequire(
  resolve(repoRoot, "clients/web/package.json"),
);
const { chromium } = requireFromWeb("playwright");
const HOST = "127.0.0.1";
const PORT = process.env.SMOKE_WEB_BROWSER_PORT ?? "6300";
const TOKEN = "smoke-web-browser-token";
const BASE_URL = `http://${HOST}:${PORT}`;
const RENDER_TIMEOUT_MS = Number(
  process.env.SMOKE_WEB_BROWSER_TIMEOUT_MS ?? 30_000,
);

const child = spawn(
  process.execPath,
  [resolve(repoRoot, "clients/launcher/build/index.js"), "--web"],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      CLIENT_PORT: PORT,
      HOST,
      MCP_INSPECTOR_API_TOKEN: TOKEN,
      MCP_AUTO_OPEN_ENABLED: "false",
    },
    stdio: ["ignore", "inherit", "inherit"],
  },
);

let exited = false;
let exitCode = null;
child.on("exit", (code) => {
  exited = true;
  exitCode = code;
});

function shutdown() {
  if (!exited) child.kill("SIGTERM");
}

function fail(message) {
  console.error(`smoke:web:browser FAILED — ${message}`);
  shutdown();
  process.exit(1);
}

function isCriticalBrowserError(message) {
  return (
    message.includes("externalized for browser compatibility") ||
    /Module\s+"node:/.test(message) ||
    message.includes("node:process")
  );
}

async function fetchRoot() {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (exited) {
      throw new Error(
        `launcher exited (code ${exitCode}) before serving — see output above`,
      );
    }
    try {
      return await fetch(`${BASE_URL}/`);
    } catch {
      await delay(500);
    }
  }
  throw new Error("server did not start within 60s");
}

let browser;
try {
  const res = await fetchRoot();
  if (res.status !== 200) {
    fail(`GET / returned HTTP ${res.status}, expected 200`);
  }

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];

  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (isCriticalBrowserError(text)) {
      pageErrors.push(text);
    }
  });

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: /Add Servers/ })
    .waitFor({ state: "visible", timeout: RENDER_TIMEOUT_MS });

  const criticalErrors = pageErrors.filter(isCriticalBrowserError);
  if (criticalErrors.length > 0) {
    fail(
      `uncaught browser errors:\n${criticalErrors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }
  if (pageErrors.length > 0) {
    fail(
      `uncaught page errors:\n${pageErrors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }

  console.log(
    `smoke:web:browser OK — rendered "Add Servers" with no page errors at ${BASE_URL}`,
  );
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  if (browser) await browser.close();
  shutdown();
  process.exit(0);
}
