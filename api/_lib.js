// Shared helpers for the Vercel functions (files starting with "_" are not routes).
export function env(name) {
  const v = process.env[name];
  if (!v) throw Object.assign(new Error(`Server is missing ${name}`), { status: 500 });
  return v;
}

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > 64 * 1024) throw Object.assign(new Error("Body too large"), { status: 413 }); chunks.push(c); }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

// Supabase REST / Auth Admin calls with the service role key (server only).
export async function sb(path, { method = "GET", body, token, prefer } = {}) {
  const url = env("SUPABASE_URL").replace(/\/$/, "") + path;
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const headers = { apikey: key, Authorization: `Bearer ${token || key}`, "Content-Type": "application/json" };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

// Who is calling? Verifies the user's access token with Supabase and loads their profile.
export async function caller(req) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  const u = await sb("/auth/v1/user", { token });
  if (!u.ok || !u.data?.id) return null;
  const p = await sb(`/rest/v1/profiles?id=eq.${encodeURIComponent(u.data.id)}&select=id,role,disabled,full_name,email`);
  const prof = Array.isArray(p.data) ? p.data[0] : null;
  if (!prof || prof.disabled) return null;
  return prof;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

// ---------- money (must match shared/core.js totals) ----------
const TAXABLE = ["part", "paint"];
export function invoiceTotalCents(items, taxRate) {
  let taxable = 0, nontax = 0;
  for (const it of items || []) {
    const line = Math.round(Number(it.qty || 0) * Number(it.unit_cents || 0));
    if (TAXABLE.includes(it.item_type)) taxable += line; else nontax += line;
  }
  return taxable + nontax + Math.round((taxable * Number(taxRate || 0)) / 100);
}
// What the customer owes on an invoice: the owner-set amount (e.g. deductible) or the full total.
export function amountDueCents(est, items) {
  return est.customer_due_cents != null ? Number(est.customer_due_cents) : invoiceTotalCents(items, est.tax_rate);
}

// ---------- Stripe (plain REST, no SDK) ----------
const STRIPE_API = () => (process.env.STRIPE_API_BASE || "https://api.stripe.com").replace(/\/$/, "");
function formEncode(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") formEncode(v, key, out);
    else out.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(v)));
  }
  return out.join("&");
}
export async function stripe(path, { method = "GET", body, idempotencyKey } = {}) {
  const headers = { Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}` };
  if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const r = await fetch(STRIPE_API() + path, { method, headers, body: body ? formEncode(body) : undefined, signal: AbortSignal.timeout(15000) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data?.error?.message || "Stripe request failed"), { status: 502 });
  return data;
}

// Loads an invoice with its items and repair order (service role).
export async function loadInvoice(estimateId) {
  const e = await sb(`/rest/v1/estimates?id=eq.${estimateId}&select=*`);
  const est = Array.isArray(e.data) ? e.data[0] : null;
  if (!est) return null;
  const [items, ro] = await Promise.all([
    sb(`/rest/v1/estimate_items?estimate_id=eq.${estimateId}&select=item_type,qty,unit_cents`),
    sb(`/rest/v1/repair_orders?id=eq.${est.ro_id}&select=id,number,customer_id`),
  ]);
  return { est, items: items.data || [], ro: (ro.data || [])[0] || null };
}

// What is still owed on an invoice after payments, computed by the database (single source of truth).
export async function balanceCents(estimateId) {
  const r = await sb("/rest/v1/rpc/invoice_balance_cents", { method: "POST", body: { p_estimate: estimateId } });
  if (!r.ok || typeof r.data !== "number") throw Object.assign(new Error("Could not read the balance"), { status: 502 });
  return r.data;
}

// Records a completed Stripe Checkout session as a payment (with its own receipt number).
// The invoice turns paid when the balance reaches $0. Safe to call twice for the same session.
export async function markPaidFromSession(session) {
  const estimateId = session?.metadata?.estimate_id;
  if (!UUID_RE.test(estimateId || "")) return { ok: false, reason: "no invoice on session" };
  if (session.payment_status !== "paid") return { ok: false, reason: "not paid" };
  if (String(session.currency).toLowerCase() !== "usd" || !(Number(session.amount_total) > 0)) return { ok: false, reason: "bad amount" };
  // The session was fetched from Stripe (or its signature verified), so the money really arrived:
  // record exactly what Stripe collected, even if a counter payment changed the balance meanwhile.
  const r = await sb("/rest/v1/rpc/record_online_payment", {
    method: "POST",
    body: {
      p_estimate: estimateId,
      p_amount_cents: Number(session.amount_total),
      p_session: String(session.id),
      p_intent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
    },
  });
  if (!r.ok || !r.data) return { ok: false, reason: "could not record" };
  return { ok: true, already: !!r.data.already, roId: r.data.ro_id, paymentId: r.data.id || null, receipt: r.data.receipt_number, paidInFull: !!r.data.paid_in_full };
}
