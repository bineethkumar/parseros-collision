// Sends one customer / shop email. The browser only says which email and which record;
// the server loads everything else from the database (see _notify.js).
//   { kind: "estimate" | "invoice", estimateId }   owner
//   { kind: "receipt", paymentId }                   owner, or the staff member who took the payment
//   { kind: "status", roId }                         shop (car received / ready for pickup)
//   { kind: "dropoff", requestId }                   shop
//   { kind: "request", requestId }                   anyone, right after making a request (tells the shop)
import { caller, readJson, sb, send, UUID_RE } from "./_lib.js";
import { dropoffEmail, estimateEmail, newRequestEmail, receiptEmail, statusEmail } from "./_notify.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  try {
    const body = await readJson(req);
    const kind = String(body.kind || "");
    const id = String(body.estimateId || body.paymentId || body.roId || body.requestId || "");
    if (!UUID_RE.test(id)) return send(res, 400, { error: "Missing record." });

    if (kind === "request") { await newRequestEmail(id); return send(res, 200, { ok: true }); }

    const me = await caller(req);
    if (!me || !["owner", "staff"].includes(me.role)) return send(res, 403, { error: "Not allowed" });
    let r;
    if (kind === "estimate" || kind === "invoice") {
      if (me.role !== "owner") return send(res, 403, { error: "Only the owner can send estimates and invoices." });
      r = await estimateEmail(kind, id, me.id);
    } else if (kind === "receipt") {
      if (me.role !== "owner") {
        const p = await sb(`/rest/v1/payments?id=eq.${id}&select=received_by`);
        if (p.data?.[0]?.received_by !== me.id) return send(res, 403, { error: "Not allowed" });
      }
      r = await receiptEmail(id, me.id);
    } else if (kind === "status") r = await statusEmail(id, me.id);
    else if (kind === "dropoff") r = await dropoffEmail(id, me.id);
    else return send(res, 400, { error: "Unknown email." });
    return send(res, 200, r);
  } catch (e) {
    return send(res, e.status || 500, { error: e.status ? e.message : "The email could not be sent." });
  }
}
