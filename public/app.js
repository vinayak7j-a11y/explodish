
/* ---------------- API helpers ---------------- */
/* All data lives on the server in /data/*.json. These are the only
   functions that talk to the network - swap the fetch calls out for
   a real database later without touching any rendering code below. */
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
async function apiCreateOrder(order){
  const r = await fetch('/api/orders', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(order)
  });
  if(!r.ok) throw new Error('Failed to place order');
  return r.json();
}

function uid(){ return Math.random().toString(36).slice(2,10); }
function fmt(n){ return '₹' + Math.round(n).toLocaleString('en-IN'); }

/* ---------------- app state ---------------- */
let DISHES = [];
let ORDERS = [];
let CART = [];
let activeTab = 'customer';
let ownerDraft = null; // dish being built in owner tab

/* ---------------- init ---------------- */
(async function init(){
  try{
    DISHES = await apiGetDishes();
    ORDERS = await apiGetOrders();
  }catch(e){
    document.getElementById('panel').innerHTML =
      '<div class="empty">Could not reach the server. Make sure <code>npm start</code> is running, then reload this page.</div>';
    console.error(e);
    return;
  }
  render();
})();

document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    render();
  });
});

function render(){
  const panel = document.getElementById('panel');
  if(activeTab==='customer'){ panel.innerHTML = customerView(); attachCustomerHandlers(); renderCartFab(); }
  else if(activeTab==='owner'){ panel.innerHTML = ownerView(); attachOwnerHandlers(); hideCart(); }
  else { panel.innerHTML = kitchenView(); attachKitchenHandlers(); hideCart(); }
}

function toast(msg){
  const t = document.createElement('div');
  t.className='toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 1800);
}

/* =========================================================
   CUSTOMER VIEW
   ========================================================= */
function customerView(){
  if(DISHES.length===0){
    return `<div class="empty">No dishes on the menu yet. Add one from Owner tools.</div>`;
  }
  const cards = DISHES.map(d=>`
    <div class="ticket dish-card" data-id="${d.id}">
      <div class="dc-media">
        ${d.image ? `<img class="dc-img" src="${d.image}">` : `<div class="dc-ph">No photo yet</div>`}
        <span class="dc-pill dc-mode">${d.mode==='A' ? 'Layered' : 'Ingredient view'}</span>
        <span class="dc-pill dc-price">${fmt(d.basePrice)}</span>
      </div>
      <div class="dc-body">
        <div class="dc-name">${escapeHtml(d.name)}</div>
        <div class="dc-cta">${d.mode==='A' ? 'Build it your way →' : "See what's inside →"}</div>
      </div>
    </div>
  `).join('');
  return `<div class="menu-grid">${cards}</div>`;
}

function attachCustomerHandlers(){
  document.querySelectorAll('.dish-card').forEach(el=>{
    el.addEventListener('click', ()=> openDetail(el.dataset.id));
  });
}

let currentDetail = null; // {dish, config, deltas}

function openDetail(dishId){
  const dish = DISHES.find(d=>d.id===dishId);
  if(!dish) return;
  let config;
  if(dish.mode==='A'){
    config = dish.ingredients.map(ing=>({ id:ing.id, qty: ing.included?1:0 }));
  } else {
    config = dish.ingredients.map((ing,i)=>({ index:i, swapChoice: ing.swappable ? 0 : null }));
  }
  currentDetail = { dish, config, deltas: [] };
  renderDetailOverlay();
}

function closeDetail(){
  currentDetail = null;
  const ov = document.getElementById('detailOverlay');
  if(ov) ov.remove();
}

function computeTotal(){
  const {dish, config} = currentDetail;
  let total = dish.basePrice;
  if(dish.mode==='A'){
    dish.ingredients.forEach(ing=>{
      const c = config.find(x=>x.id===ing.id);
      const baseline = ing.included ? 1 : 0;
      const diff = c.qty - baseline;
      if(diff > 0){ total += diff * ing.unitPrice; }
      else if(diff < 0 && dish.removalRefund){ total += diff * ing.unitPrice; }
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
  return total;
}

function renderDetailOverlay(){
  let old = document.getElementById('detailOverlay');
  if(old) old.remove();
  const {dish} = currentDetail;
  const overlay = document.createElement('div');
  overlay.className='overlay'; overlay.id='detailOverlay';

  let bodyHtml = '';
  if(dish.mode==='A'){
    bodyHtml = dish.ingredients.map(ing=>{
      const c = currentDetail.config.find(x=>x.id===ing.id);
      const priceLabel = ing.unitPrice>0 ? `${fmt(ing.unitPrice)} / unit` : 'No extra charge';
      return `
      <div class="layer-item">
        <div>
          <div class="layer-name">${escapeHtml(ing.name)} ${ing.mandatory?'<span class="badge">required</span>':''}</div>
          <div class="layer-sub">${priceLabel}${ing.allergens.length? ' · Contains: '+ing.allergens.join(', '):''}</div>
        </div>
        <div class="stepper" data-ing="${ing.id}">
          <button class="step-dec" ${ing.mandatory && c.qty<=1 ? 'disabled':''} ${c.qty<=0?'disabled':''}>−</button>
          <span class="qty">${c.qty}</span>
          <button class="step-inc" ${c.qty>=ing.maxQty?'disabled':''}>+</button>
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

  overlay.innerHTML = `
    <div class="detail">
      ${dish.image ? `<img class="detail-hero" src="${dish.image}">` : ''}
      <div class="detail-body">
        <button class="detail-close" id="closeDetail">✕</button>
        <div class="detail-title-row"><h2>${escapeHtml(dish.name)}</h2></div>
        <div class="base-price-note">Base price ${fmt(dish.basePrice)}${dish.mode==='A' ? (dish.removalRefund? ' · removing an ingredient lowers the price' : ' · removing an ingredient does not change the price') : ''}</div>
        <div class="section-label">${dish.mode==='A' ? 'Customise every layer' : "What's inside"}</div>
        ${bodyHtml}
        <div class="section-label">Price changes</div>
        <div class="delta-feed" id="deltaFeed"><div class="dempty">Adjust something above to see it here.</div></div>
      </div>
      <div class="detail-footer">
        <div class="running-total"><span class="rt-label">Total</span><span id="runningTotal">${fmt(computeTotal())}</span></div>
        <button class="btn" id="addToCartBtn">Add to order</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('closeDetail').addEventListener('click', closeDetail);
  overlay.addEventListener('click', (e)=>{ if(e.target===overlay) closeDetail(); });

  if(dish.mode==='A'){
    overlay.querySelectorAll('.stepper').forEach(step=>{
      const ingId = step.dataset.ing;
      const ing = dish.ingredients.find(x=>x.id===ingId);
      step.querySelector('.step-inc').addEventListener('click', ()=> adjustQty(ing, 1));
      step.querySelector('.step-dec').addEventListener('click', ()=> adjustQty(ing, -1));
    });
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
        updateTotals();
      });
    });
  }
}

function adjustQty(ing, dir){
  const c = currentDetail.config.find(x=>x.id===ing.id);
  const newQty = c.qty + dir;
  if(newQty < 0 || newQty > ing.maxQty) return;
  if(ing.mandatory && newQty < 1) return;
  const baseline = ing.included ? 1 : 0;
  c.qty = newQty;
  // compute delta for this single action
  let deltaAmt = 0;
  if(dir>0){
    const priorDiff = (c.qty-1) - baseline;
    if(priorDiff >= 0){ deltaAmt = ing.unitPrice; }
    else if(currentDetail.dish.removalRefund){ deltaAmt = ing.unitPrice; }
  } else {
    const newDiff = c.qty - baseline;
    if(newDiff >= 0){ deltaAmt = -ing.unitPrice; }
    else if(currentDetail.dish.removalRefund){ deltaAmt = -ing.unitPrice; }
    else { deltaAmt = 0; }
  }
  if(deltaAmt !== 0){
    const label = dir>0 ? `+ ${ing.name}` : (currentDetail.dish.removalRefund ? `Removed ${ing.name}` : `− ${ing.name}`);
    logDelta(label, deltaAmt);
  } else if(dir<0 && !currentDetail.dish.removalRefund){
    logDelta(`Removed ${ing.name} (no price change)`, 0, true);
  }
  renderDetailOverlay();
}

function logDelta(label, amount, noChange){
  currentDetail.deltas.push({label, amount, noChange});
}

function updateTotals(){
  const rt = document.getElementById('runningTotal');
  if(rt) rt.textContent = fmt(computeTotal());
  renderDeltaFeed();
}

function renderDeltaFeed(){
  const feed = document.getElementById('deltaFeed');
  if(!feed) return;
  if(currentDetail.deltas.length===0){ feed.innerHTML = '<div class="dempty">Adjust something above to see it here.</div>'; return; }
  feed.innerHTML = currentDetail.deltas.slice().reverse().map(d=>{
    const cls = d.noChange ? '' : (d.amount>=0 ? 'pos' : 'neg');
    const amtStr = d.noChange ? '₹0' : (d.amount>=0? '+ '+fmt(d.amount) : '− '+fmt(Math.abs(d.amount)));
    return `<div class="drow"><span>${escapeHtml(d.label)}</span><span class="damt ${cls}">${amtStr}</span></div>`;
  }).join('');
}

// re-render totals whenever detail overlay redraws
const _origRenderDetailOverlay = renderDetailOverlay;
renderDetailOverlay = function(){
  _origRenderDetailOverlay();
  renderDeltaFeed();
  document.getElementById('addToCartBtn').addEventListener('click', addCurrentToCart);
};

function addCurrentToCart(){
  const {dish, config, deltas} = currentDetail;
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
  CART.push({ dishName: dish.name, price: total, mods, deltas: deltas.filter(d=>!d.noChange) });
  toast('Added to order');
  closeDetail();
  renderCartFab();
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
    <div class="cart-line">
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
    upsell: CART.reduce((s,i)=> s + i.deltas.reduce((a,d)=>a+Math.max(d.amount,0),0), 0)
  };
  try{
    const saved = await apiCreateOrder(order);
    ORDERS.push(saved);
  }catch(e){
    toast('Could not reach the server — order not sent');
    console.error(e);
    return;
  }
  CART = [];
  renderCartFab();
  toast('Order sent to the kitchen');
  if(activeTab==='kitchen') render();
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* =========================================================
   OWNER VIEW
   ========================================================= */
function blankDraft(){
  return { id:null, name:'', mode:'A', basePrice:'', category:'', image:null, removalRefund:false, ingredients:[] };
}
if(!ownerDraft) ownerDraft = blankDraft();

function ownerView(){
  const managedList = DISHES.map(d=>`
    <div class="dish-manage-row" data-id="${d.id}">
      ${d.image? `<img src="${d.image}">` : `<div class="ph"></div>`}
      <div style="flex:1;">
        <div class="dname">${escapeHtml(d.name)}<span class="badge">${d.mode==='A'?'Layered':'Ingredient view'}</span></div>
        <div class="dmeta">${fmt(d.basePrice)} · ${d.ingredients.length} ingredients tagged</div>
      </div>
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
          <input type="file" id="photoInput" accept="image/*">
          <div style="font-size:11.5px;color:var(--ink-soft);margin-top:6px;">Under 3MB.</div>
        </div>
      </div>
      <div class="field-row" style="margin-top:16px;">
        <div class="field"><label>Dish name</label><input type="text" id="dishName" value="${escapeHtml(ownerDraft.name)}" placeholder="e.g. Chicken Tikka Wrap"></div>
        <div class="field"><label>Category</label><input type="text" id="dishCategory" value="${escapeHtml(ownerDraft.category)}" placeholder="e.g. Wraps"></div>
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
      <div id="ingredientList">${ownerDraft.mode==='A' ? renderIngredientRowsA() : renderIngredientRowsB()}</div>
      <button class="btn btn-add small" id="addIngredientBtn" style="margin-top:12px;">+ Add ${ownerDraft.mode==='A'?'layer':'ingredient'}</button>
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
  `;
}

function renderIngredientRowsA(){
  if(ownerDraft.ingredients.length===0) return '<div class="empty">No layers yet — add the first one below.</div>';
  return ownerDraft.ingredients.map((ing,i)=>`
    <div class="ingredient-row" data-i="${i}">
      <input type="text" class="ing-name" value="${escapeHtml(ing.name||'')}" placeholder="Layer name">
      <input type="number" class="ing-price" value="${ing.unitPrice??0}" placeholder="₹/extra unit">
      <input type="number" class="ing-maxqty" value="${ing.maxQty??1}" placeholder="Max qty" min="1">
      <label class="chk"><input type="checkbox" class="ing-included" ${ing.included?'checked':''}> Included by default</label>
      <button class="remove-ing" data-i="${i}">✕</button>
      <label class="chk" style="grid-column:1/2;"><input type="checkbox" class="ing-mandatory" ${ing.mandatory?'checked':''}> Can't be removed</label>
      <input type="text" class="ing-allergens" style="grid-column:2/5;" placeholder="Allergens, comma separated" value="${(ing.allergens||[]).join(', ')}">
    </div>
  `).join('');
}
function renderIngredientRowsB(){
  if(ownerDraft.ingredients.length===0) return '<div class="empty">No ingredients yet — add the first one below.</div>';
  return ownerDraft.ingredients.map((ing,i)=>`
    <div class="ingredient-row" style="grid-template-columns:1.4fr 2fr auto;" data-i="${i}">
      <input type="text" class="ing-name" value="${escapeHtml(ing.name||'')}" placeholder="Ingredient name">
      <input type="text" class="ing-allergens" placeholder="Allergens, comma separated" value="${(ing.allergens||[]).join(', ')}">
      <button class="remove-ing" data-i="${i}">✕</button>
    </div>
  `).join('');
}

function attachOwnerHandlers(){
  document.getElementById('photoInput').addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    if(file.size > 3*1024*1024){ toast('Photo too large — please use one under 3MB'); return; }
    const reader = new FileReader();
    reader.onload = ()=>{ ownerDraft.image = reader.result; render(); };
    reader.readAsDataURL(file);
  });
  document.getElementById('dishName').addEventListener('input', e=> ownerDraft.name = e.target.value);
  document.getElementById('dishCategory').addEventListener('input', e=> ownerDraft.category = e.target.value);
  document.getElementById('dishBase').addEventListener('input', e=> ownerDraft.basePrice = e.target.value);
  document.getElementById('removalPolicy').addEventListener('change', e=> ownerDraft.removalRefund = (e.target.value==='yes'));

  document.querySelectorAll('.mode-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const newMode = btn.dataset.mode;
      if(newMode !== ownerDraft.mode){ ownerDraft.mode = newMode; ownerDraft.ingredients = []; render(); }
    });
  });

  document.getElementById('addIngredientBtn').addEventListener('click', ()=>{
    if(ownerDraft.mode==='A'){
      ownerDraft.ingredients.push({id:uid(), name:'', included:true, mandatory:false, unitPrice:0, maxQty:2, allergens:[]});
    } else {
      ownerDraft.ingredients.push({name:'', allergens:[], swappable:false, swapOptions:[]});
    }
    render();
  });

  document.querySelectorAll('.remove-ing').forEach(btn=>{
    btn.addEventListener('click', ()=>{ ownerDraft.ingredients.splice(parseInt(btn.dataset.i),1); render(); });
  });

  document.querySelectorAll('#ingredientList .ingredient-row').forEach(row=>{
    const i = parseInt(row.dataset.i);
    const ing = ownerDraft.ingredients[i];
    const nameEl = row.querySelector('.ing-name');
    if(nameEl) nameEl.addEventListener('input', e=> ing.name = e.target.value);
    const allergEl = row.querySelector('.ing-allergens');
    if(allergEl) allergEl.addEventListener('input', e=> ing.allergens = e.target.value.split(',').map(s=>s.trim()).filter(Boolean));
    if(ownerDraft.mode==='A'){
      row.querySelector('.ing-price').addEventListener('input', e=> ing.unitPrice = parseFloat(e.target.value)||0);
      row.querySelector('.ing-maxqty').addEventListener('input', e=> ing.maxQty = parseInt(e.target.value)||1);
      row.querySelector('.ing-included').addEventListener('change', e=> ing.included = e.target.checked);
      row.querySelector('.ing-mandatory').addEventListener('change', e=> ing.mandatory = e.target.checked);
    }
  });

  document.getElementById('saveDishBtn').addEventListener('click', saveDraft);
  document.getElementById('resetDraftBtn').addEventListener('click', ()=>{ ownerDraft = blankDraft(); render(); });

  document.querySelectorAll('.edit-dish').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const id = e.target.closest('.dish-manage-row').dataset.id;
      const dish = DISHES.find(d=>d.id===id);
      ownerDraft = JSON.parse(JSON.stringify(dish));
      window.scrollTo(0,0);
      render();
    });
  });
  document.querySelectorAll('.delete-dish').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      const id = e.target.closest('.dish-manage-row').dataset.id;
      try{
        await apiDeleteDish(id);
        DISHES = DISHES.filter(d=>d.id!==id);
        render();
      }catch(err){
        toast('Could not delete — check the server is running');
        console.error(err);
      }
    });
  });
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
  render();
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

  const recentTickets = ORDERS.slice().reverse().slice(0,8).map(o=>`
    <div class="ticket ticket-card">
      <div class="ticket-head"><span>Order ${o.id}</span><span>${new Date(o.time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span></div>
      ${o.items.map(it=>`
        <div class="ticket-line"><strong>${escapeHtml(it.dishName)}</strong></div>
        ${it.mods.map(m=>`<div class="ticket-line tl-mod">— ${escapeHtml(m)}</div>`).join('')}
      `).join('')}
      <div class="ticket-line" style="text-align:right;font-weight:700;margin-top:6px;">${fmt(o.total)}</div>
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
function attachKitchenHandlers(){}
