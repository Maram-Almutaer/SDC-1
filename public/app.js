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
