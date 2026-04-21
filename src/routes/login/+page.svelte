<script>
  let step = 'idle';   // idle | sent | error
  let otp = '';
  let msg = '';
  let busy = false;

  async function sendCode() {
    busy = true;
    msg = '';
    try {
      const r = await fetch('/api/admin-login');
      if (!r.ok) throw new Error();
      step = 'sent';
      msg = 'Code sent to Telegram.';
    } catch {
      msg = 'Failed to send.';
    } finally {
      busy = false;
    }
  }

  async function verify() {
    if (!/^\d{6}$/.test(otp)) { msg = 'Enter the 6-digit code.'; return; }
    busy = true;
    msg = '';
    try {
      const r = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp })
      });
      const d = await r.json();
      if (d.ok) {
        location.href = '/admin';
      } else {
        msg = 'Invalid or expired code.';
      }
    } catch {
      msg = 'Network error.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>—</title></svelte:head>

<main>
  <div class="card">
    <div class="logo">⛔</div>
    <h1>Restricted</h1>

    {#if step === 'idle'}
      <button on:click={sendCode} disabled={busy}>
        {busy ? 'Sending…' : 'Request access'}
      </button>
    {:else}
      <input
        type="text"
        inputmode="numeric"
        maxlength="6"
        placeholder="••••••"
        bind:value={otp}
        autofocus
      />
      <button on:click={verify} disabled={busy || otp.length !== 6}>
        {busy ? 'Verifying…' : 'Verify'}
      </button>
      <button class="link" on:click={sendCode} disabled={busy}>Resend</button>
    {/if}

    {#if msg}<div class="msg">{msg}</div>{/if}
  </div>
</main>

<style>
  :global(body) { background: #0a0a0a; color: #eee; font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin:0; }
  main { min-height: 100vh; display:grid; place-items:center; padding:20px; }
  .card { background:#161616; border:1px solid #262626; border-radius:14px; padding:32px 28px; width:320px; text-align:center; box-shadow:0 8px 32px rgba(0,0,0,.6); }
  .logo { font-size:42px; margin-bottom:8px; }
  h1 { font-size:18px; font-weight:600; margin:0 0 24px; color:#aaa; letter-spacing:.5px; }
  input { width:100%; padding:14px; background:#0a0a0a; border:1px solid #333; border-radius:8px; color:#fff; font-size:22px; text-align:center; letter-spacing:8px; box-sizing:border-box; margin-bottom:12px; outline:none; }
  input:focus { border-color:#555; }
  button { width:100%; padding:12px; background:#fff; color:#000; border:0; border-radius:8px; font-weight:600; cursor:pointer; font-size:14px; }
  button:disabled { opacity:.5; cursor:not-allowed; }
  button.link { background:transparent; color:#888; margin-top:8px; padding:8px; }
  .msg { margin-top:14px; font-size:13px; color:#999; }
</style>
