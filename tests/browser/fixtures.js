import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, expect } from "@playwright/test";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForHealth(child, url, output) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (hasExited(child)) throw new Error(`FastAPI server exited early.\n${output.join("")}`);
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  child.kill("SIGTERM");
  throw new Error(`FastAPI server did not become ready.\n${output.join("")}`);
}

export const test = base.extend({
  appServer: async ({}, use, testInfo) => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), `splitmoney-${testInfo.workerIndex}-`));
    const databasePath = path.join(tempDirectory, "browser.sqlite3");
    const port = await freePort();
    const url = `http://127.0.0.1:${port}`;
    const python = process.env.SPLITMONEY_PYTHON || path.join(repositoryRoot, ".venv", "bin", "python");
    let child = null;
    let output = [];

    const start = async () => {
      output = [];
      child = spawn(python, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port)], {
        cwd: repositoryRoot,
        env: { ...process.env, SPLITMONEY_DB_PATH: databasePath },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (chunk) => output.push(chunk.toString()));
      child.stderr.on("data", (chunk) => output.push(chunk.toString()));
      await waitForHealth(child, url, output);
    };

    const stop = async () => {
      if (!child || hasExited(child)) return;
      const stopping = child;
      const exitPromise = new Promise((resolve) => {
        if (hasExited(stopping)) resolve();
        else stopping.once("exit", resolve);
      });
      if (!hasExited(stopping)) stopping.kill("SIGTERM");
      const exitedDuringGrace = await Promise.race([
        exitPromise.then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 3_000)),
      ]);
      if (!exitedDuringGrace && !hasExited(stopping)) {
        stopping.kill("SIGKILL");
      }
      if (!hasExited(stopping)) {
        await exitPromise;
      }
    };

    try {
      await start();
      await use({
        url,
        databasePath,
        restart: async () => {
          await stop();
          await start();
        },
      });
    } finally {
      await stop();
      await rm(tempDirectory, { recursive: true, force: true });
    }
  },
});

export { expect };
