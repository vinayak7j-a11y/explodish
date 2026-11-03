// Explodish menu parser test. Run with: node test/menuparse.js (also part of npm test)
const MP = require('../public/menuparse.js');
let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
const one = (text, opts) => MP.parse(text, opts).rows;
const j = x => JSON.stringify(x);

console.log('\nMenu parser');
let r = one('Aloo Tikki Burger - 99');
check('Name - price', r.length === 1 && r[0].name === 'Aloo Tikki Burger' && r[0].price === 99, j(r));
r = one('Veg Burger ........ 99');
check('dot leaders', r.length === 1 && r[0].name === 'Veg Burger' && r[0].price === 99, j(r));
r = one('Paneer Wrap ₹149\nCheese Sandwich Rs. 79/-\nMasala Dosa 120/-\nChai 20 /-');
check('₹, Rs. and /- prices', r.map(x => x.price).join() === '149,79,120,20', j(r.map(x => x.price)));
r = one('MAIN COURSE\nPaneer Butter Masala 220\nDal Tadka 160');
check('ALL CAPS heading becomes category', r.length === 2 && r.every(x => x.category === 'Main Course'), j(r.map(x => x.category)));
r = one('Wraps:\nPaneer Wrap 149');
check('heading with colon', r[0].category === 'Wraps');
r = one('Burgers\nAloo Tikki Burger 99\nCheese Burger 129\nWraps\nVeg Roll 79');
check('Title Case heading right after a dish', r.map(x => x.category).join() === 'Burgers,Burgers,Wraps', j(r.map(x => x.category)));
r = one('Aloo Tikki Burger 99\nCrispy aloo patty with mint mayo and onion\nCheese Burger 129');
check('long line under a dish is its description, not a dish', r.length === 2 && /mint mayo/.test(r[0].desc), j(r));
r = one('Aloo Tikki Burger - crispy aloo patty with mint mayo - 99');
check('"Name - description - price"', r[0].name === 'Aloo Tikki Burger' && /crispy/.test(r[0].desc) && r[0].price === 99, j(r));
r = one('Masala Tea\n20\nVeg Sandwich\n₹ 60');
check('price on the next line', r.length === 2 && r[0].price === 20 && r[1].price === 60, j(r));
r = one('Regular Large\nMargherita 129/199');
check('size header gives size labels', r[0].sizes.map(s => s.label + s.price).join() === 'Regular129,Large199' && !r[0].flags.length, j(r));
r = one('Half Full\nDal Fry 90/160');
check('Half/Full labels', r[0].sizes.map(s => s.label).join() === 'Half,Full', j(r));
r = one('Veg Burger 99/149');
check('two prices without a header are guessed and flagged', r[0].sizes.length === 2 && r[0].flags.some(f => /guessed/i.test(f)));
r = one('Veg Burger 99 149');
check('space-separated climbing prices are sizes', r[0].sizes.length === 2 && r[0].price === 99, j(r));
r = one('65 Paneer 199');
check('a number in the name is not a size', r[0].name === '65 Paneer' && r[0].price === 199 && !r[0].sizes.length, j(r));
r = one('Coke 250ml 40');
check('"250ml" stays in the name', r[0].name === 'Coke 250ml' && r[0].price === 40, j(r));
r = one('Chicken Burger - 149\nEggless Cake - 120\nEgg Roll 60');
check('non-veg flagged, "eggless" is fine', !!r[0].nonveg && !r[1].nonveg && !!r[2].nonveg, j(r.map(x => x.nonveg)));
const full = MP.parse('GST 5% extra\nCall 9876543210\nThank you for visiting\nVeg Burger 99');
check('contact, tax and thank-you lines are ignored and listed', full.rows.length === 1 && full.ignored.length === 3, j(full.ignored));
r = one('PANEER TIKKA WRAP 149');
check('SHOUTING names become Title Case', r[0].name === 'Paneer Tikka Wrap', r[0].name);
r = one('Jain Veg Burger 99');
check('Jain dishes are marked', r[0].jain === true);
r = one('Veg Burger 99\nVeg Burger 99');
check('repeats are flagged', r[1].flags.some(f => /twice/i.test(f)));
r = one('Veg Burger 99', { existingNames: ['veg burger'] });
check('dish already on the menu is flagged', r[0].onMenu === true && r[0].flags.some(f => /already/i.test(f)));
r = one('Veg Burger 15');
check('low price flagged', r[0].flags.some(f => /low/i.test(f)), j(r));
const noisy = MP.parse('~~ ;; 99\n|| 150\nVeg Burger 99');
check('garbled lines are dropped but listed, real dish kept', noisy.rows.length === 1 && noisy.rows[0].name === 'Veg Burger', j(noisy));
r = one('Aloo Tikki Burger\t\t99\r\nPaneer Wrap\t149\r\n');
check('tabs and Windows line endings', r.length === 2 && r[1].price === 149, j(r));
r = one('1. Veg Burger 99\n2) Paneer Wrap 149\n• Cheese Sandwich 79');
check('numbered and bulleted lists', r.map(x => x.name).join('|') === 'Veg Burger|Paneer Wrap|Cheese Sandwich', j(r.map(x => x.name)));
r = one('Cheese Burger ....cuveuveureercereresseseserenasnssessessessessessessssssssssss. R129');
check('long OCR junk leader is dropped and R before the price is read as the rupee sign', r.length === 1 && r[0].name === 'Cheese Burger' && r[0].price === 129, j(r));
r = one('Veg Roll X79\nGrilled Sandwich S89');
check('rupee sign misread as X or S', r.map(x => x.price).join() === '79,89', j(r));
r = MP.parse('Pure Vegetarian - Since 1998\nBURGERS\nVeg Burger 99\nJD TC FP @ 1.\nMango Shake 90');
check('"Since 1998" and noise lines are not dishes or categories', r.rows.length === 2 && r.rows.every(x => x.category === 'Burgers'), j(r.rows.map(x => [x.name, x.category])));
r = MP.parse('Veg Burger 199\nPaneer Wrap 79', { fromPhoto: true }).rows;
check('photo imports flag 100-199 prices (rupee sign may be read as 1)', r[0].flags.some(f => /misread/i.test(f)) && !r[1].flags.length, j(r));
r = MP.parse('Veg Burger 199', {}).rows;
check('pasted text is not flagged that way', r[0].flags.length === 0, j(r));

r = one('Paneer 65 Rs. 170');
check('a number in the name before "Rs." price is not a size', r[0].name === 'Paneer 65' && r[0].price === 170 && !r[0].sizes.length, j(r));
r = one('Half Full\nDal Fry 90 160');
check('space-separated Half/Full prices', r[0].sizes.map(s => s.label + s.price).join() === 'Half90,Full160', j(r));

check('template: burger', MP.templateFor('Aloo Tikki Burger', '') === 'veg-burger');
check('template: wrap/roll', MP.templateFor('Kathi Roll', '') === 'paneer-wrap');
check('template: tea is plain, not a curry', MP.templateFor('Masala Tea', '') === 'plain');
check('template: dal', MP.templateFor('Dal Tadka', 'Main Course') === 'dal');
check('template: unknown is plain', MP.templateFor('Chef Special', '') === 'plain');
check('template: category fallback', MP.templateFor('Aloo Tikki', 'Burgers') === 'veg-burger');

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + ': ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
