// Manual QA only: asks the tester's Auth emulator (PORT-5) for a Google ID token for a brand-new
// user and prints a line to paste into the browser console on http://localhost:PORT. The line posts
// the token to the real `POST /api/session` (same origin, so the app's CSP and Origin check pass)
// and opens /onboarding. The page's CSP blocks the emulator itself, hence this two-step path.
//   node e2e/manual-qa/signin.mjs 3410 "Asha Verma"
const port = Number(process.argv[2]);
const name = process.argv[3] ?? "QA Tester";
if (!Number.isInteger(port) || port < 3400 || port > 3499) {
  console.error('Usage: node e2e/manual-qa/signin.mjs <app port 3400-3499> ["Display Name"]');
  process.exit(1);
}

const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const claims = { sub: `qa-${id}`, email: `qa-${id}@example.com`, email_verified: true, name };
const response = await fetch(`http://127.0.0.1:${port - 5}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=fake-api-key`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    postBody: `id_token=${encodeURIComponent(JSON.stringify(claims))}&providerId=google.com`,
    requestUri: "http://localhost",
    returnSecureToken: true,
  }),
});
if (!response.ok) {
  console.error(`Auth emulator on 127.0.0.1:${port - 5} answered ${response.status}: ${await response.text()}`);
  process.exit(1);
}
const { idToken } = await response.json();

console.error(
  `New user ${claims.email} (${name}). Open http://localhost:${port}/ and paste this line into the DevTools console (valid for 1 hour):\n`,
);
console.log(
  `fetch("/api/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({idToken:${JSON.stringify(idToken)}})}).then(async r=>{console.log(r.status,await r.text());if(r.ok)location.assign("/dashboard")})`,
);
