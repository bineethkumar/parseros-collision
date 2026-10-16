// Stripe calls this after a payment. The signature is verified with STRIPE_WEBHOOK_SECRET
// before anything is trusted. Point the webhook at https://<site>/api/stripe-webhook and
// send the "checkout.session.completed" and "checkout.session.async_payment_succeeded" events.
import crypto from "node:crypto";
import { env, markPaidFromSession, send } from "./_lib.js";
import { receiptEmail } from "./_notify.js";

export const config = { api: { bodyParser: false } };

async function rawBody(req) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 1024 * 1024) throw new Error("too large"); chunks.push(Buffer.from(c)); }
  return Buffer.concat(chunks).toString("utf8");
}

export function verifyStripeSignature(payload, header, secret, toleranceSec = 300) {
  const sigs = [];
  let t = null;
  for (const kv of String(header || "").split(",")) {
    const [k, v] = kv.split("=");
    if (k === "t") t = Number(v);
    if (k === "v1" && v) sigs.push(v);
  }
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex");
  const exp = Buffer.from(expected, "hex");
  return sigs.some((s) => { const b = Buffer.from(s, "hex"); return b.length === exp.length && crypto.timingSafeEqual(b, exp); });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  let payload;
  try { payload = await rawBody(req); } catch { return send(res, 413, { error: "Too large" }); }
  if (!verifyStripeSignature(payload, req.headers["stripe-signature"], env("STRIPE_WEBHOOK_SECRET"))) {
    return send(res, 400, { error: "Bad signature" });
  }
  const event = JSON.parse(payload);
  if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
    const r = await markPaidFromSession(event.data.object);
    if (!r.ok && r.reason !== "not paid") console.error("stripe webhook:", r.reason, event.data.object?.id);
    if (r.ok && !r.already && r.paymentId) await receiptEmail(r.paymentId, null).catch(() => {}); // first to record it emails the receipt
  }
  return send(res, 200, { received: true });
}
