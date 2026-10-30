/**
 * Checks the emulators are up (started by `firebase emulators:exec`). No credentials are set up:
 * under the emulator the Admin SDK uses gRPC and needs no Application Default Credentials, which
 * this suite now proves (QA-08; it used to need a fake GCE metadata server).
 */

async function reachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return true;
  } catch {
    return false;
  }
}

export default async function setup() {
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:3480";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:3481";
  for (const host of [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST]) {
    if (!(await reachable(`http://${host}/`))) throw new Error(`No emulator at ${host}. Run \`npm run test:emulator\`.`);
  }
}
