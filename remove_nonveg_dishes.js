/* Finds (and optionally deletes) dishes that are not vegetarian.
   Dry run:  node remove_nonveg_dishes.js
   Delete:   node remove_nonveg_dishes.js --apply   (makes a backup copy first) */
const Database = require('better-sqlite3');
const path = require('path');

const file = process.env.DB_FILE || path.join(__dirname, 'data', 'explodish.db');
const apply = process.argv.includes('--apply');
const NONVEG_RE = /\b(chicken|mutton|lamb|beef|pork|bacon|ham|fish|prawns?|shrimps?|crabs?|lobsters?|squid|calamari|salmon|tuna|keema|kheema|eggs?|omelette|omelet|meat|sausages?|salami|pepperoni|gelatin|oysters?|mussels?|anchov(?:y|ies))\b/i;
const nonVeg = t => NONVEG_RE.test(String(t == null ? '' : t).replace(/egg[- ]?(free|less)|meat[- ]?(free|less)|oyster mushrooms?/gi, ' '));

(async () => {
  const db = new Database(file);
  const found = db.prepare('SELECT id, restaurant_id, data FROM dishes').all()
    .map(r => ({ id: r.id, d: JSON.parse(r.data) }))
    .filter(({ d }) =>
      (d.dietary && d.dietary !== 'veg') ||
      [d.name, d.category].concat((d.ingredients || []).map(i => i && i.name)).some(nonVeg));

  if (!found.length) { console.log('No non-vegetarian dishes found. Nothing to do.'); return; }
  console.log(`Found ${found.length} non-vegetarian dish(es):`);
  found.forEach(({ id, d }) => console.log(`  - ${d.name}  (id ${id}, diet: ${d.dietary || 'not set'})`));

  if (!apply) { console.log('\nDry run only. Nothing was deleted. Run again with --apply to delete them.'); return; }

  const backup = file + '.backup-' + Date.now();
  await db.backup(backup);
  console.log('\nBackup saved to ' + backup);
  const del = db.prepare('DELETE FROM dishes WHERE id = ?');
  db.transaction(() => found.forEach(({ id }) => del.run(id)))();
  console.log(`Deleted ${found.length} dish(es). Past orders are untouched.`);
})();
