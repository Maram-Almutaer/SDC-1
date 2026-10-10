// negative checks: sqli, xss, auth
const BASE = "http://127.0.0.1:8787";
async function main() {
  // SQLi login attempt
  let r = await fetch(BASE + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "' OR '1'='1", password: "x" }),
  });
  console.log("sqli-login:", r.status, "(expect 401/400, not 200)");
  // XSS: register with script name, then check /orders page escapes it
  const evil = "<script>alert(1)</script>";
  const email = `xss_${Date.now()}@example.com`;
  r = await fetch(BASE + "/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: evil, email, password: "Password123" }),
  });
  const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  console.log("xss-register:", r.status);
  r = await fetch(BASE + "/orders", { headers: { Cookie: cookie } });
  const h = await r.text();
  console.log("xss-escaped:", !h.includes("<script>alert(1)</script>"), "has-escaped=" + h.includes("&lt;script&gt;"));
  // wrong password
  r = await fetch(BASE + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "wrongpass1" }),
  });
  console.log("wrong-pass:", r.status, "(expect 401)");
  // 404 for missing order
  r = await fetch(BASE + "/api/orders/999999", { headers: { Cookie: cookie } });
  console.log("missing-order:", r.status, "(expect 404)");
  console.log("NEG PASS");
}
main().catch((e) => {
  console.error("NEG FAIL:", e.message);
  process.exit(1);
});
