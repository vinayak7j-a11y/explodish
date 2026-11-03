/* Explodish menu parser: turns pasted or OCR'd menu text into dish rows.
   Free, no AI, deterministic. Works in the browser (window.MenuParse) and in Node (tests).
   Nothing is silently dropped: lines it does not use come back in `ignored`. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MenuParse = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  var NONVEG_RE = /\b(chicken|mutton|lamb|beef|pork|bacon|ham|fish|prawns?|shrimps?|crabs?|lobsters?|squid|calamari|salmon|tuna|keema|kheema|eggs?|omelette|omelet|meat|sausages?|salami|pepperoni|gelatin|oysters?|mussels?|anchov(?:y|ies)|non[- ]?veg)\b/i;

  /* lines that are never dishes: phone numbers, taxes, addresses, thank-yous */
  var JUNK_RE = /\b(gst|gstin|fssai|tax(?:es)?|inclusive|exclusive|service charge|call us|phone|ph\.?\s*no|mob(?:ile)?|whats?app|www\.|\.com|\.in\b|open(?:ing)? (?:hours|time)|timings?|address|thank you|thanks|welcome|since|est\.|established|visit|follow us|instagram|facebook|scan|qr|home delivery|delivery|parcel|packing|charges?|extra|all rights|copyright|©|note:|please)\b/i;

  /* these are never dishes, even when a number is on the line (years, phone, tax ids) */
  var STRONG_JUNK_RE = /\b(since|est\.|established|gst|gstin|fssai|phone|whats?app|www\.|timings?|thank you|thanks for)\b|\.com\b/i;

  var SIZE_WORDS = /\b(half|full|regular|reg|large|lrg|small|medium|mini|single|double|std|standard|jumbo|big)\b/gi;

  var CUR = '(?:₹|rs\\.?|inr|[RSXZ¥€$%](?=\\d))';
  var NUM = '\\d{2,4}';
  /* one price token: 99, ₹99, Rs.99, 99/-  */
  var TOK = '(?:' + CUR + '\\s*)?' + NUM + '(?:\\s*\\/-|\\/-)?';
  /* trailing price group, up to 3 prices separated by / | , or space */
  var TRAIL = new RegExp('^(.*?)[\\s:\\-–|]*((?:' + TOK + ')(?:\\s*[\\/|,]\\s*(?:' + TOK + ')){0,2}|(?:' + TOK + ')(?:\\s+(?:' + TOK + ')){1,2})\\s*(?:\\/-|only)?\\s*$', 'i');
  var PRICE_ONLY = new RegExp('^\\s*(?:' + TOK + ')(?:\\s*[\\/|,\\s]\\s*(?:' + TOK + ')){0,2}\\s*(?:\\/-|only)?\\s*$', 'i');

  function normalise(line) {
    return String(line)
      .replace(/[\u00a0\u2007\u202f\t]+/g, ' ')
      .replace(/[\u2012\u2013\u2014\u2015\u2212]/g, '-')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/(?:\.{2,}|·{2,}|_{2,}|…+|-{3,}|={2,}|\u2022{2,})/g, ' ')
      .replace(/^\s*(?:[•·●▪■◆◦*>]+|\d{1,3}[.)])\s*(?=[A-Za-z(])/, '')
      .replace(/^\s*-\s+(?=[A-Za-z(])/, '')
      .split(' ').filter(function (w) { return w.length < 20; }).join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function numbersIn(s) {
    var out = [], re = /\d{2,4}/g, m;
    while ((m = re.exec(s))) out.push(Number(m[0]));
    return out;
  }

  function letters(s) { return (String(s).match(/[A-Za-z\u0900-\u097F]/g) || []).length; }
  function isAllCaps(s) { var l = String(s).replace(/[^A-Za-z]/g, ''); return l.length >= 3 && l === l.toUpperCase(); }
  function wordCount(s) { return String(s).trim().split(/\s+/).filter(Boolean).length; }

  var SMALL = { and: 1, of: 1, with: 1, in: 1, on: 1, a: 1, the: 1, n: 1, '&': 1 };
  function titleCase(s) {
    s = String(s).trim();
    var l = s.replace(/[^A-Za-z]/g, '');
    if (l.length < 3 || l !== l.toUpperCase()) return s; // only fix SHOUTING text
    return s.toLowerCase().replace(/\b[a-z][a-z']*/g, function (w, i) {
      return (i > 0 && SMALL[w]) ? w : w.charAt(0).toUpperCase() + w.slice(1);
    });
  }

  /* ---- template keywords (order matters: first match wins) ---- */
  var TEMPLATE_RULES = [
    ['veg-burger', /\bburgers?\b/],
    ['paneer-wrap', /\b(wraps?|rolls?|kathi|frankie|shawarma)\b/],
    ['sandwich', /\b(sandwich(?:es)?|sub|panini|toast|club)\b/],
    ['plain', /\b(tea|chai|coffee|cola|coke|pepsi|sprite|fanta|thums up|soda|water|buttermilk|chaas|cake|pastry|brownie|ice cream|fries|pizza|pasta|momos?|dosa|idli|vada|uttapam|pav bhaji|samosa|pakora|pakoda|noodle soup)\b/],
    ['biryani', /\b(biryani|biriyani|pulao|pulav)\b/],
    ['rice-bowl', /\b(bowls?|fried rice|rice bowl|noodles?|chowmein|chow mein|hakka)\b/],
    ['soup', /\b(soups?|shorba|manchow)\b/],
    ['dal', /\b(dal|daal|dhal|sambar|rajma|chole|chana|kadhi)\b/],
    ['paneer-curry', /\b(paneer|curry|masala|makhani|kadai|kadhai|korma|bhurji|sabzi|sabji|matar|malai kofta|kofta)\b/],
    ['cold-drink', /\b(shakes?|juice|lassi|smoothie|mojito|cold coffee|lemonade|mocktail|milkshake)\b/]
  ];
  function templateFor(name, category) {
    var t = (String(name) + ' ' + String(category || '')).toLowerCase();
    var n = String(name).toLowerCase();
    for (var i = 0; i < TEMPLATE_RULES.length; i++) {
      if (TEMPLATE_RULES[i][1].test(n)) return TEMPLATE_RULES[i][0];
    }
    // fall back to the heading only for the clearest headings
    var c = String(category || '').toLowerCase();
    if (/\bburgers?\b/.test(c)) return 'veg-burger';
    if (/\b(wraps?|rolls?)\b/.test(c)) return 'paneer-wrap';
    if (/\bsandwich/.test(c)) return 'sandwich';
    if (/\bsoups?\b/.test(c)) return 'soup';
    return 'plain';
  }

  function sizeLabelsFrom(line) {
    var found = [], m, re = new RegExp(SIZE_WORDS.source, 'gi');
    while ((m = re.exec(line))) {
      var w = m[1].toLowerCase();
      var map = { reg: 'regular', lrg: 'large', std: 'regular', standard: 'regular' };
      w = map[w] || w;
      found.push(w.charAt(0).toUpperCase() + w.slice(1));
    }
    return found;
  }
  function defaultLabels(n) {
    if (n === 2) return ['Regular', 'Large'];
    if (n === 3) return ['Small', 'Medium', 'Large'];
    return ['Regular'];
  }

  /* split "Name - description" or "Name: description" (only when clearly a description) */
  function splitDesc(text) {
    var m = /^(.{2,60}?)\s+-\s+(.{8,})$/.exec(text) || /^(.{2,40}?):\s+(.{8,})$/.exec(text);
    if (m && wordCount(m[1]) <= 6) return { name: m[1].trim(), desc: m[2].trim() };
    return { name: text, desc: '' };
  }

  function cleanName(s) {
    s = String(s).replace(/^[\s\-–:|.,'"]+|[\s\-–:|.,'"]+$/g, '').replace(/\s{2,}/g, ' ');
    // an unbalanced "(" left over from a cut line
    if ((s.match(/\(/g) || []).length > (s.match(/\)/g) || []).length) s = s.replace(/\s*\([^)]*$/, '');
    return titleCase(s).trim();
  }

  /* Main entry. text: pasted/OCR text. opts.existingNames: names already on the menu. */
  function parse(text, opts) {
    opts = opts || {};
    var existing = {};
    (opts.existingNames || []).forEach(function (n) { existing[String(n).trim().toLowerCase()] = 1; });

    var rawLines = String(text || '').replace(/\r/g, '').split('\n');
    // Keep blank lines as block markers, normalise the rest.
    var lines = rawLines.map(function (l) { return { raw: l, text: normalise(l), blankBefore: false }; });
    var prevBlank = true;
    lines.forEach(function (l) { l.blankBefore = prevBlank; prevBlank = (l.text === ''); });
    lines = lines.filter(function (l) { return l.text !== ''; });

    var rows = [], ignored = [];
    var category = '', sizeHeader = null, last = null, seq = 0;

    for (var i = 0; i < lines.length; i++) {
      var L = lines[i], t = L.text;

      if (STRONG_JUNK_RE.test(t) || (JUNK_RE.test(t) && !TRAIL.test(t))) { ignored.push({ line: t, reason: 'Not a dish (looks like contact, tax or notice text)' }); continue; }
      if (/\d{7,}/.test(t.replace(/[\s-]/g, ''))) { ignored.push({ line: t, reason: 'Looks like a phone number' }); continue; }

      // name on one line, price alone on the next line
      var nextT = i + 1 < lines.length ? lines[i + 1].text : '';
      if (!TRAIL.test(t) && nextT && PRICE_ONLY.test(nextT) && letters(t) >= 3 && !isAllCaps(t) && wordCount(t) <= 8) {
        t = t + ' ' + nextT; i++;
      }

      var m = TRAIL.exec(t);
      var hasPrice = !!(m && letters(m[1]) >= 2);

      if (hasPrice) {
        var nums = numbersIn(m[2]);
        var namePart = m[1];
        // space-separated numbers are only sizes when they climb sensibly; otherwise the first belongs to the name
        var spaceOnly = !/[\/|,]/.test(m[2]) && nums.length > 1;
        if (spaceOnly) {
          var tokens = m[2].trim().split(/\s+(?=(?:(?:₹|rs\.?|inr)\s*)?\d)/i);
          var cur2 = tokens.map(function (x) { return /^(?:₹|rs|inr|[RSXZ¥€$%]\d)/i.test(x); });
          var currencyOnLaterOnly = !cur2[0] && cur2.slice(1).some(Boolean); // "Paneer 65 Rs. 170": 65 is part of the name
          var ok = !currencyOnLaterOnly && nums.every(function (n, k) { return k === 0 || (n > nums[k - 1] && n / nums[k - 1] <= 2); });
          if (!ok) { namePart = (namePart + ' ' + nums.slice(0, -1).join(' ')).trim(); nums = [nums[nums.length - 1]]; }
        }
        var sd = splitDesc(namePart);
        var name = cleanName(sd.name);
        var flags = [];
        var lettersIn = letters(name), total = name.replace(/\s/g, '').length || 1;
        if (lettersIn < 3 || lettersIn / total < 0.6) {
          ignored.push({ line: L.text, reason: 'Name looks garbled' });
          continue;
        }
        var sizes = [];
        var price = nums[0];
        if (nums.length > 1) {
          var labels = (sizeHeader && sizeHeader.length === nums.length) ? sizeHeader : defaultLabels(nums.length);
          sizes = nums.map(function (n, k) { return { label: labels[k] || ('Size ' + (k + 1)), price: n }; });
          if (!(sizeHeader && sizeHeader.length === nums.length)) flags.push('Sizes guessed (Regular/Large)');
        }
        if (opts.fromPhoto && price >= 100 && price <= 199) flags.push('Check price (the \u20b9 sign is often misread as 1)');
        if (price < 20) flags.push('Price looks very low');
        if (price > 3000) flags.push('Price looks very high');
        var nv = NONVEG_RE.exec(name + ' ' + sd.desc);
        var row = {
          id: 'r' + (++seq), name: name, desc: sd.desc, category: category, price: price, sizes: sizes,
          jain: /\bjain\b/i.test(name), nonveg: nv ? nv[1].toLowerCase() : '', flags: flags,
          template: templateFor(name, category), source: L.text,
          onMenu: !!existing[name.toLowerCase()]
        };
        if (row.nonveg) row.flags.push('Not vegetarian (' + row.nonveg + ')');
        if (row.onMenu) row.flags.push('Already on your menu');
        var dupe = rows.filter(function (r) { return r.name.toLowerCase() === name.toLowerCase() && r.category === category; })[0];
        if (dupe) row.flags.push('Appears twice');
        rows.push(row); last = row;
        continue;
      }

      // size header line, e.g. "Regular Large" / "Half  Full"
      var sl = sizeLabelsFrom(t);
      var rest = t.replace(SIZE_WORDS, '').replace(/[^A-Za-z]/g, '');
      if (sl.length >= 2 && rest.length <= 2) { sizeHeader = sl; continue; }

      // no price: heading, description or noise
      var wc = wordCount(t);
      var nextHasPrice = !!(nextT && TRAIL.test(nextT));
      var capsWords = t.split(/\s+/).every(function (w) { return /^[A-Z&(]/.test(w) || SMALL[w.toLowerCase()]; });
      var heading = isAllCaps(t) || /:\s*$/.test(t) ||
        (wc <= 3 && capsWords && !/[,.]$/.test(t) && (L.blankBefore || !last || nextHasPrice)) ||
        (wc <= 4 && L.blankBefore && !last && !/[,.]$/.test(t));
      var nonSpace = t.replace(/\s/g, '').length || 1;
      var longWord = t.split(/\s+/).some(function (w) { return (w.match(/[A-Za-z]/g) || []).length >= 4; });
      if (letters(t) < 3 || letters(t) / nonSpace < 0.75 || !longWord) { ignored.push({ line: t, reason: 'Looks like noise from the photo' }); continue; }
      if (heading && wc <= 6 && !/[a-z]{3,}.*[,.]\s*[a-z]/.test(t)) {
        category = cleanName(t.replace(/:\s*$/, ''));
        sizeHeader = null; last = null;
        continue;
      }
      if (last && !last.desc) { last.desc = t; continue; } // description of the dish above
      ignored.push({ line: t, reason: 'No price found' });
    }

    // a dish with the same name in two categories keeps both; exact repeats are flagged above
    return { rows: rows, ignored: ignored };
  }

  return { parse: parse, templateFor: templateFor, titleCase: titleCase, normalise: normalise, NONVEG_RE: NONVEG_RE };
});
