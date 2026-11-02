/* Amy 帳簿 — 純 JS，冇 framework、冇外部服務。
 * URL 同 key 只會存喺部機嘅 localStorage，repo 入面冇任何 key 或者真實數據。 */
'use strict';
(() => {

  // ===== 設定 =====
  const LS_PREFIX = 'amyb.';
  const HK_TZ = 'Asia/Hong_Kong';
  const FETCH_TIMEOUT_MS = 25000;
  const AUTO_REFRESH_AFTER_MS = 5 * 60 * 1000; // App 由背景返嚟，超過 5 分鐘就自動更新
  const ROLES = ['amy', 'lai'];

  const params = new URLSearchParams(location.search);
  // ?demo / ?demo=lai / ?demo=offline / ?demo=error
  const DEMO = params.has('demo') ? (params.get('demo') || 'amy') : null;

  // ===== localStorage（全部包 try/catch，私密瀏覽都唔會死）=====
  const store = {
    get(k) { try { return localStorage.getItem(LS_PREFIX + k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(LS_PREFIX + k, v); } catch { /* ignore */ } },
    del(k) { try { localStorage.removeItem(LS_PREFIX + k); } catch { /* ignore */ } },
    getJSON(k) { try { return JSON.parse(this.get(k)); } catch { return null; } },
    setJSON(k, v) { try { this.set(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  // ===== 時間（一律用香港時間）=====
  function hkParts(date = new Date()) {
    const p = {};
    new Intl.DateTimeFormat('en-GB', {
      timeZone: HK_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).forEach(x => { p[x.type] = x.value; });
    return p;
  }
  const currentMonth = () => { const p = hkParts(); return `${p.year}-${p.month}`; };
  const todayStr = () => { const p = hkParts(); return `${p.year}-${p.month}-${p.day}`; };

  function shiftMonth(m, delta) {
    let [y, mo] = m.split('-').map(Number);
    mo += delta;
    while (mo < 1) { mo += 12; y--; }
    while (mo > 12) { mo -= 12; y++; }
    return `${y}-${String(mo).padStart(2, '0')}`;
  }
  const monthDiff = (a, b) => { // b - a（以月計）
    const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number);
    return (yb - ya) * 12 + (mb - ma);
  };

  // "2026-11-02 22:15" → { date, dm: "02-11", hm: "22:15" }
  function parseStamp(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s || '');
    if (!m) return null;
    return { date: `${m[1]}-${m[2]}-${m[3]}`, dm: `${m[3]}-${m[2]}`, hm: `${m[4]}:${m[5]}` };
  }

  // ===== 格式 =====
  const nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function money(n) {
    n = Number(n) || 0;
    const neg = n < 0 && Math.abs(n) >= 0.005;
    return (neg ? '-' : '') + 'HK$' + nf.format(Math.abs(n));
  }
  const num = n => Number(n) || 0;
  const amt = n => `<span class="amt${num(n) < -0.004 ? ' neg' : ''}">${money(n)}</span>`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ===== 狀態 =====
  const state = {
    url: '',
    key: '',
    role: null,
    month: currentMonth(),
    data: null,        // 而家顯示緊嘅回應
    fromCache: false,  // data 係咪 cache
    loading: false,
    error: null,       // 最近一次 fetch 失敗嘅訊息
    reqId: 0,
    lastFetchAt: 0,
    tab: store.get('tab') === 'household' ? 'household' : 'personal',
    collapsed: store.getJSON('collapsed') || {},
  };

  const $ = id => document.getElementById(id);

  // ===== API =====
  async function apiFetch(month) {
    if (DEMO) return demoFetch(month);
    const body = { action: 'dashboard', key: state.key };
    if (month && month !== currentMonth()) body.month = month;

    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS) : 0;
    let res;
    try {
      res = await fetch(state.url, {
        method: 'POST',
        // 只用 text/plain，避免 CORS preflight；唔好加其他 header
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        signal: ctrl ? ctrl.signal : undefined,
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('連線逾時');
      throw new Error('網絡連線失敗');
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`伺服器回應 ${res.status}`);
    const text = await res.text();
    try { return JSON.parse(text); } catch { throw new Error('回應唔係 JSON，請檢查 URL'); }
  }

  // ===== Cache：只存本月，按 role 分開 =====
  let demoCache = null; // demo 模式用記憶體，唔掂 localStorage

  function readCache(role) {
    if (!role) return null;
    const c = DEMO ? demoCache : store.getJSON('cache.' + role);
    return c && c.ok === true && c.role === role && c.month === currentMonth() ? c : null;
  }
  function writeCache(resp) {
    if (!resp.isCurrentMonth || !ROLES.includes(resp.role)) return;
    if (DEMO) { demoCache = resp; return; }
    store.setJSON('cache.' + resp.role, resp);
  }
  function clearCaches() {
    demoCache = null;
    if (DEMO) return;
    ROLES.forEach(r => store.del('cache.' + r));
    store.del('role');
  }

  function showCacheIfAny() {
    const role = state.role || (DEMO ? demoRole() : store.get('role'));
    const c = readCache(role);
    if (c) {
      state.data = c;
      state.role = c.role;
      state.fromCache = true;
    }
  }

  // ===== 載入 =====
  async function load(month = state.month) {
    const id = ++state.reqId;
    state.month = month;
    state.loading = true;
    state.error = null;
    render();

    let resp;
    try {
      resp = await apiFetch(month);
    } catch (e) {
      if (id !== state.reqId) return;
      state.loading = false;
      state.error = (e && e.message) || '連線失敗';
      render();
      return;
    }
    if (id !== state.reqId) return; // 已經有較新嘅 request

    state.loading = false;
    if (!resp || resp.ok !== true) {
      signOut((resp && resp.message) || '❌ Key錯誤');
      return;
    }
    applyResponse(resp);
    render();
  }

  function applyResponse(resp) {
    state.data = resp;
    state.role = resp.role;
    state.fromCache = false;
    state.error = null;
    state.lastFetchAt = Date.now();
    if (resp.month) state.month = resp.month;
    if (!DEMO) store.set('role', resp.role);
    writeCache(resp);
  }

  function refresh() {
    if (state.loading) return;
    load(state.month);
  }

  function goMonth(delta) {
    const target = shiftMonth(state.month, delta);
    if (target > currentMonth()) return; // 唔可以揀未來月份
    state.data = null;
    state.fromCache = false;
    if (target === currentMonth()) showCacheIfAny();
    window.scrollTo(0, 0);
    load(target);
  }

  // ===== 登入 / 登出 =====
  function signOut(message) {
    state.reqId++; // 作廢緊等緊嘅 request
    state.key = '';
    state.data = null;
    state.role = null;
    state.fromCache = false;
    state.loading = false;
    state.error = null;
    if (!DEMO) store.del('key');
    clearCaches();
    closeSheet();
    showSetup(message || '');
  }

  function validUrl(u) { return /^https:\/\/\S+$/i.test(u); }

  async function onSetupSubmit(e) {
    e.preventDefault();
    if (DEMO) { location.href = '?demo'; return; }
    const url = $('setupUrl').value.trim();
    const key = $('setupKey').value.trim();
    const msg = $('setupMsg');
    if (!validUrl(url)) { msg.textContent = '請輸入正確嘅 Web App URL（https:// 開頭）'; return; }
    if (!key) { msg.textContent = '請輸入 key'; return; }

    msg.textContent = '';
    const btn = $('setupBtn');
    btn.disabled = true;
    btn.textContent = '連線中…';
    state.url = url;
    state.key = key;
    store.set('url', url);
    const id = ++state.reqId;
    try {
      const resp = await apiFetch(null);
      if (id !== state.reqId) return;
      if (!resp || resp.ok !== true) {
        state.key = '';
        $('setupKey').value = '';
        msg.textContent = (resp && resp.message) || '❌ Key錯誤';
        return;
      }
      store.set('key', key);
      clearCaches();
      state.month = currentMonth();
      applyResponse(resp);
      $('setupKey').value = '';
      showMain();
      render();
    } catch (err) {
      msg.textContent = `${err.message}，請檢查 URL 同網絡。`;
    } finally {
      btn.disabled = false;
      btn.textContent = '登入';
    }
  }

  function onSettingsSubmit(e) {
    e.preventDefault();
    if (DEMO) { closeSheet(); return; }
    const url = $('setUrl').value.trim();
    const newKey = $('setKey').value.trim();
    const msg = $('setMsg');
    if (!validUrl(url)) { msg.textContent = '請輸入正確嘅 Web App URL（https:// 開頭）'; return; }
    msg.textContent = '';
    const changed = url !== state.url || (newKey && newKey !== state.key);
    if (changed) {
      clearCaches();
      state.url = url;
      store.set('url', url);
      if (newKey) { state.key = newKey; store.set('key', newKey); }
      state.data = null;
      state.role = null;
      state.fromCache = false;
      state.month = currentMonth();
    }
    $('setKey').value = '';
    closeSheet();
    load(state.month);
  }

  // ===== 畫面切換 =====
  function showSetup(message) {
    $('app').hidden = true;
    $('setup').hidden = false;
    $('setupUrl').value = DEMO ? '' : (store.get('url') || state.url || '');
    $('setupKey').value = '';
    $('setupMsg').textContent = message || '';
    if (DEMO) $('setupMsg').textContent = (message ? message + '　' : '') + '（demo：呢個係 key 錯誤畫面，撳登入返去 demo）';
  }
  function showMain() {
    $('setup').hidden = true;
    $('app').hidden = false;
  }

  function openSheet() {
    $('sheetDemo').hidden = !DEMO;
    $('settingsForm').hidden = !!DEMO;
    $('setUrl').value = state.url;
    $('setKey').value = '';
    $('setMsg').textContent = '';
    $('roleLabel').textContent = state.role || '—';
    $('sheet').hidden = false;
  }
  function closeSheet() { $('sheet').hidden = true; }

  // ===== Render =====
  function render() {
    renderHeader();
    renderContent();
  }

  function stampText(d) {
    const st = parseStamp(d.generatedAt);
    if (!st) return esc(d.generatedAt || '');
    return st.date === todayStr() ? st.hm : `${st.dm} ${st.hm}`;
  }

  function statusHTML() {
    const d = state.data;
    const retry = '<button type="button" class="retry" data-retry>再試</button>';
    if (!d) return state.loading ? '載入中…' : '';
    if (state.fromCache) {
      const st = parseStamp(d.generatedAt);
      const base = `上次數據・${st ? `${st.dm} ${st.hm}` : esc(d.generatedAt || '')}`;
      if (state.error) return `${base}・<span class="warn">未能更新</span>${retry}`;
      return `${base}・更新中…`;
    }
    let s = `更新於 ${stampText(d)}`;
    if (state.loading) s += '・更新中…';
    else if (state.error) s += `・<span class="warn">未能更新</span>${retry}`;
    return s;
  }

  function renderHeader() {
    $('monthLabel').textContent = state.month;
    $('nextMonth').disabled = state.month >= currentMonth();
    $('status').innerHTML = statusHTML();
    $('btnRefresh').classList.toggle('spin', state.loading);

    const showTabs = state.role === 'amy';
    $('tabs').hidden = !showTabs;
    if (showTabs) {
      document.querySelectorAll('#tabs [data-tab]').forEach(b => {
        b.setAttribute('aria-selected', String(b.dataset.tab === state.tab));
      });
    }
  }

  function renderContent() {
    const el = $('content');
    const d = state.data;
    el.classList.remove('dim');

    if (!d) {
      if (state.loading) {
        el.innerHTML = '<div class="skel tall"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div>';
      } else if (state.error) {
        el.innerHTML = errorCard('未能載入', state.error, true);
      } else {
        el.innerHTML = '';
      }
      return;
    }

    let html = '';
    if (d.isCurrentMonth === false) {
      html += `<div class="notice">📅 睇緊 ${esc(d.month)}：戶口餘額係而家嘅數，budget 係該月。</div>`;
    }
    if (state.role === 'amy' && state.tab === 'personal') {
      html += renderPersonal(d.personal);
    } else {
      html += renderHousehold(d.household);
    }
    el.innerHTML = html;
  }

  function errorCard(title, message, withRetry) {
    return `<div class="card err"><b>${esc(title)}</b>${message ? `<p>${esc(message)}</p>` : ''}${
      withRetry ? '<button type="button" class="btn primary" data-retry>再試</button>' : ''}</div>`;
  }

  function section(title, sub, body) {
    return `<div class="sec"><h2>${esc(title)}</h2>${sub ? `<small>${sub}</small>` : ''}</div>${body}`;
  }

  // ----- Budget 共用 -----
  const pctOf = b => (num(b.budget) > 0 ? num(b.spent) / num(b.budget) * 100 : 0);
  const levelOf = pct => (pct > 100 ? 'over' : pct >= 80 ? 'warn' : 'ok');

  function sortBudgets(list) {
    return list.slice().sort((a, b) => {
      const oa = num(a.spent) > num(a.budget) ? 1 : 0;
      const ob = num(b.spent) > num(b.budget) ? 1 : 0;
      return (ob - oa) || (pctOf(b) - pctOf(a));
    });
  }

  function ring(pct) {
    const r = 24, c = 2 * Math.PI * r;
    const f = Math.max(0, Math.min(pct, 100)) / 100;
    const fill = f > 0
      ? `<circle class="fill" cx="30" cy="30" r="${r}" stroke-dasharray="${(f * c).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 30 30)"/>`
      : '';
    return `<div class="ring"><svg viewBox="0 0 60 60" aria-hidden="true"><circle class="track" cx="30" cy="30" r="${r}"/>${fill}</svg><span>${Math.round(pct)}%</span></div>`;
  }

  function budgetCard(b) {
    const budget = num(b.budget), spent = num(b.spent);
    const pct = pctOf(b);
    const left = budget - spent;
    const tag = left >= 0
      ? `<span class="tag">剩 ${money(left)}</span>`
      : `<span class="tag">超支 ${money(-left)}</span>`;
    return `<div class="card bcard lv-${levelOf(pct)}">${ring(pct)}
      <div class="binfo">
        <div class="btitle"><span class="bname">${esc(b.emoji || '')} ${esc(b.cat)}</span>${tag}</div>
        <div class="bnums"><div><span>Budget</span><b>${money(budget)}</b></div><div><span>已用</span><b>${money(spent)}</b></div></div>
      </div></div>`;
  }

  function budgetGrid(list) {
    return `<div class="bgrid">${sortBudgets(list).map(budgetCard).join('')}</div>`;
  }

  function simpleSpentList(list, withPeriod) {
    const rows = list.slice().sort((a, b) => num(b.spent) - num(a.spent)).map(b => `
      <div class="row"><div class="name">${esc(b.emoji || '')} ${esc(b.cat)}${
        withPeriod ? `<small>${esc(periodLabel(b.period))}</small>` : ''}</div>${amt(b.spent)}</div>`).join('');
    return `<div class="card list">${rows}</div>`;
  }

  const PERIOD_LABEL = { Monthly: '每月', Yearly: '每年', None: '不設 budget' };
  const periodLabel = p => PERIOD_LABEL[p] || p || '不設 budget';

  // ----- 個人 -----
  function renderPersonal(p) {
    if (!p) return errorCard('冇個人數據', '回應入面搵唔到 personal。', true);
    const s = p.summary || {};
    const b = p.budgets || {};
    let html = summaryCard(s);
    html += section('戶口', '', accountGroups(p.accounts || []));
    if ((b.monthly || []).length) html += section('月度 budget', '', budgetGrid(b.monthly));
    if ((b.yearly || []).length) html += section('年度 budget', '今年累計', budgetGrid(b.yearly));
    if ((b.none || []).length) html += section('不設 budget', '', simpleSpentList(b.none, false));
    return html;
  }

  function summaryCard(s) {
    const budget = num(s.monthBudget), spent = num(s.monthBudgetSpent);
    const pct = budget > 0 ? spent / budget * 100 : 0;
    const debt = Math.abs(num(s.debt));
    return `<section class="card hero">
      <div class="hero-label">淨資產</div>
      <div class="hero-value${num(s.net) < -0.004 ? ' neg' : ''}">${money(s.net)}</div>
      <div class="pair">
        <div><span>資產</span><b>${money(s.assets)}</b></div>
        <div><span>信用卡欠款</span><b class="${debt > 0.004 ? 'neg' : ''}">${money(debt)}</b></div>
      </div>
      <div class="divider"></div>
      <div class="lv-${levelOf(pct)}">
        <div class="bud-head"><span class="t">本月 budget 已用</span><span class="p">${Math.round(pct)}%</span></div>
        <div class="bud-nums">${money(spent)} <span class="of">/ ${money(budget)}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.min(pct, 100).toFixed(1)}%"></div></div>
      </div>
      <div class="pair">
        <div><span>本月總支出</span><b>${money(s.monthExpenseAll)}</b></div>
        <div><span>本月收入</span><b>${money(s.monthIncome)}</b></div>
      </div>
    </section>`;
  }

  const TYPE_ORDER = ['Cash', 'Bank', 'E-wallet', 'Saving Pot', 'Credit Card'];
  const TYPE_LABEL = {
    'Cash': '現金', 'Bank': '銀行', 'E-wallet': '電子錢包', 'Saving Pot': 'Saving Pot',
    'Credit Card': '信用卡', 'other': '其他',
  };
  const CHEVRON = '<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';

  function accountGroups(accounts) {
    if (!accounts.length) return '<div class="card empty">冇戶口</div>';
    const groups = {};
    accounts.forEach(a => {
      const t = TYPE_ORDER.includes(a.type) ? a.type : 'other';
      (groups[t] = groups[t] || []).push(a);
    });
    return [...TYPE_ORDER, 'other'].filter(t => groups[t]).map(t => {
      const list = groups[t];
      const total = list.reduce((sum, a) => sum + num(a.balance), 0);
      const key = 'p:' + t;
      const collapsed = !!state.collapsed[key];
      const rows = list.map(a => `
        <div class="row"><div class="name">${esc(a.name)}${
          t === 'other' && a.type ? `<small>${esc(a.type)}</small>` : ''}</div>${amt(a.balance)}</div>`).join('');
      return `<div class="card list grp${collapsed ? ' collapsed' : ''}" data-grp="${esc(key)}">
        <button type="button" class="grp-head" aria-expanded="${!collapsed}">
          ${CHEVRON}<span class="g-name">${esc(TYPE_LABEL[t])}</span><span class="g-count">${list.length}</span>
          <span class="g-total${total < -0.004 ? ' neg' : ''}">${money(total)}</span>
        </button>
        <div class="grp-body">${rows}</div>
      </div>`;
    }).join('');
  }

  // ----- 屋企 -----
  function renderHousehold(h) {
    if (!h) return errorCard('冇屋企數據', '回應入面搵唔到 household。', true);
    if (h.error) return errorCard('屋企數據載入失敗', String(h.error), true);

    let html = '';
    const accounts = h.accounts || [];
    html += section('戶口', '', accounts.length
      ? `<div class="card list">${accounts.map(a => `
          <div class="row"><div class="name">${esc(a.name)}</div>${amt(a.balance)}</div>`).join('')}</div>`
      : '<div class="card empty">冇戶口</div>');

    const budgets = h.budgets || [];
    const monthly = budgets.filter(b => b.period === 'Monthly');
    const others = budgets.filter(b => b.period !== 'Monthly');
    const s = h.summary || {};
    if (budgets.length) {
      html += section('本月 budget', '', '');
      html += `<p class="sec-sub">已用 ${money(s.monthBudgetSpent)} / ${money(s.monthBudget)}・本月總支出 ${money(s.monthExpenseAll)}</p>`;
      if (monthly.length) html += budgetGrid(monthly);
      if (others.length) {
        html += section('其他支出', '唔設每月 budget', simpleSpentList(others, true));
      }
    }

    const people = h.people || {};
    const names = Object.keys(people);
    if (names.length) {
      html += section('本月供款同代付', '', `<div class="card list">${names.map((n, i) => {
        const p = people[n] || {};
        return `<div class="person"><div class="avatar${i % 2 ? ' b' : ''}">${esc(n.slice(0, 1))}</div>
          <div class="p-name">${esc(n)}</div>
          <div class="p-nums"><div><span>供款</span><b>${money(p.contribution)}</b></div><div><span>代付</span><b>${money(p.advance)}</b></div></div>
        </div>`;
      }).join('')}</div>`);
    }
    return html;
  }

  // ===== 向下拉重新整理 =====
  function setupPullToRefresh() {
    const ptr = $('ptr');
    const THRESHOLD = 64;
    let startY = null, dist = 0;

    const canStart = () => !$('app').hidden && $('sheet').hidden && window.scrollY <= 0;
    const setH = h => {
      ptr.style.height = h + 'px';
      ptr.classList.toggle('ready', h >= THRESHOLD);
      ptr.querySelector('svg').style.transform = `rotate(${h * 4}deg)`;
    };

    window.addEventListener('touchstart', e => {
      startY = canStart() && e.touches.length === 1 ? e.touches[0].clientY : null;
      dist = 0;
    }, { passive: true });

    window.addEventListener('touchmove', e => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || window.scrollY > 0) { dist = 0; setH(0); return; }
      dist = Math.min(dy * 0.5, 96);
      ptr.classList.add('dragging');
      setH(dist);
    }, { passive: true });

    const end = () => {
      if (startY == null) return;
      startY = null;
      ptr.classList.remove('dragging');
      const go = dist >= THRESHOLD;
      dist = 0;
      setH(0);
      if (go) refresh();
    };
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
  }

  // ===== 事件 =====
  function bindEvents() {
    $('setupForm').addEventListener('submit', onSetupSubmit);
    $('settingsForm').addEventListener('submit', onSettingsSubmit);
    $('btnRefresh').addEventListener('click', refresh);
    $('btnSettings').addEventListener('click', openSheet);
    $('prevMonth').addEventListener('click', () => goMonth(-1));
    $('nextMonth').addEventListener('click', () => goMonth(1));
    $('btnLogout').addEventListener('click', () => {
      if (DEMO) { location.href = './'; return; }
      if (confirm('確定登出？會清走 key 同所有 cache（URL 會保留）。')) signOut('');
    });

    document.addEventListener('click', e => {
      const t = e.target;
      if (t.closest('[data-close]')) { closeSheet(); return; }
      if (t.closest('[data-retry]')) { refresh(); return; }

      const tab = t.closest('#tabs [data-tab]');
      if (tab) {
        state.tab = tab.dataset.tab;
        store.set('tab', state.tab);
        window.scrollTo(0, 0);
        render();
        return;
      }

      const head = t.closest('.grp-head');
      if (head) {
        const grp = head.closest('[data-grp]');
        const key = grp.dataset.grp;
        const collapsed = !grp.classList.contains('collapsed');
        grp.classList.toggle('collapsed', collapsed);
        head.setAttribute('aria-expanded', String(!collapsed));
        if (collapsed) state.collapsed[key] = true; else delete state.collapsed[key];
        store.setJSON('collapsed', state.collapsed);
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$('sheet').hidden) closeSheet();
    });

    // 由背景返嚟：轉咗月就跳去新月份，否則耐咗就自動更新
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || $('app').hidden || state.loading) return;
      if (state.data && state.data.isCurrentMonth && state.month < currentMonth()) { goMonth(1); return; }
      if (Date.now() - state.lastFetchAt > AUTO_REFRESH_AFTER_MS) refresh();
    });

    setupPullToRefresh();
  }

  // ===== Demo 數據（全部虛構）=====
  function demoRole() { return DEMO === 'lai' ? 'lai' : 'amy'; }

  function stampFor(date) {
    const p = hkParts(date);
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
  }

  function demoResponse(month, { stale = false } = {}) {
    const cur = currentMonth();
    const ago = monthDiff(month, cur);
    // 舊月份嘅支出稍為變一變，等每個月睇落唔同
    const k = stale ? 0.85 : ago === 0 ? 1 : [1.08, 0.92, 1.15, 0.8][ago % 4];
    const sp = v => Math.round(v * k * 100) / 100;

    const accounts = [
      { name: '銀包', type: 'Cash', balance: 520.4 },
      { name: 'HSBC', type: 'Bank', balance: 13580.68 },
      { name: '中銀', type: 'Bank', balance: 24310 },
      { name: '八達通', type: 'E-wallet', balance: 186.5 },
      { name: 'PayMe', type: 'E-wallet', balance: 1203 },
      { name: 'AlipayHK', type: 'E-wallet', balance: 0 },
      { name: '旅行基金', type: 'Saving Pot', balance: 8000 },
      { name: '緊急備用', type: 'Saving Pot', balance: 20000 },
      { name: 'HSBC Red', type: 'Credit Card', balance: -3420.55 },
      { name: 'Citi Cash Back', type: 'Credit Card', balance: -820 },
      { name: '股票戶口', type: 'Investment', balance: 15230.2 },
    ];
    const monthly = [
      { cat: 'Meal', emoji: '🍜', budget: 2400, spent: sp(1980.5) },
      { cat: 'Transport', emoji: '🚇', budget: 800, spent: sp(912.3) },
      { cat: 'Shopping', emoji: '🛍️', budget: 1500, spent: sp(420) },
      { cat: 'Coffee', emoji: '☕', budget: 300, spent: sp(276) },
      { cat: 'Entertainment', emoji: '🎬', budget: 600, spent: sp(150) },
      { cat: 'Beauty', emoji: '💄', budget: 500, spent: sp(655.8) },
      { cat: 'Groceries', emoji: '🥬', budget: 1000, spent: 0 },
    ];
    const yearly = [
      { cat: 'Travelling', emoji: '✈️', budget: 12000, spent: 5000 },
      { cat: 'Insurance', emoji: '🛡️', budget: 8000, spent: 7200 },
      { cat: 'Health', emoji: '🏥', budget: 3000, spent: 3480 },
    ];
    const none = [
      { cat: 'Gift', emoji: '🎁', spent: sp(300) },
      { cat: 'Donation', emoji: '🙏', spent: sp(100) },
      { cat: 'Others', emoji: '📦', spent: sp(58.5) },
    ];
    const assets = accounts.filter(a => a.balance > 0).reduce((s, a) => s + a.balance, 0);
    const debt = -accounts.filter(a => a.balance < 0).reduce((s, a) => s + a.balance, 0);
    const mBudget = monthly.reduce((s, b) => s + b.budget, 0);
    const mSpent = monthly.reduce((s, b) => s + b.spent, 0);
    const noneSpent = none.reduce((s, b) => s + b.spent, 0);

    const household = ago === 1 && !stale
      ? { error: '讀取「Household」工作表失敗（demo 示範錯誤）' }
      : {
        accounts: [
          { name: 'Family', balance: 8200 },
          { name: 'Travel', balance: 15600 },
          { name: '水電煤', balance: 1350.4 },
          { name: '雜費', balance: -230 },
        ],
        budgets: [
          { cat: 'Meal', emoji: '🍜', period: 'Monthly', budget: 6500, spent: sp(3200) },
          { cat: 'Groceries', emoji: '🥬', period: 'Monthly', budget: 3000, spent: sp(2750) },
          { cat: 'Utilities', emoji: '💡', period: 'Monthly', budget: 1500, spent: sp(1720) },
          { cat: 'Daily', emoji: '🧻', period: 'Monthly', budget: 800, spent: sp(300) },
          { cat: 'Travel', emoji: '✈️', period: 'Yearly', budget: 0, spent: 4200 },
          { cat: 'Furniture', emoji: '🛋️', period: 'None', budget: 0, spent: sp(1580) },
        ],
        summary: { monthBudget: 11800, monthBudgetSpent: sp(7970), monthExpenseAll: sp(9550) },
        people: { Amy: { contribution: 1000, advance: 450 }, Lai: { contribution: 1000, advance: 120 } },
      };

    const resp = {
      ok: true,
      role: demoRole(),
      month,
      isCurrentMonth: ago === 0,
      generatedAt: stale ? stampFor(new Date(Date.now() - 26 * 3600 * 1000)) : stampFor(new Date()),
      household,
    };
    if (resp.role === 'amy') {
      resp.personal = {
        summary: {
          assets, debt, net: assets - debt,
          monthIncome: 32000,
          monthBudget: mBudget, monthBudgetSpent: mSpent,
          monthExpenseAll: mSpent + noneSpent + 850,
        },
        accounts,
        budgets: { monthly, yearly, none },
      };
    }
    return resp;
  }

  function demoFetch(month) {
    const m = month || currentMonth();
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (DEMO === 'error') resolve({ ok: false, message: '❌ Key錯誤' });
        else if (DEMO === 'offline' && m === currentMonth()) reject(new Error('網絡連線失敗'));
        else resolve(demoResponse(m));
      }, 1200);
    });
  }

  // ===== 開始 =====
  function boot() {
    bindEvents();
    if (DEMO) {
      document.title = 'Amy 帳簿（demo）';
      state.url = 'demo';
      state.key = 'demo';
      if (DEMO !== 'error') demoCache = demoResponse(currentMonth(), { stale: true });
      showMain();
      showCacheIfAny();
      load(state.month);
      return;
    }
    state.url = store.get('url') || '';
    state.key = store.get('key') || '';
    if (!state.url || !state.key) { showSetup(''); return; }
    showMain();
    showCacheIfAny(); // 即刻顯示 cache，同時背景 fetch
    load(state.month);
  }

  boot();
})();
