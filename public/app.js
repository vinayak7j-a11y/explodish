
/* ---------------- API helpers ---------------- */
/* Two families: public ones (a QR-scanning customer, no login, scoped to
   one restaurant by slug) and admin ones (cookie-authenticated, always
   scoped server-side to whichever restaurant is logged in — there's no
   admin call that takes a restaurant id, on purpose). */
async function apiGetRestaurant(slug){
  const r = await fetch(`/api/r/${slug}`);
  if(!r.ok) return null;
  return r.json();
}
async function apiGetPublicDishes(slug){
  const r = await fetch(`/api/r/${slug}/dishes`);
  if(!r.ok) return [];
  return r.json();
}
async function apiCreatePublicOrder(slug, order){
  const r = await fetch(`/api/r/${slug}/orders`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(order)
  });
  if(!r.ok){
    const body = await r.json().catch(()=>({}));
    const err = new Error(body.error || 'Failed to place order');
    err.soldOut = body.soldOut;
    throw err;
  }
  return r.json();
}

async function apiSetOrderStatus(id, status){
  const r = await fetch(`/api/orders/${id}/status`, {
    method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({status})
  });
  if(!r.ok) throw new Error('Failed to update order');
  return r.json();
}
async function apiSetSoldOut(id, soldOut){
  const r = await fetch(`/api/dishes/${id}/soldout`, {
    method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({soldOut})
  });
  if(!r.ok) throw new Error('Failed to update dish');
  return r.json();
}
async function apiMe(){
  const r = await fetch('/api/auth/me');
  if(!r.ok) return null;
  return r.json();
}
async function apiLogin(email, password){
  const r = await fetch('/api/auth/login', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email, password})
  });
  const data = await r.json();
  if(!r.ok) throw new Error(data.error || 'Login failed');
  return data;
}
async function apiRegister(name, email, password){
  const r = await fetch('/api/auth/register', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, email, password})
  });
  const data = await r.json();
  if(!r.ok) throw new Error(data.error || 'Registration failed');
  return data;
}
async function apiLogout(){
  await fetch('/api/auth/logout', { method:'POST' });
}

async function apiGetDishes(){
  const r = await fetch('/api/dishes');
  return r.json();
}
async function apiCreateDish(dish){
  const r = await fetch('/api/dishes', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(dish)
  });
  if(!r.ok) throw new Error('Failed to save dish');
  return r.json();
}
async function apiUpdateDish(id, dish){
  const r = await fetch(`/api/dishes/${id}`, {
    method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(dish)
  });
  if(!r.ok) throw new Error('Failed to update dish');
  return r.json();
}
async function apiDeleteDish(id){
  const r = await fetch(`/api/dishes/${id}`, { method:'DELETE' });
  return r.json();
}
async function apiGetOrders(){
  const r = await fetch('/api/orders');
  return r.json();
}

function uid(){ return Math.random().toString(36).slice(2,10); }
function fmt(n){ return '₹' + Math.round(n).toLocaleString('en-IN'); }

/* ---------------- app state ---------------- */
let DISHES = [];
let ORDERS = [];
let CART = [];
let activeTab = 'owner'; // admin route only — 'owner' | 'kitchen'
/* ---- Dish templates (free, no AI): pre-fill the owner form ---- */
const L = (name, unitPrice, maxQty, allergens, o) => Object.assign({ name, included:true, mandatory:false, unitPrice, maxQty, allergens: allergens||[] }, o||{});
const X = (name, unitPrice, allergens) => L(name, unitPrice, 2, allergens, { included:false });
const EXPLODISH_TEMPLATES = [
  { key:'veg-burger', label:'Veg burger', mode:'A', dietary:'veg', category:'Burgers', ingredients:[
    L('Bun', 0, 1, ['Gluten','Sesame'], {mandatory:true}), L('Veg patty', 40, 2, ['Gluten']), L('Lettuce', 10, 2), L('Tomato', 10, 2),
    L('Onion rings', 10, 2), L('Cheese slice', 20, 3, ['Dairy']), L('Mayo sauce', 10, 2, ['Egg']), X('Extra patty', 40, ['Gluten']), X('Jalapeños', 15) ] },
  { key:'chicken-burger', label:'Chicken burger', mode:'A', dietary:'non-veg', category:'Burgers', ingredients:[
    L('Bun', 0, 1, ['Gluten','Sesame'], {mandatory:true}), L('Chicken patty', 60, 2, ['Gluten','Egg']), L('Lettuce', 10, 2), L('Tomato', 10, 2),
    L('Cheese slice', 20, 3, ['Dairy']), L('Mayo sauce', 10, 2, ['Egg']), X('Fried egg', 20, ['Egg']), X('Extra cheese', 20, ['Dairy']) ] },
  { key:'paneer-wrap', label:'Paneer wrap', mode:'A', dietary:'veg', category:'Wraps', ingredients:[
    L('Wrap', 0, 1, ['Gluten'], {mandatory:true}), L('Paneer tikka', 40, 2, ['Dairy']), L('Onion', 5, 2), L('Capsicum', 5, 2),
    L('Mint chutney', 5, 2), X('Extra cheese', 20, ['Dairy']), X('Fries inside', 25) ] },
  { key:'sandwich', label:'Grilled sandwich', mode:'A', dietary:'veg', category:'Sandwiches', ingredients:[
    L('Bread', 0, 1, ['Gluten'], {mandatory:true}), L('Butter', 5, 2, ['Dairy']), L('Veg filling', 20, 2), L('Cheese slice', 20, 3, ['Dairy']),
    L('Green chutney', 5, 2), X('Extra cheese', 20, ['Dairy']), X('Corn', 15) ] },
  { key:'rice-bowl', label:'Rice bowl', mode:'A', dietary:'veg', category:'Bowls', ingredients:[
    L('Steamed rice', 20, 2, [], {mandatory:true}), L('Veg stir-fry', 30, 2, ['Soy']), L('Sauce', 10, 2, ['Soy']),
    X('Paneer cubes', 40, ['Dairy']), X('Fried egg', 20, ['Egg']) ] },
  { key:'paneer-curry', label:'Paneer curry', mode:'B', dietary:'veg', category:'Main course', ingredients:[
    {name:'Paneer', allergens:['Dairy']}, {name:'Tomato gravy', allergens:[]}, {name:'Cream', allergens:['Dairy']},
    {name:'Butter', allergens:['Dairy']}, {name:'Spices', allergens:[]}, {name:'Cashew paste', allergens:['Nuts']} ] },
  { key:'dal', label:'Dal tadka', mode:'B', dietary:'veg', category:'Main course', ingredients:[
    {name:'Yellow lentils', allergens:[]}, {name:'Ghee tadka', allergens:['Dairy']}, {name:'Onion & tomato', allergens:[]}, {name:'Spices', allergens:[]} ] },
  { key:'soup', label:'Soup', mode:'B', dietary:'veg', category:'Starters', ingredients:[
    {name:'Mixed vegetables', allergens:[]}, {name:'Vegetable stock', allergens:[]}, {name:'Black pepper', allergens:[]}, {name:'Butter', allergens:['Dairy']} ] },
  { key:'cold-drink', label:'Cold drink / shake', mode:'B', dietary:'veg', category:'Drinks', ingredients:[
    {name:'Fruit pulp', allergens:[]}, {name:'Milk', allergens:['Dairy']}, {name:'Sugar syrup', allergens:[]}, {name:'Ice', allergens:[]} ] },
  { key:'biryani', label:'Biryani', mode:'B', dietary:'non-veg', category:'Main course', ingredients:[
    {name:'Basmati rice', allergens:[]}, {name:'Chicken', allergens:[]}, {name:'Biryani masala', allergens:[]},
    {name:'Fried onions', allergens:[]}, {name:'Yogurt marinade', allergens:['Dairy']} ] }
];
/* ---- Allergen suggestions from ingredient names (free, no AI) ---- */
const ALLERGEN_RULES = [
  ['Dairy', /\b(milk|cheese|paneer|cream|butter|buttermilk|ghee|curd|yogh?urt|dahi|raita|lassi|malai|khoya|mawa|whey|kheer|kulfi|rabri|rabdi|mozzarella|cheddar|parmesan|ricotta|custard)\b/,
            /\b(coconut|almond|soy|soya|oat|rice|cashew) (milk|cream|butter)\b|\b(peanut|cocoa|shea) butter\b|\bbutter beans?\b|\bdairy[- ]free\b/g],
  ['Gluten', /\b(bun|buns|bread|breads|wrap|wraps|roti|chapati|chapatti|naan|paratha|parantha|kulcha|bhatura|bhature|puri|pav|pasta|noodles?|spaghetti|macaroni|maida|atta|wheat|tortilla|toast|croutons?|breadcrumbs?|breaded|batter|semolina|suji|rava|sooji|couscous|barley|seitan|samosa|soy sauce|brioche|pita|baguette|croissant|pizza base|pizza dough)\b/,
            /\b(rice|corn|ragi|jowar|bajra|glass|soba|millet) (noodles?|pasta|roti|bread|wraps?|bun|buns)\b|\blettuce wraps?\b|\bgluten[- ]free\b/g],
  ['Egg', /\b(eggs?|omelette|omelet|mayo|mayonnaise|aioli|anda|meringue)\b/,
          /\begg[- ]free\b|\bvegan mayo(nnaise)?\b/g],
  ['Nuts', /\b(nuts?|cashews?|kaju|almonds?|badam|walnuts?|akhrot|pistachios?|pista|pecans?|hazelnuts?|macadamia|marzipan|praline|nutella)\b/,
           /\bnut[- ]free\b/g],
  ['Peanuts', /\b(peanuts?|groundnuts?|moongphali|mungfali|shengdana|satay)\b/, null],
  ['Soy', /\b(soy|soya|soybeans?|tofu|edamame|miso|tempeh)\b/, /\bsoy[- ]free\b/g],
  ['Fish', /\b(fish|salmon|tuna|hilsa|pomfret|anchov(y|ies)|sardines?|cod|mackerel|surimi|rohu|basa|bombil|worcestershire)\b/, null],
  ['Shellfish', /\b(prawns?|shrimps?|crabs?|lobsters?|squid|calamari|oysters?|mussels?|clams?|scampi|crayfish)\b/, /\boyster mushrooms?\b/g],
  ['Sesame', /\b(sesame|til|tahini|gingelly|hummus)\b/, null],
  ['Mustard', /\b(mustard|kasundi)\b/, /\bmustard (greens?|leaves)\b/g]
];
function guessAllergens(name){
  const t = ' ' + String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,' ') + ' ';
  const out = [];
  ALLERGEN_RULES.forEach(([allergen, include, exclude])=>{
    const s = exclude ? t.replace(exclude,' ') : t;
    if(include.test(s)) out.push(allergen);
  });
  return out;
}
const AUTO_ALLERGENS = new WeakMap(); // remembers what we suggested, so we never overwrite the owner's own edits
let allergenHintShown = false;
let ownerDraft = null; // dish being built in owner tab
let activeCategory = 'All'; // customer menu category filter
let activeDietary = 'All'; // 'All' | 'Veg' | 'Non-veg'
let jainOnly = false;
let excludedAllergens = new Set();
let tableQrCount = 12;
let showTableQrGrid = false;
let CURRENT_RESTAURANT = null; // set once logged in on the admin route
let PUBLIC_SLUG = null; // set on the customer route

/* Table QR entry point: a table's QR code just links to this same page with
   ?table=N appended. Whatever table number is in the URL travels with any
   order placed this session, so the kitchen knows where it's going. */
const CURRENT_TABLE = new URLSearchParams(window.location.search).get('table');

/* ---------------- routing ----------------
   Three completely separate experiences share this one app.js:
   - /r/:slug   → public customer menu, no tabs, no admin UI exists here at all
   - /admin     → login form if not authenticated, else owner+kitchen tabs
   - anything else (/) → a tiny landing page pointing to /admin              */
function detectRoute(){
  const path = window.location.pathname;
  const m = path.match(/^\/r\/([a-z0-9-]+)\/?$/);
  if(m) return { type:'customer', slug:m[1] };
  if(path === '/admin' || path.startsWith('/admin/')) return { type:'admin' };
  return { type:'landing' };
}
const ROUTE = detectRoute();

function setMasthead(title, tag){
  const t = document.getElementById('mastheadTitle');
  const g = document.getElementById('mastheadTag');
  if(t) t.textContent = title;
  if(g) g.textContent = tag;
}
function showTableChip(){
  if(!CURRENT_TABLE) return;
  const tag = document.getElementById('mastheadTag');
  if(tag && !document.querySelector('.table-chip')){
    tag.insertAdjacentHTML('afterend', `<div class="table-chip">Table ${escapeHtml(CURRENT_TABLE)}</div>`);
  }
}

/* ---------------- init ---------------- */
(async function boot(){
  if(ROUTE.type === 'customer') return bootCustomer();
  if(ROUTE.type === 'admin') return bootAdmin();
  return bootLanding();
})();

function bootLanding(){
  setMasthead('Explodish', 'Digital menus that open up.');
  document.getElementById('panel').innerHTML = `
    <div class="landing">
      <p>This link doesn't point at a specific restaurant's menu — that
      usually means you scanned a table QR code meant for a different page,
      or typed the address by hand.</p>
      <a class="btn" href="/admin">Restaurant login</a>
    </div>
  `;
}

async function bootCustomer(){
  PUBLIC_SLUG = ROUTE.slug;
  const restaurant = await apiGetRestaurant(PUBLIC_SLUG);
  if(!restaurant){
    setMasthead('Explodish', '');
    document.getElementById('panel').innerHTML =
      '<div class="empty">This menu isn\'t available right now. Please check with the restaurant.</div>';
    return;
  }
  setMasthead(restaurant.name, 'Open a dish. See inside it. Build it your way.');
  showTableChip();
  try{
    DISHES = await apiGetPublicDishes(PUBLIC_SLUG);
  }catch(e){
    document.getElementById('panel').innerHTML =
      '<div class="empty">Could not reach the server. Please try again in a moment.</div>';
    console.error(e);
    return;
  }
  renderCustomerPage();
}

async function bootAdmin(){
  const me = await apiMe();
  if(!me){
    setMasthead('Explodish', 'Restaurant admin');
    renderAuthGate();
    return;
  }
  CURRENT_RESTAURANT = me;
  setMasthead(me.name, 'Restaurant admin');
  renderAdminTabs();
  try{
    DISHES = await apiGetDishes();
    ORDERS = await apiGetOrders();
  }catch(e){
    document.getElementById('panel').innerHTML =
      '<div class="empty">Could not reach the server. Make sure <code>npm start</code> is running, then reload this page.</div>';
    console.error(e);
    return;
  }
  renderAdmin();
}

window.addEventListener('scroll', ()=>{
  document.body.classList.toggle('scrolled', window.scrollY > 8);
}, { passive:true });

document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape' && document.getElementById('detailOverlay')) closeDetail();
});

function triggerReflow(el){ void el.offsetWidth; }

/* Customer route: always the menu, no tab concept at all. */
function renderCustomerPage(){
  const panel = document.getElementById('panel');
  panel.innerHTML = customerView();
  attachCustomerHandlers();
  renderCartFab();
  panel.classList.remove('entering');
  triggerReflow(panel);
  panel.classList.add('entering');
  markImagesLoaded();
}

/* Admin route: switches between Owner tools and Kitchen — there is no
   "Menu" tab here on purpose; customers reach the menu only via /r/:slug. */
function renderAdminTabs(){
  const tabs = document.getElementById('tabs');
  tabs.style.display = 'flex';
  tabs.innerHTML = `
    <button class="tab ${activeTab==='owner'?'active':''}" data-tab="owner">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20l9-9-9-9-9 9 9 9z"/><path d="M12 8v4l3 2"/></svg>
      Owner tools
    </button>
    <button class="tab ${activeTab==='kitchen'?'active':''}" data-tab="kitchen">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>
      Kitchen &amp; dashboard
    </button>
    <button class="tab" id="logoutTab" style="flex:0;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
    </button>
  `;
  tabs.querySelectorAll('.tab[data-tab]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      activeTab = btn.dataset.tab;
      renderAdminTabs();
      renderAdmin();
    });
  });
  document.getElementById('logoutTab').addEventListener('click', async ()=>{
    await apiLogout();
    window.location.reload();
  });
}

function renderAdmin(){
  const panel = document.getElementById('panel');
  if(activeTab==='owner'){ panel.innerHTML = ownerView(); attachOwnerHandlers(); }
  else { panel.innerHTML = kitchenView(); attachKitchenHandlers(); }
  panel.classList.remove('entering');
  triggerReflow(panel);
  panel.classList.add('entering');
  markImagesLoaded();
}

/* ---------------- auth gate (admin route, logged out) ---------------- */
function renderAuthGate(authMode){
  authMode = authMode || 'login';
  const panel = document.getElementById('panel');
  panel.innerHTML = `
    <div class="auth-card">
      <div class="auth-tabs">
        <button class="auth-tab ${authMode==='login'?'active':''}" data-mode="login">Log in</button>
        <button class="auth-tab ${authMode==='register'?'active':''}" data-mode="register">Create account</button>
      </div>
      <div class="auth-error" id="authError" style="display:none;"></div>
      ${authMode==='register' ? `
        <div class="field"><label>Restaurant name</label><input type="text" id="authName" placeholder="e.g. Spice Route Kitchen"></div>
      ` : ''}
      <div class="field"><label>Email</label><input type="email" id="authEmail" placeholder="you@restaurant.com"></div>
      <div class="field"><label>Password</label><input type="password" id="authPassword" placeholder="${authMode==='register'?'At least 8 characters':''}"></div>
      <button class="btn" id="authSubmit" style="width:100%;margin-top:6px;">${authMode==='register'?'Create account':'Log in'}</button>
      ${authMode==='login' ? `<div class="auth-hint">Demo login: owner@demo.test / demo12345</div>` : ''}
    </div>
  `;
  panel.querySelectorAll('.auth-tab').forEach(btn=>{
    btn.addEventListener('click', ()=> renderAuthGate(btn.dataset.mode));
  });
  document.getElementById('authSubmit').addEventListener('click', async ()=>{
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const errEl = document.getElementById('authError');
    errEl.style.display = 'none';
    try{
      if(authMode==='register'){
        const name = document.getElementById('authName').value.trim();
        if(!name){ throw new Error('Give your restaurant a name'); }
        await apiRegister(name, email, password);
      } else {
        await apiLogin(email, password);
      }
      window.location.reload();
    }catch(e){
      errEl.textContent = e.message;
      errEl.style.display = 'block';
    }
  });
}

function markImagesLoaded(){
  document.querySelectorAll('.dc-img, .detail-hero').forEach(img=>{
    if(img.complete) img.classList.add('loaded');
    else img.addEventListener('load', ()=> img.classList.add('loaded'), { once:true });
  });
}

let toastStack = null;
function toast(msg){
  if(!toastStack){
    toastStack = document.createElement('div');
    toastStack.className = 'toast-stack';
    toastStack.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastStack);
  }
  const t = document.createElement('div');
  t.className='toast'; t.textContent = msg;
  toastStack.appendChild(t);
  setTimeout(()=>{
    t.classList.add('leaving');
    t.addEventListener('animationend', ()=> t.remove(), { once:true });
  }, 1800);
}

/* =========================================================
   CUSTOMER VIEW
   ========================================================= */

/* ---------------- Auto-rendered ingredient visuals ----------------
   Original artwork, not photography — a small set of glossy CSS-rendered
   "disc" shapes, auto-matched to whatever an owner types by keyword. No
   API, no cost, no copyright risk (unlike hotlinking real photos found on
   the web, which isn't licensed for use in a real product). Swappable
   later for real licensed photography per ingredient (e.g. via Unsplash's
   API, which does grant a commercial license) without touching the layout
   logic below — matchIngredientVisual() is the one seam that would change. */
const INGREDIENT_VISUALS = {
  bun:    { keywords:['bun','bread','bagel','bap','roll','tortilla','wrap','naan'], top:'#ffdc9e', mid:'#e8a94f', deep:'#b8792c' },
  patty:  { keywords:['patty','beef','chicken','mutton','lamb','fillet','tikka','kebab','sausage'], top:'#c9946a', mid:'#8a5a3c', deep:'#5c3c22' },
  cheese: { keywords:['cheese','cheddar','mozzarella','swiss','gouda'], top:'#ffe27a', mid:'#e8b93c', deep:'#b88a1f' },
  leafy:  { keywords:['lettuce','greens','spinach','basil','mint','herb','coriander','methi','cilantro'], top:'#c3d888', mid:'#8aa34f', deep:'#5c7331' },
  tomato: { keywords:['tomato','marinara','capsicum','bell pepper'], top:'#f28b7a', mid:'#d8543f', deep:'#a13a28' },
  onion:  { keywords:['onion','shallot'], top:'#f0e6d8', mid:'#d9c4a0', deep:'#b39a6e' },
  pickle: { keywords:['pickle','gherkin','jalape','olive'], top:'#a9c15a', mid:'#748a34', deep:'#4d5e20' },
  sauce:  { keywords:['sauce','mayo','ketchup','drizzle','dressing','aioli','chutney'], top:'#f2a35c', mid:'#d97a2e', deep:'#a8571c' },
  paneer: { keywords:['paneer','tofu','cottage cheese'], top:'#fdf6e6', mid:'#efe0bd', deep:'#d6c294' },
  cream:  { keywords:['cream','butter','ghee','malai','cashew'], top:'#fff6e0', mid:'#f5e2ad', deep:'#e0c576' },
  generic:{ keywords:[], top:'#e8dcc4', mid:'#c9b892', deep:'#a8945f' }
};
function matchIngredientVisual(name){
  const n = (name||'').toLowerCase();
  for(const key of Object.keys(INGREDIENT_VISUALS)){
    if(key==='generic') continue;
    if(INGREDIENT_VISUALS[key].keywords.some(k=>n.includes(k))) return key;
  }
  return 'generic';
}

/* Default ingredient quantities a dish starts with — shared by the card's
   assembled render, the detail overlay's live stack, and openDetail() so
   all three always agree on what "the default build" looks like. */
function defaultQtyConfig(dish){
  return dish.ingredients.map(ing=>({ id:ing.id, qty: ing.included?1:0 }));
}

/* Renders the exploded stack: a bun (if present) as bottom+top cap, every
   other present ingredient stacked between them by array order, each as a
   glossy disc. Fully derived from current qty state, so calling this again
   after a stepper click always reflects the live build — nothing to keep
   in sync by hand. Mode B dishes aren't "layered" by definition, so they
   get a simple bowl/glass icon instead of a stack. */
function renderExplodedStack(dish, config, opts){
  opts = opts || {};
  if(dish.mode!=='A') return renderModeBIcon(dish);

  const visible = dish.ingredients
    .map(ing=>({ ing, qty: (config.find(c=>c.id===ing.id)||{}).qty || 0 }))
    .filter(x=>x.qty>0);
  if(visible.length===0) return `<div class="stack-empty">Nothing on this build yet</div>`;

  let layers = visible.slice();
  const bunIdx = layers.findIndex(x=>matchIngredientVisual(x.ing.name)==='bun');
  let bunLayer = null;
  if(bunIdx>=0){ bunLayer = layers[bunIdx]; layers.splice(bunIdx,1); }

  const w = opts.compact ? 88 : 116;
  const baseH = opts.compact ? 15 : 19;
  const midH = Math.max(baseH-3, 9);
  let y = 0;
  const discs = [];
  if(bunLayer){ discs.push({y, w, h:baseH+2, name:bunLayer.ing.name, id:bunLayer.ing.id, qty:1}); y += baseH*0.68; }
  layers.forEach(x=>{ discs.push({y, w:w-8, h:midH, name:x.ing.name, id:x.ing.id, qty:x.qty}); y += midH*0.6; });
  if(bunLayer){ discs.push({y, w, h:baseH+2, name:bunLayer.ing.name, id:bunLayer.ing.id, qty:1}); y += baseH*0.68; }
  const totalH = y + baseH;

  const draggable = opts.interactive ? 'draggable-disc' : '';
  const inner = discs.map((L,i)=>{
    const v = INGREDIENT_VISUALS[matchIngredientVisual(L.name)];
    const badge = L.qty>1 ? `<span class="stack-badge">${L.qty}</span>` : '';
    return `<div class="stack-disc ${draggable}" data-ing="${L.id}" style="--si:${i};top:${L.y}px;left:${(w-L.w)/2}px;width:${L.w}px;height:${L.h}px;background:radial-gradient(ellipse at 35% 25%, ${v.top}, ${v.mid} 55%, ${v.deep});">${badge}</div>`;
  }).join('');

  return `<div class="stack-wrap" style="height:${totalH}px;width:${w}px;">${inner}</div>`;
}

function renderModeBIcon(dish){
  const n = ((dish.category||'') + ' ' + (dish.name||'')).toLowerCase();
  const isDrink = /mocktail|drink|juice|cooler|shake|smoothie|lassi/.test(n);
  return `<div class="bowl-wrap">${isDrink ? '<div class="glass-icon"></div>' : '<div class="bowl-icon"></div>'}</div>`;
}

/* All allergens a dish carries by default — Mode A: only ingredients that
   start out included (a customer opting IN to an optional extra is making
   an aware choice, so it shouldn't count against the dish); Mode B: every
   listed ingredient, since those aren't optional. Used by the allergen
   exclude-filter below. */
function dishAllergens(dish){
  const set = new Set();
  dish.ingredients.forEach(ing=>{
    const counts = dish.mode==='A' ? ing.included : true;
    if(counts) (ing.allergens||[]).forEach(a=>set.add(a));
  });
  return set;
}

function dietaryDotHtml(dish){
  const cls = dish.dietary==='non-veg' ? 'dot-nonveg' : dish.dietary==='egg' ? 'dot-egg' : 'dot-veg';
  const title = dish.dietary==='non-veg' ? 'Non-veg' : dish.dietary==='egg' ? 'Contains egg' : 'Veg';
  return `<span class="diet-dot ${cls}" title="${title}"></span>`;
}

function customerView(){
  if(DISHES.length===0){
    return `<div class="empty">No dishes on the menu yet. Add one from Owner tools.</div>`;
  }

  const categories = ['All', ...new Set(DISHES.map(d=>d.category).filter(Boolean))];
  if(!categories.includes(activeCategory)) activeCategory = 'All';
  const allAllergens = [...new Set(DISHES.flatMap(d=>[...dishAllergens(d)]))].sort();

  const shown = DISHES.filter(d=>{
    if(activeCategory!=='All' && d.category!==activeCategory) return false;
    if(activeDietary==='Veg' && d.dietary==='non-veg') return false;
    if(activeDietary==='Non-veg' && d.dietary!=='non-veg') return false;
    if(jainOnly && !d.jainFriendly) return false;
    if(excludedAllergens.size){
      const da = dishAllergens(d);
      for(const a of excludedAllergens) if(da.has(a)) return false;
    }
    return true;
  });

  const pillsHtml = categories.length > 1 ? `<div class="category-bar">${
    categories.map(cat=>`<button class="cat-pill ${cat===activeCategory?'active':''}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`).join('')
  }</div>` : '';

  const dietPillsHtml = `<div class="category-bar filter-bar">
    ${['All','Veg','Non-veg'].map(d=>`<button class="cat-pill diet-pill ${d===activeDietary?'active':''}" data-diet="${d}">${d==='All'?'All dishes':d}</button>`).join('')}
    <button class="cat-pill jain-pill ${jainOnly?'active':''}" id="jainToggle">Jain-friendly only</button>
    ${allAllergens.map(a=>`<button class="cat-pill allergen-pill ${excludedAllergens.has(a)?'active':''}" data-allergen="${escapeHtml(a)}">No ${escapeHtml(a)}</button>`).join('')}
  </div>`;

  const cards = shown.map(d=>`
    <div class="ticket dish-card${d.soldOut ? ' sold-out' : ''}" data-id="${d.id}">
      <div class="dc-media">
        ${d.image ? `<img class="dc-img" src="${d.image}" loading="lazy" decoding="async" alt="">` : `<div class="dc-render">${renderExplodedStack(d, defaultQtyConfig(d), {compact:true})}</div>`}
        <span class="dc-pill dc-mode">${d.mode==='A' ? 'Layered' : 'Ingredient view'}</span>
        <span class="dc-pill dc-price">${fmt(d.basePrice)}</span>
        ${d.soldOut ? '<span class="dc-pill dc-soldout">Sold out today</span>' : ''}
      </div>
      <div class="dc-body">
        ${d.category ? `<div class="dc-cat">${escapeHtml(d.category)}</div>` : ''}
        <div class="dc-name">${dietaryDotHtml(d)}${escapeHtml(d.name)}</div>
        <div class="dc-cta">${d.mode==='A' ? 'Build it your way →' : "See what's inside →"}</div>
      </div>
    </div>
  `).join('');

  const gridHtml = shown.length
    ? `<div class="menu-grid">${cards}</div>`
    : `<div class="empty">No dishes match these filters.</div>`;

  return `${pillsHtml}${dietPillsHtml}${gridHtml}${howItWorksStrip()}`;
}

function howItWorksStrip(){
  const steps = [
    { title:'Tap a dish', desc:'Open any card to see exactly what it\'s made of, before you order.' },
    { title:'Build it your way', desc:'Add, remove, or bump up ingredients — the price updates live as you go.' },
    { title:'See every change', desc:'Every tap logs a price delta, so nothing on the bill is ever a surprise.' }
  ];
  return `
    <div class="how-strip">
      ${steps.map((s,i)=>`
        <div class="how-step">
          <div class="how-num">${i+1}</div>
          <div class="how-title">${escapeHtml(s.title)}</div>
          <div class="how-desc">${escapeHtml(s.desc)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function attachCustomerHandlers(){
  document.querySelectorAll('.dish-card').forEach(el=>{
    el.addEventListener('click', ()=> openDetail(el.dataset.id));
  });
  document.querySelectorAll('.cat-pill:not(.diet-pill):not(.jain-pill):not(.allergen-pill)').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      activeCategory = btn.dataset.cat;
      renderCustomerPage();
    });
  });
  document.querySelectorAll('.diet-pill').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      activeDietary = btn.dataset.diet;
      renderCustomerPage();
    });
  });
  const jainBtn = document.getElementById('jainToggle');
  if(jainBtn) jainBtn.addEventListener('click', ()=>{ jainOnly = !jainOnly; renderCustomerPage(); });
  document.querySelectorAll('.allergen-pill').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const a = btn.dataset.allergen;
      if(excludedAllergens.has(a)) excludedAllergens.delete(a); else excludedAllergens.add(a);
      renderCustomerPage();
    });
  });
}

let currentDetail = null; // {dish, config, deltas}

function openDetail(dishId){
  const dish = DISHES.find(d=>d.id===dishId);
  if(!dish) return;
  let config;
  if(dish.mode==='A'){
    config = defaultQtyConfig(dish);
  } else {
    config = dish.ingredients.map((ing,i)=>({ index:i, swapChoice: ing.swappable ? 0 : null }));
  }
  const modifierChoices = {};
  (dish.modifiers||[]).forEach(mod=>{ modifierChoices[mod.id] = 0; }); // option 0 = default
  currentDetail = { dish, config, deltas: [], modifierChoices, firstRender:true, lastTotal:null, bumpIngId:null };
  renderDetailOverlay();
}

function closeDetail(){
  const ov = document.getElementById('detailOverlay');
  currentDetail = null;
  if(!ov) return;
  ov.classList.remove('open');
  ov.addEventListener('transitionend', ()=> ov.remove(), { once:true });
  // Fallback in case transitionend doesn't fire (e.g. reduced-motion 0-duration)
  setTimeout(()=>{ if(ov.isConnected) ov.remove(); }, 400);
}

/* Price contribution of a single Mode-A ingredient at a given quantity.
   Shared by computeTotal() and the dependency-cascade logic in adjustQty(),
   so both always agree on what a given qty is "worth". */
function ingredientContribution(dish, ing, qty){
  const baseline = ing.included ? 1 : 0;
  const diff = qty - baseline;
  if(diff >= 0) return diff * ing.unitPrice;
  return dish.removalRefund ? diff * ing.unitPrice : 0;
}

function computeTotal(){
  const {dish, config, modifierChoices} = currentDetail;
  let total = dish.basePrice;
  if(dish.mode==='A'){
    dish.ingredients.forEach(ing=>{
      const c = config.find(x=>x.id===ing.id);
      total += ingredientContribution(dish, ing, c.qty);
    });
  } else {
    dish.ingredients.forEach((ing,i)=>{
      if(ing.swappable){
        const c = config.find(x=>x.index===i);
        const opt = ing.swapOptions[c.swapChoice];
        if(opt) total += opt.price;
      }
    });
  }
  (dish.modifiers||[]).forEach(mod=>{
    const opt = mod.options[modifierChoices[mod.id]];
    if(opt) total += opt.priceDelta;
  });
  return total;
}

function renderDetailOverlay(){
  let old = document.getElementById('detailOverlay');
  if(old) old.remove();
  const {dish, firstRender} = currentDetail;
  const overlay = document.createElement('div');
  overlay.className='overlay'; overlay.id='detailOverlay';

  let bodyHtml = '';
  if(dish.mode==='A'){
    bodyHtml = dish.ingredients.map((ing,i)=>{
      const c = currentDetail.config.find(x=>x.id===ing.id);
      const priceLabel = ing.unitPrice>0 ? `${fmt(ing.unitPrice)} / unit` : 'No extra charge';
      const cascadeCls = firstRender ? 'explode-in' : '';
      const cascadeStyle = firstRender ? `style="--i:${i}"` : '';
      const bumpCls = currentDetail.bumpIngId===ing.id ? 'bump' : '';
      return `
      <div class="layer-item draggable-row ${cascadeCls}" data-ing="${ing.id}" ${cascadeStyle}>
        <div class="layer-drag-handle" aria-hidden="true">⠿</div>
        <div>
          <div class="layer-name">${escapeHtml(ing.name)} ${ing.mandatory?'<span class="badge">required</span>':''}</div>
          <div class="layer-sub">${priceLabel}${ing.allergens.length? ' · Contains: '+ing.allergens.join(', '):''}</div>
        </div>
        <div class="stepper" data-ing="${ing.id}">
          <button class="step-dec" aria-label="Remove one ${escapeHtml(ing.name)}" ${ing.mandatory && c.qty<=1 ? 'disabled':''} ${c.qty<=0?'disabled':''}>−</button>
          <span class="qty ${bumpCls}">${c.qty}</span>
          <button class="step-inc" aria-label="Add one ${escapeHtml(ing.name)}" ${c.qty>=ing.maxQty?'disabled':''}>+</button>
        </div>
      </div>`;
    }).join('');
  } else {
    bodyHtml = dish.ingredients.map((ing,i)=>{
      const allergenChips = ing.allergens.map(a=>`<span class="tag-chip allergen-chip">${a}</span>`).join('');
      let swapHtml = '';
      if(ing.swappable){
        const c = currentDetail.config.find(x=>x.index===i);
        swapHtml = `<select class="swap-select" data-idx="${i}">
          ${ing.swapOptions.map((o,oi)=>`<option value="${oi}" ${oi===c.swapChoice?'selected':''}>${o.label}${o.price? ' (+'+fmt(o.price)+')':''}</option>`).join('')}
        </select>`;
      }
      return `<div class="layer-item">
        <div>
          <span class="tag-chip">${escapeHtml(ing.name)}</span>${allergenChips}
        </div>
        <div>${swapHtml}</div>
      </div>`;
    }).join('');
  }

  const modifiersHtml = (dish.modifiers && dish.modifiers.length) ? `
    <div class="section-label">Make it yours</div>
    <div class="modifier-group-list">
      ${dish.modifiers.map(mod=>`
        <div class="modifier-group">
          <div class="modifier-name">${escapeHtml(mod.name)}</div>
          <div class="modifier-options">
            ${mod.options.map((opt,oi)=>`
              <button type="button" class="modifier-opt ${currentDetail.modifierChoices[mod.id]===oi?'active':''}" data-mod="${mod.id}" data-opt="${oi}">
                ${escapeHtml(opt.label)}${opt.priceDelta ? ` (${opt.priceDelta>0?'+':'−'}${fmt(Math.abs(opt.priceDelta))})` : ''}
              </button>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  ` : '';

  const total = computeTotal();
  const totalPulse = currentDetail.lastTotal !== null && currentDetail.lastTotal !== total;
  currentDetail.lastTotal = total;

  overlay.innerHTML = `
    <div class="detail">
      ${dish.image
        ? `<img class="detail-hero" src="${dish.image}" loading="lazy" decoding="async" alt="">`
        : `<div class="detail-stack-stage"><div class="stack-stage-inner">${renderExplodedStack(dish, currentDetail.config, {compact:false, interactive:true})}</div><div class="drag-hint">Tap +/− or drag ingredients to adjust</div></div>`}
      <div class="detail-body">
        <button class="detail-close" id="closeDetail" aria-label="Close">✕</button>
        <div class="detail-title-row"><h2>${dietaryDotHtml(dish)}${escapeHtml(dish.name)}</h2></div>
        <div class="base-price-note">Base price ${fmt(dish.basePrice)}${dish.mode==='A' ? (dish.removalRefund? ' · removing an ingredient lowers the price' : ' · removing an ingredient does not change the price') : ''}</div>
        <div class="section-label">${dish.mode==='A' ? 'Customise every layer' : "What's inside"}</div>
        ${bodyHtml}
        ${modifiersHtml}
        <div class="section-label">Price changes</div>
        <div class="delta-feed" id="deltaFeed"><div class="dempty">Adjust something above to see it here.</div></div>
      </div>
      <div class="detail-footer">
        <div class="running-total"><span class="rt-label">Total</span><span id="runningTotal" class="rt-value${totalPulse?' pulse':''}">${fmt(total)}</span></div>
        ${dish.soldOut ? '<button class="btn" disabled>Sold out today</button>' : '<button class="btn" id="addToCartBtn">Add to order</button>'}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  if(firstRender){
    // True entrance: force one frame so the browser registers the closed
    // state before we flip to open, so the slide-up/cascade actually plays.
    requestAnimationFrame(()=> requestAnimationFrame(()=> overlay.classList.add('open')));
  } else {
    overlay.classList.add('open'); // re-render mid-interaction: already open, no replay
  }
  currentDetail.firstRender = false;
  currentDetail.bumpIngId = null;

  document.getElementById('closeDetail').addEventListener('click', closeDetail);
  overlay.addEventListener('click', (e)=>{ if(e.target===overlay) closeDetail(); });

  if(dish.mode==='A'){
    overlay.querySelectorAll('.stepper').forEach(step=>{
      const ingId = step.dataset.ing;
      const ing = dish.ingredients.find(x=>x.id===ingId);
      step.querySelector('.step-inc').addEventListener('click', ()=> adjustQty(ing, 1));
      step.querySelector('.step-dec').addEventListener('click', ()=> adjustQty(ing, -1));
    });
    attachDragHandlers(overlay, dish);
  } else {
    overlay.querySelectorAll('.swap-select').forEach(sel=>{
      sel.addEventListener('change', (e)=>{
        const idx = parseInt(e.target.dataset.idx);
        const ing = dish.ingredients[idx];
        const c = currentDetail.config.find(x=>x.index===idx);
        const oldOpt = ing.swapOptions[c.swapChoice];
        const newChoice = parseInt(e.target.value);
        const newOpt = ing.swapOptions[newChoice];
        c.swapChoice = newChoice;
        const priceDiff = newOpt.price - oldOpt.price;
        if(priceDiff !== 0){
          logDelta(`Swapped to ${newOpt.label}`, priceDiff);
        }
        renderDetailOverlay();
      });
    });
  }

  overlay.querySelectorAll('.modifier-opt').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const modId = btn.dataset.mod;
      const newOpt = parseInt(btn.dataset.opt);
      const mod = dish.modifiers.find(m=>m.id===modId);
      const oldOpt = currentDetail.modifierChoices[modId];
      if(oldOpt === newOpt) return;
      const priceDiff = mod.options[newOpt].priceDelta - mod.options[oldOpt].priceDelta;
      currentDetail.modifierChoices[modId] = newOpt;
      if(priceDiff !== 0){
        logDelta(`${mod.name}: ${mod.options[newOpt].label}`, priceDiff);
      }
      renderDetailOverlay();
    });
  });

  renderDeltaFeed();
  const addBtnEl = document.getElementById('addToCartBtn'); if(addBtnEl) addBtnEl.addEventListener('click', addCurrentToCart);
}

function adjustQty(ing, dir){
  const c = currentDetail.config.find(x=>x.id===ing.id);
  const newQty = c.qty + dir;
  if(newQty < 0 || newQty > ing.maxQty) return;
  if(ing.mandatory && newQty < 1) return;
  const oldQty = c.qty;
  c.qty = newQty;
  currentDetail.bumpIngId = ing.id;
  logQtyChange(ing, oldQty, newQty);
  if(newQty === 0 && oldQty > 0){
    cascadeDependents(ing);
  }
  renderDetailOverlay();
}

/* Drag-and-drop is a second input method layered on top of the tap steppers,
   not a replacement — both call the same adjustQty(), so the pricing and
   cascade logic never has to know which one triggered a change. Built on
   Pointer Events (not the HTML5 Drag and Drop API) since native DnD doesn't
   work reliably on touch, and this is a phone-first, QR-scanned product. */
function attachDragHandlers(overlay, dish){
  const DRAG_THRESHOLD = 40; // px of intentional movement before it commits

  // Drag a stack disc DOWN, off the stack, to remove one unit.
  overlay.querySelectorAll('.stack-disc.draggable-disc').forEach(disc=>{
    let startY=0, dragging=false, moved=false;
    disc.style.touchAction = 'none';
    disc.addEventListener('pointerdown', (e)=>{
      dragging = true; moved = false; startY = e.clientY;
      try{ disc.setPointerCapture(e.pointerId); }catch(err){}
    });
    disc.addEventListener('pointermove', (e)=>{
      if(!dragging) return;
      const dy = e.clientY - startY;
      if(Math.abs(dy) > 6) moved = true;
      if(dy > 0) disc.style.transform = `translateY(${Math.min(dy,80)}px) scale(${Math.max(1-Math.min(dy,80)/260,0.75)})`;
    });
    const endDrag = (e)=>{
      if(!dragging) return;
      dragging = false;
      const dy = e.clientY - startY;
      disc.style.transform = '';
      if(!moved || dy <= DRAG_THRESHOLD) return;
      const ing = dish.ingredients.find(x=>x.id===disc.dataset.ing);
      if(!ing) return;
      const c = currentDetail.config.find(x=>x.id===ing.id);
      if(ing.mandatory && c.qty<=1){ toast(`${ing.name} can't be removed`); return; }
      adjustQty(ing, -1);
    };
    disc.addEventListener('pointerup', endDrag);
    disc.addEventListener('pointercancel', endDrag);
  });

  // Drag a layer row UP, toward the stack, to add one unit.
  overlay.querySelectorAll('.layer-item.draggable-row').forEach(row=>{
    let startY=0, dragging=false, moved=false;
    row.addEventListener('pointerdown', (e)=>{
      if(e.target.closest('.stepper')) return; // let the +/- buttons behave normally
      dragging = true; moved = false; startY = e.clientY;
      try{ row.setPointerCapture(e.pointerId); }catch(err){}
    });
    row.addEventListener('pointermove', (e)=>{
      if(!dragging) return;
      const dy = e.clientY - startY;
      if(Math.abs(dy) > 6) moved = true;
      if(dy < 0){
        row.classList.add('dragging');
        row.style.transform = `translateY(${Math.max(dy,-60)}px)`;
      }
    });
    const endDrag = (e)=>{
      if(!dragging) return;
      dragging = false;
      const dy = e.clientY - startY;
      row.classList.remove('dragging');
      row.style.transform = '';
      if(!moved || dy >= -DRAG_THRESHOLD) return;
      const ing = dish.ingredients.find(x=>x.id===row.dataset.ing);
      if(!ing) return;
      const c = currentDetail.config.find(x=>x.id===ing.id);
      if(c.qty >= ing.maxQty){ toast(`Already at the max for ${ing.name}`); return; }
      adjustQty(ing, 1);
    };
    row.addEventListener('pointerup', endDrag);
    row.addEventListener('pointercancel', endDrag);
  });
}

function logQtyChange(ing, oldQty, newQty){
  const dish = currentDetail.dish;
  const deltaAmt = ingredientContribution(dish, ing, newQty) - ingredientContribution(dish, ing, oldQty);
  const dir = newQty > oldQty ? 1 : -1;
  if(deltaAmt !== 0){
    const label = dir>0 ? `+ ${ing.name}` : (dish.removalRefund ? `Removed ${ing.name}` : `− ${ing.name}`);
    logDelta(label, deltaAmt);
  } else if(dir<0 && !dish.removalRefund){
    logDelta(`Removed ${ing.name} (no price change)`, 0, true);
  }
}

/* Dependency rules: if a layer's `requires` list includes an ingredient that
   just got fully removed, auto-remove that layer too (unless it's mandatory —
   mandatory layers can't be removed by any path, so we leave it and tell the
   customer why). Cascades through chains (A needs B needs C) via a queue. */
function cascadeDependents(startIng){
  const {dish, config} = currentDetail;
  const queue = [{ id: startIng.id, name: startIng.name }];
  const alreadyCascaded = new Set();
  while(queue.length){
    const { id: parentId, name: parentName } = queue.shift();
    dish.ingredients.forEach(dep=>{
      if(alreadyCascaded.has(dep.id)) return;
      if(!dep.requires || !dep.requires.includes(parentId)) return;
      const c = config.find(x=>x.id===dep.id);
      if(!c || c.qty<=0) return;
      if(dep.mandatory){
        toast(`${dep.name} needs ${parentName}, but it's marked required — remove it manually if needed.`);
        return;
      }
      const oldQty = c.qty;
      c.qty = 0;
      alreadyCascaded.add(dep.id);
      const deltaAmt = ingredientContribution(dish, dep, 0) - ingredientContribution(dish, dep, oldQty);
      if(deltaAmt !== 0){
        logDelta(`Also removed ${dep.name} (needs ${parentName})`, deltaAmt);
      } else {
        logDelta(`Also removed ${dep.name} (needs ${parentName}, no price change)`, 0, true);
      }
      queue.push({ id: dep.id, name: dep.name });
    });
  }
}

function logDelta(label, amount, noChange){
  currentDetail.deltas.push({label, amount, noChange});
}

function renderDeltaFeed(){
  const feed = document.getElementById('deltaFeed');
  if(!feed) return;
  if(currentDetail.deltas.length===0){ feed.innerHTML = '<div class="dempty">Adjust something above to see it here.</div>'; return; }
  feed.innerHTML = currentDetail.deltas.slice().reverse().map((d,i)=>{
    const cls = d.noChange ? '' : (d.amount>=0 ? 'pos' : 'neg');
    const amtStr = d.noChange ? '₹0' : (d.amount>=0? '+ '+fmt(d.amount) : '− '+fmt(Math.abs(d.amount)));
    const newCls = i===0 ? 'new' : '';
    return `<div class="drow ${newCls}"><span>${escapeHtml(d.label)}</span><span class="damt ${cls}">${amtStr}</span></div>`;
  }).join('');
}

function addCurrentToCart(){
  const {dish, config, deltas, modifierChoices} = currentDetail;
  const total = computeTotal();
  let mods = [];
  if(dish.mode==='A'){
    dish.ingredients.forEach(ing=>{
      const c = config.find(x=>x.id===ing.id);
      const baseline = ing.included?1:0;
      if(c.qty > baseline) mods.push(`+${c.qty-baseline} ${ing.name}`);
      if(c.qty < baseline) mods.push(`No ${ing.name}`);
    });
  } else {
    dish.ingredients.forEach((ing,i)=>{
      if(ing.swappable){
        const c = config.find(x=>x.index===i);
        const opt = ing.swapOptions[c.swapChoice];
        if(c.swapChoice !== 0) mods.push(`${ing.name}: ${opt.label}`);
      }
    });
  }
  (dish.modifiers||[]).forEach(mod=>{
    const oi = modifierChoices[mod.id];
    if(oi !== 0) mods.push(`${mod.name}: ${mod.options[oi].label}`);
  });
  CART.push({ dishName: dish.name, price: total, mods, deltas: deltas.filter(d=>!d.noChange) });
  toast('Added to order');
  closeDetail();
  renderCartFab();
  const fab = document.getElementById('cartFab');
  fab.classList.remove('bump');
  triggerReflow(fab);
  fab.classList.add('bump');
}

function renderCartFab(){
  const fab = document.getElementById('cartFab');
  if(CART.length===0){ fab.style.display='none'; hideCart(); return; }
  fab.style.display='block';
  const total = CART.reduce((s,i)=>s+i.price,0);
  fab.textContent = `Order (${CART.length}) · ${fmt(total)}`;
  fab.onclick = toggleCartPanel;
}
function hideCart(){ document.getElementById('cartPanel').style.display='none'; }
function toggleCartPanel(){
  const cp = document.getElementById('cartPanel');
  if(cp.style.display==='block'){ cp.style.display='none'; return; }
  cp.style.display='block';
  cp.innerHTML = CART.map((item,i)=>`
    <div class="cart-line new" style="--i:${i}">
      <div class="cl-top"><span>${escapeHtml(item.dishName)}</span><span>${fmt(item.price)}</span></div>
      ${item.mods.length? `<div class="cl-mods">${item.mods.map(escapeHtml).join(' · ')}</div>`:''}
    </div>
  `).join('') + `
    <div style="padding-top:10px;">
      <button class="btn" style="width:100%;" id="placeOrderBtn">Place order</button>
    </div>
  `;
  document.getElementById('placeOrderBtn').addEventListener('click', placeOrder);
}

async function placeOrder(){
  const order = {
    items: CART,
    total: CART.reduce((s,i)=>s+i.price,0),
    upsell: CART.reduce((s,i)=> s + i.deltas.reduce((a,d)=>a+Math.max(d.amount,0),0), 0),
    table: CURRENT_TABLE || null
  };
  try{
    const saved = await apiCreatePublicOrder(PUBLIC_SLUG, order);
    ORDERS.push(saved);
  }catch(e){
    if(e.soldOut){ toast('Sorry, just sold out: ' + e.soldOut.join(', ') + '. Please remove it from your order.'); }
    else { toast('Could not reach the server — order not sent'); }
    console.error(e);
    return;
  }
  CART = [];
  renderCartFab();
  toast('Order sent to the kitchen');
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* =========================================================
   OWNER VIEW
   ========================================================= */
function blankDraft(){
  return { id:null, name:'', mode:'A', basePrice:'', category:'', image:null, removalRefund:false, dietary:'veg', jainFriendly:false, ingredients:[], modifiers:[] };
}
if(!ownerDraft) ownerDraft = blankDraft();

function ownerView(){
  const managedList = DISHES.map(d=>`
    <div class="dish-manage-row" data-id="${d.id}">
      ${d.image? `<img src="${d.image}">` : `<div class="ph"></div>`}
      <div style="flex:1;">
        <div class="dname">${dietaryDotHtml(d)}${escapeHtml(d.name)}<span class="badge">${d.mode==='A'?'Layered':'Ingredient view'}</span>${d.soldOut ? '<span class="badge" style="background:var(--rust);color:#fff;">Sold out</span>' : ''}</div>
        <div class="dmeta">${fmt(d.basePrice)} · ${d.ingredients.length} ingredients tagged</div>
      </div>
      <button class="btn secondary small soldout-dish">${d.soldOut ? 'Mark available' : 'Mark sold out'}</button>
      <button class="btn secondary small edit-dish">Edit</button>
      <button class="btn secondary small delete-dish" style="color:var(--rust);">Delete</button>
    </div>
  `).join('');

  return `
    <div class="section-card">
      <h3>1 · Photo &amp; basics</h3>
      <div class="sc-desc">Upload a photo and name the dish. A clean, top-down or 3/4 shot works best.</div>
      <div class="photo-upload">
        ${ownerDraft.image ? `<img src="${ownerDraft.image}">` : `<div class="ph-placeholder">No photo</div>`}
        <div>
          <label class="btn small file-btn" for="photoInput">${ownerDraft.image ? 'Change photo' : 'Choose photo'}</label>
          <input type="file" id="photoInput" accept="image/*" class="sr-only-file">
          <div style="font-size:11.5px;color:var(--ink-soft);margin-top:8px;">Under 3MB.</div>
        </div>
      </div>
      <div class="field-row" style="margin-top:16px;">
        <div class="field"><label>Dish name</label><input type="text" id="dishName" value="${escapeHtml(ownerDraft.name)}" placeholder="e.g. Chicken Tikka Wrap"></div>
        <div class="field"><label>Category</label><input type="text" id="dishCategory" value="${escapeHtml(ownerDraft.category)}" placeholder="e.g. Wraps"></div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Dietary type</label>
          <select id="dishDietary">
            <option value="veg" ${ownerDraft.dietary==='veg'?'selected':''}>Veg</option>
            <option value="egg" ${ownerDraft.dietary==='egg'?'selected':''}>Contains egg</option>
            <option value="non-veg" ${ownerDraft.dietary==='non-veg'?'selected':''}>Non-veg</option>
          </select>
        </div>
        <div class="field">
          <label>&nbsp;</label>
          <label class="chk" style="padding:10px 0;"><input type="checkbox" id="dishJain" ${ownerDraft.jainFriendly?'checked':''}> Jain-friendly (no onion/garlic/root veg)</label>
        </div>
      </div>
    </div>

    <div class="section-card">
      <h3>2 · Pricing &amp; view</h3>
      <div class="sc-desc">Set the base price, the removal rule, and how customers see this dish.</div>
      <div class="field-row">
        <div class="field"><label>Base price (₹)</label><input type="number" id="dishBase" value="${ownerDraft.basePrice}" placeholder="199"></div>
        <div class="field">
          <label>If a customer removes an included ingredient</label>
          <select id="removalPolicy">
            <option value="no" ${!ownerDraft.removalRefund?'selected':''}>Price stays the same</option>
            <option value="yes" ${ownerDraft.removalRefund?'selected':''}>Lower the price</option>
          </select>
        </div>
      </div>
      <div class="field" style="margin-bottom:2px;">
        <label>How should customers see this dish?</label>
        <div class="mode-choice">
          <div class="mode-btn ${ownerDraft.mode==='A'?'selected':''}" data-mode="A">
            <div class="mtitle">Exploded layers</div>
            <div class="mdesc">For burgers, wraps, sandwiches, bowls — anything built in stackable parts.</div>
          </div>
          <div class="mode-btn ${ownerDraft.mode==='B'?'selected':''}" data-mode="B">
            <div class="mtitle">Ingredient view</div>
            <div class="mdesc">For curries, soups, mixed dishes — full transparency, with swaps where allowed.</div>
          </div>
        </div>
      </div>
    </div>

    <div class="section-card">
      <h3>3 · ${ownerDraft.mode==='A' ? 'Layers' : 'Ingredients'}</h3>
      <div class="sc-desc">${ownerDraft.mode==='A' ? 'Every layer a customer can see and adjust.' : "Everything that's in the dish."}</div>
      <div class="field" style="margin-bottom:14px;"><label>Start from a template (optional)</label>
        <select id="templateSelect"><option value="">Choose a dish type to pre-fill…</option>${EXPLODISH_TEMPLATES.map(t=>`<option value="${t.key}">${t.label}</option>`).join('')}</select></div>
      <div id="ingredientList">${ownerDraft.mode==='A' ? renderIngredientRowsA() : renderIngredientRowsB()}</div>
      <button class="btn btn-add small" id="addIngredientBtn" style="margin-top:12px;">+ Add ${ownerDraft.mode==='A'?'layer':'ingredient'}</button>
    </div>

    <div class="section-card">
      <h3>4 · Modifiers <span style="font-weight:400;font-size:11.5px;color:var(--ink-soft);">(optional)</span></h3>
      <div class="sc-desc">Non-ingredient choices like spice level, doneness, or portion size. The first option in each group is what customers start with by default.</div>
      <div id="modifierList">${renderModifierGroups()}</div>
      <button class="btn btn-add small" id="addModifierBtn" style="margin-top:12px;">+ Add modifier group</button>
    </div>

    <div style="margin-bottom:28px;display:flex;gap:10px;">
      <button class="btn" id="saveDishBtn">${ownerDraft.id ? 'Save changes' : 'Publish to menu'}</button>
      <button class="btn secondary" id="resetDraftBtn">Clear form</button>
    </div>

    <div class="section-card">
      <h3>Your menu (${DISHES.length})</h3>
      <div class="sc-desc">Everything currently published to the Menu tab.</div>
      ${DISHES.length? managedList : '<div class="empty">Nothing published yet.</div>'}
    </div>

    <div class="section-card" id="qrSection">
      <h3>Table QR codes</h3>
      <div class="sc-desc">Print one per table. Scanning it opens this same menu with the table number attached, so orders show up on the kitchen ticket as "Table 7" instead of a bare order ID — no app, no login, just a link.</div>
      <div class="field-row" style="align-items:flex-end;">
        <div class="field"><label>Number of tables</label><input type="number" id="tableCount" value="${tableQrCount}" min="1" max="200"></div>
        <button class="btn" id="genQrBtn" style="height:41px;">Generate</button>
      </div>
      ${showTableQrGrid ? `
        <div class="qr-toolbar"><button class="btn secondary small" id="printQrBtn">Print all</button></div>
        <div class="qr-grid" id="qrGrid">${renderQrGrid()}</div>
      ` : ''}
    </div>
  `;
}

function renderQrGrid(){
  const origin = window.location.origin;
  const slug = CURRENT_RESTAURANT.slug;
  let out = '';
  for(let n=1; n<=tableQrCount; n++){
    const url = `${origin}/r/${slug}?table=${n}`;
    out += `<div class="qr-card">
      <img src="/api/qr?text=${encodeURIComponent(url)}&size=220" width="110" height="110" alt="QR code for table ${n}">
      <div class="qr-label">Table ${n}</div>
    </div>`;
  }
  return out;
}

function renderIngredientRowsA(){
  if(ownerDraft.ingredients.length===0) return '<div class="empty">No layers yet — add the first one below.</div>';
  return ownerDraft.ingredients.map((ing,i)=>{
    const others = ownerDraft.ingredients.filter((o,oi)=>oi!==i);
    const requiresBlock = others.length ? `
      <div class="ing-requires-row" style="grid-column:1/6;">
        <span class="ing-requires-label">Auto-remove this layer if the customer removes:</span>
        <div class="ing-requires-chips">
          ${others.map(o=>`<button type="button" class="requires-chip ${(ing.requires||[]).includes(o.id)?'active':''}" data-i="${i}" data-ref="${o.id}">${escapeHtml(o.name||'Untitled layer')}</button>`).join('')}
        </div>
      </div>
    ` : '';
    return `
    <div class="ingredient-row" data-i="${i}">
      <input type="text" class="ing-name" value="${escapeHtml(ing.name||'')}" placeholder="Layer name">
      <input type="number" class="ing-price" value="${ing.unitPrice??0}" placeholder="₹/extra unit">
      <input type="number" class="ing-maxqty" value="${ing.maxQty??1}" placeholder="Max qty" min="1">
      <label class="chk"><input type="checkbox" class="ing-included" ${ing.included?'checked':''}> Included by default</label>
      <button class="remove-ing" data-i="${i}" aria-label="Remove this row">✕</button>
      <label class="chk" style="grid-column:1/2;"><input type="checkbox" class="ing-mandatory" ${ing.mandatory?'checked':''}> Can't be removed</label>
      <input type="text" class="ing-allergens" style="grid-column:2/5;" placeholder="Allergens, comma separated" value="${(ing.allergens||[]).join(', ')}">
      ${requiresBlock}
    </div>`;
  }).join('');
}
function renderModifierGroups(){
  if(!ownerDraft.modifiers || ownerDraft.modifiers.length===0){
    return '<div class="empty">No modifiers yet — e.g. spice level, portion size, doneness.</div>';
  }
  return ownerDraft.modifiers.map((mod,mi)=>`
    <div class="modifier-group-edit" data-mi="${mi}">
      <div class="modifier-group-head">
        <input type="text" class="mod-name" value="${escapeHtml(mod.name||'')}" placeholder="e.g. Spice level">
        <button class="remove-mod" data-mi="${mi}">✕ Remove group</button>
      </div>
      <div class="mod-options-list">
        ${mod.options.map((opt,oi)=>`
          <div class="mod-option-row" data-mi="${mi}" data-oi="${oi}">
            <input type="text" class="mod-opt-label" value="${escapeHtml(opt.label||'')}" placeholder="Option label${oi===0?' (default)':''}">
            <input type="number" class="mod-opt-price" value="${opt.priceDelta??0}" placeholder="₹ delta">
            <button class="remove-mod-opt" data-mi="${mi}" data-oi="${oi}" aria-label="Remove this option">✕</button>
          </div>
        `).join('')}
      </div>
      <button type="button" class="btn btn-add small add-mod-opt" data-mi="${mi}">+ Add option</button>
    </div>
  `).join('');
}

function renderIngredientRowsB(){
  if(ownerDraft.ingredients.length===0) return '<div class="empty">No ingredients yet — add the first one below.</div>';
  return ownerDraft.ingredients.map((ing,i)=>`
    <div class="ingredient-row" style="grid-template-columns:1.4fr 2fr auto;" data-i="${i}">
      <input type="text" class="ing-name" value="${escapeHtml(ing.name||'')}" placeholder="Ingredient name">
      <input type="text" class="ing-allergens" placeholder="Allergens, comma separated" value="${(ing.allergens||[]).join(', ')}">
      <button class="remove-ing" data-i="${i}" aria-label="Remove this row">✕</button>
    </div>
  `).join('');
}

function attachOwnerHandlers(){
  document.getElementById('photoInput').addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    if(file.size > 3*1024*1024){ toast('Photo too large — please use one under 3MB'); return; }
    const reader = new FileReader();
    reader.onload = ()=>{ ownerDraft.image = reader.result; renderAdmin(); };
    reader.readAsDataURL(file);
  });
  document.getElementById('dishName').addEventListener('input', e=> ownerDraft.name = e.target.value);
  document.getElementById('dishCategory').addEventListener('input', e=> ownerDraft.category = e.target.value);
  document.getElementById('dishDietary').addEventListener('change', e=> ownerDraft.dietary = e.target.value);
  document.getElementById('dishJain').addEventListener('change', e=> ownerDraft.jainFriendly = e.target.checked);
  document.getElementById('dishBase').addEventListener('input', e=> ownerDraft.basePrice = e.target.value);
  document.getElementById('removalPolicy').addEventListener('change', e=> ownerDraft.removalRefund = (e.target.value==='yes'));

  document.querySelectorAll('.mode-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const newMode = btn.dataset.mode;
      if(newMode !== ownerDraft.mode){ ownerDraft.mode = newMode; ownerDraft.ingredients = []; renderAdmin(); }
    });
  });

  const templateSelect = document.getElementById('templateSelect');
  if(templateSelect) templateSelect.addEventListener('change', ()=>{
    const t = EXPLODISH_TEMPLATES.find(x=>x.key===templateSelect.value);
    if(!t) return;
    if(ownerDraft.ingredients.length && !confirm('This will replace the ingredients you have entered so far. Continue?')){ templateSelect.value=''; return; }
    ownerDraft.mode = t.mode;
    ownerDraft.dietary = t.dietary;
    ownerDraft.jainFriendly = false;
    if(!ownerDraft.category) ownerDraft.category = t.category;
    ownerDraft.ingredients = t.ingredients.map(i=> Object.assign({}, i, { id: uid(), allergens: (i.allergens||[]).slice() }));
    renderAdmin();
    toast('Template loaded — edit names, prices and allergens to match your dish');
  });
  document.getElementById('addIngredientBtn').addEventListener('click', ()=>{
    if(ownerDraft.mode==='A'){
      ownerDraft.ingredients.push({id:uid(), name:'', included:true, mandatory:false, unitPrice:0, maxQty:2, allergens:[]});
    } else {
      ownerDraft.ingredients.push({name:'', allergens:[], swappable:false, swapOptions:[]});
    }
    renderAdmin();
  });

  document.querySelectorAll('.remove-ing').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = parseInt(btn.dataset.i);
      const removedId = ownerDraft.ingredients[idx].id;
      ownerDraft.ingredients.splice(idx,1);
      ownerDraft.ingredients.forEach(ing=>{
        if(ing.requires) ing.requires = ing.requires.filter(r=>r!==removedId);
      });
      renderAdmin();
    });
  });

  document.querySelectorAll('.requires-chip').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const i = parseInt(btn.dataset.i);
      const refId = btn.dataset.ref;
      const ing = ownerDraft.ingredients[i];
      ing.requires = ing.requires || [];
      const idx = ing.requires.indexOf(refId);
      if(idx>=0) ing.requires.splice(idx,1); else ing.requires.push(refId);
      renderAdmin();
    });
  });

  document.querySelectorAll('#ingredientList .ingredient-row').forEach(row=>{
    const i = parseInt(row.dataset.i);
    const ing = ownerDraft.ingredients[i];
    const nameEl = row.querySelector('.ing-name');
    if(nameEl) nameEl.addEventListener('input', e=>{
      ing.name = e.target.value;
      const aEl = row.querySelector('.ing-allergens');
      const current = ing.allergens || [];
      const prev = AUTO_ALLERGENS.get(ing) || [];
      const untouched = current.length===0 || (current.length===prev.length && current.every(a=>prev.includes(a)));
      if(untouched && aEl){
        const guess = guessAllergens(ing.name);
        ing.allergens = guess;
        AUTO_ALLERGENS.set(ing, guess);
        aEl.value = guess.join(', ');
        if(guess.length && !allergenHintShown){ allergenHintShown = true; toast('Allergens suggested from the name — please double-check them'); }
      }
    });
    const allergEl = row.querySelector('.ing-allergens');
    if(allergEl) allergEl.addEventListener('input', e=> ing.allergens = e.target.value.split(',').map(s=>s.trim()).filter(Boolean));
    if(ownerDraft.mode==='A'){
      row.querySelector('.ing-price').addEventListener('input', e=> ing.unitPrice = parseFloat(e.target.value)||0);
      row.querySelector('.ing-maxqty').addEventListener('input', e=> ing.maxQty = parseInt(e.target.value)||1);
      row.querySelector('.ing-included').addEventListener('change', e=> ing.included = e.target.checked);
      row.querySelector('.ing-mandatory').addEventListener('change', e=> ing.mandatory = e.target.checked);
    }
  });

  document.getElementById('addModifierBtn').addEventListener('click', ()=>{
    ownerDraft.modifiers = ownerDraft.modifiers || [];
    ownerDraft.modifiers.push({ id: uid(), name:'', options:[{label:'', priceDelta:0},{label:'', priceDelta:0}] });
    renderAdmin();
  });

  document.querySelectorAll('.remove-mod').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      ownerDraft.modifiers.splice(parseInt(btn.dataset.mi),1);
      renderAdmin();
    });
  });

  document.querySelectorAll('.add-mod-opt').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      ownerDraft.modifiers[parseInt(btn.dataset.mi)].options.push({label:'', priceDelta:0});
      renderAdmin();
    });
  });

  document.querySelectorAll('.remove-mod-opt').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const mi = parseInt(btn.dataset.mi), oi = parseInt(btn.dataset.oi);
      if(ownerDraft.modifiers[mi].options.length<=1){ toast('A modifier group needs at least one option'); return; }
      ownerDraft.modifiers[mi].options.splice(oi,1);
      renderAdmin();
    });
  });

  document.querySelectorAll('#modifierList .modifier-group-edit').forEach(group=>{
    const mi = parseInt(group.dataset.mi);
    const mod = ownerDraft.modifiers[mi];
    const nameEl = group.querySelector('.mod-name');
    if(nameEl) nameEl.addEventListener('input', e=> mod.name = e.target.value);
    group.querySelectorAll('.mod-option-row').forEach(row=>{
      const oi = parseInt(row.dataset.oi);
      row.querySelector('.mod-opt-label').addEventListener('input', e=> mod.options[oi].label = e.target.value);
      row.querySelector('.mod-opt-price').addEventListener('input', e=> mod.options[oi].priceDelta = parseFloat(e.target.value)||0);
    });
  });

  document.getElementById('saveDishBtn').addEventListener('click', saveDraft);
  document.getElementById('resetDraftBtn').addEventListener('click', ()=>{ ownerDraft = blankDraft(); renderAdmin(); });

  document.querySelectorAll('.edit-dish').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const id = e.target.closest('.dish-manage-row').dataset.id;
      const dish = DISHES.find(d=>d.id===id);
      ownerDraft = JSON.parse(JSON.stringify(dish));
      window.scrollTo(0,0);
      renderAdmin();
    });
  });
  document.querySelectorAll('.soldout-dish').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      const id = e.target.closest('.dish-manage-row').dataset.id;
      const dish = DISHES.find(d=>d.id===id);
      if(!dish) return;
      btn.disabled = true;
      try{
        const updated = await apiSetSoldOut(id, !dish.soldOut);
        dish.soldOut = !!updated.soldOut;
        renderAdmin();
        toast(dish.soldOut ? dish.name + ' is now marked sold out' : dish.name + ' is available again');
      }catch(err){
        toast('Could not update the dish — check your connection');
        btn.disabled = false;
      }
    });
  });
  document.querySelectorAll('.delete-dish').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      const id = e.target.closest('.dish-manage-row').dataset.id;
      try{
        await apiDeleteDish(id);
        DISHES = DISHES.filter(d=>d.id!==id);
        renderAdmin();
      }catch(err){
        toast('Could not delete — check the server is running');
        console.error(err);
      }
    });
  });

  document.getElementById('tableCount').addEventListener('input', e=>{
    tableQrCount = Math.max(1, Math.min(200, parseInt(e.target.value)||1));
  });
  document.getElementById('genQrBtn').addEventListener('click', ()=>{
    showTableQrGrid = true;
    renderAdmin();
    const section = document.getElementById('qrSection');
    if(section && section.scrollIntoView) section.scrollIntoView({ behavior:'smooth', block:'start' });
  });
  const printBtn = document.getElementById('printQrBtn');
  if(printBtn) printBtn.addEventListener('click', ()=> window.print());
}

async function saveDraft(){
  if(!ownerDraft.name.trim()){ toast('Give the dish a name first'); return; }
  if(!ownerDraft.basePrice || parseFloat(ownerDraft.basePrice) <= 0){ toast('Set a base price'); return; }
  if(ownerDraft.ingredients.length===0){ toast('Tag at least one ingredient'); return; }
  if(ownerDraft.mode==='A' && ownerDraft.ingredients.some(i=>!i.name.trim())){ toast('Every layer needs a name'); return; }
  if(ownerDraft.mode==='B' && ownerDraft.ingredients.some(i=>!i.name.trim())){ toast('Every ingredient needs a name'); return; }

  const clean = JSON.parse(JSON.stringify(ownerDraft));
  clean.basePrice = parseFloat(clean.basePrice);

  try{
    if(clean.id){
      const updated = await apiUpdateDish(clean.id, clean);
      const idx = DISHES.findIndex(d=>d.id===updated.id);
      DISHES[idx] = updated;
    } else {
      delete clean.id;
      const created = await apiCreateDish(clean);
      DISHES.push(created);
    }
  }catch(err){
    toast('Could not save — check the server is running');
    console.error(err);
    return;
  }

  toast('Dish published to the menu');
  ownerDraft = blankDraft();
  renderAdmin();
}

/* =========================================================
   KITCHEN / DASHBOARD VIEW
   ========================================================= */
function kitchenView(){
  const totalOrders = ORDERS.length;
  const totalRevenue = ORDERS.reduce((s,o)=>s+o.total,0);
  const totalUpsell = ORDERS.reduce((s,o)=>s+o.upsell,0);

  const ingCount = {};
  ORDERS.forEach(o=> o.items.forEach(it=> it.deltas.forEach(d=>{
    if(d.amount>0){
      const key = d.label.replace(/^\+ /,'');
      ingCount[key] = (ingCount[key]||0)+1;
    }
  })));
  const topIngredients = Object.entries(ingCount).sort((a,b)=>b[1]-a[1]).slice(0,5);

  const recentTickets = ORDERS.filter(o=>(o.status||'new')!=='done').slice().reverse().slice(0,12).map(o=>`
    <div class="ticket ticket-card">
      <div class="ticket-head"><span>${o.table ? `Table ${escapeHtml(String(o.table))} · ` : ''}Order ${o.id}</span><span>${new Date(o.time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span></div>
      ${o.items.map(it=>`
        <div class="ticket-line"><strong>${escapeHtml(it.dishName)}</strong></div>
        ${it.mods.map(m=>`<div class="ticket-line tl-mod">— ${escapeHtml(m)}</div>`).join('')}
      `).join('')}
      <div class="ticket-line" style="text-align:right;font-weight:700;margin-top:6px;">${fmt(o.total)}</div>
      ${statusControls(o)}
    </div>
  `).join('');

  const icons = {
    orders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>',
    revenue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
    upsell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 17l6-6 4 4 8-8M21 7v6M21 7h-6"/></svg>',
    dishes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 3v6M5 3v6a2 2 0 002 2 2 2 0 002-2V3M17 3v18M17 3a4 4 0 00-4 4v4h4"/></svg>'
  };

  return `
    <div class="section-card">
      <h3>Today at a glance</h3>
      <div class="sc-desc">Live numbers from every order placed so far.</div>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-icon">${icons.orders}</div><div><div class="sv">${totalOrders}</div><div class="sl">Orders placed</div></div></div>
        <div class="stat-box"><div class="stat-icon">${icons.revenue}</div><div><div class="sv">${fmt(totalRevenue)}</div><div class="sl">Total revenue</div></div></div>
        <div class="stat-box"><div class="stat-icon">${icons.upsell}</div><div><div class="sv">${fmt(totalUpsell)}</div><div class="sl">Revenue from add-ons</div></div></div>
        <div class="stat-box"><div class="stat-icon">${icons.dishes}</div><div><div class="sv">${DISHES.length}</div><div class="sl">Dishes on menu</div></div></div>
      </div>
    </div>

    <div class="section-card">
      <h3>Most-added extras</h3>
      <div class="sc-desc">What customers actually pay to add — the case for bundling as an upsell.</div>
      ${topIngredients.length ? topIngredients.map(([name,count],i)=>`
        <div class="top-ing-row"><span class="rank">${i+1}</span><span class="ting-name">${escapeHtml(name)}</span><span class="ting-count">${count} order${count>1?'s':''}</span></div>
      `).join('') : '<div class="empty">No customisation data yet — place an order from the Menu tab.</div>'}
    </div>

    <div class="section-card">
      <h3>Kitchen tickets</h3>
      <div class="sc-desc">What the kitchen actually needs to see for each order.</div>
      ${recentTickets || '<div class="empty">No orders yet.</div>'}
    </div>
  `;
}
const ORDER_FLOW = {
  new:       { label:'New',       next:'preparing', btn:'Start preparing' },
  preparing: { label:'Preparing', next:'ready',     btn:'Mark ready' },
  ready:     { label:'Ready',     next:'done',      btn:'Mark served' }
};
function statusControls(o){
  const st = o.status || 'new';
  const step = ORDER_FLOW[st];
  return `<div class="ticket-status" style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px;">
    <span class="status-badge status-${st}" style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:999px;background:rgba(127,127,127,.2);">${step ? step.label : 'Done'}</span>
    ${step ? `<button class="btn small status-btn" data-order="${escapeHtml(o.id)}" data-next="${step.next}">${step.btn}</button>` : ''}
  </div>`;
}
let kitchenPoll = null;
function startKitchenPoll(){
  if(kitchenPoll) return;
  kitchenPoll = setInterval(async ()=>{
    if(activeTab!=='kitchen' || document.hidden) return;
    try{
      const r = await fetch('/api/orders');
      if(!r.ok) return;
      const fresh = await r.json();
      const sig = a => a.map(o=>o.id+':'+(o.status||'new')).join('|');
      if(sig(fresh)!==sig(ORDERS)){ ORDERS.length = 0; fresh.forEach(o=>ORDERS.push(o)); renderAdmin(); }
    }catch(e){ /* offline: try again next tick */ }
  }, 10000);
}
function attachKitchenHandlers(){
  startKitchenPoll();
  document.querySelectorAll('.status-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      btn.disabled = true;
      try{
        const updated = await apiSetOrderStatus(btn.dataset.order, btn.dataset.next);
        const idx = ORDERS.findIndex(x=>x.id===updated.id);
        if(idx>=0) ORDERS[idx] = updated;
        renderAdmin();
      }catch(e){
        toast('Could not update the order — check your connection');
        btn.disabled = false;
      }
    });
  });
}
