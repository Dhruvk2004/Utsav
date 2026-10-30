// Manual QA only: starts a private Firebase Auth + Firestore emulator pair and the scripted Gemini
// (../signed-in/fakeGoogle.mjs) for one tester whose app runs on PORT, so several testers can run
// side by side. Ports are derived from PORT: Firestore PORT-6, Auth PORT-5, hub PORT-4, logging
// PORT-3, Firestore websocket PORT-2, scripted Gemini PORT+1. Nothing in src knows this exists.
//   JAVA_HOME=/opt/homebrew/opt/openjdk@21 node e2e/manual-qa/emulators.mjs 3410
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 3400 || port > 3499) {
  console.error("Usage: node e2e/manual-qa/emulators.mjs <app port 3400-3499>");
  process.exit(1);
}

const root = resolve(import.meta.dirname, "../..");
const host = "127.0.0.1";
const config = {
  firestore: { rules: join(root, "firestore.rules"), indexes: join(root, "firestore.indexes.json") },
  emulators: {
    firestore: { host, port: port - 6, websocketPort: port - 2 },
    auth: { host, port: port - 5 },
    hub: { host, port: port - 4 },
    logging: { host, port: port - 3 },
    ui: { enabled: false },
    singleProjectMode: true,
  },
};
const configPath = join(tmpdir(), `utsav-manual-qa-${port}.firebase.json`);
writeFileSync(configPath, JSON.stringify(config, null, 2));

const children = [
  spawn("node", [join(root, "e2e/signed-in/fakeGoogle.mjs")], {
    stdio: "inherit",
    env: { ...process.env, FAKE_GOOGLE_PORT: String(port + 1) },
  }),
  spawn(
    "npx",
    ["--yes", "firebase-tools@15.17.0", "emulators:start", "--config", configPath, "--only", "auth,firestore", "--project", "demo-utsav"],
    { stdio: "inherit", cwd: root },
  ),
];

console.log(
  `Emulators for app port ${port}: Firestore ${host}:${port - 6}, Auth ${host}:${port - 5}, scripted Gemini ${host}:${port + 1}. Ctrl+C stops all.`,
);

const stop = () => children.forEach((child) => child.kill("SIGINT"));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
children.forEach((child) => child.on("exit", stop));
