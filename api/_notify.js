// Builds each customer / shop email from the database (never from what the browser sends),
// sends it, and notes it on the repair order timeline (shop only).
import { env, invoiceTotalCents, sb } from "./_lib.js";
import { sendEmail } from "./_mail.js";
import * as T from "./_emails.js";

const one = async (path) => { const r = await sb(path); return r.ok && Array.isArray(r.data) ? r.data[0] || null : null; };
const site = () => env("SITE_URL").replace(/\/$/, "");
const portalRo = (roId) => `${site()}/portal/#/ro/${roId}`;
const vehicleName = (v) => (v ? [v.year, v.make, v.model].filter(Boolean).join(" ") || "vehicle" : "vehicle");
const METHODS = { cash: "Cash", check: "Check", card: "Card", insurance: "Insurance", online: "Card (online)" };
const fail = (status, message) => Object.assign(new Error(message), { status });
const OPTED_OUT = "This customer turned off update emails (customer page > Contact).";

async function loadJob(roId) {
  const ro = await one(`/rest/v1/repair_orders?id=eq.${roId}&select=*`);
  if (!ro) throw fail(404, "Repair order not found.");
  const [cust, veh] = await Promise.all([
    one(`/rest/v1/customers?id=eq.${ro.customer_id}&select=*`),
    ro.vehicle_id ? one(`/rest/v1/vehicles?id=eq.${ro.vehicle_id}&select=*`) : null,
  ]);
  return { ro, cust: cust || {}, veh };
}
async function onTimeline(roId, result, what, by) {
  if (!result.ok) return;
  await sb("/rest/v1/ro_events", { method: "POST", prefer: "return=minimal",
    body: { ro_id: roId, note: `Email sent to ${result.to}: ${what}`, visible_to_customer: false, created_by: by || null } });
}
async function balanceOf(estimateId) {
  const r = await sb("/rest/v1/rpc/invoice_balance_cents", { method: "POST", body: { p_estimate: estimateId } });
  return r.ok && typeof r.data === "number" ? r.data : null;
}

// Estimate ready / invoice ready (owner).
export async function estimateEmail(kind, estimateId, by) {
  const est = await one(`/rest/v1/estimates?id=eq.${estimateId}&select=*`);
  if (!est || est.kind !== kind) throw fail(404, kind === "invoice" ? "Invoice not found." : "Estimate not found.");
  if (kind === "estimate" && est.status === "draft") throw fail(409, "Send the estimate first.");
  const { ro, cust, veh } = await loadJob(est.ro_id);
  const items = (await sb(`/rest/v1/estimate_items?estimate_id=eq.${estimateId}&select=item_type,qty,unit_cents`)).data || [];
  const total = invoiceTotalCents(items, est.tax_rate);
  const base = { name: cust.full_name, ro: ro.number, vehicle: vehicleName(veh), total, link: portalRo(ro.id) };
  const t = kind === "estimate" ? T.estimate(base)
    : T.invoice({ ...base, due: est.customer_due_cents ?? total, balance: (await balanceOf(estimateId)) ?? (est.customer_due_cents ?? total) });
  const r = await sendEmail({ to: cust.email, ...t, kind, skip: cust.email_updates === false ? OPTED_OUT : null,
    log: { ro_id: ro.id, customer_id: cust.id, ref_id: estimateId, sent_by: by } });
  await onTimeline(ro.id, r, kind === "estimate" ? "estimate ready" : "invoice", by);
  return r;
}

// Payment receipt. Always sent (not an "update"). `by` null = online payment.
export async function receiptEmail(paymentId, by) {
  const pay = await one(`/rest/v1/payments?id=eq.${paymentId}&select=*`);
  if (!pay) throw fail(404, "Payment not found.");
  if (pay.voided_at) throw fail(409, "That payment was voided.");
  const { ro, cust, veh } = await loadJob(pay.ro_id);
  const t = T.receipt({ name: cust.full_name, receiptNo: pay.receipt_number, amount: pay.amount_cents, method: METHODS[pay.method] || pay.method,
    ro: ro.number, vehicle: vehicleName(veh), balance: await balanceOf(pay.estimate_id), when: T.whenText(pay.created_at), link: portalRo(ro.id) });
  const r = await sendEmail({ to: cust.email, ...t, kind: "receipt", log: { ro_id: ro.id, customer_id: cust.id, ref_id: pay.id, sent_by: by } });
  await onTimeline(ro.id, r, `receipt #${pay.receipt_number}`, by);
  return r;
}

// Car checked in / ready for pickup.
export async function statusEmail(roId, by) {
  const { ro, cust, veh } = await loadJob(roId);
  if (!["received", "ready"].includes(ro.status)) throw fail(409, "Status emails go only for 'Vehicle received' and 'Ready for pickup'.");
  const t = T.status({ name: cust.full_name, ro: ro.number, vehicle: vehicleName(veh), stage: ro.status, link: portalRo(ro.id) });
  const r = await sendEmail({ to: cust.email, ...t, kind: "status", skip: cust.email_updates === false ? OPTED_OUT : null,
    log: { ro_id: ro.id, customer_id: cust.id, sent_by: by } });
  await onTimeline(ro.id, r, ro.status === "ready" ? "ready for pickup" : "vehicle received", by);
  return r;
}

// Drop-off appointment confirmed (website or portal request).
export async function dropoffEmail(requestId, by) {
  const q = await one(`/rest/v1/requests?id=eq.${requestId}&select=*`);
  if (!q) throw fail(404, "Request not found.");
  if (q.status !== "scheduled" || !q.scheduled_for) throw fail(409, "Schedule the drop-off first.");
  const cust = q.customer_id ? await one(`/rest/v1/customers?id=eq.${q.customer_id}&select=*`) : null;
  const t = T.dropoff({ name: q.full_name, when: T.whenText(q.scheduled_for), vehicle: [q.year, q.make, q.model].filter(Boolean).join(" "),
    link: cust ? `${site()}/portal/` : null });
  return sendEmail({ to: q.email || cust?.email, ...t, kind: "dropoff", skip: cust?.email_updates === false ? OPTED_OUT : null,
    log: { request_id: q.id, customer_id: q.customer_id, sent_by: by } });
}

// New request from the website or the portal: tells the shop. Anyone may trigger it, so it only works
// once per request, only for a request made in the last 15 minutes, and only to the shop's own address.
export async function newRequestEmail(requestId) {
  const q = await one(`/rest/v1/requests?id=eq.${requestId}&select=*`);
  if (!q || q.status !== "new" || Date.now() - new Date(q.created_at).getTime() > 15 * 60 * 1000) return { ok: false };
  const already = await one(`/rest/v1/email_log?request_id=eq.${q.id}&kind=eq.request&select=id`);
  if (already) return { ok: false };
  const to = process.env.SHOP_NOTIFY_EMAIL || process.env.EMAIL_REPLY_TO;
  const r = await sendEmail({ to, ...T.newRequest({ r: q, link: `${site()}/manage/#/requests` }), kind: "request", log: { request_id: q.id, customer_id: q.customer_id } });
  return { ok: r.ok };
}
