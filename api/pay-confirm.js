// Called when the customer comes back from Stripe. Double-checks the session with Stripe
// and marks the invoice paid (the webhook does the same; whichever arrives first wins).
import { caller, markPaidFromSession, readJson, sb, send, stripe, loadInvoice } from "./_lib.js";
import { receiptEmail } from "./_notify.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  try {
    const me = await caller(req);
    if (!me || me.role !== "customer") return send(res, 403, { error: "Not allowed" });
    const { sessionId } = await readJson(req);
    if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(String(sessionId || ""))) return send(res, 400, { error: "Bad session." });
    const session = await stripe(`/v1/checkout/sessions/${sessionId}`);
    // only the customer who owns the invoice can confirm it
    const prof = await sb(`/rest/v1/profiles?id=eq.${me.id}&select=customer_id`);
    const inv = await loadInvoice(session?.metadata?.estimate_id || "x");
    if (!inv || inv.ro?.customer_id !== prof.data?.[0]?.customer_id) return send(res, 403, { error: "Not allowed" });
    const r = await markPaidFromSession(session);
    if (r.ok && !r.already && r.paymentId) await receiptEmail(r.paymentId, null).catch(() => {}); // first to record it emails the receipt
    return send(res, r.ok ? 200 : 409, r.ok ? { paid: true, paidInFull: !!r.paidInFull, receipt: r.receipt || null } : { paid: false, error: r.reason });
  } catch (e) {
    return send(res, e.status || 500, { error: e.status ? e.message : "Could not confirm the payment." });
  }
}
