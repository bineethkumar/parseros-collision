// Starts a Stripe Checkout payment for an unpaid invoice. Only the customer who owns the invoice may pay it.
// The amount is computed here from the database, never taken from the browser.
import { balanceCents, caller, env, loadInvoice, readJson, sb, send, stripe, UUID_RE } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  try {
    const me = await caller(req);
    if (!me || me.role !== "customer") return send(res, 403, { error: "Please sign in to pay." });
    const { estimateId } = await readJson(req);
    if (!UUID_RE.test(String(estimateId || ""))) return send(res, 400, { error: "Missing invoice." });

    const prof = await sb(`/rest/v1/profiles?id=eq.${me.id}&select=customer_id`);
    const customerId = prof.data?.[0]?.customer_id;
    const inv = await loadInvoice(estimateId);
    if (!inv || !inv.ro || inv.ro.customer_id !== customerId || inv.est.kind !== "invoice") return send(res, 404, { error: "Invoice not found." });
    if (inv.est.status !== "unpaid") return send(res, 409, { error: "This invoice is already paid." });

    // charge only what is still owed after any cash, check or earlier online payments
    const amount = await balanceCents(inv.est.id);
    if (!(amount >= 50)) return send(res, 400, { error: "Nothing left to pay online on this invoice." });

    const site = env("SITE_URL").replace(/\/$/, "");
    const session = await stripe("/v1/checkout/sessions", {
      method: "POST",
      idempotencyKey: `parceros-${inv.est.id}-${amount}-${Number(inv.est.paid_cents || 0)}`,
      body: {
        mode: "payment",
        client_reference_id: inv.est.id,
        customer_email: me.email || undefined,
        line_items: { 0: { quantity: 1, price_data: { currency: "usd", unit_amount: amount,
          product_data: { name: `Parceros Collision Center - Repair order #${inv.ro.number}` } } } },
        metadata: { estimate_id: inv.est.id, ro_id: inv.ro.id },
        payment_intent_data: { metadata: { estimate_id: inv.est.id, ro_number: String(inv.ro.number) }, description: `RO #${inv.ro.number}` },
        success_url: `${site}/portal/?paid={CHECKOUT_SESSION_ID}#/ro/${inv.ro.id}`,
        cancel_url: `${site}/portal/#/ro/${inv.ro.id}`,
      },
    });
    return send(res, 200, { url: session.url });
  } catch (e) {
    return send(res, e.status || 500, { error: e.status ? e.message : "Could not start the payment." });
  }
}
