// Gmail advanced filter: builds a Gmail search query from multi-select checkboxes.
// Gmail enforces Trusted Types, so the DOM is built with createElement only (no innerHTML).
(() => {
  const h = (tag, { dataset, ...props } = {}, ...kids) => {
    // dataset is getter-only, so it is merged into the existing object instead of assigned.
    const el = Object.assign(document.createElement(tag), props);
    if (dataset) Object.assign(el.dataset, dataset);
    kids.forEach(k => el.append(k));
    return el;
  };

  const GROUPS = {
    // Star types require them to be enabled in Gmail settings (General > Stars).
    star: [['כל כוכב', 'is:starred'], ['ללא כוכב', '-is:starred'],
           ['⭐ צהוב', 'has:yellow-star'], ['🟠 כתום', 'has:orange-star'], ['🔴 אדום', 'has:red-star'],
           ['🟣 סגול', 'has:purple-star'], ['🔵 כחול', 'has:blue-star'], ['🟢 ירוק', 'has:green-star'],
           ['❗ קריאה אדומה', 'has:red-bang'], ['! קריאה צהובה', 'has:yellow-bang'], ['✔ וי ירוק', 'has:green-check'],
           ['ℹ מידע כחול', 'has:blue-info'], ['❓ שאלה סגולה', 'has:purple-question'], ['» חץ כתום', 'has:orange-guillemet']],
    read: [['נקרא', 'is:read'], ['לא נקרא', 'is:unread']],
    box: [['דואר נכנס', 'in:inbox'], ['נשלח', 'in:sent'], ['טיוטות', 'in:drafts'],
          ['ארכיון', '-in:inbox -in:sent -in:drafts -in:spam -in:trash'],
          ['ספאם', 'in:spam'], ['אשפה', 'in:trash'], ['הכל', 'in:anywhere']],
    attach: [['עם קובץ מצורף', 'has:attachment'], ['חשוב', 'is:important']]
  };

  // Quote a user value for Gmail search; strips quotes so input cannot break out of the term.
  const quote = s => '"' + s.replace(/"/g, '').trim() + '"';
  // Quotes only when the value contains characters that would split the term.
  const term = s => { const v = s.replace(/"/g, '').trim(); return /[\s(){}]/.test(v) ? '"' + v + '"' : v; };
  // Parentheses only where needed: around the group when there are alternatives,
  // and around a multi-word alternative so OR does not bind to its first word only.
  const or = terms => terms.length === 0 ? '' : terms.length === 1 ? terms[0]
    : '(' + terms.map(t => / /.test(t.replace(/"[^"]*"/g, '')) ? '(' + t + ')' : t).join(' OR ') + ')';
  const lines = s => s.split(/[\n,;]+/).map(x => x.trim()).filter(Boolean);

  const checkboxGroup = (title, key, items) => h('fieldset', {},
    h('legend', { textContent: title }),
    ...items.map(([text, q]) => h('label', {},
      h('input', { type: 'checkbox', value: q, className: 'gaf-cb', dataset: { group: key } }), text)));

  const labelBox = h('div', { className: 'gaf-list' });
  const fromBox = h('textarea', { rows: 2, placeholder: 'כתובות שולח (שורה לכל אחת)' });
  const toBox = h('textarea', { rows: 2, placeholder: 'כתובות נמען (שורה לכל אחת)' });
  const exactBox = h('textarea', { rows: 2, placeholder: 'ביטויים מדויקים (שורה לכל ביטוי)' });
  const exactMode = h('select', {},
    h('option', { value: 'AND', textContent: 'כל הביטויים' }),
    h('option', { value: 'OR', textContent: 'אחד מהביטויים' }));
  const excludeBox = h('input', { type: 'text', placeholder: 'מילים להוציא (מופרדות בפסיק)' });
  const preview = h('div', { className: 'gaf-q' });

  const tplSelect = h('select', { className: 'gaf-tpl-select' });
  const tplName = h('input', { type: 'text', placeholder: 'שם תבנית חדשה' });
  const closeBtn = h('button', { className: 'gaf-close', title: 'סגור', textContent: '✕' });

  const panel = h('div', { id: 'gaf-panel' },
    h('div', { className: 'gaf-head' }, h('span', { textContent: 'סינון מתקדם' }), closeBtn),
    checkboxGroup('כוכב', 'star', GROUPS.star),
    checkboxGroup('מצב קריאה', 'read', GROUPS.read),
    checkboxGroup('תיקייה', 'box', GROUPS.box),
    checkboxGroup('נוסף', 'attach', GROUPS.attach),
    h('fieldset', {}, h('legend', { textContent: 'תוויות' }), labelBox),
    h('fieldset', {}, h('legend', { textContent: 'אימיילים' }), fromBox, toBox),
    h('fieldset', {}, h('legend', { textContent: 'מילים מדויקות' }), exactBox, exactMode, excludeBox),
    preview,
    h('div', { className: 'gaf-btns' },
      h('button', { id: 'gaf-search', textContent: 'סנן' }),
      h('button', { id: 'gaf-clear', textContent: 'נקה' })),
    h('fieldset', { className: 'gaf-tpl' }, h('legend', { textContent: 'תבניות' }),
      h('div', { className: 'gaf-row' }, tplSelect,
        h('button', { id: 'gaf-tpl-del', className: 'gaf-text-btn', textContent: 'מחק' })),
      h('div', { className: 'gaf-row' }, tplName,
        h('button', { id: 'gaf-tpl-save', className: 'gaf-text-btn', textContent: 'שמור' }))));

  const toggle = h('button', { id: 'gaf-toggle', title: 'סינון מתקדם', ariaLabel: 'סינון מתקדם' });

  // Labels are read from the Gmail sidebar links (#label/<name>). Gmail does not always keep
  // them in the DOM (collapsed sidebar, "More" closed), so every name seen is cached.
  let knownLabels = new Set();
  chrome.storage.local.get('labels', r => { (r.labels || []).forEach(n => knownLabels.add(n)); });
  function loadLabels(checked = new Set([...labelBox.querySelectorAll('input:checked')].map(i => i.value))) {
    // Labels checked in a template stay listed even when the sidebar does not show them.
    const names = new Set([...checked, ...knownLabels]);
    document.querySelectorAll('a[href*="#label/"]').forEach(a => {
      const name = decodeURIComponent(a.getAttribute('href').split('#label/')[1] || '').replace(/\+/g, ' ');
      if (name) names.add(name);
    });
    if (names.size > knownLabels.size) {
      knownLabels = new Set(names);
      chrome.storage.local.set({ labels: [...names] });
    }
    labelBox.replaceChildren(...[...names].sort().map(n => h('label', {},
      h('input', { type: 'checkbox', value: n, checked: checked.has(n) }), n)));
    if (!names.size) labelBox.append(h('span', { textContent: 'פתח את רשימת התוויות בסרגל הצד כדי לטעון' }));
  }

  function buildQuery() {
    const parts = [];
    for (const key of Object.keys(GROUPS)) {
      const vals = [...panel.querySelectorAll(`.gaf-cb[data-group="${key}"]:checked`)].map(i => i.value);
      // "נוסף" is cumulative (AND); the rest are alternatives within the group (OR).
      if (key === 'attach') parts.push(...vals); else parts.push(or(vals));
    }
    parts.push(or([...labelBox.querySelectorAll('input:checked')].map(i => 'label:' + term(i.value.replace(/[\s/]+/g, '-')))));
    parts.push(or(lines(fromBox.value).map(e => 'from:' + term(e))));
    parts.push(or(lines(toBox.value).map(e => 'to:' + term(e))));
    const phrases = exactBox.value.split('\n').map(x => x.trim()).filter(Boolean).map(quote);
    parts.push(exactMode.value === 'OR' ? or(phrases) : phrases.join(' '));
    parts.push(...lines(excludeBox.value).map(w => '-' + term(w)));
    return parts.filter(Boolean).join(' ');
  }

  const refresh = () => { preview.textContent = buildQuery() || '(אין סינון)'; };

  // Templates: the form state, kept in chrome.storage.sync so it follows the Chrome profile.
  const getState = () => ({
    cbs: [...panel.querySelectorAll('.gaf-cb:checked')].map(i => i.dataset.group + '|' + i.value),
    labels: [...labelBox.querySelectorAll('input:checked')].map(i => i.value),
    from: fromBox.value, to: toBox.value, exact: exactBox.value, mode: exactMode.value, exclude: excludeBox.value
  });
  function setState(s) {
    const cbs = new Set(s.cbs || []);
    panel.querySelectorAll('.gaf-cb').forEach(i => { i.checked = cbs.has(i.dataset.group + '|' + i.value); });
    loadLabels(new Set(s.labels || []));
    fromBox.value = s.from || ''; toBox.value = s.to || ''; exactBox.value = s.exact || '';
    exactMode.value = s.mode || 'AND'; excludeBox.value = s.exclude || '';
    refresh();
  }

  let templates = {};
  function renderTemplates() {
    tplSelect.replaceChildren(h('option', { value: '', textContent: 'בחר תבנית…' }),
      ...Object.keys(templates).sort().map(n => h('option', { value: n, textContent: n })));
  }
  const saveTemplates = () => chrome.storage.sync.set({ templates });
  chrome.storage.sync.get('templates', r => { templates = r.templates || {}; renderTemplates(); });

  tplSelect.addEventListener('change', e => {
    e.stopPropagation();
    if (templates[tplSelect.value]) { setState(templates[tplSelect.value]); tplName.value = tplSelect.value; }
  });
  panel.querySelector('#gaf-tpl-save').addEventListener('click', () => {
    const name = tplName.value.trim();
    if (!name) { tplName.focus(); return; }
    templates[name] = getState();
    saveTemplates(); renderTemplates(); tplSelect.value = name;
  });
  panel.querySelector('#gaf-tpl-del').addEventListener('click', () => {
    const name = tplSelect.value;
    if (!name || !confirm(`למחוק את התבנית "${name}"?`)) return;
    delete templates[name];
    saveTemplates(); renderTemplates(); tplName.value = '';
  });

  const close = () => panel.classList.remove('open');
  panel.addEventListener('input', refresh);
  panel.addEventListener('change', refresh);
  closeBtn.addEventListener('click', close);
  panel.querySelector('#gaf-search').addEventListener('click', () => {
    const q = buildQuery();
    if (!q) return;
    location.hash = '#search/' + encodeURIComponent(q);
    close();
  });
  panel.querySelector('#gaf-clear').addEventListener('click', () => setState({}));
  toggle.addEventListener('click', () => {
    if (panel.classList.toggle('open')) loadLabels();
  });

  document.body.append(panel, toggle);
  refresh();
})();
