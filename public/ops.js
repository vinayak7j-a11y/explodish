/* Explodish Ops: the founder's back-office. Everything shown comes from /api/ops/*.
   Text from the database is always inserted with textContent, never as HTML. */
(function () {
  const root = document.getElementById('root');
  const STATUSES = ['waiting', 'building', 'preview', 'live', 'expired'];
  const LABEL = { waiting: 'Waiting', building: 'Building', preview: 'Preview', live: 'Live', expired: 'Expired' };
  const state = { view: 'boot', list: [], filter: 'all', openId: null, files: [], publicUrl: '', error: '', message: '' };

  function el(tag, props, kids) {
    const e = document.createElement(tag);
    Object.keys(props || {}).forEach(k => {
      if (k === 'text') e.textContent = props[k];
      else if (k === 'class') e.className = props[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), props[k]);
      else e.setAttribute(k, props[k]);
    });
    (kids || []).forEach(c => { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  async function api(method, url, body) {
    const r = await fetch(url, { method: method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    let j = null;
    try { j = await r.json(); } catch (e) {}
    if (!r.ok) { const err = new Error((j && j.error) || 'Something went wrong'); err.status = r.status; throw err; }
    return j;
  }
  function ago(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 90) return 'just now';
    if (s < 5400) return Math.round(s / 60) + ' min ago';
    if (s < 129600) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' days ago';
  }
  function waDigits(r) {
    let d = String(r.whatsapp || '').replace(/\D/g, '');
    if (d.length === 10) d = '91' + d;
    return d;
  }
  function menuLink(r) { return (state.publicUrl || location.origin) + '/r/' + r.slug; }
  const TEMPLATES = [
    { label: 'Got your menu', text: r => 'Hi! This is Explodish. We got the menu for ' + r.name + '. We are building your menu now and will send you a private preview here.' },
    { label: 'Preview ready', text: r => 'Hi! Your Explodish preview for ' + r.name + ' is ready: ' + menuLink(r) + '\nOpen it on your phone, tap a dish and change it. Tell us what you think.' },
    { label: 'Go live', text: r => 'Glad you like it! If you want to put ' + r.name + ' live on your table QR codes, reply here and we will share the next step.' }
  ];
  function waLink(r, text) { return 'https://wa.me/' + waDigits(r) + '?text=' + encodeURIComponent(text); }
  function current() { return state.list.find(r => r.id === state.openId); }
  function show(nodes) { root.textContent = ''; nodes.filter(Boolean).forEach(n => root.appendChild(n)); }

  function loginView(note) {
    const pw = el('input', { type: 'password', placeholder: 'Ops password', autocomplete: 'current-password' });
    const err = el('div', { class: 'err', text: note || '' });
    async function go() {
      err.textContent = '';
      try { await api('POST', '/api/ops/login', { password: pw.value }); await boot(); }
      catch (e) { err.textContent = e.message; }
    }
    pw.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    show([el('div', { class: 'card' }, [el('h1', { text: 'Explodish Ops' }), el('div', { class: 'muted', text: 'Founder only' }), el('div', { class: 'row' }, [pw]), err, el('button', { class: 'btn', text: 'Log in', onclick: go })])]);
    pw.focus();
  }
  function offView(msg) {
    show([el('div', { class: 'card' }, [el('h1', { text: 'Explodish Ops' }), el('div', { class: 'err', text: msg })])]);
  }

  function listView() {
    const counts = { all: state.list.length };
    STATUSES.forEach(s => { counts[s] = state.list.filter(r => r.status === s).length; });
    const chips = ['all'].concat(STATUSES).map(s => el('button', {
      class: 'chip' + (state.filter === s ? ' on' : ''),
      text: (s === 'all' ? 'All' : LABEL[s]) + ' ' + counts[s],
      onclick: () => { state.filter = s; listView(); }
    }));
    const rows = state.list.filter(r => state.filter === 'all' || r.status === state.filter).map(r => el('div', { class: 'card tap', onclick: () => openRestaurant(r.id) }, [
      el('div', { class: 'top' }, [el('div', { class: 'name', text: r.name }), el('span', { class: 'badge s-' + r.status, text: LABEL[r.status] })]),
      el('div', { class: 'muted', text: [r.whatsapp || 'no WhatsApp', r.plan || 'no plan', 'signed up ' + ago(r.createdAt)].join('  ·  ') }),
      el('div', { class: 'muted', text: r.fileCount + ' menu file' + (r.fileCount === 1 ? '' : 's') + '  ·  ' + r.dishCount + ' dish' + (r.dishCount === 1 ? '' : 'es') })
    ]));
    show([
      el('div', { class: 'bar' }, [el('h1', { text: 'Explodish Ops' }), el('div', {}, [
        el('button', { class: 'btn sec', text: 'Refresh', onclick: refresh }), ' ',
        el('button', { class: 'btn sec', text: 'Log out', onclick: logout })])]),
      el('div', { class: 'err', text: state.error }),
      el('div', { class: 'chips' }, chips),
      rows.length ? el('div', {}, rows) : el('div', { class: 'muted', text: state.list.length ? 'Nobody in this group.' : 'No restaurants yet.' })
    ]);
  }

  function detailView() {
    const r = current();
    if (!r) { state.view = 'list'; return listView(); }
    const statusBtns = STATUSES.map(s => el('button', { class: 'btn' + (r.status === s ? ' on' : ' sec'), text: LABEL[s], onclick: () => save({ status: s }) }));
    const paid = el('input', { type: 'date', value: r.paidUntil ? String(r.paidUntil).slice(0, 10) : '' });
    const fileNodes = state.files.map(f => {
      const url = '/api/ops/restaurants/' + encodeURIComponent(r.id) + '/files/' + encodeURIComponent(f.name);
      return f.type === 'pdf'
        ? el('a', { class: 'pdf', href: url, target: '_blank', rel: 'noopener', text: 'PDF' })
        : el('a', { href: url, target: '_blank', rel: 'noopener' }, [el('img', { src: url, alt: 'Menu photo' })]);
    });
    const tpl = TEMPLATES.map(t => {
      const text = t.text(r);
      return el('div', { class: 'row' }, [
        el('a', { class: 'btn' + (waDigits(r) ? '' : ' sec'), href: waDigits(r) ? waLink(r, text) : '#', target: '_blank', rel: 'noopener', text: 'WhatsApp: ' + t.label }),
        el('button', { class: 'btn sec', text: 'Copy', onclick: () => { try { navigator.clipboard.writeText(text); state.message = 'Copied'; } catch (e) { state.message = 'Could not copy'; } detailView(); } })
      ]);
    });
    show([
      el('div', { class: 'bar' }, [el('button', { class: 'btn sec', text: 'Back', onclick: () => { state.view = 'list'; state.openId = null; refresh(); } }), el('span', { class: 'badge s-' + r.status, text: LABEL[r.status] })]),
      el('div', { class: 'card' }, [
        el('div', { class: 'name', text: r.name }),
        el('div', { class: 'muted', text: r.email }),
        el('div', { class: 'muted', text: 'WhatsApp: ' + (r.whatsapp || 'not given') + '  ·  Plan: ' + (r.plan || 'not chosen') }),
        el('div', { class: 'muted', text: 'Signed up ' + ago(r.createdAt) + '  ·  ' + r.dishCount + ' dishes' }),
        el('div', { class: 'muted' }, ['Menu link: ', el('a', { href: menuLink(r), target: '_blank', rel: 'noopener', text: menuLink(r) })])
      ]),
      el('div', { class: 'err', text: state.error }),
      state.message ? el('div', { class: 'muted', text: state.message }) : null,
      el('div', { class: 'row' }, [el('button', { class: 'btn', text: 'Open their menu editor', onclick: openEditor })]),
      el('h2', { text: 'Status' }),
      el('div', { class: 'row' }, statusBtns),
      el('h2', { text: 'Paid until' }),
      el('div', { class: 'row' }, [paid,
        el('button', { class: 'btn', text: 'Save', onclick: () => save({ paidUntil: paid.value || null }) }),
        el('button', { class: 'btn sec', text: 'Clear', onclick: () => save({ paidUntil: null }) })]),
      el('h2', { text: 'Menu files (' + state.files.length + ')' }),
      state.files.length ? el('div', { class: 'files' }, fileNodes) : el('div', { class: 'muted', text: 'No files uploaded.' }),
      el('h2', { text: 'WhatsApp messages' }),
      el('div', {}, tpl)
    ]);
  }

  async function save(fields) {
    state.error = ''; state.message = '';
    try {
      const updated = await api('PUT', '/api/ops/restaurants/' + encodeURIComponent(state.openId), fields);
      state.list = state.list.map(r => r.id === updated.id ? updated : r);
      state.message = 'Saved';
    } catch (e) { state.error = e.message; }
    detailView();
  }
  async function openEditor() {
    state.error = ''; state.message = '';
    try {
      const res = await api('POST', '/api/ops/restaurants/' + encodeURIComponent(state.openId) + '/open-as-owner');
      window.location.href = res.url || '/admin';
    } catch (e) { state.error = e.message; detailView(); }
  }
  async function openRestaurant(id) {
    state.openId = id; state.view = 'detail'; state.files = []; state.error = ''; state.message = '';
    detailView();
    try { state.files = await api('GET', '/api/ops/restaurants/' + encodeURIComponent(id) + '/files'); } catch (e) { state.error = e.message; }
    if (state.openId === id) detailView();
  }
  async function refresh() {
    try { state.list = await api('GET', '/api/ops/restaurants'); state.error = ''; }
    catch (e) { if (e.status === 401) return loginView('Please log in again'); state.error = e.message; }
    if (state.view === 'list') listView();
  }
  async function logout() { try { await api('POST', '/api/ops/logout'); } catch (e) {} loginView(); }
  async function boot() {
    try {
      const me = await api('GET', '/api/ops/me');
      state.publicUrl = me.publicUrl || '';
      state.view = 'list';
      await refresh();
      if (state.view === 'list') listView();
    } catch (e) {
      if (e.status === 503) return offView(e.message);
      loginView();
    }
  }
  setInterval(() => { if (state.view === 'list' && !document.hidden) refresh(); }, 30000);
  boot();
})();
