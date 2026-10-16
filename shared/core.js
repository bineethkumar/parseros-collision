// Shared browser code for the customer portal, the management portal and the request form.
/* global supabase */

export let sb = null;

export async function initSupabase() {
  if (sb) return sb;
  const r = await fetch("/api/config", { cache: "no-store" });
  const cfg = await r.json().catch(() => ({}));
  if (!r.ok || !cfg.supabaseUrl) throw new Error(cfg.error || "Supabase is not configured yet.");
  sb = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
  });
  return sb;
}

// ---------- safe HTML ----------
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));
// html`...${value}...` escapes every value unless it is raw(...) or an array of those.
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => {
    if (Array.isArray(v)) out += v.map((x) => (x instanceof Raw ? x.s : esc(x))).join("");
    else out += v instanceof Raw ? v.s : esc(v);
    out += strings[i + 1];
  });
  return raw(out);
}

// ---------- formatting ----------
export const money = (cents) => (Number(cents || 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
export const fdate = (d) => (d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
export const ftime = (d) => (d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
export const daysSince = (d) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));
export const vehicleName = (v) => (v ? [v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle" : "No vehicle");

export const STATUSES = [
  ["received", "Vehicle received", "We have your vehicle and are checking it in."],
  ["estimate", "Writing estimate", "We are inspecting the damage and writing your estimate."],
  ["approval", "Waiting for approval", "Your estimate is ready. Waiting for you or your insurance to approve."],
  ["parts", "Ordering parts", "Parts are on order."],
  ["body", "Body repair", "Our technicians are repairing the body and structure."],
  ["paint", "Paint", "Your vehicle is in the paint booth."],
  ["reassembly", "Reassembly & detail", "Putting everything back together and cleaning up."],
  ["ready", "Ready for pickup", "Your vehicle is ready. Call 301-595-0888 to pick it up."],
  ["delivered", "Picked up", "Thank you for choosing Parceros."],
];
export const statusLabel = (s) => (STATUSES.find((x) => x[0] === s) || [s, s])[1];
export const statusIndex = (s) => STATUSES.findIndex((x) => x[0] === s);

export const SLOTS = [["8-10", "8 to 10 AM"], ["10-12", "10 AM to 12 PM"], ["12-2", "12 to 2 PM"], ["2-5", "2 to 5 PM"]];
export const slotLabel = (s) => (SLOTS.find((x) => x[0] === s) || [s, s || ""])[1];

// ---------- money math (tax on parts + paint materials, not labor/sublet) ----------
export const TAXABLE = ["part", "paint"];
export function totals(items, taxRate) {
  let taxable = 0, nontax = 0;
  for (const it of items || []) {
    const line = Math.round(Number(it.qty || 0) * Number(it.unit_cents || 0));
    if (TAXABLE.includes(it.item_type)) taxable += line; else nontax += line;
  }
  const tax = Math.round((taxable * Number(taxRate || 0)) / 100);
  return { taxable, nontax, subtotal: taxable + nontax, tax, total: taxable + nontax + tax };
}

// ---------- UI helpers ----------
// ---------- payments ----------
export const PAY_METHODS = [["cash", "Cash"], ["check", "Check"], ["card", "Card at shop"], ["insurance", "Insurance"], ["online", "Online by card"]];
export const payMethodLabel = (m) => (m === "mixed" ? "Several methods" : (PAY_METHODS.find((x) => x[0] === m) || [m, m || ""])[1]);
// what is owed before payments: the owner-set share (e.g. deductible) or the full total
export const invoiceDue = (est, items) => (est.customer_due_cents != null ? Number(est.customer_due_cents) : totals(items, est.tax_rate).total);
export const paidSum = (payments) => (payments || []).filter((p) => !p.voided_at).reduce((a, p) => a + Number(p.amount_cents || 0), 0);
// "12.5" / "$1,200.00" -> 1250 / 120000 cents; null if not a valid positive amount
export function parseCents(v) {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0 || n > 1000000) return null;
  return Math.round(n * 100);
}

// ---------- checks the shop writes ----------
export const CHECK_CATEGORIES = [["parts", "Parts"], ["paint", "Paint & materials"], ["sublet", "Sublet"], ["rent", "Rent"], ["utilities", "Utilities"],
  ["tools", "Tools & equipment"], ["supplies", "Shop supplies"], ["insurance", "Insurance"], ["refund", "Customer refund"], ["other", "Other"]];
export const checkCategoryLabel = (c) => (CHECK_CATEGORIES.find((x) => x[0] === c) || [c, c || ""])[1];
// 123456 -> "One thousand two hundred thirty-four and 56/100"
export function amountWords(cents) {
  const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const under1000 = (n) => {
    const out = [];
    if (n >= 100) { out.push(ONES[Math.floor(n / 100)], "hundred"); n %= 100; }
    if (n >= 20) { out.push(TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "")); n = 0; }
    if (n) out.push(ONES[n]);
    return out.join(" ");
  };
  cents = Math.round(Number(cents || 0));
  let dollars = Math.floor(cents / 100);
  const parts = [];
  for (const [size, name] of [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"], [1, ""]]) {
    if (dollars >= size) { parts.push(under1000(Math.floor(dollars / size)) + (name ? " " + name : "")); dollars %= size; }
  }
  const words = parts.join(" ") || "zero";
  return words[0].toUpperCase() + words.slice(1) + " and " + String(cents % 100).padStart(2, "0") + "/100";
}

// "Forgot password?": the portal's server emails the reset link from the shop's own address.
// The answer is the same whether or not the email has a login.
export async function requestPasswordReset(email) {
  const r = await fetch("/api/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Could not send the reset email. Try again in a minute.");
  return j.message || "If that email has a login, a reset link is on its way.";
}

// A sign-in link that didn't work (expired, already used, or opened first by an email scanner)
// comes back with an error in the address. Returns a friendly message for it, or null.
export function linkProblem() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ""));
  const code = h.get("error_code") || "", desc = (h.get("error_description") || "").replace(/\+/g, " ");
  if (!code && !desc && !h.get("error")) return null;
  return /expired|invalid|otp/i.test(code + " " + desc) ? "This link has expired or was already used." : desc || "That sign-in link didn't work.";
}
// Shown on the sign-in page after a broken link: the person types their email and gets a fresh link.
export function newLinkCard(message) {
  return html`<div class="p-card p-form" id="newlink" style="border:2px solid var(--amber)">
    <h2>${message}</h2>
    <p class="p-hint">Sign-in links work once and expire after 24 hours. Some email programs open links by themselves to scan them, which can use them up.</p>
    <label class="p-field"><span>Your email</span><input type="email" name="nlemail" autocomplete="email"></label>
    <button class="p-btn p-btn--go" type="button" id="nlsend">Email me a new link</button>
  </div>`;
}
export function wireNewLinkCard(root) {
  const btn = root.querySelector("#nlsend");
  if (!btn) return;
  btn.addEventListener("click", () => busy(btn, async () => {
    const email = root.querySelector("[name=nlemail]").value.trim();
    if (!email) return toast("Type your email first.", "err");
    try {
      const msg = await requestPasswordReset(email);
      root.querySelector("#newlink").innerHTML = String(html`<h2>Check your email</h2><p>${msg}</p>
        <p class="p-hint">Open the newest email and click its link once. Not there in a few minutes? Check spam, or call us at 301-595-0888.</p>`);
    } catch (err) { toast(errMsg(err), "err"); }
  }));
}

export function toast(msg, kind = "ok") {
  let box = document.querySelector(".p-toasts");
  if (!box) { box = document.createElement("div"); box.className = "p-toasts"; box.setAttribute("role", "status"); document.body.appendChild(box); }
  const t = document.createElement("div");
  t.className = "p-toast p-toast--" + kind;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), kind === "err" ? 7000 : 3500);
}
export const errMsg = (e) => (e && (e.message || e.error_description || e.msg)) || "Something went wrong.";

export function formData(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { o[k] = typeof v === "string" ? v.trim() : v; });
  return o;
}
export const nn = (v) => (v === "" || v === undefined ? null : v);

export async function busy(btn, fn) {
  const label = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Working..."; }
  try { return await fn(); } finally { if (btn) { btn.disabled = false; btn.textContent = label; } }
}

// ---------- VIN ----------
export const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
export async function decodeVin(vin) {
  vin = String(vin || "").trim().toUpperCase();
  if (!VIN_RE.test(vin)) throw new Error("A VIN is 17 letters and numbers (no I, O or Q).");
  const r = await fetch("/api/vin?vin=" + encodeURIComponent(vin));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "VIN lookup failed.");
  if (!j.found) throw new Error("No match for that VIN. Check it, or enter the vehicle by hand.");
  return j;
}
// Wires a VIN input + "Look up" button to fill year/make/model fields inside `root`.
export function wireVin(root) {
  const btn = root.querySelector("[data-vin-lookup]");
  if (!btn) return;
  btn.addEventListener("click", () => busy(btn, async () => {
    const vinEl = root.querySelector("[name=vin]");
    try {
      const d = await decodeVin(vinEl.value);
      vinEl.value = d.vin;
      for (const k of ["year", "make", "model"]) { const el = root.querySelector(`[name=${k}]`); if (el && d[k]) el.value = d[k]; }
      const tr = root.querySelector("[name=trim_level]"); if (tr && d.trim) tr.value = d.trim;
      const out = root.querySelector("[data-vin-result]");
      if (out) out.textContent = `Found: ${[d.year, d.make, d.model, d.trim].filter(Boolean).join(" ")}`;
    } catch (e) { toast(errMsg(e), "err"); }
  }));
}

// ---------- photos ----------
const uid = () => crypto.randomUUID();
// Re-encode to JPEG (max 2000px). This also strips GPS/location data from phone photos.
async function shrink(file) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    if (blob) return { blob, ext: "jpg", type: "image/jpeg" };
  } catch { /* e.g. HEIC on some browsers: upload as-is */ }
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z]/g, "") || "jpg";
  return { blob: file, ext, type: file.type || "image/jpeg" };
}
export async function uploadPhotos(files, { customerId, roId = null, requestId = null, visible = true, userId }) {
  const ok = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
  let n = 0;
  for (const f of Array.from(files || []).slice(0, 10)) {
    if (f.type && !ok.includes(f.type)) { toast(`${f.name}: only photos can be uploaded.`, "err"); continue; }
    if (f.size > 25 * 1024 * 1024) { toast(`${f.name} is too large.`, "err"); continue; }
    const { blob, ext, type } = await shrink(f);
    if (blob.size > 10 * 1024 * 1024) { toast(`${f.name} is too large after resizing.`, "err"); continue; }
    const path = `${customerId}/${uid()}.${ext}`;
    const up = await sb.storage.from("photos").upload(path, blob, { contentType: type, upsert: false });
    if (up.error) { toast(errMsg(up.error), "err"); continue; }
    const ins = await sb.from("photos").insert({ customer_id: customerId, ro_id: roId, request_id: requestId, storage_path: path, visible_to_customer: visible, uploaded_by: userId });
    if (ins.error) { await sb.storage.from("photos").remove([path]); toast(errMsg(ins.error), "err"); continue; }
    n++;
  }
  return n;
}
export async function photoUrls(rows) {
  if (!rows || !rows.length) return {};
  const { data } = await sb.storage.from("photos").createSignedUrls(rows.map((r) => r.storage_path), 3600);
  const map = {};
  (data || []).forEach((d) => { if (d.signedUrl) map[d.path] = d.signedUrl; });
  return map;
}
export function photoGrid(rows, urls, { canHide = false } = {}) {
  if (!rows.length) return html`<p class="p-muted">No photos yet.</p>`;
  return html`<div class="p-photos">${rows.map((p) => html`
    <figure class="p-photo">
      ${urls[p.storage_path] ? html`<a href="${urls[p.storage_path]}" target="_blank" rel="noopener"><img src="${urls[p.storage_path]}" alt="Vehicle photo" loading="lazy"></a>` : html`<div class="p-photo__missing">Photo</div>`}
      <figcaption>${ftime(p.created_at)}${canHide ? html` · <button type="button" class="p-linkbtn" data-toggle-photo="${p.id}" data-visible="${p.visible_to_customer ? "1" : "0"}">${p.visible_to_customer ? "Shown to customer" : "Shop only"}</button>` : ""}</figcaption>
    </figure>`)}</div>`;
}

// ---------- tiny hash router ----------
export function router(routes, fallback) {
  const run = () => {
    const h = location.hash.replace(/^#/, "") || "/";
    const [p, qs] = h.split("?");
    const params = new URLSearchParams(qs || "");
    for (const [pattern, fn] of routes) {
      const m = p.match(pattern);
      if (m) return fn(m, params);
    }
    return fallback(params);
  };
  window.addEventListener("hashchange", run);
  return run;
}
export const go = (h) => { if (location.hash === h) window.dispatchEvent(new HashChangeEvent("hashchange")); else location.hash = h; };
