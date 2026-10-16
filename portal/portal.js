// Parceros customer portal
import {
  initSupabase, sb, html, raw, money, fdate, ftime, vehicleName, STATUSES, statusLabel, statusIndex,
  SLOTS, slotLabel, totals, payMethodLabel, invoiceDue, paidSum, requestPasswordReset, toast, errMsg, formData, nn, busy, wireVin, uploadPhotos, photoUrls, photoGrid, router,
} from "/shared/core.js";

const app = document.getElementById("app");
let me = null; // { user, profile, customer }
const LOGO = raw(`<svg viewBox="0 0 200 52" aria-hidden="true"><path d="M66 24 C92 6 140 3 170 21 L175 25 C146 11 100 11 66 24Z" fill="#fff"/><path d="M4 40 C38 26 110 23 186 30 L196 33 L190 34 C140 32 66 32 8 42Z" fill="#fff"/><path d="M10 45 C64 34 140 34 194 38" stroke="#3fae86" stroke-width="2.6" fill="none"/></svg>`);
const $ = (s) => app.querySelector(s);
const $$ = (s) => Array.from(app.querySelectorAll(s));
const must = ({ data, error }) => { if (error) throw error; return data; };

start();
async function start() {
  try { await initSupabase(); }
  catch (e) { return setPage(html`<main class="p-main"><div class="p-card"><h2>Portal not ready</h2><p>${errMsg(e)}</p></div></main>`, false); }
  const hashErr = new URLSearchParams(location.hash.replace(/^#/, "")).get("error_description");
  await loadMe();
  if (hashErr) { history.replaceState(null, "", location.pathname); toast(hashErr.replace(/\+/g, " "), "err"); }
  if (new URLSearchParams(location.search).get("welcome") && me) history.replaceState(null, "", location.pathname + "#/set-password");
  const paidSession = new URLSearchParams(location.search).get("paid");
  if (paidSession && me) {
    history.replaceState(null, "", location.pathname + location.hash);
    await confirmPayment(paidSession);
  }
  run();
}
async function authHeader() {
  const { data: { session } } = await sb.auth.getSession();
  return { "Content-Type": "application/json", Authorization: "Bearer " + (session?.access_token || "") };
}
async function confirmPayment(sessionId) {
  try {
    const r = await fetch("/api/pay-confirm", { method: "POST", headers: await authHeader(), body: JSON.stringify({ sessionId }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.paid) toast(j.paidInFull ? "Payment received. You're paid in full. Thank you!" : "Payment received. Thank you!");
    else toast("We are confirming your payment. It will show as paid shortly.");
  } catch { toast("We are confirming your payment. It will show as paid shortly."); }
}
async function loadMe() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { me = null; return; }
  const { data: profile } = await sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
  let customer = null;
  if (profile?.customer_id) customer = (await sb.from("customers").select("*").eq("id", profile.customer_id).maybeSingle()).data;
  me = { user: session.user, profile, customer };
}

const run = router([
  [/^\/set-password$/, () => guard(setPasswordView, true)],
  [/^\/$/, () => guard(homeView)],
  [/^\/ro\/([0-9a-f-]{36})$/, (m) => guard(() => roView(m[1]))],
  [/^\/book$/, () => guard(bookView)],
  [/^\/vehicles$/, () => guard(vehiclesView)],
], () => guard(homeView));

async function guard(fn, allowAny = false) {
  if (!me) return loginView();
  if (!allowAny && (!me.customer || me.profile?.disabled || me.profile?.role !== "customer")) {
    const shop = ["owner", "staff"].includes(me.profile?.role);
    return setPage(html`<main class="p-main"><div class="p-card" style="max-width:560px;margin:40px auto"><h2>${shop ? "This is a shop account" : "Account not linked yet"}</h2>
      <p>${shop ? html`Use <a href="/manage/">shop management</a> instead.` : "Your login is not linked to a customer file yet. Please call us at 301-595-0888."}</p>
      <button class="p-btn" data-signout>Sign out</button></div></main>`, false);
  }
  setPage(html`<div class="p-loading">Loading</div>`);
  try { await fn(); } catch (e) { console.error(e); setPage(html`<main class="p-main"><div class="p-card"><h2>Could not load</h2><p>${errMsg(e)}</p><a class="p-btn" href="#/">Back</a></div></main>`); }
}

function setPage(content, withNav = true) {
  const h = location.hash || "#/";
  const tab = (href, label) => html`<a href="${href}" class="${(href === "#/" ? h === "#/" || h === "#" || h.startsWith("#/ro/") : h.startsWith(href)) ? "is-on" : ""}">${label}</a>`;
  const top = withNav && me?.customer ? html`<header class="p-top">
      <a class="p-logo" href="#/">${LOGO}<span><b>Parceros</b><small>Customer portal</small></span></a>
      <nav class="p-nav" aria-label="Sections">${tab("#/", "My repairs")}${tab("#/book", "Book drop-off")}${tab("#/vehicles", "My vehicles")}</nav>
      <div class="p-who"><span>${me.customer.full_name}</span><button type="button" data-signout>Sign out</button></div>
    </header>` : "";
  app.innerHTML = String(html`${top}${content}`);
  app.querySelectorAll("[data-signout]").forEach((b) => b.addEventListener("click", async () => { await sb.auth.signOut(); me = null; location.hash = "#/"; run(); }));
}

// ---------------------------------------------------------------- auth
function loginView() {
  app.innerHTML = String(html`<div class="p-auth">
    <div class="p-auth__art"><div><p class="p-mono">Parceros Collision Center</p><h1>Where is <em>my car?</em></h1><p>Follow your repair, approve estimates and send us photos.</p></div></div>
    <div class="p-auth__box"><form class="p-card p-form" id="login">
      <h2>Customer sign in</h2>
      <label class="p-field"><span>Email</span><input name="email" type="email" required autocomplete="username"></label>
      <label class="p-field"><span>Password</span><input name="password" type="password" required autocomplete="current-password"></label>
      <button class="p-btn p-btn--go" type="submit">Sign in</button>
      <button class="p-linkbtn" type="button" id="forgot">Forgot password?</button>
      <p class="p-hint">No login yet? We send you a link when we open your repair. Need an estimate? <a href="/request/">Request one here</a> or call <a href="tel:+13015950888">301-595-0888</a>.</p>
    </form></div></div>`);
  $("#login").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formData(e.target);
    busy(e.submitter, async () => {
      const { error } = await sb.auth.signInWithPassword({ email: f.email, password: f.password });
      if (error) return toast("Email or password is not right.", "err");
      await loadMe(); location.hash = "#/"; run();
    });
  });
  $("#forgot").addEventListener("click", async () => {
    const email = $("[name=email]").value.trim();
    if (!email) return toast("Type your email first, then click Forgot password.", "err");
    try { toast(await requestPasswordReset(email)); } catch (err) { toast(errMsg(err), "err"); }
  });
}

function setPasswordView() {
  setPage(html`<main class="p-main"><form class="p-card p-form" id="pw" style="max-width:460px;margin:40px auto">
    <h2>Welcome! Set your password</h2>
    <p class="p-muted">Signed in as ${me.user.email}. Choose a password with at least 10 characters.</p>
    <label class="p-field"><span>New password</span><input name="p1" type="password" minlength="10" required autocomplete="new-password"></label>
    <label class="p-field"><span>Repeat password</span><input name="p2" type="password" minlength="10" required autocomplete="new-password"></label>
    <button class="p-btn p-btn--go" type="submit">Save password</button>
  </form></main>`, false);
  $("#pw").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (f.p1 !== f.p2) return toast("The two passwords do not match.", "err");
    busy(e.submitter, async () => {
      const { error } = await sb.auth.updateUser({ password: f.p1 });
      if (error) return toast(errMsg(error), "err");
      toast("Password saved. Welcome!");
      location.hash = "#/";
    });
  });
}

// ---------------------------------------------------------------- home
async function homeView() {
  const cid = me.customer.id;
  const [ros, vehicles, requests] = await Promise.all([
    sb.from("repair_orders").select("*").eq("customer_id", cid).order("created_at", { ascending: false }).then(must),
    sb.from("vehicles").select("*").eq("customer_id", cid).then(must),
    sb.from("requests").select("*").eq("customer_id", cid).in("status", ["new", "scheduled"]).order("created_at", { ascending: false }).then(must),
  ]);
  const vmap = Object.fromEntries(vehicles.map((v) => [v.id, v]));
  const active = ros.filter((r) => r.status !== "delivered");
  const past = ros.filter((r) => r.status === "delivered");
  const pct = (s) => Math.round(((statusIndex(s) + 1) / (STATUSES.length - 1)) * 100);
  setPage(html`<main class="p-main">
    <div class="p-head"><div><p class="p-crumb">My repairs</p><h1>Hi ${me.customer.full_name.split(" ")[0]}</h1></div><a class="p-btn p-btn--go" href="#/book">Book a drop-off</a></div>
    ${active.length ? active.map((r) => html`<a class="p-card" href="#/ro/${r.id}" style="display:block;text-decoration:none;color:inherit">
      <div class="p-spread"><h2 style="margin:0">${vehicleName(vmap[r.vehicle_id])}</h2><span class="p-mono">RO #${r.number}</span></div>
      <div class="p-progress" aria-hidden="true"><span style="width:${Math.min(100, pct(r.status))}%"></span></div>
      <p style="margin:0"><b>${statusLabel(r.status)}</b> · <span class="p-muted">${(STATUSES.find((s) => s[0] === r.status) || [])[2] || ""}</span></p>
      ${r.status === "approval" ? html`<p style="margin:8px 0 0"><span class="p-badge p-badge--amber">Action needed</span> Review your estimate</p>` : ""}
      ${r.promised_date ? html`<p class="p-hint" style="margin:8px 0 0">Expected: ${fdate(r.promised_date)}</p>` : ""}
    </a>`) : html`<div class="p-empty">No vehicles in the shop right now.</div>`}
    ${requests.length ? html`<div class="p-card"><h2>Upcoming drop-offs</h2>${requests.map((q) => html`<p><b>${[q.year, q.make, q.model].filter(Boolean).join(" ") || "Vehicle"}</b> · ${q.status === "scheduled" ? html`<span class="p-badge p-badge--teal">Confirmed</span> ${ftime(q.scheduled_for)}` : html`<span class="p-badge">Waiting for the shop to confirm</span> asked for ${q.preferred_date ? fdate(q.preferred_date) : "any day"}${q.preferred_slot ? ", " + slotLabel(q.preferred_slot) : ""}`}</p>`)}</div>` : ""}
    ${past.length ? html`<div class="p-card"><h2>Past repairs</h2><table class="p-table"><tbody>${past.map((r) => html`<tr data-href="#/ro/${r.id}"><td><b>#${r.number}</b></td><td>${vehicleName(vmap[r.vehicle_id])}</td><td>${fdate(r.updated_at)}</td></tr>`)}</tbody></table></div>` : ""}
  </main>`);
  $$("tr[data-href]").forEach((tr) => tr.addEventListener("click", () => (location.hash = tr.dataset.href)));
}

// ---------------------------------------------------------------- one repair
async function roView(id) {
  const ro = must(await sb.from("repair_orders").select("*").eq("id", id).maybeSingle());
  if (!ro) return setPage(html`<main class="p-main"><div class="p-card"><h2>Not found</h2><a href="#/">Back</a></div></main>`);
  const [veh, events, photos, estimates, payments] = await Promise.all([
    ro.vehicle_id ? sb.from("vehicles").select("*").eq("id", ro.vehicle_id).maybeSingle().then(must) : null,
    sb.from("ro_events").select("*").eq("ro_id", id).order("created_at", { ascending: false }).then(must),
    sb.from("photos").select("*").eq("ro_id", id).order("created_at").then(must),
    sb.from("estimates").select("*").eq("ro_id", id).order("created_at").then(must),
    sb.from("payments").select("*").eq("ro_id", id).order("created_at").then(must),
  ]);
  const items = estimates.length ? must(await sb.from("estimate_items").select("*").in("estimate_id", estimates.map((e) => e.id)).order("sort")) : [];
  const urls = await photoUrls(photos);
  const cur = statusIndex(ro.status);
  const shown = STATUSES.filter(([k]) => k !== "delivered" || ro.status === "delivered");
  setPage(html`<main class="p-main">
    <p class="p-crumb"><a href="#/">My repairs</a> /</p>
    <div class="p-head"><div><h1>${vehicleName(veh)}</h1><p class="p-muted" style="margin:6px 0 0">Repair order #${ro.number}${ro.claim_number ? " · Claim " + ro.claim_number : ""}</p></div></div>
    <div class="p-cols"><div>
      ${estimates.map((e) => estimateCard(e, items.filter((i) => i.estimate_id === e.id), payments.filter((p) => p.estimate_id === e.id)))}
      <div class="p-card"><h2>Updates from the shop</h2>
        ${events.length ? html`<ul class="p-timeline">${events.map((ev) => html`<li><time>${ftime(ev.created_at)}</time><br>${ev.status ? html`<span class="p-badge p-badge--teal">${statusLabel(ev.status)}</span>` : ""}${ev.note || ""}</li>`)}</ul>` : html`<p class="p-muted">No updates yet.</p>`}
      </div>
      <div class="p-card"><h2>Photos</h2>
        ${photoGrid(photos, urls)}
        <label class="p-drop" style="margin-top:12px"><input type="file" id="phup" accept="image/*" multiple>Send us photos of the damage</label>
      </div>
    </div><div>
      <div class="p-card"><h2>Repair progress</h2>
        <ol class="p-steps">${shown.map(([k, label, desc], i) => html`<li class="${i < cur ? "is-done" : i === cur ? "is-now" : ""}"><b>${label}</b>${i === cur ? html`<small>${desc}</small>` : ""}</li>`)}</ol>
        ${ro.promised_date ? html`<p class="p-hint">Expected ready: <b>${fdate(ro.promised_date)}</b></p>` : ""}
      </div>
      <div class="p-card"><h2>Questions?</h2><p>Call or text <a href="tel:+13015950888">301-595-0888</a><br>Mon to Fri, 8 AM to 5 PM</p></div>
    </div></div>
  </main>`);
  $("#phup").addEventListener("change", async (e) => {
    const n = await uploadPhotos(e.target.files, { customerId: me.customer.id, roId: id, visible: true, userId: me.user.id });
    if (n) { toast(`Thanks! ${n} photo${n > 1 ? "s" : ""} sent.`); run(); }
  });
  $$("[data-pay]").forEach((b) => b.addEventListener("click", () => busy(b, async () => {
    const r = await fetch("/api/pay", { method: "POST", headers: await authHeader(), body: JSON.stringify({ estimateId: b.dataset.pay }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) return toast(j.error || "Could not start the payment.", "err");
    location.href = j.url;
  })));
  $$("form[data-decide]").forEach((f) => f.addEventListener("submit", (e) => {
    e.preventDefault();
    const decision = e.submitter?.value;
    const signer = new FormData(f).get("signer")?.toString().trim();
    if (!signer) return toast("Type your full name to sign.", "err");
    if (decision === "approved" && !f.querySelector("[name=agree]").checked) return toast("Tick the box to authorize the repair.", "err");
    busy(e.submitter, async () => {
      const { error } = await sb.rpc("decide_estimate", { p_estimate: f.dataset.decide, p_decision: decision, p_signer: signer });
      if (error) return toast(errMsg(error), "err");
      toast(decision === "approved" ? "Thank you! We will start on your repair." : "Got it. We will call you to talk it over.");
      run();
    });
  }));
}

function estimateCard(e, its, pays = []) {
  const t = totals(its, e.tax_rate);
  const isInv = e.kind === "invoice";
  const due = invoiceDue(e, its);
  const paid = paidSum(pays); // skips cancelled ones
  const bal = Math.max(0, due - paid);
  return html`<div class="p-card" style="${e.status === "sent" ? "border:2px solid var(--teal)" : ""}">
    <div class="p-spread"><h2 style="margin:0">${isInv ? "Invoice" : "Estimate"}</h2>
      <span class="p-badge ${["approved", "paid"].includes(e.status) ? "p-badge--teal" : e.status === "declined" ? "p-badge--red" : "p-badge--amber"}">${e.status === "sent" ? "Needs your approval" : e.status === "unpaid" ? "Balance due" : e.status === "paid" ? "Paid" : e.status}</span></div>
    <table class="p-table" style="margin-top:12px"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th></tr></thead><tbody>
      ${its.map((i) => html`<tr><td>${i.description}</td><td class="num">${i.qty}</td><td class="num">${money(i.unit_cents)}</td><td class="num">${money(Math.round(i.qty * i.unit_cents))}</td></tr>`)}
    </tbody></table>
    <div class="p-total"><span>Subtotal</span><span class="num">${money(t.subtotal)}</span><span>Tax</span><span class="num">${money(t.tax)}</span><b>Total</b><b class="num">${money(t.total)}</b></div>
    ${e.notes ? html`<p class="p-hint" style="margin-top:12px">${e.notes}</p>` : ""}
    ${e.status === "sent" && !isInv ? html`<form class="p-form" data-decide="${e.id}" style="margin-top:16px;border-top:1px dashed var(--line);padding-top:16px">
      <label class="p-check"><input type="checkbox" name="agree"> I authorize Parceros Collision Center to perform the repairs above.</label>
      <label class="p-field"><span>Type your full name to sign</span><input name="signer" maxlength="120" autocomplete="name"></label>
      <div class="p-row"><button class="p-btn p-btn--go" type="submit" value="approved">Approve estimate</button><button class="p-btn p-btn--danger" type="submit" value="declined">Decline</button></div>
    </form>` : ""}
    ${e.signer_name ? html`<p class="p-hint">${e.status === "approved" ? "Approved" : "Declined"} by ${e.signer_name}, ${ftime(e.decided_at)}</p>` : ""}
    ${isInv && pays.length ? html`<h3 style="margin-top:18px">Your payments</h3>
      <table class="p-table p-paytable"><thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th class="num">Amount</th><th></th></tr></thead><tbody>
        ${pays.map((p) => html`<tr class="${p.voided_at ? "is-void" : ""}"><td class="p-mono">#${p.receipt_number}</td><td>${fdate(p.created_at)}</td><td>${payMethodLabel(p.method)}${p.voided_at ? html` <span class="p-badge p-badge--red">Cancelled</span>` : ""}</td><td class="num">${money(p.amount_cents)}</td>
          <td class="p-actions"><a class="p-linkbtn" href="/print/?receipt=${p.id}" target="_blank" rel="noopener">Receipt</a></td></tr>`)}
      </tbody></table>` : ""}
    ${isInv && e.status === "unpaid" ? html`<div class="p-due">
      <div><p class="p-mono" style="margin:0">${paid ? "Balance remaining" : "Amount due from you"}</p><b data-balance>${money(bal)}</b>
        ${paid ? html`<p class="p-hint" style="margin:0">${money(paid)} paid of ${money(due)}</p>` : ""}
        ${e.customer_due_cents != null && e.customer_due_cents !== t.total ? html`<p class="p-hint" style="margin:0">Your share (for example, your insurance deductible). Insurance covers the rest.</p>` : ""}</div>
      ${bal >= 50 ? html`<button class="p-btn p-btn--go" type="button" data-pay="${e.id}">Pay ${money(bal)} by card</button>` : ""}
    </div><p class="p-hint" style="margin-top:8px">Secure card payment by Stripe. You can also pay at the shop with cash, check or card.</p>` : ""}
    ${e.status === "paid" ? html`<p class="p-hint" style="margin-top:12px"><span class="p-badge p-badge--teal">Paid in full</span> ${ftime(e.paid_at)}. Thank you!</p>` : ""}
    <p style="margin:12px 0 0"><a class="p-btn p-btn--sm" href="/print/?id=${e.id}" target="_blank" rel="noopener">Print / save PDF</a></p>
  </div>`;
}

// ---------------------------------------------------------------- vehicles
function vehicleFields() {
  return html`<div class="p-vin"><label class="p-field"><span>VIN (on the driver-side dashboard or door frame)</span><input name="vin" maxlength="17" placeholder="17 characters" style="text-transform:uppercase"></label>
      <button type="button" class="p-btn" data-vin-lookup>Look up</button></div>
    <p class="p-hint" data-vin-result>We fill in the year, make and model for you.</p>
    <div class="p-grid3">
      <label class="p-field"><span>Year</span><input name="year" type="number" min="1950" max="2100"></label>
      <label class="p-field"><span>Make</span><input name="make" maxlength="60"></label>
      <label class="p-field"><span>Model</span><input name="model" maxlength="80"></label>
    </div>
    <div class="p-grid2">
      <label class="p-field"><span>Color</span><input name="color" maxlength="40"></label>
      <label class="p-field"><span>Plate</span><input name="plate" maxlength="20"></label>
    </div>`;
}
const vehicleRow = (f) => ({ customer_id: me.customer.id, vin: nn((f.vin || "").toUpperCase()), year: f.year ? Number(f.year) : null, make: nn(f.make), model: nn(f.model), color: nn(f.color), plate: nn((f.plate || "").toUpperCase()) });

async function vehiclesView() {
  const vehicles = must(await sb.from("vehicles").select("*").eq("customer_id", me.customer.id).order("created_at"));
  setPage(html`<main class="p-main">
    <div class="p-head"><div><p class="p-crumb">My vehicles</p><h1>My vehicles</h1></div></div>
    <div class="p-cols"><div class="p-card">${vehicles.length ? html`<table class="p-table"><thead><tr><th>Vehicle</th><th>VIN</th><th>Plate</th></tr></thead><tbody>${vehicles.map((v) => html`<tr><td><b>${vehicleName(v)}</b> ${v.color ? html`<span class="p-muted">· ${v.color}</span>` : ""}</td><td class="p-mono">${v.vin || ""}</td><td>${v.plate || ""}</td></tr>`)}</tbody></table>` : html`<p class="p-muted">No vehicles yet.</p>`}</div>
    <form class="p-card p-form" id="vform"><h2>Add a vehicle</h2>${vehicleFields()}<button class="p-btn p-btn--go" type="submit">Save vehicle</button></form></div>
  </main>`);
  wireVin($("#vform"));
  $("#vform").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (!f.vin && !f.make) return toast("Enter the VIN or at least the make.", "err");
    busy(e.submitter, async () => {
      const { error } = await sb.from("vehicles").insert(vehicleRow(f));
      if (error) return toast(errMsg(error), "err");
      toast("Vehicle saved."); run();
    });
  });
}

// ---------------------------------------------------------------- book a drop-off
function nextWeekdays(n) {
  const out = []; const d = new Date(); d.setHours(12, 0, 0, 0);
  while (out.length < n) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) out.push(d.toISOString().slice(0, 10)); }
  return out;
}
async function bookView() {
  const vehicles = must(await sb.from("vehicles").select("*").eq("customer_id", me.customer.id).order("created_at"));
  const days = nextWeekdays(15);
  setPage(html`<main class="p-main">
    <div class="p-head"><div><p class="p-crumb">Book drop-off</p><h1>Book a drop-off</h1></div></div>
    <form class="p-card p-form" id="bform" style="max-width:820px">
      <label class="p-field"><span>Which vehicle?</span><select name="vehicle_id" id="veh">
        ${vehicles.map((v) => html`<option value="${v.id}">${vehicleName(v)}</option>`)}
        <option value="new" ${vehicles.length ? "" : raw("selected")}>+ A different vehicle</option></select></label>
      <div id="newveh" ${vehicles.length ? raw("hidden") : ""}>${vehicleFields()}</div>
      <div class="p-grid2">
        <label class="p-field"><span>Day</span><select name="preferred_date" required>${days.map((d) => html`<option value="${d}">${fdate(d)} (${new Date(d + "T12:00").toLocaleDateString("en-US", { weekday: "long" })})</option>`)}</select></label>
        <label class="p-field"><span>Time</span><select name="preferred_slot" required>${SLOTS.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
      </div>
      <label class="p-field"><span>What happened? Where is the damage?</span><textarea name="description" maxlength="4000" required></textarea></label>
      <label class="p-drop"><input type="file" name="photos" id="photos" accept="image/*" multiple><span id="phlabel">Add photos of the damage (optional, up to 10)</span></label>
      <p class="p-hint">We are open Monday to Friday, 8 AM to 5 PM. We will confirm your time by phone or text.</p>
      <button class="p-btn p-btn--go" type="submit">Request this time</button>
    </form>
  </main>`);
  wireVin($("#newveh"));
  $("#veh").addEventListener("change", (e) => ($("#newveh").hidden = e.target.value !== "new"));
  $("#photos").addEventListener("change", (e) => ($("#phlabel").textContent = `${e.target.files.length} photo(s) selected`));
  $("#bform").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formData(e.target);
    busy(e.submitter, async () => {
      let vehicleId = f.vehicle_id, v = vehicles.find((x) => x.id === vehicleId);
      if (vehicleId === "new") {
        if (!f.vin && !f.make) return toast("Enter the VIN or at least the make.", "err");
        const ins = await sb.from("vehicles").insert(vehicleRow(f)).select("*").single();
        if (ins.error) return toast(errMsg(ins.error), "err");
        v = ins.data; vehicleId = v.id;
      }
      const c = me.customer;
      const rq = await sb.from("requests").insert({
        customer_id: c.id, vehicle_id: vehicleId, full_name: c.full_name, email: c.email, phone: c.phone,
        vin: v?.vin || null, year: v?.year || null, make: v?.make || null, model: v?.model || null,
        description: f.description, preferred_date: f.preferred_date, preferred_slot: f.preferred_slot,
      }).select("id").single();
      if (rq.error) return toast(errMsg(rq.error), "err");
      fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "request", requestId: rq.data.id }) }).catch(() => {}); // email the shop
      const files = $("#photos").files;
      if (files.length) await uploadPhotos(files, { customerId: c.id, requestId: rq.data.id, visible: true, userId: me.user.id });
      setPage(html`<main class="p-main"><div class="p-card" style="max-width:560px;margin:30px auto;text-align:center">
        <h1>Request sent</h1><p>We asked for <b>${fdate(f.preferred_date)}, ${slotLabel(f.preferred_slot)}</b>. We will call or text you to confirm.</p>
        <a class="p-btn p-btn--go" href="#/">Back to my repairs</a></div></main>`);
    });
  });
}
