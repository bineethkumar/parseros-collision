// "Forgot password?" on the sign-in pages. The portal emails the reset link through the shop's own
// SMTP (same look as every other email), instead of Supabase sending it.
// Anyone can call this, so it always answers the same way (never reveals whether an email has an
// account) and limits sending: 3 per email address and 10 per visitor, per hour.
import crypto from "node:crypto";
import { env, readJson, sb, send, EMAIL_RE } from "./_lib.js";
import { sendEmail } from "./_mail.js";
import * as T from "./_emails.js";

const PER_EMAIL = 3, PER_VISITOR = 10;
const SAME_ANSWER = { ok: true, message: "If that email has a login, a reset link is on its way." };

function visitorHash(req) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
  // one-way hash: enough to count requests, without keeping anyone's IP address
  return crypto.createHmac("sha256", env("SUPABASE_SERVICE_ROLE_KEY")).update(ip).digest("hex").slice(0, 32);
}
async function recentCount(filter) {
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const r = await sb(`/rest/v1/email_log?kind=eq.reset&created_at=gte.${encodeURIComponent(since)}&${filter}&select=id`);
  return Array.isArray(r.data) ? r.data.length : 0;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  try {
    const body = await readJson(req);
    const email = String(body.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return send(res, 400, { error: "Enter a valid email address." });
    const ip = visitorHash(req);

    // too many recent tries: answer the same, send nothing
    if ((await recentCount(`ip_hash=eq.${ip}`)) >= PER_VISITOR || (await recentCount(`to_email=eq.${encodeURIComponent(email)}`)) >= PER_EMAIL) {
      return send(res, 200, SAME_ANSWER);
    }

    const p = await sb(`/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id,role,full_name,disabled`);
    const prof = Array.isArray(p.data) ? p.data[0] : null;
    if (!prof || prof.disabled || !["owner", "staff", "customer"].includes(prof.role)) {
      await sendEmail({ to: email, subject: "Password reset", html: "", text: "", kind: "reset", skip: "No active login with that email.", log: { ip_hash: ip } });
      return send(res, 200, SAME_ANSWER);
    }

    // the person's role decides where the link lands (shop portal or customer portal)
    const area = prof.role === "customer" ? "portal" : "manage";
    const site = env("SITE_URL").replace(/\/$/, "");
    const link = await sb("/auth/v1/admin/generate_link", {
      method: "POST",
      body: { type: "recovery", email, redirect_to: `${site}/${area}/?welcome=1` },
    });
    const actionLink = link.data?.action_link || link.data?.properties?.action_link;
    if (!link.ok || !actionLink) {
      await sendEmail({ to: email, subject: "Password reset", html: "", text: "", kind: "reset", skip: "Supabase could not make the link.", log: { ip_hash: ip } });
      return send(res, 200, SAME_ANSWER);
    }
    await sendEmail({ to: email, ...T.passwordReset({ name: prof.full_name, link: actionLink }), kind: "reset", log: { ip_hash: ip, sent_by: null } });
    return send(res, 200, SAME_ANSWER);
  } catch (e) {
    console.error("reset:", e?.message || e); // shows in Vercel > Logs (e.g. a missing setting)
    return send(res, 200, SAME_ANSWER);
  }
}
