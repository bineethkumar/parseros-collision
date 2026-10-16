// Parceros shop management portal (owner + staff)
import {
  initSupabase, sb, html, raw, esc, money, fdate, ftime, daysSince, vehicleName, STATUSES, statusLabel,
  slotLabel, totals, PAY_METHODS, payMethodLabel, invoiceDue, paidSum, parseCents, CHECK_CATEGORIES, checkCategoryLabel, amountWords, requestPasswordReset, linkProblem, newLinkCard, wireNewLinkCard, toast, errMsg, formData, nn, busy, wireVin, uploadPhotos, photoUrls, photoGrid, router, go,
} from "/shared/core.js";
import { zipWriter } from "/shared/zip.js";

const app = document.getElementById("app");
let me = null; // { user, profile }
const isOwner = () => me?.profile?.role === "owner";
let linkIssue = null; // a sign-in link that didn't work: offer a new one on the sign-in page
const LOGO = raw(`<svg viewBox="0 0 200 52" aria-hidden="true"><path d="M66 24 C92 6 140 3 170 21 L175 25 C146 11 100 11 66 24Z" fill="#fff"/><path d="M4 40 C38 26 110 23 186 30 L196 33 L190 34 C140 32 66 32 8 42Z" fill="#fff"/><path d="M10 45 C64 34 140 34 194 38" stroke="#3fae86" stroke-width="2.6" fill="none"/></svg>`);

// ---------------------------------------------------------------- boot
start();
async function start() {
  try { await initSupabase(); }
  catch (e) { return setPage(html`<main class="p-main"><div class="p-card"><h2>Setup needed</h2><p>${errMsg(e)}</p></div></main>`); }
  linkIssue = linkProblem();
  sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") { me = null; } });
  await loadMe();
  if (linkIssue) {
    history.replaceState(null, "", location.pathname);
    if (me) { toast(`${linkIssue} You're already signed in.`, "err"); linkIssue = null; }
  }
  if (new URLSearchParams(location.search).get("welcome") && me) {
    history.replaceState(null, "", location.pathname + "#/set-password");
  }
  run();
}
async function loadMe() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { me = null; return; }
  const { data: profile } = await sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
  me = { user: session.user, profile };
}

const run = router([
  [/^\/set-password$/, () => guard(setPasswordView, true)],
  [/^\/$/, () => guard(boardView)],
  [/^\/customers$/, (m, q) => guard(() => customersView(q))],
  [/^\/customers\/([0-9a-f-]{36})$/, (m) => guard(() => customerView(m[1]))],
  [/^\/new-ro$/, (m, q) => guard(() => newRoView(q))],
  [/^\/ro\/([0-9a-f-]{36})$/, (m) => guard(() => roView(m[1]))],
  [/^\/requests$/, (m, q) => guard(() => requestsView(q))],
  [/^\/staff$/, () => guard(staffView)],
  [/^\/checks$/, (m, q) => guard(() => checksView(q))],
  [/^\/checks\/new$/, (m, q) => guard(() => writeCheckView(q))],
  [/^\/checks\/payees$/, () => guard(payeesView)],
  [/^\/checks\/bank$/, () => guard(bankView)],
  [/^\/backups$/, () => guard(backupsView)],
  [/^\/expenses$/, (m, q) => guard(() => expensesView(q))],
  [/^\/profit$/, (m, q) => guard(() => profitView(q))],
], () => guard(boardView));

async function guard(fn, allowAny = false) {
  if (!me) return loginView();
  const p = me.profile;
  if (!allowAny && (!p || p.disabled || !["owner", "staff"].includes(p.role))) {
    return setPage(html`<main class="p-main"><div class="p-card"><h2>No shop access</h2>
      <p>This login is not a shop account${p?.disabled ? " (it has been turned off)" : ""}. Customers sign in at <a href="/portal/">the customer portal</a>.</p>
      <button class="p-btn" data-signout>Sign out</button></div></main>`, false);
  }
  setPage(html`<div class="p-loading">Loading</div>`);
  try { await fn(); } catch (e) { console.error(e); setPage(html`<main class="p-main"><div class="p-card"><h2>Could not load</h2><p>${errMsg(e)}</p><a class="p-btn" href="#/">Back to board</a></div></main>`); }
}

// ---------------------------------------------------------------- shell
function setPage(content, withNav = true) {
  const h = location.hash || "#/";
  const tab = (href, label) => html`<a href="${href}" class="${(href === "#/" ? h === "#/" || h === "#" : h.startsWith(href)) ? "is-on" : ""}">${label}</a>`;
  const top = withNav && me?.profile && ["owner", "staff"].includes(me.profile.role) ? html`
    <header class="p-top">
      <a class="p-logo" href="#/">${LOGO}<span><b>Parceros</b><small>Shop management</small></span></a>
      <nav class="p-nav" aria-label="Sections">
        ${tab("#/", "Board")}${tab("#/customers", "Customers")}${tab("#/requests", "Requests")}${isOwner() ? html`${tab("#/profit", "Job profit")}${tab("#/expenses", "Expenses")}${tab("#/checks", "Checks")}${tab("#/staff", "Staff")}${tab("#/backups", "Backups")}` : ""}
      </nav>
      <div class="p-who"><span>${me.profile.full_name || me.user.email} · ${me.profile.role}</span><button type="button" data-signout>Sign out</button></div>
    </header>` : "";
  app.innerHTML = String(html`${top}${content}`);
  app.querySelectorAll("[data-signout]").forEach((b) => b.addEventListener("click", async () => { await sb.auth.signOut(); me = null; location.hash = "#/"; run(); }));
}
const $ = (s) => app.querySelector(s);
const $$ = (s) => Array.from(app.querySelectorAll(s));
function dialog(content) {
  const d = document.createElement("dialog");
  d.className = "p-dialog";
  d.innerHTML = String(content);
  document.body.appendChild(d);
  d.addEventListener("close", () => d.remove());
  d.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => d.close()));
  d.showModal();
  return d;
}
async function byIds(table, ids, cols = "*") {
  const u = [...new Set(ids.filter(Boolean))];
  if (!u.length) return {};
  const { data, error } = await sb.from(table).select(cols).in("id", u);
  if (error) throw error;
  return Object.fromEntries((data || []).map((r) => [r.id, r]));
}
const must = ({ data, error }) => { if (error) throw error; return data; };

// ---------------------------------------------------------------- emails
// "Email the customer" checkbox, ticked by default. Shows a note instead when there's no email on file.
function emailBox(email, label = "Email the customer", { updates = true, optedOut = false } = {}) {
  if (!email) return html`<span class="p-hint">No email on file, so nothing will be emailed.</span>`;
  return html`<label class="p-check"><input type="checkbox" data-email ${updates && optedOut ? "" : raw("checked")}> ${label}
    ${updates && optedOut ? html`<span class="p-muted">(they turned off update emails)</span>` : ""}</label>`;
}
const wantsEmail = (root) => !!root?.querySelector("[data-email]")?.checked;
function emailResult(r) {
  if (!r) return;
  if (r.status === "sent") toast(`Email sent to ${r.to}.`);
  else toast(`Not emailed: ${r.error || "unknown problem"}`, r.status === "failed" ? "err" : "ok");
}
// Asks the server to send one email (it builds the content from the database).
async function notify(payload) {
  try {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return toast(`Not emailed: ${j.error || "the email could not be sent."}`, "err");
    emailResult(j);
  } catch { toast("Not emailed: the email could not be sent.", "err"); }
}
const STATUS_EMAIL = ["received", "ready"]; // stages that email the customer

// ---------------------------------------------------------------- auth views
function loginView() {
  app.innerHTML = String(html`
  <div class="p-auth">
    <div class="p-auth__art"><div><p class="p-mono">Parceros Collision Center</p><h1>Shop <em>management</em></h1><p>Customers, cars, estimates and the repair board.</p></div></div>
    <div class="p-auth__box">${linkIssue ? newLinkCard(linkIssue) : ""}<form class="p-card p-form" id="login" autocomplete="on">
      <h2>Staff sign in</h2>
      <label class="p-field"><span>Email</span><input name="email" type="email" required autocomplete="username"></label>
      <label class="p-field"><span>Password</span><input name="password" type="password" required autocomplete="current-password"></label>
      <button class="p-btn p-btn--go" type="submit">Sign in</button>
      <button class="p-linkbtn" type="button" id="forgot">Forgot password?</button>
      <p class="p-hint">Customer? Use the <a href="/portal/">customer portal</a>.</p>
    </form></div>
  </div>`);
  wireNewLinkCard(app);
  $("#login").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formData(e.target);
    busy(e.submitter, async () => {
      const { error } = await sb.auth.signInWithPassword({ email: f.email, password: f.password });
      if (error) return toast("Email or password is not right.", "err");
      await loadMe();
      if (!me.profile || !["owner", "staff"].includes(me.profile.role) || me.profile.disabled) {
        await sb.auth.signOut(); me = null;
        return toast("That account does not have shop access.", "err");
      }
      location.hash = "#/"; run();
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
    <h2>Set your password</h2>
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
      toast("Password saved.");
      location.hash = "#/";
    });
  });
}

// ---------------------------------------------------------------- board
async function boardView() {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const ros = must(await sb.from("repair_orders").select("*").or(`status.neq.delivered,updated_at.gte.${since}`).order("created_at"));
  const custs = await byIds("customers", ros.map((r) => r.customer_id), "id,full_name,phone,email,email_updates");
  const vehs = await byIds("vehicles", ros.map((r) => r.vehicle_id), "id,year,make,model,color");
  const techs = await byIds("profiles", ros.map((r) => r.assigned_staff_id), "id,full_name,email");
  const newReq = must(await sb.from("requests").select("id", { count: "exact", head: false }).eq("status", "new")).length;
  const today = new Date().toISOString().slice(0, 10);
  const col = ([key, label]) => {
    const list = ros.filter((r) => r.status === key);
    return html`<section class="p-col" data-col="${key}" aria-label="${label}">
      <h3>${label} <span>${list.length}</span></h3>
      ${list.map((r) => html`<a class="p-tile ${r.promised_date && r.promised_date < today && key !== "delivered" ? "is-late" : ""}" href="#/ro/${r.id}" draggable="true" data-ro="${r.id}">
        <b>#${r.number} ${custs[r.customer_id]?.full_name || ""}</b>
        <small>${vehicleName(vehs[r.vehicle_id])}${techs[r.assigned_staff_id] ? " · " + personName(techs[r.assigned_staff_id]) : ""}</small>
        <small>${daysSince(r.created_at)} days in shop${r.promised_date ? html` · promised ${fdate(r.promised_date)}` : ""}</small>
      </a>`)}
    </section>`;
  };
  setPage(html`<main class="p-main p-main--wide">
    <div class="p-head"><div><p class="p-crumb">Repair board</p><h1>Cars in the shop</h1></div>
      <div class="p-row">${newReq ? html`<a class="p-btn" href="#/requests">${newReq} new request${newReq > 1 ? "s" : ""}</a>` : ""}<a class="p-btn p-btn--go" href="#/new-ro">New repair order</a></div></div>
    <p class="p-hint">Drag a car to a new column to update its stage. The customer sees the change in their portal.</p>
    ${ros.length ? html`<div class="p-board">${STATUSES.map(col)}</div>` : html`<div class="p-empty">No cars yet. Start with <a href="#/customers">a customer</a> or a <a href="#/new-ro">new repair order</a>.</div>`}
  </main>`);
  // drag + drop
  $$(".p-tile").forEach((t) => t.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", t.dataset.ro)));
  $$(".p-col").forEach((c) => {
    c.addEventListener("dragover", (e) => { e.preventDefault(); c.classList.add("is-over"); });
    c.addEventListener("dragleave", () => c.classList.remove("is-over"));
    c.addEventListener("drop", async (e) => {
      e.preventDefault(); c.classList.remove("is-over");
      const id = e.dataTransfer.getData("text/plain");
      const ro = ros.find((r) => r.id === id);
      if (!ro || ro.status === c.dataset.col) return;
      const { error } = await sb.rpc("set_ro_status", { p_ro: id, p_status: c.dataset.col, p_note: null, p_visible: true });
      if (error) return toast(errMsg(error), "err");
      toast(`#${ro.number} moved to ${statusLabel(c.dataset.col)}`);
      const cust = custs[ro.customer_id];
      if (STATUS_EMAIL.includes(c.dataset.col) && cust?.email) {
        // no checkbox on a drag, so ask
        const d = dialog(html`<h2>Email ${cust.full_name}?</h2>
          <p>${c.dataset.col === "ready" ? "Tell them their car is ready for pickup." : "Tell them we have their car."} It goes to ${cust.email}.</p>
          ${cust.email_updates === false ? html`<p class="p-hint">They turned off update emails, so it won't be sent.</p>` : ""}
          <div class="p-row"><button class="p-btn p-btn--go" id="yes" ${cust.email_updates === false ? raw("disabled") : ""}>Send email</button><button class="p-btn" data-close>Not now</button></div>`);
        d.querySelector("#yes").addEventListener("click", (ev) => busy(ev.target, async () => { await notify({ kind: "status", roId: ro.id }); d.close(); }));
        d.addEventListener("close", () => run());
        return;
      }
      run();
    });
  });
}

// ---------------------------------------------------------------- customers
async function customersView(q) {
  const term = (q.get("q") || "").replace(/[^\p{L}\p{N} @.\-+]/gu, "").trim().slice(0, 60);
  let query = sb.from("customers").select("*").order("created_at", { ascending: false }).limit(200);
  if (term) query = query.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
  const rows = must(await query);
  setPage(html`<main class="p-main">
    <div class="p-head"><div><p class="p-crumb">Customers</p><h1>Customers</h1></div><button class="p-btn p-btn--go" id="add">Add customer</button></div>
    <form class="p-row p-card" id="search"><input class="p-input" name="q" placeholder="Search name, phone or email" value="${term}" style="flex:1"><button class="p-btn">Search</button></form>
    <div class="p-card">${rows.length ? html`<table class="p-table"><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Added</th></tr></thead><tbody>
      ${rows.map((c) => html`<tr data-href="#/customers/${c.id}"><td><b>${c.full_name}</b></td><td>${c.phone || ""}</td><td>${c.email || ""}</td><td>${fdate(c.created_at)}</td></tr>`)}
    </tbody></table>` : html`<div class="p-empty">${term ? "No customers match." : "No customers yet."}</div>`}</div>
  </main>`);
  $$("tr[data-href]").forEach((tr) => tr.addEventListener("click", () => (location.hash = tr.dataset.href)));
  $("#search").addEventListener("submit", (e) => { e.preventDefault(); go("#/customers?q=" + encodeURIComponent(formData(e.target).q || "")); });
  $("#add").addEventListener("click", () => customerDialog());
}

// Customer address in parts. Older customers may only have the single "address" field.
function addressFields(c = {}) {
  return html`<label class="p-field"><span>Street</span><input name="street" maxlength="200" autocomplete="street-address" value="${c.street || (!c.city && !c.zip ? c.address || "" : "")}"></label>
    <div class="p-grid3">
      <label class="p-field"><span>City</span><input name="city" maxlength="100" autocomplete="address-level2" value="${c.city || ""}"></label>
      <label class="p-field"><span>State</span><input name="state" maxlength="40" autocomplete="address-level1" value="${c.state ?? "MD"}" style="text-transform:uppercase"></label>
      <label class="p-field"><span>ZIP</span><input name="zip" maxlength="20" inputmode="numeric" autocomplete="postal-code" value="${c.zip || ""}"></label>
    </div>`;
}
const addressRow = (f) => {
  const any = f.street || f.city || f.zip; // the State box starts as "MD": only keep it with a real address
  return { street: nn(f.street), city: nn(f.city), state: any ? nn((f.state || "").toUpperCase()) : null, zip: nn(f.zip) };
};
const addressText = (c) => (c?.street || c?.city || c?.zip
  ? [c.street, [c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ")
  : c?.address || "");

function customerDialog() {
  const d = dialog(html`<form class="p-form" id="cform">
    <h2>New customer</h2>
    <label class="p-field"><span>Full name *</span><input name="full_name" required maxlength="120"></label>
    <div class="p-grid2">
      <label class="p-field"><span>Phone</span><input name="phone" type="tel" maxlength="40"></label>
      <label class="p-field"><span>Email</span><input name="email" type="email" maxlength="200"></label>
    </div>
    ${addressFields()}
    <div class="p-row"><button class="p-btn p-btn--go" type="submit">Save customer</button><button class="p-btn" type="button" data-close>Cancel</button></div>
  </form>`);
  d.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formData(e.target);
    busy(e.submitter, async () => {
      const { data, error } = await sb.from("customers").insert({ full_name: f.full_name, phone: nn(f.phone), email: nn(f.email?.toLowerCase()), ...addressRow(f) }).select("id").single();
      if (error) return toast(errMsg(error), "err");
      d.close(); location.hash = "#/customers/" + data.id;
    });
  });
}

function vehicleFields(v = {}) {
  return html`<div class="p-vin"><label class="p-field"><span>VIN</span><input name="vin" maxlength="17" value="${v.vin || ""}" placeholder="17 characters" style="text-transform:uppercase"></label>
      <button type="button" class="p-btn" data-vin-lookup>Look up</button></div>
    <p class="p-hint" data-vin-result>Enter the VIN and press Look up to fill in year, make and model.</p>
    <div class="p-grid3">
      <label class="p-field"><span>Year</span><input name="year" type="number" min="1950" max="2100" value="${v.year || ""}"></label>
      <label class="p-field"><span>Make</span><input name="make" maxlength="60" value="${v.make || ""}"></label>
      <label class="p-field"><span>Model</span><input name="model" maxlength="80" value="${v.model || ""}"></label>
      <label class="p-field"><span>Trim</span><input name="trim_level" maxlength="80" value="${v.trim_level || ""}"></label>
      <label class="p-field"><span>Color</span><input name="color" maxlength="40" value="${v.color || ""}"></label>
      <label class="p-field"><span>Plate</span><input name="plate" maxlength="20" value="${v.plate || ""}"></label>
    </div>`;
}
// Edit a vehicle (VIN look-up included); owners can also delete one that is on no repair order.
function vehicleDialog(v, ros) {
  const used = ros.filter((r) => r.vehicle_id === v.id).length;
  const d = dialog(html`<form class="p-form"><h2>Edit vehicle</h2>${vehicleFields(v)}
    <div class="p-row"><button class="p-btn p-btn--go" type="submit">Save vehicle</button>
      ${isOwner() ? html`<button class="p-btn p-btn--danger" type="button" id="delveh">Delete</button>` : ""}
      <button class="p-btn" type="button" data-close>Cancel</button></div>
    ${used ? html`<p class="p-hint">This vehicle is on ${used} repair order${used > 1 ? "s" : ""}. Changes show there too.</p>` : ""}</form>`);
  wireVin(d);
  d.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (!f.vin && !f.make) return toast("Enter a VIN or at least the make.", "err");
    const { customer_id, ...row } = vehicleRow(f, v.customer_id);
    busy(e.submitter, async () => {
      const { error } = await sb.from("vehicles").update(row).eq("id", v.id);
      if (error) return toast(errMsg(error), "err");
      d.close(); toast("Vehicle saved."); run();
    });
  });
  d.querySelector("#delveh")?.addEventListener("click", (e) => busy(e.target, async () => {
    if (used) return toast(`It's on ${used} repair order${used > 1 ? "s" : ""}, so it can't be deleted. Edit it instead.`, "err");
    if (!confirm(`Delete the ${vehicleName(v)}?`)) return;
    const { error } = await sb.from("vehicles").delete().eq("id", v.id);
    if (error) return toast(errMsg(error), "err");
    d.close(); toast("Vehicle deleted."); run();
  }));
}
const vehicleRow = (f, customerId) => ({
  customer_id: customerId, vin: nn((f.vin || "").toUpperCase()), year: f.year ? Number(f.year) : null,
  make: nn(f.make), model: nn(f.model), trim_level: nn(f.trim_level), color: nn(f.color), plate: nn((f.plate || "").toUpperCase()),
});

async function customerView(id) {
  const c = must(await sb.from("customers").select("*").eq("id", id).maybeSingle());
  if (!c) return setPage(html`<main class="p-main"><div class="p-card"><h2>Customer not found</h2></div></main>`);
  const [vehicles, ros, login] = await Promise.all([
    sb.from("vehicles").select("*").eq("customer_id", id).order("created_at").then(must),
    sb.from("repair_orders").select("*").eq("customer_id", id).order("created_at", { ascending: false }).then(must),
    sb.from("profiles").select("id,email,disabled,created_at").eq("customer_id", id).maybeSingle().then(must),
  ]);
  const vmap = Object.fromEntries(vehicles.map((v) => [v.id, v]));
  setPage(html`<main class="p-main">
    <p class="p-crumb"><a href="#/customers">Customers</a> /</p>
    <div class="p-head"><h1>${c.full_name}</h1><a class="p-btn p-btn--go" href="#/new-ro?customer=${c.id}">New repair order</a></div>
    <div class="p-cols"><div>
      <div class="p-card"><h2>Repair orders</h2>${ros.length ? html`<table class="p-table"><thead><tr><th>RO</th><th>Vehicle</th><th>Stage</th><th>Opened</th></tr></thead><tbody>
        ${ros.map((r) => html`<tr data-href="#/ro/${r.id}"><td><b>#${r.number}</b></td><td>${vehicleName(vmap[r.vehicle_id])}</td><td><span class="p-badge ${r.status === "ready" ? "p-badge--teal" : ""}">${statusLabel(r.status)}</span></td><td>${fdate(r.created_at)}</td></tr>`)}
      </tbody></table>` : html`<p class="p-muted">No repair orders yet.</p>`}</div>
      <div class="p-card"><h2>Vehicles</h2>
        ${vehicles.length ? html`<table class="p-table"><thead><tr><th>Vehicle</th><th>VIN</th><th>Plate</th><th></th></tr></thead><tbody>${vehicles.map((v) => html`<tr><td><b>${vehicleName(v)}</b> ${v.trim_level || ""} ${v.color ? html`<span class="p-muted">· ${v.color}</span>` : ""}</td><td class="p-mono">${v.vin || ""}</td><td>${v.plate || ""}</td>
          <td class="p-actions"><button type="button" class="p-linkbtn" data-editveh="${v.id}">Edit</button></td></tr>`)}</tbody></table>` : html`<p class="p-muted">No vehicles yet.</p>`}
        <details style="margin-top:14px"><summary class="p-btn p-btn--sm" style="display:inline-flex">Add vehicle</summary>
          <form class="p-form" id="vform" style="margin-top:14px">${vehicleFields()}<button class="p-btn p-btn--go" type="submit">Save vehicle</button></form>
        </details>
      </div>
    </div><div>
      <form class="p-card p-form" id="cedit"><h2>Contact</h2>
        <label class="p-field"><span>Full name</span><input name="full_name" required maxlength="120" value="${c.full_name}"></label>
        <label class="p-field"><span>Phone</span><input name="phone" type="tel" maxlength="40" value="${c.phone || ""}"></label>
        ${c.phone ? html`<p class="p-hint"><a href="tel:${c.phone}">Call</a> · <a href="sms:${c.phone}">Text</a></p>` : ""}
        <label class="p-field"><span>Email</span><input name="email" type="email" maxlength="200" value="${c.email || ""}"></label>
        ${addressFields(c)}
        <label class="p-field"><span>Shop notes (not shown to customer)</span><textarea name="notes" maxlength="4000">${c.notes || ""}</textarea></label>
        <label class="p-check"><input type="checkbox" name="email_updates" ${c.email_updates === false ? "" : raw("checked")}> Email updates (estimate, invoice, car received / ready, drop-off)</label>
        <p class="p-hint">Receipts and login emails are always sent.</p>
        <button class="p-btn" type="submit">Save contact</button>
      </form>
      <div class="p-card" id="access"><h2>Portal access</h2>
        ${login ? html`<p><span class="p-badge p-badge--teal">Has a login</span> ${login.email}${login.disabled ? html` <span class="p-badge p-badge--red">Turned off</span>` : ""}</p>
          <p class="p-hint">Forgot their password? Make a new link and send it to them.</p>
          <label class="p-check"><input type="checkbox" data-email checked> Email the link to them</label>
          <button class="p-btn" id="invite">Make password reset link</button>`
        : html`<p class="p-muted">No portal login yet. Make an invite link and text or email it to the customer. They choose their own password.</p>
          <label class="p-check"><input type="checkbox" data-email checked> Email the invite to them</label>
          <button class="p-btn p-btn--go" id="invite">Make invite link</button>`}
      </div>
    </div></div>
  </main>`);
  $$("tr[data-href]").forEach((tr) => tr.addEventListener("click", () => (location.hash = tr.dataset.href)));
  wireVin($("#vform"));
  $("#vform").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (!f.vin && !f.make) return toast("Enter a VIN or at least the make.", "err");
    busy(e.submitter, async () => {
      const { error } = await sb.from("vehicles").insert(vehicleRow(f, id));
      if (error) return toast(errMsg(error), "err");
      toast("Vehicle added."); run();
    });
  });
  $$("[data-editveh]").forEach((b) => b.addEventListener("click", () => vehicleDialog(vehicles.find((v) => v.id === b.dataset.editveh), ros)));
  $("#cedit").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formData(e.target);
    busy(e.submitter, async () => {
      const { error } = await sb.from("customers").update({ full_name: f.full_name, phone: nn(f.phone), email: nn(f.email?.toLowerCase()), ...addressRow(f), notes: nn(f.notes), email_updates: f.email_updates === "on" }).eq("id", id);
      if (error) return toast(errMsg(error), "err");
      toast("Saved."); run();
    });
  });
  $("#invite").addEventListener("click", (e) => busy(e.target, async () => {
    const email = (login?.email || $("[name=email]").value || "").trim();
    if (!email) return toast("Add the customer's email first and save.", "err");
    await inviteFlow({ kind: "customer", customerId: id, email, fullName: c.full_name, sendEmail: wantsEmail($("#access")) }, c.phone);
  }));
}

async function inviteFlow(body, phone) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch("/api/invite", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return toast(j.error || "Could not make the link.", "err");
  const msg = `Hi ${body.fullName || ""}, here is your Parceros Collision Center ${body.kind === "staff" ? "staff" : "customer portal"} link to set your password: ${j.link}`;
  const sent = j.email?.status === "sent";
  const d = dialog(html`<h2>${j.existing ? "Password reset link" : "Invite link"} ready</h2>
    ${j.email ? (sent ? html`<p><span class="p-badge p-badge--teal">Emailed</span> We emailed it to <b>${j.email.to}</b>. You can also text it below.</p>`
      : html`<p class="p-neg">Not emailed: ${j.email.error}</p>`) : ""}
    <p>${sent ? "Or send" : "Send"} this link to <b>${body.email}</b>. It works once and expires (24 hours by default in Supabase). Anyone with the link can set the password, so only send it to them.</p>
    <div class="p-linkbox"><input class="p-input" readonly value="${j.link}" id="lnk"><button class="p-btn" id="copy">Copy</button></div>
    <div class="p-row" style="margin-top:14px">
      ${phone ? html`<a class="p-btn" href="sms:${phone}?&body=${encodeURIComponent(msg)}">Text it</a>` : ""}
      <a class="p-btn" href="mailto:${body.email}?subject=${encodeURIComponent("Your Parceros Collision Center login")}&body=${encodeURIComponent(msg)}">Email it</a>
      <button class="p-btn p-btn--go" data-close>Done</button>
    </div>`);
  d.querySelector("#copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(j.link); toast("Link copied."); } catch { d.querySelector("#lnk").select(); }
  });
}

// ---------------------------------------------------------------- new repair order
async function newRoView(q) {
  const customerId = q.get("customer");
  const customers = must(await sb.from("customers").select("id,full_name,phone,email,email_updates").order("full_name").limit(1000));
  const picked = customers.find((c) => c.id === customerId);
  const vehicles = customerId ? must(await sb.from("vehicles").select("*").eq("customer_id", customerId)) : [];
  setPage(html`<main class="p-main">
    <p class="p-crumb"><a href="#/">Board</a> /</p><h1>New repair order</h1>
    <form class="p-card p-form" id="roform" style="max-width:820px">
      <label class="p-field"><span>Customer *</span><select name="customer_id" required id="cust">
        <option value="">Choose a customer</option>
        ${customers.map((c) => html`<option value="${c.id}" ${c.id === customerId ? raw("selected") : ""}>${c.full_name}${c.phone ? " · " + c.phone : ""}</option>`)}
      </select></label>
      <p class="p-hint">New customer? <a href="#/customers">Add them first</a>.</p>
      ${customerId ? html`
        <label class="p-field"><span>Vehicle</span><select name="vehicle_id" id="veh">
          ${vehicles.map((v) => html`<option value="${v.id}">${vehicleName(v)} ${v.vin ? "· " + v.vin : ""}</option>`)}
          <option value="new" ${vehicles.length ? "" : raw("selected")}>+ Add a new vehicle</option>
        </select></label>
        <div id="newveh" ${vehicles.length ? raw("hidden") : ""}>${vehicleFields()}</div>
        <label class="p-field"><span>What needs fixing</span><textarea name="description" maxlength="4000" placeholder="Front bumper and right headlight after a parking lot hit"></textarea></label>
        <div class="p-grid3">
          <label class="p-field"><span>Insurance company</span><input name="insurance_company" maxlength="120"></label>
          <label class="p-field"><span>Claim number</span><input name="claim_number" maxlength="80"></label>
          <label class="p-field"><span>Promised date</span><input name="promised_date" type="date"></label>
        </div>
        ${emailBox(picked?.email, "Email the customer that we have their car", { optedOut: picked?.email_updates === false })}
        <button class="p-btn p-btn--go" type="submit">Create repair order</button>` : ""}
    </form>
  </main>`);
  $("#cust").addEventListener("change", (e) => go("#/new-ro?customer=" + e.target.value));
  if (!customerId) return;
  wireVin($("#newveh"));
  $("#veh").addEventListener("change", (e) => ($("#newveh").hidden = e.target.value !== "new"));
  $("#roform").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formData(e.target);
    busy(e.submitter, async () => {
      let vehicleId = f.vehicle_id;
      if (vehicleId === "new") {
        if (!f.vin && !f.make) return toast("Enter a VIN or at least the make.", "err");
        const v = await sb.from("vehicles").insert(vehicleRow(f, customerId)).select("id").single();
        if (v.error) return toast(errMsg(v.error), "err");
        vehicleId = v.data.id;
      }
      const r = await sb.from("repair_orders").insert({ customer_id: customerId, vehicle_id: vehicleId, description: nn(f.description), insurance_company: nn(f.insurance_company), claim_number: nn(f.claim_number), promised_date: nn(f.promised_date) }).select("id").single();
      if (r.error) return toast(errMsg(r.error), "err");
      await sb.rpc("set_ro_status", { p_ro: r.data.id, p_status: "received", p_note: "We have your vehicle.", p_visible: true });
      if (wantsEmail(e.target)) await notify({ kind: "status", roId: r.data.id });
      location.hash = "#/ro/" + r.data.id;
    });
  });
}

// ---------------------------------------------------------------- repair order
async function roView(id) {
  const ro = must(await sb.from("repair_orders").select("*").eq("id", id).maybeSingle());
  if (!ro) return setPage(html`<main class="p-main"><div class="p-card"><h2>Repair order not found</h2></div></main>`);
  const [cust, vehicles, events, photos, estimates, payments, costLines, techs, entries, expenses, rates] = await Promise.all([
    sb.from("customers").select("*").eq("id", ro.customer_id).single().then(must),
    sb.from("vehicles").select("*").eq("customer_id", ro.customer_id).then(must),
    sb.from("ro_events").select("*").eq("ro_id", id).order("created_at", { ascending: false }).then(must),
    sb.from("photos").select("*").eq("ro_id", id).order("created_at").then(must),
    isOwner() ? sb.from("estimates").select("*").eq("ro_id", id).order("created_at").then(must) : Promise.resolve([]),
    sb.from("payments").select("*").eq("ro_id", id).order("created_at").then(must), // staff: only the ones they took
    isOwner() ? sb.from("check_lines").select("*").eq("ro_id", id).then(must) : Promise.resolve([]),
    shopPeople(),
    sb.from("time_entries").select("*").eq("ro_id", id).order("work_date").order("created_at").then(must),
    isOwner() ? sb.from("expenses").select("*").eq("ro_id", id).order("expense_date").then(must) : Promise.resolve([]),
    isOwner() ? sb.from("staff_rates").select("*").then(must) : Promise.resolve([]),
  ]);
  const costChecks = await byIds("checks", costLines.map((l) => l.check_id), "id,check_number,check_date,payee_name,status");
  const items = estimates.length ? must(await sb.from("estimate_items").select("*").in("estimate_id", estimates.map((e) => e.id)).order("sort")) : [];
  const urls = await photoUrls(photos);
  const veh = vehicles.find((v) => v.id === ro.vehicle_id);
  const evBy = await byIds("profiles", events.map((e) => e.created_by), "id,full_name,role");

  setPage(html`<main class="p-main">
    <p class="p-crumb"><a href="#/">Board</a> / <a href="#/customers/${cust.id}">${cust.full_name}</a> /</p>
    <div class="p-head"><div><h1>RO #${ro.number}</h1><p class="p-muted" style="margin:6px 0 0">${vehicleName(veh)}${veh?.vin ? " · VIN " + veh.vin : ""}${ro.assigned_staff_id ? html` · Tech: <b>${personName(techs.find((t) => t.id === ro.assigned_staff_id))}</b>` : ""}</p></div>
      <span class="p-badge p-badge--dark" style="font-size:.85rem;padding:8px 14px">${statusLabel(ro.status)}</span></div>
    <div class="p-cols"><div>
      <form class="p-card p-form" id="stform"><h2>Update stage</h2>
        <div class="p-grid2">
          <label class="p-field"><span>Stage</span><select name="status">${STATUSES.map(([k, l]) => html`<option value="${k}" ${k === ro.status ? raw("selected") : ""}>${l}</option>`)}</select></label>
          <label class="p-check" style="align-self:end"><input type="checkbox" name="visible" checked> Show note to customer</label>
        </div>
        <label class="p-field"><span>Note (optional)</span><input name="note" maxlength="2000" placeholder="Parts arrive Thursday"></label>
        <div id="stemail" hidden>${emailBox(cust.email, "Email the customer about this stage", { optedOut: cust.email_updates === false })}</div>
        <button class="p-btn p-btn--go" type="submit">Update</button>
      </form>

      ${isOwner() ? estimatesBlock(estimates, items, payments, cust) : staffPayBlock(payments, cust)}
      ${isOwner() ? jobProfitBlock(ro, { estimates, items, expenses, checkLines: costLines.filter((l) => costChecks[l.check_id]?.status !== "void"), checks: costChecks, entries, rates }) : ""}
      ${hoursBlock(ro, entries, techs, rates)}

      <div class="p-card"><div class="p-spread"><h2>Photos</h2>
        <label class="p-check"><input type="checkbox" id="phvis" checked> Customer can see new uploads</label></div>
        ${photoGrid(photos, urls, { canHide: true })}
        <label class="p-drop" style="margin-top:12px"><input type="file" id="phup" accept="image/*" multiple>Add photos (up to 10 at a time)</label>
      </div>

      <form class="p-card p-form" id="roedit"><h2>Job details</h2>
        <label class="p-field"><span>Vehicle</span><select name="vehicle_id">${vehicles.map((v) => html`<option value="${v.id}" ${v.id === ro.vehicle_id ? raw("selected") : ""}>${vehicleName(v)} ${v.vin ? "· " + v.vin : ""}</option>`)}</select></label>
        <label class="p-field"><span>Technician on this job</span><select name="assigned_staff_id"><option value="">Not assigned</option>
          ${techs.filter((t) => !t.disabled || t.id === ro.assigned_staff_id).map((t) => html`<option value="${t.id}" ${t.id === ro.assigned_staff_id ? raw("selected") : ""}>${personName(t)}</option>`)}</select></label>
        <label class="p-field"><span>What needs fixing</span><textarea name="description" maxlength="4000">${ro.description || ""}</textarea></label>
        <div class="p-grid3">
          <label class="p-field"><span>Insurance company</span><input name="insurance_company" maxlength="120" value="${ro.insurance_company || ""}"></label>
          <label class="p-field"><span>Claim number</span><input name="claim_number" maxlength="80" value="${ro.claim_number || ""}"></label>
          <label class="p-field"><span>Promised date</span><input name="promised_date" type="date" value="${ro.promised_date || ""}"></label>
        </div>
        <button class="p-btn" type="submit">Save details</button>
      </form>
    </div><div>
      <div class="p-card"><h2>Customer</h2>
        <p><a href="#/customers/${cust.id}"><b>${cust.full_name}</b></a></p>
        ${cust.phone ? html`<p><a href="tel:${cust.phone}">${cust.phone}</a> · <a href="sms:${cust.phone}">Text</a></p>` : ""}
        ${cust.email ? html`<p><a href="mailto:${cust.email}">${cust.email}</a></p>` : ""}
      </div>
      <div class="p-card"><h2>Timeline</h2>
        <form class="p-form" id="noteform" style="margin-bottom:12px">
          <label class="p-field"><span>Add a note</span><textarea name="note" maxlength="2000" required style="min-height:60px"></textarea></label>
          <div class="p-spread"><label class="p-check"><input type="checkbox" name="visible"> Show to customer</label><button class="p-btn p-btn--sm" type="submit">Add note</button></div>
        </form>
        <ul class="p-timeline">${events.map((ev) => html`<li>
          <time>${ftime(ev.created_at)}</time>${evBy[ev.created_by] ? html` <span class="p-muted">· ${evBy[ev.created_by].full_name}</span>` : ""}<br>
          ${ev.status ? html`<span class="p-badge p-badge--teal">${statusLabel(ev.status)}</span>` : ""}${ev.visible_to_customer ? "" : html`<span class="p-badge">Shop only</span>`}
          ${ev.note || ""}
        </li>`)}</ul>
      </div>
    </div></div>
  </main>`);

  // the email checkbox only shows for the stages that email the customer
  const stSel = $("#stform [name=status]");
  const showStEmail = () => { $("#stemail").hidden = !STATUS_EMAIL.includes(stSel.value) || stSel.value === ro.status; };
  stSel.addEventListener("change", showStEmail);
  $("#stform").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    busy(e.submitter, async () => {
      const { error } = await sb.rpc("set_ro_status", { p_ro: id, p_status: f.get("status"), p_note: f.get("note") || null, p_visible: f.get("visible") === "on" });
      if (error) return toast(errMsg(error), "err");
      toast("Stage updated.");
      if (STATUS_EMAIL.includes(f.get("status")) && f.get("status") !== ro.status && wantsEmail(e.target)) await notify({ kind: "status", roId: id });
      run();
    });
  });
  $("#noteform").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    busy(e.submitter, async () => {
      const { error } = await sb.from("ro_events").insert({ ro_id: id, note: String(f.get("note")).trim(), visible_to_customer: f.get("visible") === "on", created_by: me.user.id });
      if (error) return toast(errMsg(error), "err");
      run();
    });
  });
  $("#roedit").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formData(e.target);
    busy(e.submitter, async () => {
      const { error } = await sb.from("repair_orders").update({ vehicle_id: nn(f.vehicle_id), assigned_staff_id: nn(f.assigned_staff_id), description: nn(f.description), insurance_company: nn(f.insurance_company), claim_number: nn(f.claim_number), promised_date: nn(f.promised_date) }).eq("id", id);
      if (error) return toast(errMsg(error), "err");
      toast("Saved."); run();
    });
  });
  $("#phup").addEventListener("change", async (e) => {
    const n = await uploadPhotos(e.target.files, { customerId: ro.customer_id, roId: id, visible: $("#phvis").checked, userId: me.user.id });
    if (n) { toast(`${n} photo${n > 1 ? "s" : ""} added.`); run(); }
  });
  $$("[data-toggle-photo]").forEach((b) => b.addEventListener("click", async () => {
    const { error } = await sb.from("photos").update({ visible_to_customer: b.dataset.visible !== "1" }).eq("id", b.dataset.togglePhoto);
    if (error) return toast(errMsg(error), "err");
    run();
  }));
  if (isOwner()) { wireEstimates(ro, estimates, items); wireJobCosts(ro, expenses); }
  wirePayments(ro);
  wireHours(ro);
}

// ---------------------------------------------------------------- payments
const METHOD_OPTS = PAY_METHODS.filter(([k]) => k !== "online");
function payForm(scope, { amount = "", owner = false, cust = null } = {}) {
  return html`<form class="p-form p-payform" data-payform="${scope}">
    <div class="p-grid2">
      <label class="p-field"><span>Amount received ($)</span><input name="amount" inputmode="decimal" required placeholder="0.00" value="${amount}"></label>
      <label class="p-field"><span>How they paid</span><select name="method">${METHOD_OPTS.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
    </div>
    <div class="p-grid2">
      <label class="p-field"><span>Check # / last 4 of card / claim # (optional)</span><input name="reference" maxlength="80"></label>
      <label class="p-field"><span>Note (optional)</span><input name="note" maxlength="500"></label>
    </div>
    ${emailBox(cust?.email, "Email the customer a receipt", { updates: false })}
    <button class="p-btn p-btn--go" type="submit">${owner ? "Record payment" : "Save payment & get receipt"}</button>
  </form>`;
}
function paymentRows(list, { owner }) {
  if (!list.length) return html`<p class="p-muted">No payments yet.</p>`;
  return html`<table class="p-table p-paytable"><thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th>Taken by</th><th class="num">Amount</th><th></th></tr></thead><tbody>
    ${list.map((p) => html`<tr class="${p.voided_at ? "is-void" : ""}">
      <td class="p-mono">#${p.receipt_number}</td>
      <td>${ftime(p.created_at)}</td>
      <td>${payMethodLabel(p.method)}${p.reference ? html` <span class="p-muted">· ${p.reference}</span>` : ""}${p.note ? html`<br><span class="p-muted">${p.note}</span>` : ""}
        ${p.voided_at ? html`<br><span class="p-badge p-badge--red">Void</span> <span class="p-muted">${p.void_reason} (${p.voided_by_name || ""}, ${fdate(p.voided_at)})</span>` : ""}</td>
      <td>${p.received_by_name || ""}</td>
      <td class="num">${money(p.amount_cents)}</td>
      <td class="p-actions"><a class="p-linkbtn" href="/print/?receipt=${p.id}" target="_blank" rel="noopener">Receipt</a>
        ${owner && !p.voided_at && p.method !== "online" ? html` <button type="button" class="p-linkbtn p-linkbtn--danger" data-void="${p.id}" data-receipt="${p.receipt_number}">Void</button>` : ""}</td>
    </tr>`)}</tbody></table>`;
}
// Staff: take money without seeing prices, totals or the balance.
function staffPayBlock(payments, cust) {
  return html`<div class="p-card"><h2>Take a payment</h2>
    <p class="p-hint">Enter what the customer handed you. The owner sees every payment and who took it. If it's more than they owe, you'll be told to check with the owner.</p>
    ${payForm("ro", { cust })}
    ${payments.length ? html`<h3 style="margin-top:18px">Payments you took on this car</h3>${paymentRows(payments, { owner: false })}` : ""}
  </div>`;
}
function receiptDialog(r) {
  const d = dialog(html`<h2>Payment saved</h2>
    <p>Receipt <b class="p-mono">#${r.receipt_number}</b>${r.paid_in_full ? html` · <span class="p-badge p-badge--teal">Paid in full</span>` : ""}</p>
    <div class="p-row"><a class="p-btn p-btn--go" href="/print/?receipt=${r.id}" target="_blank" rel="noopener">Print receipt</a><button class="p-btn" data-close>Done</button></div>`);
  d.addEventListener("close", () => run());
}
function wirePayments(ro) {
  $$("form[data-payform]").forEach((form) => form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formData(form);
    const cents = parseCents(f.amount);
    if (cents == null) return toast("Enter the amount received, like 150 or 150.00.", "err");
    const estId = form.dataset.payform === "ro" ? null : form.dataset.payform;
    busy(e.submitter, async () => {
      const { data, error } = await sb.rpc("record_payment", { p_ro: ro.id, p_estimate: estId, p_amount_cents: cents, p_method: f.method, p_reference: nn(f.reference), p_note: nn(f.note) });
      if (error) return toast(errMsg(error), "err");
      const r = typeof data === "string" ? JSON.parse(data) : data;
      if (wantsEmail(form)) await notify({ kind: "receipt", paymentId: r.id });
      receiptDialog(r);
    });
  }));
  $$("[data-void]").forEach((b) => b.addEventListener("click", () => {
    const d = dialog(html`<form class="p-form" id="voidform"><h2>Void receipt #${b.dataset.receipt}?</h2>
      <p class="p-hint">Use this only for a payment entered by mistake. It stays on record, marked void, and the balance goes back up.</p>
      <label class="p-field"><span>Reason</span><input name="reason" maxlength="300" required placeholder="Typed the wrong amount"></label>
      <div class="p-row"><button class="p-btn p-btn--danger" type="submit">Void payment</button><button class="p-btn" type="button" data-close>Cancel</button></div></form>`);
    d.querySelector("#voidform").addEventListener("submit", (e) => {
      e.preventDefault();
      busy(e.submitter, async () => {
        const { error } = await sb.rpc("void_payment", { p_payment: b.dataset.void, p_reason: d.querySelector("[name=reason]").value.trim() });
        if (error) return toast(errMsg(error), "err");
        d.close(); toast("Payment voided."); run();
      });
    });
  }));
}

// ---------------------------------------------------------------- estimates (owner only)
const TYPES = [["part", "Part"], ["labor", "Labor"], ["paint", "Paint & materials"], ["sublet", "Sublet"], ["other", "Other"]];
function estimatesBlock(estimates, items, payments = [], cust = null) {
  const badge = (s) => html`<span class="p-badge ${s === "approved" || s === "paid" ? "p-badge--teal" : s === "declined" ? "p-badge--red" : s === "sent" || s === "unpaid" ? "p-badge--amber" : ""}">${s}</span>`;
  return html`<div class="p-card"><div class="p-spread"><h2>Estimates & invoices</h2><button class="p-btn p-btn--sm" id="newest">New estimate</button></div>
    ${estimates.length ? estimates.map((e) => {
      const its = items.filter((i) => i.estimate_id === e.id);
      const t = totals(its, e.tax_rate);
      const editable = e.status === "draft";
      const pays = payments.filter((p) => p.estimate_id === e.id);
      const due = invoiceDue(e, its), paid = paidSum(pays), bal = due - paid;
      return html`<details class="p-card" style="margin:12px 0 0;background:var(--paper)" ${editable || (e.kind === "invoice" && e.status === "unpaid") ? raw("open") : ""} data-est="${e.id}">
        <summary class="p-spread" style="cursor:pointer"><span><b>${e.kind === "invoice" ? "Invoice" : "Estimate"}</b> ${badge(e.status)} <span class="p-muted">${fdate(e.created_at)}</span></span><b>${money(t.total)}${e.kind === "invoice" && e.status === "unpaid" && paid ? html` <span class="p-muted" style="font-weight:500">· ${money(bal)} left</span>` : ""}</b></summary>
        <form class="p-form" data-estform="${e.id}" style="margin-top:12px">
          ${editable
            ? html`<table class="p-table p-lines" data-rows><thead><tr><th style="width:150px">Type</th><th style="width:90px">Qty</th><th style="width:120px">Unit $</th><th class="num">Line</th><th style="width:80px"></th></tr></thead>
              ${its.map((i) => itemRow(i, true))}</table>`
            : html`<table class="p-table"><thead><tr><th style="width:140px">Type</th><th>Description</th><th style="width:80px">Qty</th><th style="width:120px">Unit $</th><th class="num" style="width:110px">Line</th></tr></thead>
              <tbody>${its.map((i) => itemRow(i, false))}</tbody></table>`}
          ${editable ? html`<button type="button" class="p-btn p-btn--sm" data-addrow>Add line</button>` : ""}
          <div class="p-grid2">
            <label class="p-field"><span>Tax rate % (on parts + paint)</span><input name="tax_rate" type="number" step="0.001" min="0" max="30" value="${e.tax_rate}" ${editable ? "" : raw("disabled")}></label>
            <label class="p-field"><span>Notes for customer</span><input name="notes" maxlength="4000" value="${e.notes || ""}" ${editable ? "" : raw("disabled")}></label>
          </div>
          <div class="p-total"><span>Parts & paint</span><span class="num" data-t="taxable">${money(t.taxable)}</span><span>Labor & other</span><span class="num" data-t="nontax">${money(t.nontax)}</span><span>Tax</span><span class="num" data-t="tax">${money(t.tax)}</span><b>Total</b><b class="num" data-t="total">${money(t.total)}</b></div>
          ${e.signer_name ? html`<p class="p-hint">${e.status === "approved" ? "Approved" : "Declined"} by ${e.signer_name} on ${ftime(e.decided_at)}</p>` : ""}
          ${e.kind === "invoice" && e.status === "unpaid" ? html`<div class="p-row" style="margin-top:12px;align-items:end">
            <label class="p-field" style="max-width:280px"><span>Customer owes (deductible / their share)</span><input type="number" step="0.01" min="0" data-due value="${e.customer_due_cents != null ? (e.customer_due_cents / 100).toFixed(2) : ""}" placeholder="Blank = full total ${money(t.total)}"></label>
            <button class="p-btn p-btn--sm" type="button" data-savedue="${e.id}">Save amount</button></div>
            <p class="p-hint">The customer can pay what's left by card in their portal. Leave blank to charge the full total.</p>` : ""}
          ${editable || (e.kind === "estimate" && e.status === "approved") ? html`<div style="margin-top:12px">${emailBox(cust?.email, editable ? "Email the customer when I send it" : "Email the customer the invoice", { optedOut: cust?.email_updates === false })}</div>` : ""}
          <div class="p-row" style="margin-top:12px">
            ${editable ? html`<button class="p-btn" type="submit">Save</button><button class="p-btn p-btn--go" type="button" data-send="${e.id}">Save & send to customer</button><button class="p-btn p-btn--danger" type="button" data-del="${e.id}">Delete draft</button>` : ""}
            ${e.kind === "estimate" && e.status === "approved" ? html`<button class="p-btn p-btn--go" type="button" data-invoice="${e.id}">Turn into invoice</button>` : ""}
            ${e.kind === "estimate" && ["sent", "declined"].includes(e.status) ? html`<button class="p-btn" type="button" data-reopen="${e.id}">Edit again (back to draft)</button>` : ""}
            <a class="p-btn" href="/print/?id=${e.id}" target="_blank" rel="noopener">Print / PDF</a>
          </div>
        </form>
        ${e.kind === "invoice" ? html`<div class="p-paybox" data-paybox="${e.id}">
          <h3>Payments</h3>
          <div class="p-total"><span>Customer owes</span><span class="num">${money(due)}</span><span>Paid</span><span class="num" data-t="paid">${money(paid)}</span><b>Balance</b><b class="num" data-t="balance">${money(bal)}</b></div>
          ${e.status === "paid" ? html`<p class="p-hint"><span class="p-badge p-badge--teal">Paid in full</span> ${payMethodLabel(e.paid_method)} · ${ftime(e.paid_at)}</p>` : ""}
          ${paymentRows(pays, { owner: true })}
          ${e.status === "unpaid" && bal > 0 ? html`<h3 style="margin-top:14px">Record a payment</h3>${payForm(e.id, { amount: (bal / 100).toFixed(2), owner: true, cust })}` : ""}
        </div>` : ""}
      </details>`;
    }) : html`<p class="p-muted">No estimate yet.</p>`}
  </div>`;
}
function itemRow(i = {}, editable = true) {
  const line = Math.round(Number(i.qty || 1) * Number(i.unit_cents || 0));
  if (!editable) return html`<tr><td>${(TYPES.find((t) => t[0] === i.item_type) || ["", ""])[1]}</td><td>${i.description}</td><td>${i.qty}</td><td>${money(i.unit_cents)}</td><td class="num">${money(line)}</td></tr>`;
  // one line = two rows: the numbers on top, the description across the full width below
  return html`<tbody data-row class="p-line"><tr>
    <td><select name="item_type">${TYPES.map(([k, l]) => html`<option value="${k}" ${k === (i.item_type || "part") ? raw("selected") : ""}>${l}</option>`)}</select></td>
    <td><input name="qty" type="number" step="0.01" min="0.01" value="${i.qty || 1}" required></td>
    <td><input name="unit" type="number" step="0.01" min="0" value="${((i.unit_cents || 0) / 100).toFixed(2)}" required></td>
    <td class="num" data-line>${money(line)}</td>
    <td><button type="button" class="p-linkbtn" data-rmrow aria-label="Remove line">Remove</button></td>
  </tr><tr><td colspan="5"><textarea name="description" class="p-desc" maxlength="1000" rows="2" required placeholder="DESCRIPTION">${i.description || ""}</textarea></td></tr></tbody>`;
}
function readItems(form) {
  return Array.from(form.querySelectorAll("[data-row]")).map((tr, k) => ({
    item_type: tr.querySelector("[name=item_type]").value,
    description: tr.querySelector("[name=description]").value.trim().toUpperCase(),
    qty: Number(tr.querySelector("[name=qty]").value || 0),
    unit_cents: Math.round(Number(tr.querySelector("[name=unit]").value || 0) * 100),
    sort: k,
  }));
}
function wireEstimates(ro, estimates, items) {
  $("#newest").addEventListener("click", (e) => busy(e.target, async () => {
    const { error } = await sb.from("estimates").insert({ ro_id: ro.id, kind: "estimate", status: "draft" });
    if (error) return toast(errMsg(error), "err");
    run();
  }));
  $$("form[data-estform]").forEach((form) => {
    const estId = form.dataset.estform;
    const est = estimates.find((x) => x.id === estId);
    const recalc = () => {
      if (est.status !== "draft") return;
      const its = readItems(form);
      form.querySelectorAll("[data-row]").forEach((tr, k) => (tr.querySelector("[data-line]").textContent = money(Math.round(its[k].qty * its[k].unit_cents))));
      const t = totals(its, form.querySelector("[name=tax_rate]").value);
      for (const k of ["taxable", "nontax", "tax", "total"]) form.querySelector(`[data-t=${k}]`).textContent = money(t[k]);
    };
    form.addEventListener("input", recalc);
    // description boxes grow with the text (for browsers without CSS field-sizing)
    const grow = (t) => { if (!t.offsetParent) return; t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px"; }; // skip hidden (closed) panels
    form.addEventListener("input", (e) => { if (e.target.matches(".p-desc")) grow(e.target); });
    form.querySelectorAll(".p-desc").forEach(grow);
    form.closest("details")?.addEventListener("toggle", () => form.querySelectorAll(".p-desc").forEach(grow));
    form.addEventListener("click", (e) => {
      if (e.target.matches("[data-addrow]")) { form.querySelector("[data-rows]").insertAdjacentHTML("beforeend", String(itemRow({}))); recalc(); }
      if (e.target.matches("[data-rmrow]")) { e.target.closest("[data-row]").remove(); recalc(); }
    });
    const save = async () => {
      const its = readItems(form);
      if (its.some((i) => !i.description || i.qty <= 0)) { toast("Every line needs a description and a quantity.", "err"); return false; }
      const up = await sb.from("estimates").update({ tax_rate: Number(form.querySelector("[name=tax_rate]").value || 0), notes: nn(form.querySelector("[name=notes]").value.trim()) }).eq("id", estId);
      if (up.error) { toast(errMsg(up.error), "err"); return false; }
      const del = await sb.from("estimate_items").delete().eq("estimate_id", estId);
      if (del.error) { toast(errMsg(del.error), "err"); return false; }
      if (its.length) {
        const ins = await sb.from("estimate_items").insert(its.map((i) => ({ ...i, estimate_id: estId })));
        if (ins.error) { toast(errMsg(ins.error), "err"); return false; }
      }
      return true;
    };
    form.addEventListener("submit", (e) => { e.preventDefault(); busy(e.submitter, async () => { if (await save()) { toast("Estimate saved."); run(); } }); });
    form.querySelector("[data-send]")?.addEventListener("click", (e) => busy(e.target, async () => {
      if (!readItems(form).length) return toast("Add at least one line first.", "err");
      if (!(await save())) return;
      const { error } = await sb.from("estimates").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", estId);
      if (error) return toast(errMsg(error), "err");
      if (["received", "estimate"].includes(ro.status)) await sb.rpc("set_ro_status", { p_ro: ro.id, p_status: "approval", p_note: "Your estimate is ready to review in your portal.", p_visible: true });
      toast("Sent. The customer can now approve it in their portal.");
      if (wantsEmail(form)) await notify({ kind: "estimate", estimateId: estId });
      run();
    }));
    form.querySelector("[data-del]")?.addEventListener("click", (e) => busy(e.target, async () => {
      if (!confirm("Delete this draft estimate?")) return;
      const { error } = await sb.from("estimates").delete().eq("id", estId);
      if (error) return toast(errMsg(error), "err");
      run();
    }));
    form.querySelector("[data-reopen]")?.addEventListener("click", (e) => busy(e.target, async () => {
      const { error } = await sb.from("estimates").update({ status: "draft", signer_name: null, decided_at: null }).eq("id", estId);
      if (error) return toast(errMsg(error), "err");
      run();
    }));
    form.querySelector("[data-invoice]")?.addEventListener("click", (e) => busy(e.target, async () => {
      const inv = await sb.from("estimates").insert({ ro_id: ro.id, kind: "invoice", status: "unpaid", tax_rate: est.tax_rate, notes: est.notes, sent_at: new Date().toISOString() }).select("id").single();
      if (inv.error) return toast(errMsg(inv.error), "err");
      const its = items.filter((i) => i.estimate_id === estId).map(({ item_type, description, qty, unit_cents, sort }) => ({ item_type, description, qty, unit_cents, sort, estimate_id: inv.data.id }));
      if (its.length) { const r = await sb.from("estimate_items").insert(its); if (r.error) return toast(errMsg(r.error), "err"); }
      toast("Invoice created. The customer can see it in their portal.");
      if (wantsEmail(form)) await notify({ kind: "invoice", estimateId: inv.data.id });
      run();
    }));
    form.querySelector("[data-savedue]")?.addEventListener("click", (e) => busy(e.target, async () => {
      const v = form.querySelector("[data-due]").value.trim();
      const cents = v === "" ? null : Math.round(Number(v) * 100);
      if (cents != null && (!(cents >= 0) || cents > 100000000)) return toast("Enter a valid amount.", "err");
      const { error } = await sb.from("estimates").update({ customer_due_cents: cents }).eq("id", estId);
      if (error) return toast(errMsg(error), "err");
      toast("Amount saved."); run();
    }));
  });
}

// ---------------------------------------------------------------- requests inbox
async function requestsView(q) {
  const tab = ["new", "scheduled", "converted", "closed"].includes(q.get("s")) ? q.get("s") : "new";
  const rows = must(await sb.from("requests").select("*").eq("status", tab).order("created_at", { ascending: false }).limit(200));
  const photos = rows.length ? must(await sb.from("photos").select("*").in("request_id", rows.map((r) => r.id))) : [];
  const urls = await photoUrls(photos);
  setPage(html`<main class="p-main">
    <div class="p-head"><div><p class="p-crumb">Requests</p><h1>Estimate & drop-off requests</h1></div></div>
    <nav class="p-row" style="margin-bottom:16px">${["new", "scheduled", "converted", "closed"].map((s) => html`<a class="p-btn p-btn--sm ${s === tab ? "p-btn--dark" : ""}" href="#/requests?s=${s}">${s}</a>`)}</nav>
    ${rows.length ? rows.map((r) => html`<article class="p-card">
      <div class="p-spread"><h2 style="margin:0">${r.full_name}</h2><span class="p-muted">${ftime(r.created_at)}${r.customer_id ? html` · <a href="#/customers/${r.customer_id}">portal customer</a>` : html` · <span class="p-badge">from website</span>`}</span></div>
      <dl class="p-kv" style="margin-top:12px">
        <dt>Contact</dt><dd>${r.phone ? html`<a href="tel:${r.phone}">${r.phone}</a> ` : ""}${r.email ? html`<a href="mailto:${r.email}">${r.email}</a>` : ""}</dd>
        <dt>Vehicle</dt><dd>${[r.year, r.make, r.model].filter(Boolean).join(" ") || "Not given"}${r.vin ? html` <span class="p-mono">${r.vin}</span>` : ""}</dd>
        <dt>Wants</dt><dd>${r.preferred_date ? fdate(r.preferred_date) : "Any day"}${r.preferred_slot ? ", " + slotLabel(r.preferred_slot) : ""}</dd>
        <dt>Damage</dt><dd>${r.description || ""}</dd>
        ${r.scheduled_for ? html`<dt>Scheduled</dt><dd><b>${ftime(r.scheduled_for)}</b></dd>` : ""}
      </dl>
      ${photos.some((p) => p.request_id === r.id) ? html`<div style="margin-top:12px">${photoGrid(photos.filter((p) => p.request_id === r.id), urls)}</div>` : ""}
      ${tab === "new" || tab === "scheduled" ? html`<form class="p-row" data-sched="${r.id}" style="margin-top:14px">
        <input class="p-input" type="datetime-local" name="when" required style="max-width:240px">
        <button class="p-btn" type="submit">${tab === "scheduled" ? "Reschedule" : "Schedule drop-off"}</button>
        <button class="p-btn p-btn--go" type="button" data-convert="${r.id}">Car is here: create repair order</button>
        <button class="p-btn p-btn--danger" type="button" data-close-req="${r.id}">Close</button>
        <div style="flex-basis:100%">${emailBox(r.email, "Email the customer (drop-off confirmed / we have their car)")}</div>
      </form>` : ""}
    </article>`) : html`<div class="p-empty">Nothing here.</div>`}
  </main>`);
  $$("form[data-sched]").forEach((f) => f.addEventListener("submit", (e) => {
    e.preventDefault();
    const when = new FormData(f).get("when");
    busy(e.submitter, async () => {
      const { error } = await sb.from("requests").update({ status: "scheduled", scheduled_for: new Date(when).toISOString() }).eq("id", f.dataset.sched);
      if (error) return toast(errMsg(error), "err");
      if (wantsEmail(f)) { toast("Scheduled."); await notify({ kind: "dropoff", requestId: f.dataset.sched }); }
      else toast("Scheduled. Call or text the customer to confirm.");
      run();
    });
  }));
  $$("[data-close-req]").forEach((b) => b.addEventListener("click", () => busy(b, async () => {
    const { error } = await sb.from("requests").update({ status: "closed" }).eq("id", b.dataset.closeReq);
    if (error) return toast(errMsg(error), "err");
    run();
  })));
  $$("[data-convert]").forEach((b) => b.addEventListener("click", () => busy(b, async () => {
    const r = rows.find((x) => x.id === b.dataset.convert);
    let customerId = r.customer_id;
    if (!customerId) {
      const c = await sb.from("customers").insert({ full_name: r.full_name, phone: r.phone, email: r.email }).select("id").single();
      if (c.error) return toast(errMsg(c.error), "err");
      customerId = c.data.id;
    }
    let vehicleId = r.vehicle_id;
    if (!vehicleId && (r.vin || r.make)) {
      const v = await sb.from("vehicles").insert({ customer_id: customerId, vin: r.vin, year: r.year, make: r.make, model: r.model }).select("id").single();
      if (v.error) return toast(errMsg(v.error), "err");
      vehicleId = v.data.id;
    }
    const ro = await sb.from("repair_orders").insert({ customer_id: customerId, vehicle_id: vehicleId, description: r.description }).select("id").single();
    if (ro.error) return toast(errMsg(ro.error), "err");
    await sb.rpc("set_ro_status", { p_ro: ro.data.id, p_status: "received", p_note: "We have your vehicle.", p_visible: true });
    await sb.from("photos").update({ ro_id: ro.data.id }).eq("request_id", r.id);
    await sb.from("requests").update({ status: "converted", customer_id: customerId }).eq("id", r.id);
    if (wantsEmail(b.closest("form"))) await notify({ kind: "status", roId: ro.data.id });
    location.hash = "#/ro/" + ro.data.id;
  })));
}

// ---------------------------------------------------------------- job costing
const PAID_WITH = [["card", "Card"], ["cash", "Cash"], ["ach", "Bank transfer (ACH)"], ["account", "On vendor account"], ["other", "Other"]];
const paidWithLabel = (k) => (PAID_WITH.find((x) => x[0] === k) || [k, k || ""])[1];
const JOB_ROWS = [["part", "Parts"], ["paint", "Paint & materials"], ["labor", "Labor"], ["sublet", "Sublet"], ["other", "Other"]];
const costKey = (cat) => ({ parts: "part", paint: "paint", sublet: "sublet" })[cat] || "other"; // spending category -> estimate line type
const hrs = (n) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " h";
const pct = (x) => (x == null ? "" : Math.round(x * 100) + "%");
const monthOf = (q) => (/^\d{4}-\d{2}$/.test(q.get("m") || "") ? q.get("m") : localToday().slice(0, 7));
const shiftMonth = (m, by) => { const [y, mo] = m.split("-").map(Number); return new Date(y, mo - 1 + by, 1).toLocaleDateString("en-CA").slice(0, 7); };
const monthName = (m) => new Date(m + "-15T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
function monthNav(base, m) {
  return html`<div class="p-row"><a class="p-btn p-btn--sm" href="${base}?m=${shiftMonth(m, -1)}">‹ Prev</a>
    <input class="p-input" type="month" id="month" value="${m}" style="max-width:190px"><a class="p-btn p-btn--sm" href="${base}?m=${shiftMonth(m, 1)}">Next ›</a></div>`;
}
const wireMonth = (base) => $("#month")?.addEventListener("change", (e) => e.target.value && go(`${base}?m=${e.target.value}`));

// Hourly cost of a staff member on a given day (the rate in effect then).
function rateFor(rates, staffId, day) {
  const mine = rates.filter((r) => r.staff_id === staffId).sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  const r = mine.find((x) => x.effective_from <= day) || mine[mine.length - 1];
  return r ? r.hourly_cost_cents : null;
}
// Charged = invoices before sales tax (or the approved estimate until it is invoiced).
// Costs = parts/paint/sublet bought for the job (expenses + check lines) + hours x technician cost.
function jobNumbers({ estimates, items, expenses, checkLines, entries, rates }) {
  const invoices = estimates.filter((e) => e.kind === "invoice");
  const approved = estimates.filter((e) => e.kind === "estimate" && e.status === "approved").slice(-1);
  const soldIds = new Set((invoices.length ? invoices : approved).map((e) => e.id));
  const charged = { part: 0, labor: 0, paint: 0, sublet: 0, other: 0 }, cost = { ...charged };
  let hoursSold = 0, hoursWorked = 0, missingRate = false;
  for (const i of items) {
    if (!soldIds.has(i.estimate_id)) continue;
    charged[i.item_type in charged ? i.item_type : "other"] += Math.round(Number(i.qty) * Number(i.unit_cents));
    if (i.item_type === "labor") hoursSold += Number(i.qty);
  }
  for (const x of [...expenses, ...checkLines]) cost[costKey(x.category)] += x.amount_cents;
  for (const e of entries) {
    const r = rateFor(rates, e.staff_id, e.work_date);
    if (r == null) missingRate = true;
    cost.labor += Math.round(Number(e.hours) * (r || 0));
    hoursWorked += Number(e.hours);
  }
  const sum = (o) => Object.values(o).reduce((a, v) => a + v, 0);
  const revenue = sum(charged), totalCost = sum(cost);
  return { charged, cost, revenue, totalCost, profit: revenue - totalCost, margin: revenue ? (revenue - totalCost) / revenue : null,
    hoursSold, hoursWorked, missingRate, fromEstimate: !invoices.length && approved.length > 0, nothingSold: !soldIds.size };
}

function jobProfitBlock(ro, d) {
  const n = jobNumbers(d);
  const rows = JOB_ROWS.filter(([k]) => n.charged[k] || n.cost[k]);
  const costs = [
    ...d.checkLines.map((l) => { const c = d.checks[l.check_id]; return { date: c.check_date, from: `Check #${c.check_number} · ${c.payee_name}`, what: l.description, category: l.category, amount: l.amount_cents }; }),
    ...d.expenses.map((x) => ({ id: x.id, date: x.expense_date, from: `${x.vendor} · ${paidWithLabel(x.paid_with)}`, what: [x.description, x.reference].filter(Boolean).join(" · "), category: x.category, amount: x.amount_cents })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return html`<div class="p-card"><div class="p-spread"><h2>Job profit</h2>
      ${n.fromEstimate ? html`<span class="p-badge p-badge--amber">From approved estimate · not invoiced yet</span>` : n.nothingSold ? html`<span class="p-badge">No approved estimate yet</span>` : ""}</div>
    <div class="p-stats">
      <div><span>Customer charge (before tax)</span><b>${money(n.revenue)}</b></div>
      <div><span>Costs</span><b>${money(n.totalCost)}</b></div>
      <div class="${n.profit < 0 ? "is-bad" : "is-good"}"><span>Profit${n.margin != null ? " · " + pct(n.margin) : ""}</span><b>${money(n.profit)}</b></div>
    </div>
    ${rows.length ? html`<table class="p-table"><thead><tr><th></th><th class="num">Charged</th><th class="num">Cost</th><th class="num">Difference</th></tr></thead><tbody>
      ${rows.map(([k, l]) => html`<tr><td>${l}${k === "labor" ? html`<br><span class="p-muted">${hrs(n.hoursSold)} sold · ${hrs(n.hoursWorked)} worked</span>` : ""}</td>
        <td class="num">${money(n.charged[k])}</td><td class="num">${money(n.cost[k])}</td><td class="num ${n.charged[k] - n.cost[k] < 0 ? "p-neg" : ""}">${money(n.charged[k] - n.cost[k])}</td></tr>`)}
    </tbody></table>` : ""}
    ${n.missingRate ? html`<p class="p-hint p-neg">Some hours have no hourly cost set, so labor cost shows too low. Set it under <a href="#/staff">Staff</a>.</p>` : ""}
    <p class="p-hint">Labor lines on the estimate count as hours sold (quantity = hours). Sales tax is not counted as income.</p>
    <h3 style="margin-top:18px">Parts & other costs</h3>
    ${costs.length ? html`<table class="p-table"><thead><tr><th>Date</th><th>From</th><th>For</th><th class="num">Amount</th><th></th></tr></thead><tbody>
      ${costs.map((c) => html`<tr><td>${fdate(c.date)}</td><td>${c.from}</td><td>${c.what || ""} <span class="p-muted">· ${checkCategoryLabel(c.category)}</span></td><td class="num">${money(c.amount)}</td>
        <td>${c.id ? html`<button type="button" class="p-linkbtn" data-editexp="${c.id}">Edit</button>` : ""}</td></tr>`)}
    </tbody></table>` : html`<p class="p-muted">No costs recorded yet.</p>`}
    <div class="p-row" style="margin-top:12px"><button class="p-btn p-btn--sm" id="addcost">Add a cost (card, cash, account)</button><a class="p-btn p-btn--sm" href="#/checks/new?ro=${ro.id}">Pay by check</a></div>
  </div>`;
}

// Everyone in the shop can log hours; only the owner sees what they cost.
// Staff log their own hours; the owner can log for anyone.
function hoursBlock(ro, entries, techs, rates) {
  const owner = isOwner(), byId = Object.fromEntries(techs.map((t) => [t.id, t]));
  const active = techs.filter((t) => !t.disabled && (owner || t.id === me.user.id));
  return html`<div class="p-card"><h2>Hours worked</h2>
    ${entries.length ? html`<table class="p-table"><thead><tr><th>Date</th><th>Technician</th><th>Work</th><th class="num">Hours</th>${owner ? html`<th class="num">Cost</th>` : ""}<th></th></tr></thead><tbody>
      ${entries.map((e) => { const r = owner ? rateFor(rates, e.staff_id, e.work_date) : null; return html`<tr><td>${fdate(e.work_date)}</td><td>${personName(byId[e.staff_id])}</td><td>${e.note || ""}</td><td class="num">${Number(e.hours)}</td>
        ${owner ? html`<td class="num">${r == null ? html`<span class="p-neg">no rate</span>` : money(Math.round(Number(e.hours) * r))}</td>` : ""}
        <td>${owner || e.created_by === me.user.id ? html`<button type="button" class="p-linkbtn p-linkbtn--danger" data-delhours="${e.id}">Remove</button>` : ""}</td></tr>`; })}
    </tbody></table><p class="p-hint">Total ${hrs(entries.reduce((a, e) => a + Number(e.hours), 0))}</p>` : html`<p class="p-muted">No hours logged yet.</p>`}
    ${active.length ? html`<form class="p-form" id="hoursform" style="margin-top:12px">
      <div class="p-grid3">
        <label class="p-field"><span>Technician</span><select name="staff_id" required>${active.map((t) => html`<option value="${t.id}" ${t.id === (owner ? ro.assigned_staff_id : me.user.id) ? raw("selected") : ""}>${personName(t)}</option>`)}</select></label>
        <label class="p-field"><span>Date</span><input name="work_date" type="date" required value="${localToday()}"></label>
        <label class="p-field"><span>Hours</span><input name="hours" type="number" step="0.25" min="0.25" max="24" required placeholder="2.5"></label>
      </div>
      <label class="p-field"><span>Work done (optional)</span><input name="note" maxlength="300" placeholder="Replaced front bumper cover"></label>
      <button class="p-btn" type="submit">Log hours</button>
    </form>` : html`<p class="p-hint">Invite your technicians under <a href="#/staff">Staff</a> to log hours.</p>`}
  </div>`;
}
function wireHours(ro) {
  $("#hoursform")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const h = Number(f.hours);
    if (!(h > 0 && h <= 24)) return toast("Enter hours between 0.25 and 24.", "err");
    busy(e.submitter, async () => {
      const { error } = await sb.from("time_entries").insert({ ro_id: ro.id, staff_id: f.staff_id, work_date: f.work_date, hours: h, note: nn(f.note), created_by: me.user.id });
      if (error) return toast(errMsg(error), "err");
      toast("Hours logged."); run();
    });
  });
  $$("[data-delhours]").forEach((b) => b.addEventListener("click", () => busy(b, async () => {
    if (!confirm("Remove these hours?")) return;
    const { error } = await sb.from("time_entries").delete().eq("id", b.dataset.delhours);
    if (error) return toast(errMsg(error), "err");
    run();
  })));
}
function wireJobCosts(ro, expenses) {
  $("#addcost")?.addEventListener("click", () => expenseDialog(null, { roId: ro.id }));
  $$("[data-editexp]").forEach((b) => b.addEventListener("click", () => expenseDialog(expenses.find((x) => x.id === b.dataset.editexp), { roId: ro.id })));
}

// Owner + staff accounts: they are the technicians. Names only (no money), so staff may load it too.
const personName = (p) => (p ? p.full_name || p.email || "" : "");
async function shopPeople() {
  const people = must(await sb.from("profiles").select("id,full_name,email,role,disabled").in("role", ["owner", "staff"]));
  return people.sort((a, b) => personName(a).localeCompare(personName(b)));
}
async function recentRos() {
  const ros = must(await sb.from("repair_orders").select("id,number,customer_id").order("created_at", { ascending: false }).limit(200));
  return { ros, custs: await byIds("customers", ros.map((r) => r.customer_id), "id,full_name") };
}
const roOptions = (ros, custs, sel) => html`<option value="">No job</option>${ros.map((r) => html`<option value="${r.id}" ${r.id === sel ? raw("selected") : ""}>#${r.number} ${custs[r.customer_id]?.full_name || ""}</option>`)}`;

// Add / edit a cost paid any way except a portal check. `pick` = {ros, custs} shows a job picker.
function expenseDialog(x, { roId = null, pick = null } = {}) {
  const d = dialog(html`<form class="p-form"><h2>${x ? "Edit cost" : "Add a cost"}</h2>
    <div class="p-grid2">
      <label class="p-field"><span>Paid to *</span><input name="vendor" required maxlength="120" value="${x?.vendor || ""}" placeholder="LKQ, dealer, PPG"></label>
      <label class="p-field"><span>Date</span><input name="expense_date" type="date" required value="${x?.expense_date || localToday()}"></label>
    </div>
    <label class="p-field"><span>What for</span><input name="description" maxlength="300" value="${x?.description || ""}" placeholder="Front bumper cover and clips"></label>
    <div class="p-grid3">
      <label class="p-field"><span>Category</span><select name="category">${CHECK_CATEGORIES.map(([k, l]) => html`<option value="${k}" ${k === (x?.category || "parts") ? raw("selected") : ""}>${l}</option>`)}</select></label>
      <label class="p-field"><span>Paid with</span><select name="paid_with">${PAID_WITH.map(([k, l]) => html`<option value="${k}" ${k === (x?.paid_with || "card") ? raw("selected") : ""}>${l}</option>`)}</select></label>
      <label class="p-field"><span>Amount $ *</span><input name="amount" inputmode="decimal" required value="${x ? (x.amount_cents / 100).toFixed(2) : ""}" placeholder="0.00"></label>
    </div>
    <div class="p-grid2">
      <label class="p-field"><span>Vendor invoice # (optional)</span><input name="reference" maxlength="80" value="${x?.reference || ""}"></label>
      ${pick ? html`<label class="p-field"><span>Job</span><select name="ro_id">${roOptions(pick.ros, pick.custs, x?.ro_id)}</select></label>` : ""}
    </div>
    <div class="p-row"><button class="p-btn p-btn--go" type="submit">Save</button>${x ? html`<button class="p-btn p-btn--danger" type="button" id="delexp">Delete</button>` : ""}<button class="p-btn" type="button" data-close>Cancel</button></div>
  </form>`);
  d.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const cents = parseCents(f.amount);
    if (cents == null) return toast("Enter the amount, like 412.50.", "err");
    const row = { vendor: f.vendor, expense_date: f.expense_date, description: nn(f.description), category: f.category, paid_with: f.paid_with,
      amount_cents: cents, reference: nn(f.reference), ro_id: pick ? nn(f.ro_id) : (x ? x.ro_id : roId) };
    busy(e.submitter, async () => {
      const r = x ? await sb.from("expenses").update(row).eq("id", x.id) : await sb.from("expenses").insert({ ...row, created_by: me.user.id });
      if (r.error) return toast(errMsg(r.error), "err");
      d.close(); toast("Saved."); run();
    });
  });
  d.querySelector("#delexp")?.addEventListener("click", (e) => busy(e.target, async () => {
    if (!confirm("Delete this cost?")) return;
    const { error } = await sb.from("expenses").delete().eq("id", x.id);
    if (error) return toast(errMsg(error), "err");
    d.close(); run();
  }));
}

// All spending for a month: expenses entered here + checks written in the portal.
async function expensesView(q) {
  if (!isOwner()) return ownerOnly();
  const m = monthOf(q), from = m + "-01", to = shiftMonth(m, 1) + "-01";
  const [exps, checks, pick] = await Promise.all([
    sb.from("expenses").select("*").gte("expense_date", from).lt("expense_date", to).order("expense_date").then(must),
    sb.from("checks").select("*").neq("status", "void").gte("check_date", from).lt("check_date", to).then(must),
    recentRos(),
  ]);
  const lines = checks.length ? must(await sb.from("check_lines").select("*").in("check_id", checks.map((c) => c.id))) : [];
  const chk = Object.fromEntries(checks.map((c) => [c.id, c]));
  const roNum = await byIds("repair_orders", [...exps.map((x) => x.ro_id), ...lines.map((l) => l.ro_id)], "id,number");
  const rows = [
    ...exps.map((x) => ({ id: x.id, date: x.expense_date, from: x.vendor, what: [x.description, x.reference].filter(Boolean).join(" · "), category: x.category, how: paidWithLabel(x.paid_with), ro: x.ro_id, amount: x.amount_cents })),
    ...lines.map((l) => { const c = chk[l.check_id]; return { date: c.check_date, from: c.payee_name, what: l.description, category: l.category, how: `Check #${c.check_number}`, ro: l.ro_id, amount: l.amount_cents }; }),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const byCat = CHECK_CATEGORIES.map(([k, l]) => [l, rows.filter((r) => r.category === k).reduce((a, r) => a + r.amount, 0)]).filter(([, v]) => v);
  const total = rows.reduce((a, r) => a + r.amount, 0);
  setPage(html`<main class="p-main p-main--wide">
    <div class="p-head"><div><p class="p-crumb">Expenses</p><h1>Spending · ${monthName(m)}</h1></div>
      <div class="p-row">${monthNav("#/expenses", m)}<button class="p-btn p-btn--go" id="addexp">Add expense</button></div></div>
    <div class="p-cols"><div class="p-card">
      ${rows.length ? html`<table class="p-table"><thead><tr><th>Date</th><th>Paid to</th><th>For</th><th>Category</th><th>Paid with</th><th>Job</th><th class="num">Amount</th><th></th></tr></thead><tbody>
        ${rows.map((r) => html`<tr><td>${fdate(r.date)}</td><td><b>${r.from}</b></td><td>${r.what || ""}</td><td>${checkCategoryLabel(r.category)}</td><td>${r.how}</td>
          <td>${r.ro && roNum[r.ro] ? html`<a href="#/ro/${r.ro}">#${roNum[r.ro].number}</a>` : ""}</td><td class="num">${money(r.amount)}</td>
          <td>${r.id ? html`<button type="button" class="p-linkbtn" data-editexp="${r.id}">Edit</button>` : ""}</td></tr>`)}
      </tbody></table>` : html`<div class="p-empty">No spending recorded for ${monthName(m)}.</div>`}
      <p class="p-hint">Checks written under Checks are included automatically. Add everything else here: card, cash, bank transfer, vendor account.</p>
    </div><div class="p-card"><h2>By category</h2>
      ${byCat.length ? html`<div class="p-total" style="max-width:none">${byCat.map(([l, v]) => html`<span>${l}</span><span class="num">${money(v)}</span>`)}<b>Total</b><b class="num">${money(total)}</b></div>` : html`<p class="p-muted">Nothing yet.</p>`}
    </div></div>
  </main>`);
  wireMonth("#/expenses");
  $("#addexp").addEventListener("click", () => expenseDialog(null, { pick }));
  $$("[data-editexp]").forEach((b) => b.addEventListener("click", () => expenseDialog(exps.find((x) => x.id === b.dataset.editexp), { pick })));
}

// Profit on every job invoiced in a month, and hours/labor cost per technician on those jobs.
async function profitView(q) {
  if (!isOwner()) return ownerOnly();
  const m = monthOf(q);
  const [y, mo] = m.split("-").map(Number);
  const invs = await fetchAll(() => sb.from("estimates").select("id,ro_id").eq("kind", "invoice")
    .gte("created_at", new Date(y, mo - 1, 1).toISOString()).lt("created_at", new Date(y, mo, 1).toISOString()).order("id"));
  const roIds = [...new Set(invs.map((i) => i.ro_id))];
  const head = html`<div class="p-head"><div><p class="p-crumb">Job profit</p><h1>Job profit · ${monthName(m)}</h1></div>${monthNav("#/profit", m)}</div>`;
  if (!roIds.length) {
    setPage(html`<main class="p-main">${head}<div class="p-empty">No jobs were invoiced in ${monthName(m)}.</div></main>`);
    return wireMonth("#/profit");
  }
  const [ros, ests, entries, exps, clines, rates, techs] = await Promise.all([
    fetchIn("repair_orders", "id", roIds),
    fetchIn("estimates", "ro_id", roIds),
    fetchIn("time_entries", "ro_id", roIds),
    fetchIn("expenses", "ro_id", roIds),
    fetchIn("check_lines", "ro_id", roIds),
    fetchAll(() => sb.from("staff_rates").select("*").order("id")),
    shopPeople(),
  ]);
  ests.sort(byCreated); // jobNumbers takes the latest approved estimate
  const [items, chks, custs, vehs] = await Promise.all([
    fetchIn("estimate_items", "estimate_id", ests.map((e) => e.id)),
    fetchIn("checks", "id", clines.map((l) => l.check_id), "id,status").then(indexById),
    fetchIn("customers", "id", ros.map((r) => r.customer_id), "id,full_name").then(indexById),
    fetchIn("vehicles", "id", ros.map((r) => r.vehicle_id), "id,year,make,model").then(indexById),
  ]);
  const live = clines.filter((l) => chks[l.check_id]?.status !== "void");
  const techName = Object.fromEntries(techs.map((t) => [t.id, personName(t)]));
  const jobs = ros.map((r) => ({ r, n: jobNumbers({ estimates: ests.filter((e) => e.ro_id === r.id), items, expenses: exps.filter((x) => x.ro_id === r.id),
    checkLines: live.filter((l) => l.ro_id === r.id), entries: entries.filter((e) => e.ro_id === r.id), rates }) })).sort((a, b) => a.r.number - b.r.number);
  const tot = jobs.reduce((a, { n }) => ({ revenue: a.revenue + n.revenue, labor: a.labor + n.cost.labor, other: a.other + n.totalCost - n.cost.labor, profit: a.profit + n.profit }), { revenue: 0, labor: 0, other: 0, profit: 0 });
  const perTech = techs.map((t) => {
    const mine = entries.filter((e) => e.staff_id === t.id);
    return { t, jobs: new Set(mine.map((e) => e.ro_id)).size, hours: mine.reduce((a, e) => a + Number(e.hours), 0),
      cost: mine.reduce((a, e) => a + Math.round(Number(e.hours) * (rateFor(rates, e.staff_id, e.work_date) || 0)), 0) };
  }).filter((x) => x.hours);
  setPage(html`<main class="p-main p-main--wide">${head}
    <div class="p-stats">
      <div><span>Charged (before tax) · ${jobs.length} job${jobs.length === 1 ? "" : "s"}</span><b>${money(tot.revenue)}</b></div>
      <div><span>Parts & other costs</span><b>${money(tot.other)}</b></div>
      <div><span>Labor cost</span><b>${money(tot.labor)}</b></div>
      <div class="${tot.profit < 0 ? "is-bad" : "is-good"}"><span>Profit${tot.revenue ? " · " + pct(tot.profit / tot.revenue) : ""}</span><b>${money(tot.profit)}</b></div>
    </div>
    <div class="p-card"><table class="p-table"><thead><tr><th>RO</th><th>Customer · vehicle</th><th>Tech</th><th class="num">Charged</th><th class="num">Parts & other</th><th class="num">Labor</th><th class="num">Profit</th><th class="num">Margin</th></tr></thead><tbody>
      ${jobs.map(({ r, n }) => html`<tr data-href="#/ro/${r.id}"><td><b>#${r.number}</b></td><td>${custs[r.customer_id]?.full_name || ""}<br><span class="p-muted">${vehicleName(vehs[r.vehicle_id])}</span></td>
        <td>${techName[r.assigned_staff_id] || ""}</td><td class="num">${money(n.revenue)}</td><td class="num">${money(n.totalCost - n.cost.labor)}</td>
        <td class="num">${money(n.cost.labor)}<br><span class="p-muted">${hrs(n.hoursWorked)}${n.missingRate ? " · no rate" : ""}</span></td>
        <td class="num ${n.profit < 0 ? "p-neg" : ""}"><b>${money(n.profit)}</b></td><td class="num ${n.profit < 0 ? "p-neg" : ""}">${pct(n.margin)}</td></tr>`)}
    </tbody></table>
    <p class="p-hint">Jobs invoiced in ${monthName(m)}. Costs only count what is linked to the job: hours logged, expenses and check lines with that repair order.</p></div>
    ${perTech.length ? html`<div class="p-card"><h2>Technicians on these jobs</h2><table class="p-table"><thead><tr><th>Technician</th><th class="num">Jobs</th><th class="num">Hours</th><th class="num">Labor cost</th></tr></thead><tbody>
      ${perTech.map((x) => html`<tr><td><b>${personName(x.t)}</b></td><td class="num">${x.jobs}</td><td class="num">${hrs(x.hours)}</td><td class="num">${money(x.cost)}</td></tr>`)}
    </tbody></table></div>` : ""}
  </main>`);
  wireMonth("#/profit");
  $$("tr[data-href]").forEach((tr) => tr.addEventListener("click", () => (location.hash = tr.dataset.href)));
}

// ---------------------------------------------------------------- checks (owner only)
const ownerOnly = () => setPage(html`<main class="p-main"><div class="p-card"><h2>Owner only</h2></div></main>`);
const localToday = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the shop's time zone
const checkBadge = (c) => c.status === "void" ? html`<span class="p-badge p-badge--red">Void</span>`
  : c.status === "cleared" ? html`<span class="p-badge p-badge--teal">Cleared</span>`
  : c.printed_at ? html`<span class="p-badge">Open</span>` : html`<span class="p-badge p-badge--amber">Not printed</span>`;

async function checksView(q) {
  if (!isOwner()) return ownerOnly();
  const banks = must(await sb.from("bank_accounts").select("*").order("created_at"));
  if (!banks.length) return bankView();
  const tab = ["open", "cleared", "void", "all"].includes(q.get("s")) ? q.get("s") : "open";
  let query = sb.from("checks").select("*").order("check_date", { ascending: false }).order("check_number", { ascending: false }).limit(300);
  if (tab !== "all") query = query.eq("status", tab === "open" ? "issued" : tab);
  const [rows, open] = await Promise.all([query.then(must), sb.from("checks").select("amount_cents").eq("status", "issued").then(must)]);
  const bankName = Object.fromEntries(banks.map((b) => [b.id, b.name + (b.last4 ? " ··" + b.last4 : "")]));
  const many = banks.length > 1;
  setPage(html`<main class="p-main p-main--wide">
    <div class="p-head"><div><p class="p-crumb">Checks</p><h1>Check register</h1></div>
      <div class="p-row"><a class="p-btn" href="#/checks/payees">Payees</a><a class="p-btn" href="#/checks/bank">Bank & printer</a><a class="p-btn p-btn--go" href="#/checks/new">Write a check</a></div></div>
    <div class="p-due" style="margin:0 0 16px"><span><b>${open.length}</b> open check${open.length === 1 ? "" : "s"} not yet cleared the bank</span><b>${money(open.reduce((a, c) => a + c.amount_cents, 0))}</b></div>
    <nav class="p-row" style="margin-bottom:16px">${[["open", "Open"], ["cleared", "Cleared"], ["void", "Void"], ["all", "All"]].map(([s, l]) => html`<a class="p-btn p-btn--sm ${s === tab ? "p-btn--dark" : ""}" href="#/checks?s=${s}">${l}</a>`)}
      ${rows.length ? html`<button class="p-btn p-btn--sm" id="csv" style="margin-left:auto">Download list (CSV)</button>` : ""}</nav>
    <div class="p-card">${rows.length ? html`<table class="p-table p-paytable"><thead><tr><th>Check</th><th>Date</th><th>Paid to</th><th>Memo</th>${many ? html`<th>Account</th>` : ""}<th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map((c) => html`<tr class="${c.status === "void" ? "is-void" : ""}">
        <td class="p-mono"><b>#${c.check_number}</b></td><td>${fdate(c.check_date)}</td><td><b>${c.payee_name}</b></td>
        <td>${c.memo || ""}${c.status === "void" ? html`<br><span class="p-muted">${c.void_reason} (${c.voided_by_name || ""}, ${fdate(c.voided_at)})</span>` : ""}</td>
        ${many ? html`<td>${bankName[c.bank_account_id] || ""}</td>` : ""}
        <td class="num">${money(c.amount_cents)}</td><td>${checkBadge(c)}</td>
        <td class="p-actions">${c.status === "void" ? "" : html`<a class="p-linkbtn" href="/print/?check=${c.id}" target="_blank" rel="noopener">Print</a>`}
          ${c.status === "issued" ? html` · <button type="button" class="p-linkbtn" data-clear="${c.id}" data-on="1">Cleared bank</button>
            · <button type="button" class="p-linkbtn" data-reprint="${c.id}" data-num="${c.check_number}">Misprinted</button>
            · <button type="button" class="p-linkbtn p-linkbtn--danger" data-voidchk="${c.id}" data-num="${c.check_number}">Void</button>` : ""}
          ${c.status === "cleared" ? html` · <button type="button" class="p-linkbtn" data-clear="${c.id}" data-on="0">Not cleared</button>` : ""}</td>
      </tr>`)}
    </tbody></table>` : html`<div class="p-empty">${tab === "open" ? html`No open checks. <a href="#/checks/new">Write a check</a>.` : "Nothing here."}</div>`}</div>
  </main>`);
  $("#csv")?.addEventListener("click", () => {
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["Check number", "Date", "Payee", "Amount", "Status", "Memo", "Account"].map(cell).join(",")]
      .concat(rows.map((c) => [c.check_number, c.check_date, c.payee_name, (c.amount_cents / 100).toFixed(2), c.status === "issued" ? "open" : c.status, c.memo, bankName[c.bank_account_id]].map(cell).join(",")));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/csv" }));
    a.download = `checks-${tab}-${localToday()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $$("[data-clear]").forEach((b) => b.addEventListener("click", () => busy(b, async () => {
    const { error } = await sb.rpc("set_check_cleared", { p_check: b.dataset.clear, p_cleared: b.dataset.on === "1" });
    if (error) return toast(errMsg(error), "err");
    run();
  })));
  $$("[data-reprint]").forEach((b) => b.addEventListener("click", () => {
    const d = dialog(html`<h2>Check #${b.dataset.num} misprinted?</h2>
      <p>Check #${b.dataset.num} will be marked <b>void</b> and the same check copied onto the next number. Write VOID across the spoiled paper and keep it for your records.</p>
      <div class="p-row"><button class="p-btn p-btn--go" id="go">Void it and copy to next check</button><button class="p-btn" data-close>Cancel</button></div>`);
    d.querySelector("#go").addEventListener("click", (e) => busy(e.target, async () => {
      const { data, error } = await sb.rpc("reprint_check", { p_check: b.dataset.reprint });
      if (error) return toast(errMsg(error), "err");
      d.close();
      checkSavedDialog(typeof data === "string" ? JSON.parse(data) : data);
    }));
  }));
  $$("[data-voidchk]").forEach((b) => b.addEventListener("click", () => {
    const d = dialog(html`<form class="p-form" id="voidform"><h2>Void check #${b.dataset.num}?</h2>
      <p class="p-hint">Use this when a check is lost, written wrong or never sent. It stays in the register, marked void. If it was already mailed, also ask the bank to stop payment.</p>
      <label class="p-field"><span>Reason</span><input name="reason" maxlength="300" required placeholder="Wrong amount, rewritten"></label>
      <div class="p-row"><button class="p-btn p-btn--danger" type="submit">Void check</button><button class="p-btn" type="button" data-close>Cancel</button></div></form>`);
    d.querySelector("#voidform").addEventListener("submit", (e) => {
      e.preventDefault();
      busy(e.submitter, async () => {
        const { error } = await sb.rpc("void_check", { p_check: b.dataset.voidchk, p_reason: d.querySelector("[name=reason]").value.trim() });
        if (error) return toast(errMsg(error), "err");
        d.close(); toast("Check voided."); run();
      });
    });
  }));
}

function checkSavedDialog(r, { again = false } = {}) {
  const d = dialog(html`<h2>Check #${r.check_number} is ready</h2>
    <p>Put check <b class="p-mono">#${r.check_number}</b> in the printer first. The number printed on the paper must match.</p>
    <p class="p-hint">In the print window choose <b>Scale 100%</b> (or "Actual size") and <b>Margins: None</b>. Sign the check by hand.</p>
    <div class="p-row"><a class="p-btn p-btn--go" href="/print/?check=${r.id}" target="_blank" rel="noopener">Print check #${r.check_number}</a>
      ${again ? html`<button class="p-btn" id="again">Write another</button>` : ""}<button class="p-btn" data-close>Done</button></div>`);
  d.querySelector("#again")?.addEventListener("click", () => { d.dataset.next = "#/checks/new"; d.close(); });
  d.addEventListener("close", () => go(d.dataset.next || "#/checks"));
}

function payeeDialog(p, onSaved) {
  const d = dialog(html`<form class="p-form"><h2>${p ? "Edit payee" : "New payee"}</h2>
    <label class="p-field"><span>Name on the check *</span><input name="name" required maxlength="120" value="${p?.name || ""}" placeholder="LKQ Corporation"></label>
    <p class="p-hint" style="margin:4px 0 0">Mailing address: prints in the envelope window.</p>
    ${addressFields(p || {})}
    <div class="p-grid2">
      <label class="p-field"><span>Phone</span><input name="phone" type="tel" maxlength="40" value="${p?.phone || ""}"></label>
      ${p ? html`<label class="p-check" style="align-self:end"><input type="checkbox" name="active" ${p.active ? raw("checked") : ""}> Show in the payee list</label>` : ""}
    </div>
    <label class="p-field"><span>Notes (account number with them, terms)</span><input name="notes" maxlength="1000" value="${p?.notes || ""}"></label>
    <div class="p-row"><button class="p-btn p-btn--go" type="submit">Save payee</button><button class="p-btn" type="button" data-close>Cancel</button></div>
  </form>`);
  d.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const row = { name: f.name, ...addressRow(f), phone: nn(f.phone), notes: nn(f.notes), ...(p ? { active: f.active === "on" } : {}) };
    busy(e.submitter, async () => {
      const r = p ? await sb.from("payees").update(row).eq("id", p.id).select("*").single() : await sb.from("payees").insert(row).select("*").single();
      if (r.error) return toast(errMsg(r.error), "err");
      d.close(); onSaved(r.data);
    });
  });
}

async function payeesView() {
  if (!isOwner()) return ownerOnly();
  const rows = must(await sb.from("payees").select("*").order("name"));
  setPage(html`<main class="p-main">
    <p class="p-crumb"><a href="#/checks">Checks</a> /</p>
    <div class="p-head"><h1>Payees</h1><button class="p-btn p-btn--go" id="add">Add payee</button></div>
    <div class="p-card">${rows.length ? html`<table class="p-table"><thead><tr><th>Name</th><th>Address</th><th>Phone</th><th></th></tr></thead><tbody>
      ${rows.map((p) => html`<tr><td><b>${p.name}</b>${p.active ? "" : html` <span class="p-badge">hidden</span>`}${p.notes ? html`<br><span class="p-muted">${p.notes}</span>` : ""}</td>
        <td>${addressText(p)}</td><td>${p.phone || ""}</td>
        <td><button class="p-btn p-btn--sm" data-edit="${p.id}">Edit</button></td></tr>`)}
    </tbody></table>` : html`<div class="p-empty">No payees yet. Add the vendors, landlord and others you pay by check.</div>`}</div>
  </main>`);
  $("#add").addEventListener("click", () => payeeDialog(null, () => run()));
  $$("[data-edit]").forEach((b) => b.addEventListener("click", () => payeeDialog(rows.find((p) => p.id === b.dataset.edit), () => run())));
}

async function bankView() {
  if (!isOwner()) return ownerOnly();
  const banks = must(await sb.from("bank_accounts").select("*").order("created_at"));
  const form = (b = {}) => html`<form class="p-card p-form" data-bank="${b.id || ""}">
    <h2>${b.id ? b.name : banks.length ? "Add another account" : "Your checking account"}</h2>
    <div class="p-grid3">
      <label class="p-field"><span>Name *</span><input name="name" required maxlength="80" value="${b.name || ""}" placeholder="Operating account"></label>
      <label class="p-field"><span>Bank</span><input name="bank_name" maxlength="80" value="${b.bank_name || ""}"></label>
      <label class="p-field"><span>Last 4 digits of account</span><input name="last4" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" value="${b.last4 || ""}"></label>
    </div>
    <label class="p-field" style="max-width:280px"><span>Next check number *</span><input name="next_check_number" type="number" min="1" max="99999999" required value="${b.next_check_number || ""}" placeholder="Number on the next blank check"></label>
    <h3>Printer alignment</h3>
    <p class="p-hint">If the print lands off the lines, move it here. Use a minus number to move left / up. 0.10 inch is about 2.5 mm.</p>
    <div class="p-grid2" style="max-width:520px">
      <label class="p-field"><span>Move right (inches)</span><input name="offset_x_in" type="number" step="0.01" min="-1" max="1" value="${b.offset_x_in ?? 0}"></label>
      <label class="p-field"><span>Move down (inches)</span><input name="offset_y_in" type="number" step="0.01" min="-1" max="1" value="${b.offset_y_in ?? 0}"></label>
    </div>
    ${b.id ? html`<label class="p-check"><input type="checkbox" name="active" ${b.active ? raw("checked") : ""}> In use</label>` : ""}
    <div class="p-row"><button class="p-btn p-btn--go" type="submit">Save</button>
      ${b.id ? html`<a class="p-btn" href="/print/?checktest=${b.id}" target="_blank" rel="noopener">Print a test on plain paper</a>` : ""}</div>
  </form>`;
  setPage(html`<main class="p-main">
    <p class="p-crumb"><a href="#/checks">Checks</a> /</p>
    <div class="p-head"><h1>${banks.length ? "Bank & printer" : "Set up check printing"}</h1></div>
    ${banks.length ? "" : html`<div class="p-card"><h2>Before you start</h2>
      <p>Order <b>voucher checks for QuickBooks</b> (check on top, two stubs below) from your bank or a check printer. Those come with your bank details and check numbers already printed, so this website never needs your full account number. Leftover QuickBooks checks work too.</p>
      <p class="p-hint">After saving, print a test on plain paper and hold it behind a blank check up to the light to check the lines up.</p></div>`}
    ${banks.map((b) => form(b))}
    ${banks.length ? html`<details><summary class="p-btn p-btn--sm" style="display:inline-flex;margin-bottom:12px">Add another account</summary>${form()}</details>` : form()}
  </main>`);
  $$("form[data-bank]").forEach((f) => f.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = formData(f);
    if (v.last4 && !/^[0-9]{4}$/.test(v.last4)) return toast("Last 4 digits only, like 1234.", "err");
    const row = { name: v.name, bank_name: nn(v.bank_name), last4: nn(v.last4), next_check_number: Number(v.next_check_number),
      offset_x_in: Number(v.offset_x_in || 0), offset_y_in: Number(v.offset_y_in || 0), ...(f.dataset.bank ? { active: v.active === "on" } : {}) };
    busy(e.submitter, async () => {
      const r = f.dataset.bank ? await sb.from("bank_accounts").update(row).eq("id", f.dataset.bank) : await sb.from("bank_accounts").insert(row);
      if (r.error) return toast(errMsg(r.error), "err");
      toast("Saved.");
      if (!banks.length) location.hash = "#/checks"; else run();
    });
  }));
}

async function writeCheckView(q) {
  if (!isOwner()) return ownerOnly();
  const [banks, payees, { ros, custs }] = await Promise.all([
    sb.from("bank_accounts").select("*").eq("active", true).order("created_at").then(must),
    sb.from("payees").select("*").eq("active", true).order("name").then(must),
    recentRos(),
  ]);
  if (!banks.length) return bankView();
  const preRo = q.get("ro");
  const roOpts = (sel) => roOptions(ros, custs, sel);
  const lineRow = (l = {}) => html`<tr data-row>
    <td><input name="description" maxlength="120" required value="${l.description || ""}" placeholder="Invoice 44812"></td>
    <td><select name="category">${CHECK_CATEGORIES.map(([k, lb]) => html`<option value="${k}" ${k === (l.category || "parts") ? raw("selected") : ""}>${lb}</option>`)}</select></td>
    <td><select name="ro_id">${roOpts(l.ro_id)}</select></td>
    <td><input name="amount" inputmode="decimal" required placeholder="0.00"></td>
    <td><button type="button" class="p-linkbtn" data-rmrow aria-label="Remove line">Remove</button></td>
  </tr>`;
  setPage(html`<main class="p-main">
    <p class="p-crumb"><a href="#/checks">Checks</a> /</p><h1>Write a check</h1>
    <form class="p-card p-form" id="chk" style="max-width:920px">
      <div class="p-grid3">
        <label class="p-field" ${banks.length > 1 ? "" : raw("hidden")}><span>From account</span><select name="bank" id="bank">${banks.map((b) => html`<option value="${b.id}">${b.name}${b.last4 ? " ··" + b.last4 : ""}</option>`)}</select></label>
        <label class="p-field"><span>Check number (on the paper)</span><input name="number" id="num" type="number" min="1" max="99999999" required value="${banks[0].next_check_number}"></label>
        <label class="p-field"><span>Date</span><input name="date" type="date" required value="${localToday()}"></label>
      </div>
      <div class="p-row" style="align-items:end">
        <label class="p-field" style="flex:1;min-width:240px"><span>Pay to the order of *</span><select name="payee" id="payee" required>
          <option value="">Choose a payee</option>${payees.map((p) => html`<option value="${p.id}">${p.name}</option>`)}</select></label>
        <button type="button" class="p-btn" id="newpayee">New payee</button>
      </div>
      <label class="p-field"><span>Memo (prints on the check)</span><input name="memo" maxlength="120" placeholder="Account 5521 · September parts"></label>
      <h3>What it pays for</h3>
      <p class="p-hint">These lines print on both stubs. Link a line to a job to see what each car cost you.</p>
      <table class="p-table"><thead><tr><th>Description</th><th style="width:170px">Category</th><th style="width:190px">Job</th><th style="width:120px">Amount $</th><th></th></tr></thead>
        <tbody data-rows>${lineRow({ ro_id: preRo })}</tbody></table>
      <button type="button" class="p-btn p-btn--sm" id="addrow">Add line</button>
      <div class="p-due"><span id="words" class="p-mono">Zero and 00/100 dollars</span><b id="total">${money(0)}</b></div>
      <div class="p-row"><button class="p-btn p-btn--go" type="submit">Save & print check</button><a class="p-btn" href="#/checks">Cancel</a></div>
    </form>
  </main>`);
  const form = $("#chk");
  const readLines = () => $$("tr[data-row]").map((tr) => ({
    description: tr.querySelector("[name=description]").value.trim(),
    category: tr.querySelector("[name=category]").value,
    ro_id: tr.querySelector("[name=ro_id]").value || null,
    amount_cents: parseCents(tr.querySelector("[name=amount]").value),
  }));
  const recalc = () => {
    const t = readLines().reduce((a, l) => a + (l.amount_cents || 0), 0);
    $("#total").textContent = money(t);
    $("#words").textContent = amountWords(t) + " dollars";
  };
  form.addEventListener("input", recalc);
  $("#bank").addEventListener("change", (e) => { $("#num").value = banks.find((b) => b.id === e.target.value).next_check_number; });
  $("#addrow").addEventListener("click", () => {
    if ($$("tr[data-row]").length >= 10) return toast("The check stub fits up to 10 lines.", "err");
    form.querySelector("[data-rows]").insertAdjacentHTML("beforeend", String(lineRow()));
  });
  form.addEventListener("click", (e) => {
    if (e.target.matches("[data-rmrow]") && $$("tr[data-row]").length > 1) { e.target.closest("tr").remove(); recalc(); }
  });
  $("#newpayee").addEventListener("click", () => payeeDialog(null, (p) => {
    $("#payee").insertAdjacentHTML("beforeend", String(html`<option value="${p.id}">${p.name}</option>`));
    $("#payee").value = p.id;
  }));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formData(form);
    const lines = readLines();
    if (lines.some((l) => !l.description)) return toast("Every line needs a description.", "err");
    if (lines.some((l) => l.amount_cents == null)) return toast("Every line needs an amount, like 412.50.", "err");
    const bank = banks.find((b) => b.id === f.bank);
    const num = Number(f.number);
    busy(e.submitter, async () => {
      const { data, error } = await sb.rpc("issue_check", { p_bank: bank.id, p_payee: f.payee, p_date: f.date, p_memo: nn(f.memo), p_lines: lines,
        p_number: num === bank.next_check_number ? null : num });
      if (error) return toast(errMsg(error), "err");
      checkSavedDialog(typeof data === "string" ? JSON.parse(data) : data, { again: true });
    });
  });
}

// ---------------------------------------------------------------- reading lots of rows
// Supabase returns at most 1,000 rows per request: page through so nothing is silently left out.
async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = must(await build().range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
// Rows whose `col` is one of `ids`, asked for 100 ids at a time so the request stays short.
async function fetchIn(table, col, ids, cols = "*") {
  const u = [...new Set(ids.filter(Boolean))], out = [];
  for (let i = 0; i < u.length; i += 100) out.push(...(await fetchAll(() => sb.from(table).select(cols).in(col, u.slice(i, i + 100)).order("id"))));
  return out;
}
const indexById = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));
const byCreated = (a, b) => String(a.created_at).localeCompare(String(b.created_at));

// ---------------------------------------------------------------- backups (owner only)
// Monthly zip (photos + readable job pages + spreadsheets) and a full data export, saved to the
// shop's own computer. Nothing is deleted from the portal.
const dollars = (c) => (c == null ? "" : (Number(c) / 100).toFixed(2));
// Excel-friendly CSV (the BOM makes Excel read accents correctly)
function csv(head, rows) {
  const cell = (v) => { const s = v == null ? "" : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
// Plain letters only in file names: some unzip tools (including Windows') garble accents.
const safeName = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 #._-]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 60) || "item";
function saveBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
const mb = (bytes) => (bytes / 1048576).toFixed(1) + " MB";

function progressDialog(title) {
  let cancelled = false;
  const d = dialog(html`<h2>${title}</h2><p data-msg>Reading records…</p><progress data-bar style="width:100%"></progress>
    <p class="p-hint">Keep this tab open until it finishes.</p><div class="p-row"><button class="p-btn" data-close>Cancel</button></div>`);
  d.addEventListener("close", () => { cancelled = true; run(); });
  return {
    get cancelled() { return cancelled; },
    step(msg, value, max) {
      d.querySelector("[data-msg]").textContent = msg;
      const bar = d.querySelector("[data-bar]");
      if (max) { bar.max = max; bar.value = value; } else bar.removeAttribute("value");
    },
    finish(content) {
      d.innerHTML = String(content);
      d.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => d.close()));
    },
  };
}
async function logBackup(row) {
  const { error } = await sb.from("backups").insert({ ...row, created_by: me.user.id, created_by_name: me.profile?.full_name || me.user.email });
  if (error) toast("The backup downloaded, but it could not be logged: " + errMsg(error), "err");
}

async function backupsView() {
  if (!isOwner()) return ownerOnly();
  const thisMonth = localToday().slice(0, 7);
  const months = Array.from({ length: 24 }, (_, i) => shiftMonth(thisMonth, -i));
  const [y, mo] = months[months.length - 1].split("-").map(Number);
  const [ros, log] = await Promise.all([
    fetchAll(() => sb.from("repair_orders").select("id,created_at,status").gte("created_at", new Date(y, mo - 1, 1).toISOString()).order("id")),
    sb.from("backups").select("*").order("created_at", { ascending: false }).limit(1000).then(must),
  ]);
  const monthOfTs = (ts) => new Date(ts).toLocaleDateString("en-CA").slice(0, 7);
  const rows = months.map((m) => {
    const mine = ros.filter((r) => monthOfTs(r.created_at) === m);
    return { m, jobs: mine.length, open: mine.filter((r) => r.status !== "delivered").length, last: log.find((b) => b.kind === "month" && b.month === m) };
  });
  const lastFull = log.find((b) => b.kind === "full");
  setPage(html`<main class="p-main">
    <div class="p-head"><div><p class="p-crumb">Backups</p><h1>Backups</h1></div></div>
    <div class="p-card"><h2>Monthly backup</h2>
      <p>One zip per month: every repair order opened that month (its photos, plus a page with estimates, invoices, payments, hours, costs and timeline that opens in any browser) and spreadsheets of that month's payments, expenses, checks and hours.</p>
      <p class="p-hint">Download each month around the 5th of the next month, once its cars are picked up. Keep two copies: this computer plus an external drive or a cloud folder. Nothing is deleted from the portal.</p>
      <div class="p-row" style="margin-bottom:12px"><input class="p-input" type="month" id="anymonth" max="${thisMonth}" style="max-width:190px"><button class="p-btn" id="dlany">Download that month</button></div>
      <table class="p-table"><thead><tr><th>Month</th><th class="num">Jobs opened</th><th>Cars</th><th>Last downloaded</th><th></th></tr></thead><tbody>
        ${rows.map((r) => html`<tr><td><b>${monthName(r.m)}</b></td><td class="num">${r.jobs}</td>
          <td>${r.open ? html`<span class="p-badge p-badge--amber">${r.open} still in shop</span>` : r.jobs ? html`<span class="p-badge p-badge--teal">all picked up</span>` : ""}</td>
          <td>${r.last ? html`${fdate(r.last.created_at)} <span class="p-muted">· ${r.last.created_by_name || ""} · ${r.last.photos ?? 0} photos</span>` : html`<span class="p-muted">never</span>`}</td>
          <td><button class="p-btn p-btn--sm ${r.last || !r.jobs ? "" : "p-btn--go"}" data-month="${r.m}">Download zip</button></td></tr>`)}
      </tbody></table>
    </div>
    <div class="p-card"><h2>Full data export</h2>
      <p>Every record in the portal (customers, vehicles, repair orders, estimates, invoices, payments, checks, expenses, hours, staff) as data files a developer can load back into a new database, plus the same as spreadsheets. Photos are not in it; they are in the monthly zips.</p>
      <p class="p-hint">Last export: ${lastFull ? html`${ftime(lastFull.created_at)} by ${lastFull.created_by_name || ""}` : "never"}. Do this once a month too, and keep it with the monthly zips.</p>
      <button class="p-btn p-btn--go" id="full">Download full export</button>
    </div>
  </main>`);
  $$("[data-month]").forEach((b) => b.addEventListener("click", () => monthBackup(b.dataset.month)));
  $("#dlany").addEventListener("click", () => { const m = $("#anymonth").value; if (!m) return toast("Pick a month first.", "err"); monthBackup(m); });
  $("#full").addEventListener("click", () => fullExport());
}

async function monthBackup(m) {
  const p = progressDialog(`Backup · ${monthName(m)}`);
  try {
    const [y, mo] = m.split("-").map(Number);
    const start = new Date(y, mo - 1, 1).toISOString(), end = new Date(y, mo, 1).toISOString();
    const from = m + "-01", to = shiftMonth(m, 1) + "-01";
    const inMonth = (table, col, a, b) => fetchAll(() => sb.from(table).select("*").gte(col, a).lt(col, b).order("id"));
    const ros = (await inMonth("repair_orders", "created_at", start, end)).sort((a, b) => a.number - b.number);
    const ids = ros.map((r) => r.id);
    const [events, photos, ests, roPays, roHours, roExps, roLines, rates, people, monthPays, monthExps, monthChecks, monthHours] = await Promise.all([
      fetchIn("ro_events", "ro_id", ids), fetchIn("photos", "ro_id", ids), fetchIn("estimates", "ro_id", ids), fetchIn("payments", "ro_id", ids),
      fetchIn("time_entries", "ro_id", ids), fetchIn("expenses", "ro_id", ids), fetchIn("check_lines", "ro_id", ids),
      fetchAll(() => sb.from("staff_rates").select("*").order("id")), shopPeople(),
      inMonth("payments", "created_at", start, end), inMonth("expenses", "expense_date", from, to),
      inMonth("checks", "check_date", from, to), inMonth("time_entries", "work_date", from, to),
    ]);
    const known = new Set(ids);
    const [items, monthLines, roChecks, otherRos] = await Promise.all([
      fetchIn("estimate_items", "estimate_id", ests.map((e) => e.id)),
      fetchIn("check_lines", "check_id", monthChecks.map((c) => c.id)),
      fetchIn("checks", "id", roLines.map((l) => l.check_id)).then(indexById),
      fetchIn("repair_orders", "id", [...monthPays, ...monthExps, ...monthHours].map((x) => x.ro_id).filter((id) => id && !known.has(id))),
    ]);
    const lineRoIds = monthLines.map((l) => l.ro_id).filter((id) => id && !known.has(id) && !otherRos.some((r) => r.id === id));
    const allRos = indexById([...ros, ...otherRos, ...(await fetchIn("repair_orders", "id", lineRoIds))]);
    const roList = Object.values(allRos);
    const [custs, vehs] = await Promise.all([
      fetchIn("customers", "id", roList.map((r) => r.customer_id)).then(indexById),
      fetchIn("vehicles", "id", roList.map((r) => r.vehicle_id)).then(indexById),
    ]);
    const who = indexById(people);
    const roNum = (id) => (id && allRos[id] ? allRos[id].number : "");
    const custOf = (roId) => custs[allRos[roId]?.customer_id]?.full_name || "";

    const zip = zipWriter();
    const missing = [], jobRows = [], photoIndex = [];
    let photoCount = 0;
    for (let i = 0; i < ros.length; i++) {
      const r = ros[i], cust = custs[r.customer_id], veh = vehs[r.vehicle_id];
      const folder = safeName(`RO-${r.number} ${cust?.full_name || ""}`);
      const rp = photos.filter((x) => x.ro_id === r.id).sort(byCreated);
      const files = [];
      for (let k = 0; k < rp.length; k++) {
        if (p.cancelled) return;
        p.step(`Job ${i + 1} of ${ros.length} (RO #${r.number}): photo ${k + 1} of ${rp.length}`, i, ros.length);
        const ext = safeName(rp[k].storage_path.split(".").pop() || "jpg").toLowerCase();
        const file = `${String(k + 1).padStart(3, "0")}_${String(rp[k].created_at).slice(0, 10)}.${ext}`;
        const { data, error } = await sb.storage.from("photos").download(rp[k].storage_path);
        if (error || !data) { missing.push(`${folder}/photos/${file}`); continue; }
        await zip.add(`${folder}/photos/${file}`, data);
        files.push(file); photoCount++;
        photoIndex.push([`${folder}/photos/${file}`, rp[k].storage_path, r.number, rp[k].created_at, rp[k].visible_to_customer ? "yes" : "no"]);
      }
      if (p.cancelled) return;
      p.step(`Job ${i + 1} of ${ros.length} (RO #${r.number})`, i + 1, ros.length);
      const mineLines = roLines.filter((l) => l.ro_id === r.id && roChecks[l.check_id]?.status !== "void");
      const d = { estimates: ests.filter((e) => e.ro_id === r.id).sort(byCreated), items, expenses: roExps.filter((x) => x.ro_id === r.id),
        checkLines: mineLines, entries: roHours.filter((e) => e.ro_id === r.id), rates };
      const n = jobNumbers(d);
      await zip.add(`${folder}/job.html`, jobHtml({ r, cust, veh, who, d, n, files, roChecks,
        events: events.filter((e) => e.ro_id === r.id).sort(byCreated), pays: roPays.filter((x) => x.ro_id === r.id).sort(byCreated) }));
      jobRows.push([r.number, fdate(r.created_at), statusLabel(r.status), cust?.full_name, cust?.phone, cust?.email, vehicleName(veh), veh?.vin, veh?.plate,
        r.insurance_company, r.claim_number, personName(who[r.assigned_staff_id]), dollars(n.revenue), dollars(n.totalCost - n.cost.labor), dollars(n.cost.labor),
        dollars(n.profit), n.hoursWorked, files.length]);
    }
    p.step("Making spreadsheets…");
    await zip.add("jobs.csv", csv(["RO", "Opened", "Stage", "Customer", "Phone", "Email", "Vehicle", "VIN", "Plate", "Insurance", "Claim",
      "Technician", "Charged before tax", "Parts & other cost", "Labor cost", "Profit", "Hours worked", "Photos"], jobRows));
    await zip.add("payments.csv", csv(["Receipt", "Date", "RO", "Customer", "Method", "Reference", "Amount", "Taken by", "Voided", "Void reason"],
      monthPays.sort(byCreated).map((x) => [x.receipt_number, ftime(x.created_at), roNum(x.ro_id), custOf(x.ro_id), payMethodLabel(x.method), x.reference,
        dollars(x.amount_cents), x.received_by_name, x.voided_at ? fdate(x.voided_at) : "", x.void_reason])));
    await zip.add("expenses.csv", csv(["Date", "Paid to", "What for", "Category", "Paid with", "Vendor invoice", "RO", "Amount"],
      monthExps.sort((a, b) => a.expense_date.localeCompare(b.expense_date)).map((x) => [x.expense_date, x.vendor, x.description, checkCategoryLabel(x.category),
        paidWithLabel(x.paid_with), x.reference, roNum(x.ro_id), dollars(x.amount_cents)])));
    await zip.add("checks.csv", csv(["Check", "Date", "Payee", "Status", "Memo", "Line", "Category", "RO", "Line amount", "Check total"],
      monthChecks.sort((a, b) => a.check_number - b.check_number).flatMap((c) => monthLines.filter((l) => l.check_id === c.id).sort((a, b) => a.sort - b.sort)
        .map((l) => [c.check_number, c.check_date, c.payee_name, c.status === "issued" ? "open" : c.status, c.memo, l.description, checkCategoryLabel(l.category),
          roNum(l.ro_id), dollars(l.amount_cents), dollars(c.amount_cents)]))));
    await zip.add("hours.csv", csv(["Date", "Person", "RO", "Hours", "Work", "Cost per hour", "Cost"],
      monthHours.sort((a, b) => a.work_date.localeCompare(b.work_date)).map((e) => { const rate = rateFor(rates, e.staff_id, e.work_date);
        return [e.work_date, personName(who[e.staff_id]), roNum(e.ro_id), Number(e.hours), e.note, dollars(rate), rate == null ? "" : dollars(Math.round(Number(e.hours) * rate))]; })));
    await zip.add("photo-index.csv", csv(["File in this zip", "Storage path in the portal", "RO", "Uploaded", "Customer could see it"], photoIndex));
    await zip.add("README.txt", [
      `PARCEROS COLLISION CENTER - BACKUP FOR ${monthName(m).toUpperCase()}`,
      `Made ${ftime(new Date().toISOString())} by ${me.profile?.full_name || me.user.email}.`,
      "",
      `${ros.length} repair orders opened this month, ${photoCount} photos.`,
      "",
      "WHAT'S INSIDE",
      "  RO-#### Name/job.html    open in any web browser: customer, vehicle, estimates and invoices",
      "                           with every line, payments, hours, costs, job profit, timeline, photos",
      "  RO-#### Name/photos/     the job's photos",
      "  jobs.csv                 one row per repair order opened this month (opens in Excel)",
      "  payments.csv             money received this month (any repair order)",
      "  expenses.csv             spending entered under Expenses with a date this month",
      "  checks.csv               checks written this month, one row per stub line",
      "  hours.csv                hours worked this month, with cost",
      "  photo-index.csv          which photo file is which photo in the portal (for a developer)",
      "",
      "Jobs that were still in the shop when this was made may get more photos and payments later:",
      "download the month again once they are picked up.",
      "",
      "Keep two copies: this computer plus an external drive or a cloud folder.",
      ...(missing.length ? ["", `PHOTOS THAT COULD NOT BE DOWNLOADED (${missing.length}):`, ...missing.map((x) => "  " + x)] : []),
    ].join("\r\n"));
    const blob = zip.blob();
    saveBlob(blob, `parceros-backup-${m}.zip`);
    await logBackup({ kind: "month", month: m, jobs: ros.length, photos: photoCount, missing: missing.length, bytes: blob.size });
    p.finish(html`<h2>Backup ready</h2>
      <p><b>parceros-backup-${m}.zip</b> (${mb(blob.size)}): ${ros.length} job${ros.length === 1 ? "" : "s"}, ${photoCount} photo${photoCount === 1 ? "" : "s"}.</p>
      ${missing.length ? html`<p class="p-neg">${missing.length} photo${missing.length === 1 ? "" : "s"} could not be downloaded. They are listed in README.txt inside the zip. Try again later.</p>` : ""}
      <p class="p-hint">Move it from Downloads to your backup folder, and copy it to a second place (external drive or cloud folder).</p>
      <div class="p-row"><button class="p-btn p-btn--go" data-close>Done</button></div>`);
  } catch (e) {
    if (!p.cancelled) p.finish(html`<h2>Backup failed</h2><p>${errMsg(e)}</p><p class="p-hint">Nothing was changed in the portal. Try again.</p><div class="p-row"><button class="p-btn" data-close>Close</button></div>`);
  }
}

const JOB_CSS = `body{font:15px/1.45 system-ui,sans-serif;color:#111;max-width:900px;margin:24px auto;padding:0 16px}
header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #111;padding-bottom:10px}.r{text-align:right}
h1{margin:0;font-size:1.5rem}h2{margin:26px 0 8px;font-size:1.1rem;border-bottom:1px solid #ccc;padding-bottom:4px}h3{margin:16px 0 6px;font-size:1rem}
.two{display:grid;grid-template-columns:1fr 1fr;gap:20px}table{width:100%;border-collapse:collapse;margin:6px 0}
th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #ddd;vertical-align:top}th{font-size:.8rem;text-transform:uppercase;color:#555}
.n{text-align:right;white-space:nowrap}.void{color:#888;text-decoration:line-through}.muted{color:#666}
.ph{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}.ph img{width:100%;border-radius:6px}
footer{margin-top:30px;color:#666;font-size:.85rem}`;

// A self-contained page for one repair order, saved in the backup next to its photos.
function jobHtml({ r, cust, veh, who, d, n, files, roChecks, events, pays }) {
  const TYPE = Object.fromEntries(TYPES);
  const costs = [
    ...d.checkLines.map((l) => ({ date: roChecks[l.check_id].check_date, from: `Check #${roChecks[l.check_id].check_number} · ${roChecks[l.check_id].payee_name}`, what: l.description, category: l.category, amount: l.amount_cents })),
    ...d.expenses.map((x) => ({ date: x.expense_date, from: `${x.vendor} · ${paidWithLabel(x.paid_with)}`, what: [x.description, x.reference].filter(Boolean).join(" · "), category: x.category, amount: x.amount_cents })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return "<!doctype html>\n" + String(html`<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>RO #${r.number} · ${cust?.full_name || ""}</title><style>${raw(JOB_CSS)}</style></head><body>
<header><div><b>Parceros Collision Center</b><br>11322 Old Baltimore Pike, Beltsville, MD 20705<br>(301) 595-0888</div>
  <div class="r"><h1>Repair order #${r.number}</h1>${statusLabel(r.status)} · opened ${fdate(r.created_at)}</div></header>
<section class="two">
  <div><h2>Customer</h2><p><b>${cust?.full_name || ""}</b><br>${cust?.phone || ""}<br>${cust?.email || ""}<br>${addressText(cust)}</p></div>
  <div><h2>Vehicle</h2><p><b>${vehicleName(veh)}</b>${veh?.trim_level ? " " + veh.trim_level : ""}${veh?.color ? " · " + veh.color : ""}${veh?.vin ? html`<br>VIN ${veh.vin}` : ""}${veh?.plate ? html`<br>Plate ${veh.plate}` : ""}</p>
    <p>${r.insurance_company ? html`Insurance: ${r.insurance_company}<br>` : ""}${r.claim_number ? html`Claim: ${r.claim_number}<br>` : ""}${r.assigned_staff_id ? html`Technician: ${personName(who[r.assigned_staff_id])}<br>` : ""}${r.promised_date ? html`Promised: ${fdate(r.promised_date)}` : ""}</p></div>
</section>
${r.description ? html`<h2>Work requested</h2><p>${r.description}</p>` : ""}
<h2>Estimates & invoices</h2>
${d.estimates.length ? d.estimates.map((e) => {
    const its = d.items.filter((i) => i.estimate_id === e.id).sort((a, b) => a.sort - b.sort), t = totals(its, e.tax_rate);
    return html`<h3>${e.kind === "invoice" ? "Invoice" : "Estimate"} · ${e.status} · ${fdate(e.sent_at || e.created_at)}</h3>
  <table><tr><th>Type</th><th>Description</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Total</th></tr>
  ${its.map((i) => html`<tr><td>${TYPE[i.item_type] || ""}</td><td>${i.description}</td><td class="n">${i.qty}</td><td class="n">${money(i.unit_cents)}</td><td class="n">${money(Math.round(i.qty * i.unit_cents))}</td></tr>`)}
  <tr><td colspan="4" class="n">Tax (${Number(e.tax_rate)}% on parts & paint)</td><td class="n">${money(t.tax)}</td></tr>
  <tr><td colspan="4" class="n"><b>Total</b></td><td class="n"><b>${money(t.total)}</b></td></tr></table>
  ${e.customer_due_cents != null ? html`<p>Customer's share: ${money(e.customer_due_cents)}</p>` : ""}
  ${e.signer_name ? html`<p>${e.status === "declined" ? "Declined" : "Approved"} by ${e.signer_name} on ${ftime(e.decided_at)}</p>` : ""}
  ${e.notes ? html`<p class="muted">${e.notes}</p>` : ""}`;
  }) : html`<p class="muted">None.</p>`}
<h2>Payments</h2>
${pays.length ? html`<table><tr><th>Receipt</th><th>Date</th><th>Method</th><th>Taken by</th><th class="n">Amount</th></tr>
  ${pays.map((x) => html`<tr class="${x.voided_at ? "void" : ""}"><td>#${x.receipt_number}</td><td>${ftime(x.created_at)}</td><td>${payMethodLabel(x.method)}${x.reference ? " · " + x.reference : ""}${x.voided_at ? html`<br>VOID: ${x.void_reason}` : ""}</td><td>${x.received_by_name || ""}</td><td class="n">${money(x.amount_cents)}</td></tr>`)}</table>` : html`<p class="muted">None.</p>`}
<h2>Job profit</h2>
<table><tr><th></th><th class="n">Charged</th><th class="n">Cost</th></tr>
  ${JOB_ROWS.filter(([k]) => n.charged[k] || n.cost[k]).map(([k, l]) => html`<tr><td>${l}</td><td class="n">${money(n.charged[k])}</td><td class="n">${money(n.cost[k])}</td></tr>`)}
  <tr><td><b>Total</b> (before tax)</td><td class="n"><b>${money(n.revenue)}</b></td><td class="n"><b>${money(n.totalCost)}</b></td></tr></table>
<p><b>Profit ${money(n.profit)}</b>${n.margin != null ? ` (${pct(n.margin)})` : ""} · ${hrs(n.hoursSold)} sold · ${hrs(n.hoursWorked)} worked${n.missingRate ? " · some hours had no hourly cost set" : ""}${n.fromEstimate ? " · from the approved estimate (not invoiced)" : ""}</p>
<h2>Hours worked</h2>
${d.entries.length ? html`<table><tr><th>Date</th><th>Person</th><th>Work</th><th class="n">Hours</th></tr>
  ${d.entries.slice().sort((a, b) => a.work_date.localeCompare(b.work_date)).map((e) => html`<tr><td>${fdate(e.work_date)}</td><td>${personName(who[e.staff_id])}</td><td>${e.note || ""}</td><td class="n">${Number(e.hours)}</td></tr>`)}</table>` : html`<p class="muted">None logged.</p>`}
<h2>Parts & other costs</h2>
${costs.length ? html`<table><tr><th>Date</th><th>From</th><th>For</th><th class="n">Amount</th></tr>
  ${costs.map((c) => html`<tr><td>${fdate(c.date)}</td><td>${c.from}</td><td>${c.what || ""} <span class="muted">· ${checkCategoryLabel(c.category)}</span></td><td class="n">${money(c.amount)}</td></tr>`)}</table>` : html`<p class="muted">None recorded.</p>`}
<h2>Timeline</h2>
${events.length ? html`<table>${events.map((ev) => html`<tr><td style="white-space:nowrap">${ftime(ev.created_at)}</td><td>${ev.status ? html`<b>${statusLabel(ev.status)}</b> ` : ""}${ev.note || ""}${ev.visible_to_customer ? "" : html` <span class="muted">(shop only)</span>`}</td></tr>`)}</table>` : html`<p class="muted">None.</p>`}
<h2>Photos (${files.length})</h2>
<div class="ph">${files.map((f) => html`<a href="photos/${f}"><img src="photos/${f}" alt="Photo ${f}" loading="lazy"></a>`)}</div>
<footer>From the Parceros portal backup made ${ftime(new Date().toISOString())}.</footer>
</body></html>`) + "\n";
}

// Every table, as JSON (to load back into a database) and CSV (to read). Order = parents first.
const EXPORT_TABLES = ["customers", "profiles", "vehicles", "repair_orders", "ro_events", "estimates", "estimate_items", "payments", "requests", "photos",
  "bank_accounts", "payees", "checks", "check_lines", "staff_rates", "time_entries", "expenses", "backups", "email_log"];
async function fullExport() {
  const p = progressDialog("Full data export");
  try {
    const zip = zipWriter(), counts = [];
    for (let i = 0; i < EXPORT_TABLES.length; i++) {
      const t = EXPORT_TABLES[i];
      if (p.cancelled) return;
      p.step(`Reading ${t.replace(/_/g, " ")} (${i + 1} of ${EXPORT_TABLES.length})`, i, EXPORT_TABLES.length);
      const rows = await fetchAll(() => sb.from(t).select("*").order("id"));
      const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      await zip.add(`data/${t}.json`, JSON.stringify(rows, null, 1));
      await zip.add(`spreadsheets/${t}.csv`, csv(keys, rows.map((r) => keys.map((k) => (r[k] !== null && typeof r[k] === "object" ? JSON.stringify(r[k]) : r[k])))));
      counts.push(`  ${t.padEnd(16)} ${rows.length}`);
    }
    const day = localToday();
    await zip.add("README.txt", [
      "PARCEROS COLLISION CENTER - FULL DATA EXPORT",
      `Made ${ftime(new Date().toISOString())} by ${me.profile?.full_name || me.user.email}.`,
      "",
      "Every record in the portal. data/ has one JSON file per table (for loading back into a database),",
      "spreadsheets/ has the same tables as CSV (open in Excel). Photos are NOT in here: they are in the",
      "monthly backup zips (photo-index.csv in each one maps photo files to the portal).",
      "",
      "ROWS PER TABLE",
      ...counts,
      "",
      "HOW TO RESTORE (for a developer)",
      "  The easiest restore is Supabase's own backup (paid plan). Use this export when that isn't available.",
      "  1. New Supabase project: run supabase/schema.sql from the website code.",
      "  2. Logins are not in this export (Supabase keeps passwords private). Re-invite staff and customers,",
      "     then point profiles at the new logins. profiles.json keeps each person's role, name and email.",
      "  3. Insert data/*.json with the service-role key in the order listed above (parents first).",
      "     Restore staff profiles before staff_rates, time_entries and repair_orders.assigned_staff_id.",
      "  4. Reset the counters so new numbers continue where they stopped:",
      "       select setval('public.ro_number_seq', (select coalesce(max(number), 1000) from public.repair_orders));",
      "       select setval('public.receipt_number_seq', (select coalesce(max(receipt_number), 5000) from public.payments));",
      "  5. Photos: upload each file from the monthly zips to the private 'photos' bucket at the",
      "     storage path listed in that zip's photo-index.csv.",
    ].join("\r\n"));
    const blob = zip.blob();
    saveBlob(blob, `parceros-full-export-${day}.zip`);
    await logBackup({ kind: "full", bytes: blob.size });
    p.finish(html`<h2>Export ready</h2><p><b>parceros-full-export-${day}.zip</b> (${mb(blob.size)})</p>
      <p class="p-hint">Keep it with the monthly backups, in two places. It contains customer details, so store it somewhere private.</p>
      <div class="p-row"><button class="p-btn p-btn--go" data-close>Done</button></div>`);
  } catch (e) {
    if (!p.cancelled) p.finish(html`<h2>Export failed</h2><p>${errMsg(e)}</p><p class="p-hint">Nothing was changed in the portal. Try again.</p><div class="p-row"><button class="p-btn" data-close>Close</button></div>`);
  }
}

// ---------------------------------------------------------------- staff (owner only)
async function staffView() {
  if (!isOwner()) return setPage(html`<main class="p-main"><div class="p-card"><h2>Owner only</h2></div></main>`);
  const [people, rates] = await Promise.all([
    sb.from("profiles").select("*").in("role", ["owner", "staff", "none"]).order("created_at").then(must),
    sb.from("staff_rates").select("*").order("effective_from", { ascending: false }).then(must),
  ]);
  const rateNow = (id) => rates.find((x) => x.staff_id === id && x.effective_from <= localToday()) || rates.find((x) => x.staff_id === id);
  setPage(html`<main class="p-main">
    <div class="p-head"><div><p class="p-crumb">Staff</p><h1>Staff accounts</h1></div></div>
    <div class="p-cols"><div class="p-card">
      <table class="p-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th class="num">Cost per hour</th><th></th></tr></thead><tbody>
      ${people.map((p) => { const r = rateNow(p.id); return html`<tr><td><b>${p.full_name || ""}</b></td><td>${p.email}</td>
        <td>${p.role === "none" ? html`<span class="p-badge p-badge--red">no access</span>` : html`<span class="p-badge ${p.role === "owner" ? "p-badge--dark" : ""}">${p.role}</span>`}${p.disabled ? html` <span class="p-badge p-badge--red">turned off</span>` : ""}</td>
        <td class="num">${p.role === "none" ? "" : html`${r ? money(r.hourly_cost_cents) : html`<span class="p-muted">not set</span>`}<br><button type="button" class="p-linkbtn" data-rate="${p.id}">${r ? "Change" : "Set rate"}</button>`}</td>
        <td>${p.id === me.user.id ? html`<span class="p-muted">you</span>` : html`
          ${["owner", "staff"].includes(p.role) && !p.disabled ? html`<button class="p-btn p-btn--sm" data-reset="${p.email}" data-name="${p.full_name || ""}" data-role="${p.role}">Reset link</button> ` : ""}
          <button class="p-btn p-btn--sm ${p.disabled ? "" : "p-btn--danger"}" data-toggle="${p.id}" data-off="${p.disabled ? "1" : "0"}">${p.disabled ? "Turn on" : "Turn off"}</button>`}</td></tr>`; })}
      </tbody></table>
      <p class="p-hint">Staff can update cars, customers and photos, and log their own hours. Only owners see estimates, invoices, pay rates and money, and only owners manage staff.</p>
      <p class="p-hint"><b>Cost per hour</b> is what each person costs you: their wage, or wage plus payroll taxes and benefits for true cost. Job profit uses it. Someone who leaves: turn them off, and their past hours still count on old jobs.</p>
    </div>
    <form class="p-card p-form" id="sform"><h2>Invite staff</h2>
      <label class="p-field"><span>Full name</span><input name="fullName" required maxlength="120"></label>
      <label class="p-field"><span>Email</span><input name="email" type="email" required maxlength="200"></label>
      <label class="p-field"><span>Role</span><select name="role"><option value="staff">Staff</option><option value="owner">Owner (full access)</option></select></label>
      <label class="p-check"><input type="checkbox" data-email checked> Email the invite to them</label>
      <button class="p-btn p-btn--go" type="submit">Make invite link</button>
    </form></div>
  </main>`);
  $$("[data-rate]").forEach((b) => b.addEventListener("click", () => rateDialog(people.find((p) => p.id === b.dataset.rate), rates.filter((r) => r.staff_id === b.dataset.rate))));
  $("#sform").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formData(e.target);
    busy(e.submitter, () => inviteFlow({ kind: "staff", email: f.email.toLowerCase(), fullName: f.fullName, role: f.role, sendEmail: wantsEmail(e.target) }));
  });
  $$("[data-reset]").forEach((b) => b.addEventListener("click", () => busy(b, () => inviteFlow({ kind: "staff", email: b.dataset.reset, fullName: b.dataset.name, role: b.dataset.role }))));
  $$("[data-toggle]").forEach((b) => b.addEventListener("click", () => busy(b, async () => {
    const { error } = await sb.from("profiles").update({ disabled: b.dataset.off !== "1" }).eq("id", b.dataset.toggle);
    if (error) return toast(errMsg(error), "err");
    run();
  })));
}

// Owner sets what a staff member costs per hour, from a date on (a raise keeps older hours at the old rate).
function rateDialog(person, history) {
  const cur = history.find((r) => r.effective_from <= localToday()) || history[0];
  const d = dialog(html`<form class="p-form"><h2>Cost per hour · ${personName(person)}</h2>
    <div class="p-grid2">
      <label class="p-field"><span>Cost per hour ($)</span><input name="rate" inputmode="decimal" required value="${cur ? (cur.hourly_cost_cents / 100).toFixed(2) : ""}" placeholder="25.00"></label>
      <label class="p-field"><span>Starting from</span><input name="from" type="date" required value="${cur ? localToday() : "2000-01-01"}"></label>
    </div>
    <p class="p-hint">${cur ? "A raise? Enter the new rate and the date it starts. Hours before that date keep the old rate." : "First rate: it counts for all hours already logged."}</p>
    ${history.length ? html`<details><summary class="p-linkbtn">Rate history</summary><ul>${history.map((r) => html`<li>${money(r.hourly_cost_cents)} / hour from ${fdate(r.effective_from)}</li>`)}</ul></details>` : ""}
    <div class="p-row"><button class="p-btn p-btn--go" type="submit">Save</button><button class="p-btn" type="button" data-close>Cancel</button></div>
  </form>`);
  d.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const cents = Math.round(Number(f.rate.replace(/[$,]/g, "")) * 100);
    if (!(cents >= 0 && cents <= 100000)) return toast("Enter the hourly cost, like 25 or 27.50.", "err");
    busy(e.submitter, async () => {
      const { error } = await sb.from("staff_rates").upsert({ staff_id: person.id, hourly_cost_cents: cents, effective_from: f.from }, { onConflict: "staff_id,effective_from" });
      if (error) return toast(errMsg(error), "err");
      d.close(); toast("Saved."); run();
    });
  });
}
