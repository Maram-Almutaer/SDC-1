/* Sahara Souq — سوق الصحراء
 * Cloudflare Workers + D1 e-commerce app (Arabic+English)
 * Workflow: Register → Login → Add to cart → Checkout (create order) → View /orders/:id
 */

export interface Env {
  DB: D1Database;
}

interface User {
  id: number;
  name: string;
  email: string;
  created_at: string;
}

// ---------- utils ----------
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtSAR(cents: number): string {
  return (cents / 100).toFixed(2) + " ر.س";
}

function parseCookies(req: Request): Record<string, string> {
  const h = req.headers.get("Cookie") || "";
  const out: Record<string, string> = {};
  for (const part of h.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) {
      const k = part.slice(0, i).trim();
      const v = part.slice(i + 1).trim();
      if (k) out[k] = decodeURIComponent(v);
    }
  }
  return out;
}

function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decodeToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomHex(nBytes: number): string {
  const b = new Uint8Array(nBytes);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Secure password hashing: PBKDF2-SHA256, 100k iterations
async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = b64encode(saltBytes);
  const hash = await pbkdf2(password, salt);
  return { hash, salt };
}

async function pbkdf2(password: string, saltB64: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: b64decodeToBytes(saltB64) as unknown as ArrayBuffer, iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  return b64encode(bits);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  try {
    const h = await pbkdf2(password, salt);
    return timingSafeEqual(h, expectedHash);
  } catch {
    return false;
  }
}

// ---------- sessions ----------
async function createSession(env: Env, userId: number, reqUrl: string): Promise<string> {
  const token = randomHex(32);
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, userId, expires)
    .run();
  return token;
}

function sessionCookie(token: string, reqUrl: string, maxAge = 7 * 24 * 3600): string {
  const secure = reqUrl.startsWith("https://") ? "; Secure" : "";
  return `session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

async function getUser(req: Request, env: Env): Promise<User | null> {
  const cookies = parseCookies(req);
  const token = cookies["session"];
  if (!token) return null;
  const row = await env.DB.prepare(
    "SELECT s.expires_at, u.id, u.name, u.email, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?"
  )
    .bind(token)
    .first<any>();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }
  return { id: row.id, name: row.name, email: row.email, created_at: row.created_at };
}

// ---------- embedded static assets (mirrored in /public) ----------
const CSS = `
:root{--bg:#faf7f2;--card:#fff;--ink:#1f2937;--muted:#6b7280;--brand:#0f766e;--brand2:#b45309;--line:#e7e0d4}
*{box-sizing:border-box}body{margin:0;font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:var(--bg);color:var(--ink)}
a{color:var(--brand)}.topbar{background:#0b3b39;color:#fff;padding:10px 18px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.topbar .logo{font-weight:800;font-size:20px}.topbar .logo small{font-weight:400;opacity:.8}
.topbar nav{display:flex;gap:14px;margin-inline-start:auto;align-items:center}
.topbar nav a{color:#fff;text-decoration:none;opacity:.95}.topbar nav a:hover{text-decoration:underline}
.wrap{max-width:1080px;margin:0 auto;padding:22px 16px}
.hero{background:linear-gradient(135deg,#0f766e,#134e4a);color:#fff;border-radius:16px;padding:28px;display:flex;gap:18px;align-items:center;flex-wrap:wrap}
.hero h1{margin:0 0 6px}.hero p{margin:0;opacity:.9}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;margin-top:18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px}
.card .em{font-size:44px;text-align:center}.card h3{margin:4px 0;font-size:16px}.card .en{color:var(--muted);font-size:12px}
.card .price{font-weight:800;color:var(--brand2)}.card button{background:var(--brand);color:#fff;border:0;border-radius:10px;padding:10px;cursor:pointer}
.card button:hover{filter:brightness(1.08)}
.panel{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin-top:16px}
table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid var(--line);padding:10px;text-align:right;font-size:14px}
input,select,textarea{width:100%;padding:10px;border:1px solid var(--line);border-radius:10px;margin:6px 0}
.btn{background:var(--brand);color:#fff;border:0;border-radius:10px;padding:11px 16px;cursor:pointer;font-size:15px}
.btn.sec{background:#334155}.btn.warn{background:#b45309}
.muted{color:var(--muted)}.row{display:flex;gap:10px;flex-wrap:wrap}.row>*{flex:1;min-width:200px}
.alert{background:#fef3c7;border:1px solid #f59e0b;border-radius:10px;padding:10px;margin:10px 0}
.ok{background:#ecfdf5;border:1px solid #10b981;border-radius:10px;padding:10px;margin:10px 0}
.badge{display:inline-block;background:#e0f2f1;color:#0b3b39;border-radius:20px;padding:2px 10px;font-size:12px}
footer{color:var(--muted);text-align:center;padding:26px;font-size:13px}
`;

const APP_JS = `
async function api(path, opts){ const r = await fetch(path, opts); const t = await r.text(); let j=null; try{j=JSON.parse(t)}catch{} return {r, j, t}; }
function getCart(){ try{return JSON.parse(localStorage.getItem('sahara_cart')||'[]')}catch{return[]} }
function setCart(c){ localStorage.setItem('sahara_cart', JSON.stringify(c)); updateBadge(); }
function updateBadge(){ const c=getCart().reduce((a,i)=>a+(i.qty||0),0); const el=document.getElementById('cartCount'); if(el) el.textContent=c; }
async function loadProducts(){
  const grid=document.getElementById('grid'); if(!grid) return;
  const {r,j}=await api('/api/products');
  if(!r.ok){ grid.innerHTML='<p>تعذر تحميل المنتجات</p>'; return; }
  grid.innerHTML=j.products.map(p=>
    '<div class="card"><div class="em">'+p.emoji+'</div><h3>'+escapeHtml(p.name_ar)+'</h3><div class="en">'+escapeHtml(p.name_en)+'</div><div class="muted">'+escapeHtml(p.description_ar||'')+'</div><div class="price">'+(p.price_cents/100).toFixed(2)+' ر.س</div><div class="muted">المخزون: '+p.stock+'</div><button onclick="addToCart('+p.id+')">أضف إلى السلة 🛒<br><small>Add to cart</small></button></div>'
  ).join('');
}
function escapeHtml(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function addToCart(id){ const c=getCart(); const f=c.find(i=>i.id===id); if(f) f.qty++; else c.push({id,qty:1}); setCart(c); alert('تمت الإضافة إلى السلة ✅'); }
function renderCart(){
  const box=document.getElementById('cartBox'); if(!box) return;
  const c=getCart();
  if(!c.length){ box.innerHTML='<p class="muted">سلتك فارغة. <a href="/">تصفح المنتجات</a></p>'; return; }
  fetch('/api/products').then(r=>r.json()).then(j=>{
    const map=Object.fromEntries(j.products.map(p=>[p.id,p]));
    let total=0;
    box.innerHTML='<table><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th></th></tr>'+c.map(i=>{
      const p=map[i.id]; if(!p) return '';
      total+=p.price_cents*i.qty;
      return '<tr><td>'+escapeHtml(p.name_ar)+'<br><small>'+escapeHtml(p.name_en)+'</small></td><td>'+i.qty+'</td><td>'+(p.price_cents*i.qty/100).toFixed(2)+' ر.س</td><td><button onclick="rmItem('+i.id+')">حذف</button></td></tr>';
    }).join('')+'</table><h3>الإجمالي: '+(total/100).toFixed(2)+' ر.س</h3>';
  });
}
function rmItem(id){ setCart(getCart().filter(i=>i.id!==id)); renderCart(); }
async function checkout(ev){
  ev.preventDefault();
  const f=new FormData(ev.target);
  const body={ items:getCart().map(i=>({product_id:i.id,qty:i.qty})), shipping_name:f.get('shipping_name'), shipping_phone:f.get('shipping_phone'), shipping_city:f.get('shipping_city'), shipping_address:f.get('shipping_address'), notes:f.get('notes')||'' };
  const {r,j}=await api('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok){ alert('خطأ: '+(j?.error||r.status)); return; }
  localStorage.removeItem('sahara_cart'); location.href='/orders/'+j.order.id;
}
async function doLogin(ev){ ev.preventDefault(); const f=new FormData(ev.target); const {r,j}=await api('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:f.get('email'),password:f.get('password')})}); if(!r.ok){ alert(j?.error||'login failed'); return;} location.href='/'; }
async function doRegister(ev){ ev.preventDefault(); const f=new FormData(ev.target); const {r,j}=await api('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.get('name'),email:f.get('email'),password:f.get('password')})}); if(!r.ok){ alert(j?.error||'register failed'); return;} location.href='/'; }
async function doLogout(){ await fetch('/api/logout',{method:'POST'}); location.href='/'; }
document.addEventListener('DOMContentLoaded',()=>{ updateBadge(); loadProducts(); renderCart(); });
`;

// ---------- html ----------
function layout(title: string, body: string, user: User | null): string {
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | سوق الصحراء Sahara Souq</title>
<link rel="stylesheet" href="/style.css"></head><body>
<div class="topbar"><div class="logo">🏜️ سوق الصحراء <small>Sahara Souq</small></div>
<nav>
<a href="/">الرئيسية/Home</a>
<a href="/orders">طلباتي/Orders</a>
<a href="/cart">السلة 🛒 (<span id="cartCount">0</span>)</a>
${user ? `<span>مرحباً ${esc(user.name)}</span><a href="#" onclick="doLogout();return false">تسجيل الخروج/Logout</a>` : `<a href="/login">دخول/Login</a><a href="/register">حساب جديد/Register</a>`}
</nav></div>
<div class="wrap">${body}</div>
<footer>شركة سوق الصحراء Sahara Souq LLC — الرياض، المملكة العربية السعودية • الدفع عند الاستلام • شحن لجميع المدن</footer>
<script src="/app.js"></script></body></html>`;
}

function homePage(user: User | null): string {
  return layout(
    "الرئيسية",
    `<div class="hero"><div><h1>أهلاً بك في سوق الصحراء 🏜️</h1>
<p>تسوق إلكتروني سعودي: عطور، تمور، أزياء، وإلكترونيات — Saudi online shopping, cash on delivery.</p>
<p class="muted" style="color:#d7efe9">سجل حسابك، أضف منتجات للسلة، أتمم طلبك، ثم تابع طلبك من صفحة «طلباتي».</p></div></div>
<div id="grid" class="grid"><p class="muted">جاري تحميل المنتجات… Loading products…</p></div>`,
    user
  );
}

function loginPage(): string {
  return layout(
    "تسجيل الدخول",
    `<div class="panel" style="max-width:460px;margin:20px auto"><h2>تسجيل الدخول / Login</h2>
<form onsubmit="doLogin(event)"><label>البريد الإلكتروني Email</label><input name="email" type="email" required placeholder="you@example.com">
<label>كلمة المرور Password</label><input name="password" type="password" required>
<button class="btn" type="submit">دخول</button></form>
<p class="muted">ليس لديك حساب؟ <a href="/register">سجل الآن</a></p></div>`,
    null
  );
}

function registerPage(): string {
  return layout(
    "حساب جديد",
    `<div class="panel" style="max-width:460px;margin:20px auto"><h2>إنشاء حساب / Register</h2>
<form onsubmit="doRegister(event)"><label>الاسم الكامل Full name</label><input name="name" required placeholder="مثال: محمد العتيبي">
<label>البريد الإلكتروني Email</label><input name="email" type="email" required>
<label>كلمة المرور Password (8+ أحرف)</label><input name="password" type="password" required minlength="8">
<button class="btn" type="submit">إنشاء الحساب</button></form></div>`,
    null
  );
}

function cartPage(user: User | null): string {
  return layout(
    "السلة",
    `<h2>سلة التسوق 🛒 / Cart</h2><div class="panel"><div id="cartBox">…</div></div>
<div class="panel"><h3>إتمام الطلب / Checkout</h3>
<form onsubmit="checkout(event)">
<div class="row"><div><label>اسم المستلم</label><input name="shipping_name" required></div>
<div><label>الجوال</label><input name="shipping_phone" required placeholder="05xxxxxxxx"></div></div>
<div class="row"><div><label>المدينة</label><input name="shipping_city" required placeholder="الرياض"></div>
<div><label>العنوان</label><input name="shipping_address" required placeholder="الحي، الشارع، المبنى"></div></div>
<label>ملاحظات (اختياري)</label><textarea name="notes" rows="2" placeholder="تغليف هدية؟"></textarea>
<button class="btn" type="submit">تأكيد الطلب / Place order</button>
<p class="muted">الدفع عند الاستلام. سيظهر لك رقم الطلب مثل <code>/orders/583</code>.</p></form></div>`,
    user
  );
}

function ordersListPage(user: User, orders: any[]): string {
  const rows =
    orders.length === 0
      ? `<p class="muted">لا توجد طلبات بعد. <a href="/">ابدأ التسوق</a></p>`
      : `<table><tr><th>رقم الطلب</th><th>الحالة</th><th>الإجمالي</th><th>التاريخ</th><th></th></tr>` +
        orders
          .map(
            (o) =>
              `<tr><td>#${o.id}</td><td><span class="badge">${esc(o.status)}</span></td><td>${fmtSAR(o.total_cents)}</td><td>${esc(o.created_at)}</td><td><a href="/orders/${o.id}">عرض / View</a></td></tr>`
          )
          .join("") +
        `</table>`;
  return layout(`طلباتي`, `<h2>طلباتي / My Orders</h2><div class="panel">${rows}</div>`, user);
}

function orderDetailPage(user: User, order: any, items: any[]): string {
  const itemRows = items
    .map(
      (it) =>
        `<tr><td>${esc(it.emoji || "📦")} ${esc(it.name_ar)}<br><small>${esc(it.name_en)}</small></td><td>${it.qty}</td><td>${fmtSAR(it.unit_price_cents)}</td><td>${fmtSAR(it.qty * it.unit_price_cents)}</td></tr>`
    )
    .join("");
  return layout(
    `طلب #${order.id}`,
    `<p><a href="/orders">← كل الطلبات</a></p>
<h2>طلب رقم #${order.id} <span class="badge">${esc(order.status)}</span></h2>
<div class="panel"><div class="row">
<div><b>المستلم:</b> ${esc(order.shipping_name)}<br><b>الجوال:</b> ${esc(order.shipping_phone)}<br><b>المدينة:</b> ${esc(order.shipping_city)}<br><b>العنوان:</b> ${esc(order.shipping_address)}</div>
<div><b>التاريخ:</b> ${esc(order.created_at)}<br><b>الإجمالي:</b> ${fmtSAR(order.total_cents)}<br><b>ملاحظات:</b> ${esc(order.notes || "—")}</div>
</div>
<p><a class="btn" href="/orders/${order.id}/invoice">تحميل الفاتورة PDF / Download invoice</a></p></div>
<div class="panel"><h3>المنتجات / Items</h3><table><tr><th>المنتج</th><th>كمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr>${itemRows}</table></div>`,
    user
  );
}

// ---------- minimal PDF invoice (English/ASCII so Helvetica renders; flag is ASCII) ----------
function toAscii(s: string): string {
  return String(s ?? "").replace(/[^\x20-\x7E\n]/g, "?");
}
function pdfEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
function buildInvoicePdf(order: any, items: any[]): Uint8Array {
  const lines = [
    "Sahara Souq LLC - Invoice",
    `Order #${order.id}   Status: ${toAscii(order.status)}`,
    `Date: ${toAscii(order.created_at)}`,
    `Ship to: ${toAscii(order.shipping_name)} - ${toAscii(order.shipping_city)}`,
    `Phone: ${toAscii(order.shipping_phone)}`,
    `Address: ${toAscii(order.shipping_address)}`,
    "----------------------------------------",
    ...items.map((it) => `${toAscii(it.name_en).slice(0, 34)} x${it.qty} @ ${(it.unit_price_cents / 100).toFixed(2)} = ${((it.qty * it.unit_price_cents) / 100).toFixed(2)} SAR`),
    "----------------------------------------",
    `TOTAL: ${(order.total_cents / 100).toFixed(2)} SAR`,
    `Notes: ${toAscii(order.notes || "-")}`,
    "Cash on delivery. Thank you for shopping with Sahara Souq!",
  ];
  let content = "";
  let y = 770;
  for (const ln of lines) {
    content += `BT /F1 11 Tf 50 ${y} Td (${pdfEscape(ln.slice(0, 90))}) Tj ET\n`;
    y -= 18;
    if (y < 50) break;
  }
  const objs: string[] = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objs[3] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>";
  objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objs[5] = `<< /Length ${content.length} >>\nstream\n${content}endstream`;
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 1; i <= 5; i++) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefPos = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

// ---------- handlers ----------
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
function html(s: string, status = 200): Response {
  return new Response(s, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
function redirect(to: string, cookie?: string): Response {
  const h: Record<string, string> = { Location: to };
  if (cookie) h["Set-Cookie"] = cookie;
  return new Response(null, { status: 302, headers: h });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();

    // static assets
    if (path === "/style.css") return new Response(CSS, { headers: { "Content-Type": "text/css; charset=utf-8" } });
    if (path === "/app.js") return new Response(APP_JS, { headers: { "Content-Type": "application/javascript; charset=utf-8" } });

    // --- API: products ---
    if (path === "/api/products" && method === "GET") {
      const { results } = await env.DB.prepare("SELECT id, name_ar, name_en, description_ar, price_cents, stock, emoji, category FROM products ORDER BY id").all();
      return json({ products: results });
    }

    if (path === "/api/me" && method === "GET") {
      const u = await getUser(req, env);
      if (!u) return json({ error: "unauthorized" }, 401);
      return json({ user: u });
    }

    // --- API: register ---
    if (path === "/api/register" && method === "POST") {
      let b: any;
      try { b = await req.json(); } catch { return json({ error: "طلب غير صالح / invalid JSON" }, 400); }
      const name = String(b.name || "").trim();
      const email = String(b.email || "").trim().toLowerCase();
      const password = String(b.password || "");
      if (name.length < 2) return json({ error: "الاسم قصير جداً" }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "بريد إلكتروني غير صالح / invalid email" }, 400);
      if (password.length < 8) return json({ error: "كلمة المرور 8 أحرف على الأقل / password min 8 chars" }, 400);
      const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
      if (exists) return json({ error: "البريد مسجل مسبقاً / email already registered" }, 409);
      const { hash, salt } = await hashPassword(password);
      const ins = await env.DB.prepare("INSERT INTO users (name, email, password_hash, password_salt) VALUES (?, ?, ?, ?)")
        .bind(name, email, hash, salt).run();
      const userId = Number(ins.meta.last_row_id);
      const token = await createSession(env, userId, req.url);
      return new Response(JSON.stringify({ ok: true, user: { id: userId, name, email } }), {
        status: 201,
        headers: { "Content-Type": "application/json; charset=utf-8", "Set-Cookie": sessionCookie(token, req.url) },
      });
    }

    // --- API: login ---
    if (path === "/api/login" && method === "POST") {
      let b: any;
      try { b = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
      const email = String(b.email || "").trim().toLowerCase();
      const password = String(b.password || "");
      const row = await env.DB.prepare("SELECT id, name, email, password_hash, password_salt, created_at FROM users WHERE email = ?").bind(email).first<any>();
      if (!row) return json({ error: "بيانات الدخول غير صحيحة / invalid credentials" }, 401);
      const ok = await verifyPassword(password, row.password_salt, row.password_hash);
      if (!ok) return json({ error: "بيانات الدخول غير صحيحة / invalid credentials" }, 401);
      const token = await createSession(env, row.id, req.url);
      return new Response(JSON.stringify({ ok: true, user: { id: row.id, name: row.name, email: row.email } }), {
        headers: { "Content-Type": "application/json; charset=utf-8", "Set-Cookie": sessionCookie(token, req.url) },
      });
    }

    // --- API: logout ---
    if (path === "/api/logout" && method === "POST") {
      const c = parseCookies(req);
      if (c.session) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(c.session).run();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json; charset=utf-8", "Set-Cookie": sessionCookie("deleted", req.url, 0) },
      });
    }
    if (path === "/logout" && method === "GET") {
      const c = parseCookies(req);
      if (c.session) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(c.session).run();
      return redirect("/", sessionCookie("deleted", req.url, 0));
    }

    // --- API: list my orders (correctly scoped) ---
    if (path === "/api/orders" && method === "GET") {
      const u = await getUser(req, env);
      if (!u) return json({ error: "unauthorized" }, 401);
      const { results } = await env.DB.prepare("SELECT id, status, total_cents, created_at FROM orders WHERE user_id = ? ORDER BY id DESC").bind(u.id).all();
      return json({ orders: results });
    }

    // --- API: create order (checkout) ---
    if (path === "/api/orders" && method === "POST") {
      const u = await getUser(req, env);
      if (!u) return json({ error: "سجل الدخول أولاً / please login" }, 401);
      let b: any;
      try { b = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
      const items = Array.isArray(b.items) ? b.items : [];
      const shipping_name = String(b.shipping_name || "").trim();
      const shipping_phone = String(b.shipping_phone || "").trim();
      const shipping_city = String(b.shipping_city || "").trim();
      const shipping_address = String(b.shipping_address || "").trim();
      const notes = String(b.notes || "").slice(0, 500);
      if (!items.length) return json({ error: "السلة فارغة / cart is empty" }, 400);
      if (items.length > 20) return json({ error: "عدد الأصناف كبير" }, 400);
      if (!shipping_name || !shipping_phone || !shipping_city || !shipping_address)
        return json({ error: "أكمل بيانات الشحن / shipping details required" }, 400);
      if (!/^0?5\d{8}$/.test(shipping_phone.replace(/[\s-]/g, "")))
        return json({ error: "رقم الجوال غير صالح / invalid phone (05xxxxxxxx)" }, 400);

      // validate products + compute total
      let total = 0;
      const lines: { product_id: number; qty: number; unit: number }[] = [];
      for (const it of items) {
        const pid = Number(it.product_id);
        const qty = Number(it.qty);
        if (!Number.isInteger(pid) || !Number.isInteger(qty) || qty < 1 || qty > 10)
          return json({ error: "كمية غير صالحة" }, 400);
        const p = await env.DB.prepare("SELECT id, price_cents, stock FROM products WHERE id = ?").bind(pid).first<any>();
        if (!p) return json({ error: `منتج غير موجود: ${pid}` }, 400);
        if (p.stock < qty) return json({ error: `نفد المخزون للمنتج ${pid}` }, 400);
        total += p.price_cents * qty;
        lines.push({ product_id: pid, qty, unit: p.price_cents });
      }
      const ins = await env.DB.prepare(
        "INSERT INTO orders (user_id, status, total_cents, shipping_name, shipping_phone, shipping_city, shipping_address, notes) VALUES (?, 'confirmed', ?, ?, ?, ?, ?, ?)"
      ).bind(u.id, total, shipping_name, shipping_phone, shipping_city, shipping_address, notes).run();
      const orderId = Number(ins.meta.last_row_id);
      const stmts = lines.map((l) =>
        env.DB.prepare("INSERT INTO order_items (order_id, product_id, qty, unit_price_cents) VALUES (?, ?, ?, ?)").bind(orderId, l.product_id, l.qty, l.unit)
      );
      stmts.push(...lines.map((l) => env.DB.prepare("UPDATE products SET stock = stock - ? WHERE id = ?").bind(l.qty, l.product_id)));
      await env.DB.batch(stmts);
      return json({ ok: true, order: { id: orderId, total_cents: total } }, 201);
    }

    // --- API: order detail (JSON) — requires login, returns order by id ---
    const apiDetail = path.match(/^\/api\/orders\/(\d+)$/);
    if (apiDetail && method === "GET") {
      const u = await getUser(req, env);
      if (!u) return json({ error: "unauthorized" }, 401);
      const id = Number(apiDetail[1]);
      const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<any>();
      if (!order) return json({ error: "order not found" }, 404);
      const { results: orderItems } = await env.DB.prepare(
        "SELECT oi.qty, oi.unit_price_cents, p.name_ar, p.name_en, p.emoji FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?"
      ).bind(id).all();
      return json({ order, items: orderItems });
    }

    // --- invoice PDF ---
    const invMatch = path.match(/^\/orders\/(\d+)\/invoice$/);
    if (invMatch && method === "GET") {
      const u = await getUser(req, env);
      if (!u) return redirect("/login");
      const id = Number(invMatch[1]);
      const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<any>();
      if (!order) return html(layout("غير موجود", `<div class="panel"><h2>الطلب غير موجود (404)</h2></div>`, u), 404);
      const { results: orderItems } = await env.DB.prepare(
        "SELECT oi.qty, oi.unit_price_cents, p.name_ar, p.name_en FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?"
      ).bind(id).all();
      const pdf = buildInvoicePdf(order, orderItems || []);
      return new Response(pdf as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="invoice-${order.id}.pdf"`,
        },
      });
    }

    // --- pages ---
    if (path === "/" && method === "GET") {
      const u = await getUser(req, env);
      return html(homePage(u));
    }
    if (path === "/login" && method === "GET") return html(loginPage());
    if (path === "/register" && method === "GET") return html(registerPage());
    if (path === "/cart" && method === "GET") {
      const u = await getUser(req, env);
      return html(cartPage(u));
    }
    if (path === "/orders" && method === "GET") {
      const u = await getUser(req, env);
      if (!u) return redirect("/login");
      const { results } = await env.DB.prepare("SELECT id, status, total_cents, created_at FROM orders WHERE user_id = ? ORDER BY id DESC").bind(u.id).all();
      return html(ordersListPage(u, results || []));
    }

    // --- order detail page (HTML) — requires login, shows order by id ---
    const detailMatch = path.match(/^\/orders\/(\d+)\/?$/);
    if (detailMatch && method === "GET") {
      const u = await getUser(req, env);
      if (!u) return redirect("/login");
      const id = Number(detailMatch[1]);
      const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<any>();
      if (!order) return html(layout("غير موجود", `<div class="panel"><h2>الطلب غير موجود (404)</h2><p><a href="/orders">عودة</a></p></div>`, u), 404);
      const { results: orderItems } = await env.DB.prepare(
        "SELECT oi.qty, oi.unit_price_cents, p.name_ar, p.name_en, p.emoji FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?"
      ).bind(id).all();
      return html(orderDetailPage(u, order, orderItems || []));
    }

    return html(layout("404", `<div class="panel"><h2>صفحة غير موجودة (404)</h2><p><a href="/">عودة للرئيسية</a></p></div>`, await getUser(req, env)), 404);
  },
};
