/* Explodish layer artwork v2: shaded, outlined, 3/4-view food layers drawn as SVG by code.
   No images, no downloads, no licences: every shape is original and generated from the ingredient's colours.
   app.js calls layerShapeV2(key, colours, role, name) and layerHeightV2(key, role). */
(function (root) {
  var W = 120;
  var GN = 0;

  /* height of each layer's drawing at a 120-wide design (the stack scales it) and how far it overhangs */
  var HEIGHTS = { 'wrap-top': 30, 'wrap-bottom': 22, 'bun-top': 46, 'bun-bottom': 34, patty: 34, cheese: 28, leafy: 30, tomato: 30, onion: 30, pickle: 28, sauce: 26, paneer: 34, cream: 26, generic: 30 };
  var WIDTHS = { 'wrap-top': 1.02, 'wrap-bottom': 1, 'bun-top': 1, 'bun-bottom': 1, patty: .97, cheese: 1, leafy: 1.07, tomato: .93, onion: .92, pickle: .9, sauce: .95, paneer: .92, cream: .92, generic: .94 };

  var FLAT_BREAD = /\b(wraps?|tortilla|rolls?|kathi|frankie|naan|paratha|roti|chapati|pita|dosa)\b/i;
  var DOMED_BUN = /\b(bun|brioche|burger|sandwich|bread|toast|pav)\b/i;
  function kindOf(key, role, name) {
    if (key !== 'bun') return key;
    var flat = name && FLAT_BREAD.test(name) && !DOMED_BUN.test(name);
    return (flat ? 'wrap-' : 'bun-') + (role === 'top' ? 'top' : 'bottom');
  }
  function layerHeightV2(key, role, name) { return HEIGHTS[kindOf(key, role, name)] || HEIGHTS.generic; }
  function layerWidthV2(key, role, name) { return WIDTHS[kindOf(key, role, name)] || WIDTHS.generic; }

  function grad(id, stops, x2, y2) {
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="' + (x2 || 0) + '" y2="' + (y2 == null ? 1 : y2) + '">' +
      stops.map(function (s) { return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] != null ? ' stop-opacity="' + s[2] + '"' : '') + '/>'; }).join('') + '</linearGradient>';
  }
  function rgrad(id, stops, cx, cy, r) {
    return '<radialGradient id="' + id + '" cx="' + (cx || .5) + '" cy="' + (cy || .4) + '" r="' + (r || .7) + '">' +
      stops.map(function (s) { return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"/>'; }).join('') + '</radialGradient>';
  }
  function ell(cx, cy, rx, ry, fill, extra) {
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  var OUT = function (c, w) { return ' stroke="' + c.deep + '" stroke-width="' + (w || 1.3) + '" stroke-linejoin="round"'; };

  /* a thick disc: side band + top face. Used by patty, bun bottom, paneer, generic. */
  function slab(g, c, o) {
    var cy = o.cy, ry = o.ry, rx = o.rx, th = o.th, cx = 60;
    var l = cx - rx, r = cx + rx, by = cy + th;
    var side = 'M' + l + ' ' + cy + ' L' + l + ' ' + by + ' C' + l + ' ' + (by + ry * 1.05) + ' ' + (cx - rx * .55) + ' ' + (by + ry * 1.25) + ' ' + cx + ' ' + (by + ry * 1.25) +
      ' C' + (cx + rx * .55) + ' ' + (by + ry * 1.25) + ' ' + r + ' ' + (by + ry * 1.05) + ' ' + r + ' ' + by + ' L' + r + ' ' + cy + ' Z';
    return '<path d="' + side + '" fill="url(#' + g + 's)"' + OUT(c) + '/>' +
      ell(cx, cy, rx, ry, 'url(#' + g + 't)', OUT(c));
  }

  function shapeFor(key, c, role, name) {
    var g = 'g' + (++GN), kind = kindOf(key, role, name), H = layerHeightV2(key, role, name), defs = '', body = '';
    var sideStops = [[0, c.mid], [1, c.deep]];

    if (kind === 'wrap-top') {
      defs = grad(g + 'd', [[0, c.top], [.6, c.mid], [1, c.deep]]);
      body = '<path d="M5 22 C4 8 32 2 60 2 C88 2 116 8 115 22 C115 28 92 30 60 30 C28 30 5 28 5 22 Z" fill="url(#' + g + 'd)"' + OUT(c, 1.4) + '/>' +
        '<path d="M14 14 C34 7 86 7 106 14" stroke="' + c.deep + '" stroke-width="1.4" fill="none" opacity=".45" stroke-linecap="round"/>' +
        [[26, 14, 7, 3], [52, 10, 5, 2.4], [78, 12, 8, 3], [98, 16, 6, 2.6], [40, 21, 6, 2.4], [70, 22, 7, 2.6]].map(function (b) { return ell(b[0], b[1], b[2], b[3], c.deep, ' opacity=".32"'); }).join('') +
        ell(42, 8, 18, 2.6, '#fff', ' opacity=".34" transform="rotate(-6 42 8)"');
    } else if (kind === 'wrap-bottom') {
      defs = grad(g + 's', sideStops) + rgrad(g + 't', [[0, c.top], [1, c.mid]], .5, .4, .8);
      body = slab(g, c, { cy: 8, ry: 7, rx: 55, th: 6 }) + ell(34, 7, 9, 2.4, c.deep, ' opacity=".3"') + ell(84, 9, 8, 2.2, c.deep, ' opacity=".3"');
    } else if (kind === 'bun-top') {
      defs = grad(g + 'd', [[0, c.top], [.45, c.mid], [1, c.deep]]);
      var seeds = /bun|brioche|burger/i.test(name) ? [[34, 17, -25], [50, 10, 8], [66, 9, -10], [82, 15, 28], [44, 25, 14], [60, 22, -18], [76, 27, 8], [26, 28, -35], [92, 27, 24]] : [];
      body = '<path d="M5 38 C4 12 30 2 60 2 C90 2 116 12 115 38 C115 44 94 46 60 46 C26 46 5 44 5 38 Z" fill="url(#' + g + 'd)"' + OUT(c, 1.5) + '/>' +
        '<path d="M8 36 C30 42 90 42 112 36 L113 39 C110 45 90 45.5 60 45.5 C30 45.5 10 45 7 39 Z" fill="' + c.deep + '" opacity=".35"/>' +
        ell(40, 13, 20, 4.6, '#fff', ' opacity=".38" transform="rotate(-14 40 13)"') +
        seeds.map(function (s) {
          return '<g transform="rotate(' + s[2] + ' ' + s[0] + ' ' + s[1] + ')"><ellipse cx="' + s[0] + '" cy="' + (s[1] + .9) + '" rx="3.3" ry="1.7" fill="' + c.deep + '" opacity=".45"/><ellipse cx="' + s[0] + '" cy="' + s[1] + '" rx="3.1" ry="1.55" fill="#fff6dc"/></g>';
        }).join('');
    } else if (kind === 'bun-bottom') {
      defs = grad(g + 's', sideStops) + rgrad(g + 't', [[0, '#fff1cf'], [1, c.top]], .5, .4, .8);
      body = slab(g, c, { cy: 11, ry: 8.5, rx: 55, th: 14 }) + ell(60, 11, 46, 5.2, c.top, ' opacity=".55"');
    } else if (kind === 'patty') {
      defs = grad(g + 's', sideStops) + rgrad(g + 't', [[0, c.top], [1, c.mid]], .45, .35, .85) + '<clipPath id="' + g + 'c"><ellipse cx="60" cy="12" rx="55" ry="9.5"/></clipPath>';
      body = slab(g, c, { cy: 12, ry: 9.5, rx: 55, th: 13 }) +
        '<g clip-path="url(#' + g + 'c)" stroke="' + c.deep + '" stroke-width="3" opacity=".55" stroke-linecap="round"><path d="M20 22 L40 2"/><path d="M36 22 L56 2"/><path d="M52 22 L72 2"/><path d="M68 22 L88 2"/><path d="M84 22 L104 2"/></g>' +
        [[28, 9], [48, 14], [70, 8], [90, 13], [62, 15], [104, 11]].map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="1.3" fill="' + c.deep + '" opacity=".7"/>'; }).join('') +
        '<path d="M12 9 C30 3 70 2 100 6" stroke="#fff" stroke-width="1.6" fill="none" opacity=".28" stroke-linecap="round"/>';
    } else if (kind === 'cheese') {
      defs = grad(g + 't', [[0, c.top], [1, c.mid]]) + grad(g + 'f', [[0, c.mid], [1, c.deep]]);
      body = '<path d="M12 5 L108 5 L117 16 L3 16 Z" fill="url(#' + g + 't)"' + OUT(c) + '/>' +
        '<path d="M3 16 L117 16 L117 19 Q116 21 112 21 L104 21 Q103 27 99 27 Q95 27 94 21 L72 21 Q71 25.5 68 25.5 Q65 25.5 64 21 L34 21 Q33 24.5 30 24.5 Q27 24.5 26 21 L8 21 Q3 21 3 19 Z" fill="url(#' + g + 'f)"' + OUT(c, 1.1) + '/>' +
        '<path d="M16 9 L100 9" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".55"/>' +
        '<path d="M22 12.5 L60 12.5" stroke="' + c.deep + '" stroke-width="1" opacity=".25" stroke-linecap="round"/>';
    } else if (kind === 'leafy') {
      defs = grad(g + 'l', [[0, c.top], [.6, c.mid], [1, c.deep]]);
      var wave = 'M2 17 Q5 5 13 12 T28 9 T43 12 T58 8 T73 12 T88 9 T104 12 Q116 7 118 17 Q121 24 110 24 T92 27 T74 24 T56 27 T38 24 T20 27 T6 24 Q-1 22 2 17 Z';
      body = '<path d="' + wave + '" fill="url(#' + g + 'l)"' + OUT(c, 1.2) + '/>' +
        '<path d="M6 15 Q30 9 60 13 T114 14" stroke="' + c.top + '" stroke-width="2.2" fill="none" opacity=".8" stroke-linecap="round"/>' +
        '<g stroke="' + c.deep + '" stroke-width="1" opacity=".4" fill="none" stroke-linecap="round"><path d="M60 16 L30 21"/><path d="M60 16 L92 21"/><path d="M60 16 L60 23"/><path d="M20 15 L12 20"/><path d="M100 15 L108 20"/></g>';
    } else if (kind === 'tomato') {
      defs = rgrad(g + 't', [[0, c.top], [.75, c.mid], [1, c.deep]], .5, .45, .75) + grad(g + 's', [[0, c.mid], [1, c.deep]]);
      body = '<path d="M7 12 L7 17 C7 24.5 38 27 60 27 C82 27 113 24.5 113 17 L113 12 C113 19 82 21.5 60 21.5 C38 21.5 7 19 7 12 Z" fill="url(#' + g + 's)"' + OUT(c, 1.1) + '/>' +
        ell(60, 12, 53, 9.5, 'url(#' + g + 't)', OUT(c)) +
        ell(60, 12, 44, 6.6, 'none', ' stroke="' + c.top + '" stroke-width="1.4" opacity=".7"') +
        [[36, 11, -20], [52, 14, 15], [68, 10, -10], [84, 14, 25], [60, 12, 90]].map(function (s) {
          return '<ellipse cx="' + s[0] + '" cy="' + s[1] + '" rx="4.6" ry="2.1" fill="#ffd88a" opacity=".85" transform="rotate(' + s[2] + ' ' + s[0] + ' ' + s[1] + ')"/>';
        }).join('') + ell(36, 7.8, 17, 2.1, '#fff', ' opacity=".35" transform="rotate(-8 36 8)"');
    } else if (kind === 'onion') {
      var ring = function (cx, cy, rx, ry, tint) {
        return ell(cx, cy, rx, ry, 'none', ' stroke="' + c.deep + '" stroke-width="5.4" opacity=".55"') +
          ell(cx, cy, rx, ry, 'none', ' stroke="' + c.mid + '" stroke-width="4"') +
          ell(cx, cy, rx, ry, 'none', ' stroke="' + tint + '" stroke-width="1.6" opacity=".75" transform="translate(0 -.8)"');
      };
      body = ring(34, 15, 24, 8.5, '#e6b3cf') + ring(62, 17, 28, 9.5, '#fff') + ring(88, 15, 22, 8, '#e6b3cf') +
        ell(62, 17, 17, 5, 'none', ' stroke="' + c.top + '" stroke-width="1.6" opacity=".85"');
    } else if (kind === 'pickle') {
      defs = rgrad(g + 'p', [[0, c.top], [.7, c.mid], [1, c.deep]], .45, .4, .75);
      body = [18, 42, 66, 90].map(function (x, i) {
        var y = 13 + (i % 2) * 2;
        return ell(x, y + 3, 12.5, 7.4, c.deep, ' opacity=".7"') + ell(x, y, 12.5, 7.4, 'url(#' + g + 'p)', OUT(c, 1.1)) +
          ell(x, y, 8.4, 4.4, 'none', ' stroke="' + c.top + '" stroke-width="1.2" opacity=".7"') +
          '<g stroke="' + c.top + '" stroke-width="1" opacity=".6" stroke-linecap="round"><path d="M' + (x - 3) + ' ' + y + ' l2 1"/><path d="M' + (x + 2) + ' ' + (y - 1) + ' l2 1"/></g>' +
          ell(x - 4, y - 3, 4, 1.2, '#fff', ' opacity=".35"');
      }).join('');
    } else if (kind === 'sauce') {
      defs = grad(g + 'u', [[0, c.top], [1, c.mid]]);
      body = '<path d="M4 11 Q12 3 24 10 T48 10 T72 9 T104 9 Q114 12 108 16 Q104 17 100 16 L98 21 Q97 25 94 25 Q91 25 90 21 L90 17 Q70 20 50 17 L48 22 Q47 26 44 26 Q41 26 40 22 L40 17 Q20 20 8 16 Q2 15 4 11 Z" fill="url(#' + g + 'u)"' + OUT(c, 1.1) + '/>' +
        ell(32, 9, 12, 2.4, '#fff', ' opacity=".55"') + ell(80, 10, 8, 1.8, '#fff', ' opacity=".4"');
    } else if (kind === 'paneer') {
      defs = grad(g + 't', [[0, '#fffdf4'], [1, c.top]]) + grad(g + 'f', [[0, c.top], [1, c.deep]]);
      body = '<path d="M12 6 L108 6 L116 16 L4 16 Z" fill="url(#' + g + 't)"' + OUT(c, 1.1) + '/>' +
        '<path d="M4 16 L116 16 L116 28 Q116 31 112 31 L8 31 Q4 31 4 28 Z" fill="url(#' + g + 'f)"' + OUT(c, 1.1) + '/>' +
        [[24, 10], [48, 12], [74, 9], [98, 12], [60, 8]].map(function (p) { return ell(p[0], p[1], 5, 1.6, '#c9833a', ' opacity=".55"'); }).join('') +
        [[20, 24], [44, 22], [70, 25], [96, 23]].map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="1.1" fill="' + c.deep + '" opacity=".45"/>'; }).join('') +
        '<path d="M16 9 L96 9" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>';
    } else if (kind === 'cream') {
      defs = grad(g + 'u', [[0, c.top], [1, c.mid]]);
      body = '<path d="M5 14 Q10 4 28 9 Q40 2 56 8 Q74 2 92 8 Q112 6 115 15 Q113 24 96 21 Q80 26 62 21 Q44 26 28 21 Q8 24 5 14 Z" fill="url(#' + g + 'u)"' + OUT(c, 1.1) + '/>' +
        '<path d="M16 12 Q40 7 66 11 T104 12" stroke="#fff" stroke-width="2.2" fill="none" opacity=".7" stroke-linecap="round"/>';
    } else {
      defs = grad(g + 's', sideStops) + rgrad(g + 't', [[0, c.top], [1, c.mid]], .45, .35, .85);
      body = slab(g, c, { cy: 12, ry: 9, rx: 53, th: 10 }) +
        '<path d="M14 9 C34 3 72 3 100 8" stroke="#fff" stroke-width="1.8" fill="none" opacity=".4" stroke-linecap="round"/>';
    }
    return ['0 0 ' + W + ' ' + H, (defs ? '<defs>' + defs + '</defs>' : '') + body];
  }

  /* ---------- Mode B (ingredient view): a bowl or a glass, with garnish and steam ---------- */
  function liquidColours(n) {
    if (/mango|orange|lemon|pineapple|papaya|nimbu|lime(?!.*mint)/.test(n)) return ['#ffe08a', '#ffb02e', '#e8851a'];
    if (/strawberry|watermelon|rose|berry|cranberry|pomegranate|litchi|lychee/.test(n)) return ['#ffc2cf', '#f0617f', '#c93457'];
    if (/mint|mojito|green|kiwi|cucumber|lime|aam panna/.test(n)) return ['#d8f5b8', '#8bd05a', '#4f9a35'];
    if (/coffee|chocolate|choco|cocoa|cola|cold coffee/.test(n)) return ['#d9ab86', '#8a5a3c', '#5a3822'];
    if (/lassi|milk|badam|kesar|thandai|buttermilk|chaas/.test(n)) return ['#fffaf0', '#f3e2bc', '#e0c88f'];
    return ['#ffd0a0', '#f58a52', '#d9602e'];
  }
  function modeBArt(dish) {
    var n = ((dish.category || '') + ' ' + (dish.name || '')).toLowerCase();
    var g = 'g' + (++GN);
    var drink = /mocktail|drink|juice|cooler|shake|smoothie|lassi|soda|lemonade|mojito|coffee|chai|tea\b|buttermilk|chaas|sharbat|falooda/.test(n);
    if (drink) {
      var q = liquidColours(n);
      return '<svg class="modeb-art" viewBox="0 0 160 130" aria-hidden="true" focusable="false"><defs>' +
        grad(g + 'l', [[0, q[0]], [.55, q[1]], [1, q[2]]]) + grad(g + 'g', [[0, '#ffffff', .55], [1, '#ffffff', .12]]) + '</defs>' +
        ell(80, 120, 34, 6, '#000', ' opacity=".35"') +
        '<path d="M48 22 L112 22 L100 112 Q80 122 60 112 Z" fill="url(#' + g + 'g)" stroke="#fff" stroke-opacity=".55" stroke-width="1.6" stroke-linejoin="round"/>' +
        '<path d="M52 36 L108 36 L98 111 Q80 120 62 111 Z" fill="url(#' + g + 'l)"/>' +
        ell(80, 36, 28, 5.5, q[0], ' opacity=".95"') +
        [[68, 58, -14], [90, 70, 20], [74, 88, 8], [92, 96, -18]].map(function (i) {
          return '<rect x="' + (i[0] - 8) + '" y="' + (i[1] - 8) + '" width="16" height="16" rx="3.5" fill="#fff" opacity=".42" stroke="#fff" stroke-opacity=".7" transform="rotate(' + i[2] + ' ' + i[0] + ' ' + i[1] + ')"/>';
        }).join('') +
        '<path d="M96 6 L78 100" stroke="#fff" stroke-width="5.4" stroke-linecap="round"/><path d="M96 6 L78 100" stroke="#e23d4b" stroke-width="2" stroke-linecap="round" stroke-dasharray="5 6"/>' +
        '<g transform="translate(108 24)"><circle r="14" fill="#ffe27a" stroke="#e8b72a" stroke-width="1.6"/><circle r="10.5" fill="none" stroke="#fff7c8" stroke-width="1.4"/><path d="M0 -10 V10 M-10 0 H10 M-7 -7 L7 7 M-7 7 L7 -7" stroke="#fff7c8" stroke-width="1" opacity=".8"/></g>' +
        '<path d="M54 30 L60 108" stroke="#fff" stroke-width="3.4" stroke-linecap="round" opacity=".5"/>' +
        '<circle cx="66" cy="14" r="2" fill="#fff" opacity=".6" class="drip"/><circle cx="58" cy="8" r="1.4" fill="#fff" opacity=".5" class="drip"/></svg>';
    }
    var kind = /soup|shorba|manchow/.test(n) ? 'soup' : /biryani|biriyani|pulao|pulav|rice|khichdi/.test(n) ? 'biryani' : /dal|daal|rajma|chole|chana|sambar|kadhi/.test(n) ? 'dal' : 'curry';
    var P = { curry: ['#f6a24d', '#d9602e', '#a8401c'], dal: ['#f7d36a', '#e2a42a', '#b87a14'], soup: ['#f9b8a0', '#e8694a', '#b9432b'], biryani: ['#fff0c2', '#f2d58a', '#d9b04a'] }[kind];
    var leaf = function (x, y, r) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="4.2" ry="2" fill="#5fa83a" stroke="#3d7a22" stroke-width=".7" transform="rotate(' + r + ' ' + x + ' ' + y + ')"/>'; };
    var garnish = '';
    if (kind === 'curry') {
      garnish = [[58, 56, -8], [84, 60, 10], [102, 54, -14], [70, 66, 6]].map(function (c2) {
        return '<g transform="rotate(' + c2[2] + ' ' + c2[0] + ' ' + c2[1] + ')"><rect x="' + (c2[0] - 7) + '" y="' + (c2[1] - 5) + '" width="14" height="10" rx="2.6" fill="#f9ecc8" stroke="#d9bf86" stroke-width="1"/><rect x="' + (c2[0] - 7) + '" y="' + (c2[1] - 5) + '" width="14" height="3.6" rx="2" fill="#fff" opacity=".6"/></g>';
      }).join('') + '<path d="M50 62 Q66 54 82 62 T112 60" stroke="#fff3d6" stroke-width="3.2" fill="none" stroke-linecap="round" opacity=".85"/>' + leaf(76, 52, -20) + leaf(92, 66, 25) + leaf(62, 50, 15);
    } else if (kind === 'dal') {
      garnish = '<path d="M46 60 Q64 52 82 60 T114 58" stroke="#fff0b0" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".7"/>' +
        [[60, 58], [74, 64], [90, 56], [100, 63], [68, 54]].map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.1" fill="#c2381f"/>'; }).join('') +
        [[56, 63], [84, 60], [96, 66], [72, 58]].map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="1.1" fill="#5a3822"/>'; }).join('') +
        '<ellipse cx="82" cy="60" rx="7" ry="3.4" fill="#ffe27a" stroke="#e8b72a" stroke-width=".8"/>' + leaf(66, 62, -15) + leaf(98, 58, 20);
    } else if (kind === 'soup') {
      garnish = '<path d="M52 61 Q66 53 80 60 T108 58" stroke="#fff6e8" stroke-width="3.4" fill="none" stroke-linecap="round" opacity=".9"/>' +
        [[62, 62], [78, 57], [94, 63], [104, 58]].map(function (p) { return '<rect x="' + (p[0] - 4) + '" y="' + (p[1] - 3) + '" width="8" height="6" rx="1.6" fill="#e2a64a" stroke="#b87a22" stroke-width=".8"/>'; }).join('') + leaf(72, 54, 10) + leaf(90, 60, -20);
    } else {
      garnish = '<path d="M30 64 Q80 14 130 64 Q80 74 30 64 Z" fill="#fff6dc" stroke="#d9b04a" stroke-width="1.4"/>' +
        '<g stroke="#e8d08a" stroke-width="1.4" stroke-linecap="round" opacity=".9">' + [[52, 46, 3], [66, 36, -2], [82, 34, 4], [96, 42, -3], [74, 50, 2], [58, 58, -4], [92, 56, 3], [104, 54, -2], [44, 58, 2], [80, 60, -3]].map(function (s) { return '<path d="M' + s[0] + ' ' + s[1] + ' l' + (s[2] * 2) + ' 4"/>'; }).join('') + '</g>' +
        [[60, 44], [88, 40], [74, 54], [100, 52], [48, 56]].map(function (p) { return ell(p[0], p[1], 3.6, 1.6, '#f08a1c', ' opacity=".85"'); }).join('') +
        [[70, 40], [96, 46], [56, 52]].map(function (p) { return ell(p[0], p[1], 4.4, 2, '#8a5a2a', ' opacity=".7"'); }).join('') + leaf(80, 36, -25) + leaf(66, 44, 30);
    }
    return '<svg class="modeb-art" viewBox="0 0 160 130" aria-hidden="true" focusable="false"><defs>' +
      grad(g + 'b', [[0, '#fff3d8'], [.25, '#e9c58a'], [1, '#b37a3a']]) + rgrad(g + 'f', [[0, P[0]], [.7, P[1]], [1, P[2]]], .5, .45, .7) + '</defs>' +
      ell(80, 116, 44, 7, '#000', ' opacity=".3"') +
      '<path d="M20 62 C20 100 48 116 80 116 C112 116 140 100 140 62 Z" fill="url(#' + g + 'b)" stroke="#8a5a2a" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M26 74 C32 98 54 108 80 108" stroke="#fff" stroke-width="3" fill="none" opacity=".35" stroke-linecap="round"/>' +
      '<ellipse cx="80" cy="62" rx="60" ry="14" fill="#fff3d8" stroke="#8a5a2a" stroke-width="1.6"/>' +
      '<ellipse cx="80" cy="63" rx="53" ry="11" fill="url(#' + g + 'f)"/>' + garnish +
      '<g class="steam" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="3" opacity=".5"><path d="M62 44 Q56 34 63 26 Q70 18 63 8"/><path d="M82 40 Q76 30 83 22 Q90 14 83 4"/><path d="M102 44 Q96 34 103 26 Q110 18 103 8"/></g></svg>';
  }

  root.modeBArtV2 = modeBArt;
  root.layerShapeV2 = shapeFor;
  root.layerHeightV2 = layerHeightV2;
  root.layerWidthV2 = layerWidthV2;
})(typeof self !== 'undefined' ? self : this);
