#!/usr/bin/env python3
"""Makes Explodish vegetarian-only. Patches server.js and public/app.js.
Run from the menu-app folder:  python3 make_veg_only.py
Prints [OK]/[SKIP] per change. Safe to re-run."""
import re

def read(p): return open(p, encoding='utf-8').read()
def write(p, s): open(p, 'w', encoding='utf-8').write(s)

def replace_once(path, old, new, label, marker=None):
    s = read(path)
    if marker and marker in s:
        print(f"[SKIP] {label}: already applied"); return
    if s.count(old) != 1:
        print(f"[SKIP] {label}: found {s.count(old)} times (need 1; it may already be applied)"); return
    write(path, s.replace(old, new, 1)); print(f"[OK] {label}")

def regex_remove(path, pattern, label, repl='', marker=None):
    s = read(path)
    if marker and marker in s:
        print(f"[SKIP] {label}: already applied"); return
    n = len(re.findall(pattern, s, re.S | re.M))
    if n != 1:
        print(f"[SKIP] {label}: found {n} times (need 1; it may already be applied)"); return
    write(path, re.sub(pattern, lambda m: repl, s, count=1, flags=re.S | re.M)); print(f"[OK] {label}")

# ---------- server.js ----------
S = "server.js"
replace_once(S, "const IMG_RE = ", r"""/* Explodish is vegetarian-only: reject anything that names meat, fish or egg. */
const NONVEG_RE = /\b(chicken|mutton|lamb|beef|pork|bacon|ham|fish|prawns?|shrimps?|crabs?|lobsters?|squid|calamari|salmon|tuna|keema|kheema|eggs?|omelette|omelet|meat|sausages?|salami|pepperoni|gelatin|oysters?|mussels?|anchov(?:y|ies))\b/i;
function nonVegWord(text) {
  const t = String(text == null ? '' : text)
    .replace(/egg[- ]?(free|less)|meat[- ]?(free|less)|oyster mushrooms?/gi, ' ');
  const m = NONVEG_RE.exec(t);
  return m ? m[0] : null;
}
const IMG_RE = """, "server: non-veg word check", marker="NONVEG_RE =")

replace_once(S, "  let image = null;", r"""  if (b.dietary && b.dietary !== 'veg') return { error: 'Only vegetarian dishes can be added to Explodish' };
  const badWord = [name, b.category]
    .concat(Array.isArray(b.ingredients) ? b.ingredients.slice(0, 60).map(i => i && i.name) : [])
    .map(nonVegWord).find(Boolean);
  if (badWord) return { error: '"' + badWord + '" is not vegetarian. Explodish only allows vegetarian dishes.' };
  let image = null;""", "server: reject non-veg dishes", marker="Only vegetarian dishes can be added")

replace_once(S, "dietary: ['veg', 'non-veg', 'egg'].includes(b.dietary) ? b.dietary : 'veg',", "dietary: 'veg',",
             "server: every dish is veg")

replace_once(S, "  res.json(store.listDishes(restaurant.id));",
             "  res.json(store.listDishes(restaurant.id).filter(d => !d.dietary || d.dietary === 'veg')); // hide any old non-veg dishes",
             "server: hide old non-veg dishes from customers")

# ---------- public/app.js ----------
P = "public/app.js"
replace_once(P, "['All','Veg','Non-veg']", "[]", "app: remove Veg / Non-veg filter buttons")
regex_remove(P, r'^[ \t]*<option value="egg"[^\n]*</option>\n', "app: remove 'Contains egg' option")
regex_remove(P, r'^[ \t]*<option value="non-veg"[^\n]*</option>\n', "app: remove 'Non-veg' option")
regex_remove(P, r"^  \{ key:'chicken-burger'.*?\] \},\n", "app: remove chicken burger template")
regex_remove(P, r"^  \{ key:'biryani'.*?\] \}\n", "app: replace biryani template with veg biryani", repl=
"""  { key:'biryani', label:'Veg biryani', mode:'B', dietary:'veg', category:'Main course', ingredients:[
    {name:'Basmati rice', allergens:[]}, {name:'Mixed vegetables', allergens:[]}, {name:'Biryani masala', allergens:[]},
    {name:'Fried onions', allergens:[]}, {name:'Yogurt marinade', allergens:['Dairy']} ] }
""", marker="label:'Veg biryani'")
replace_once(P, "L('Mayo sauce', 10, 2, ['Egg'])", "L('Eggless mayo sauce', 10, 2)", "app: eggless mayo in the veg burger template")
replace_once(P, ", X('Fried egg', 20, ['Egg']) ] },", " ] },", "app: remove fried egg add-on")
regex_remove(P, r"^  \['Egg',[^\n]*\n[^\n]*\],\n", "app: remove egg allergen rule")
regex_remove(P, r"^  \['Fish',[^\n]*\n", "app: remove fish allergen rule")
regex_remove(P, r"^  \['Shellfish',[^\n]*\n", "app: remove shellfish allergen rule")
