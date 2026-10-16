// Creates a one-time "set your password" link for a customer or staff member.
// Only signed-in shop users may call it; only the owner may invite staff.
// The link is shown to the shop to text or email; with sendEmail the server also emails it.
import { caller, env, readJson, sb, send, EMAIL_RE, UUID_RE } from "./_lib.js";
import { sendEmail } from "./_mail.js";
import * as T from "./_emails.js";
import crypto from "node:crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  try {
    const me = await caller(req);
    if (!me || !["owner", "staff"].includes(me.role)) return send(res, 403, { error: "Not allowed" });

    const body = await readJson(req);
    const kind = body.kind === "staff" ? "staff" : "customer";
    const email = String(body.email || "").trim().toLowerCase();
    const fullName = String(body.fullName || "").trim().slice(0, 120);
    if (!EMAIL_RE.test(email)) return send(res, 400, { error: "Enter a valid email address." });

    let appMeta;
    if (kind === "staff") {
      if (me.role !== "owner") return send(res, 403, { error: "Only the owner can invite staff." });
      const role = body.role === "owner" ? "owner" : "staff";
      appMeta = { role, full_name: fullName || email };
    } else {
      const customerId = String(body.customerId || "");
      if (!UUID_RE.test(customerId)) return send(res, 400, { error: "Missing customer." });
      const c = await sb(`/rest/v1/customers?id=eq.${customerId}&select=id,full_name`);
      if (!c.ok || !Array.isArray(c.data) || !c.data[0]) return send(res, 404, { error: "Customer not found." });
      appMeta = { role: "customer", customer_id: customerId, full_name: fullName || c.data[0].full_name };
    }

    // Does this email already have a login?
    const existing = await sb(`/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id,role,customer_id`);
    const prof = Array.isArray(existing.data) ? existing.data[0] : null;
    if (prof) {
      const sameCustomer = kind === "customer" && prof.role === "customer" && prof.customer_id === appMeta.customer_id;
      const sameStaff = kind === "staff" && ["owner", "staff"].includes(prof.role);
      if (!sameCustomer && !sameStaff) {
        return send(res, 409, { error: "That email already has a different login. Use another email." });
      }
    } else {
      const created = await sb("/auth/v1/admin/users", {
        method: "POST",
        body: {
          email,
          email_confirm: true,
          password: crypto.randomBytes(24).toString("base64url"),
          app_metadata: appMeta,
        },
      });
      if (!created.ok) {
        return send(res, 400, { error: created.data?.msg || created.data?.message || "Could not create the login." });
      }
      // Belt and braces: write the role / customer link onto the profile directly
      // (the database trigger also does this once Supabase attaches app_metadata).
      if (created.data?.id) {
        await sb(`/rest/v1/profiles?id=eq.${encodeURIComponent(created.data.id)}`, {
          method: "PATCH",
          body: { role: appMeta.role, customer_id: appMeta.customer_id || null, full_name: appMeta.full_name },
        });
      }
    }

    if (kind === "customer") {
      await sb(`/rest/v1/customers?id=eq.${appMeta.customer_id}`, { method: "PATCH", body: { email } });
    }

    const site = env("SITE_URL").replace(/\/$/, "");
    const area = kind === "staff" ? "manage" : "portal";
    const link = await sb("/auth/v1/admin/generate_link", {
      method: "POST",
      body: { type: "recovery", email, redirect_to: `${site}/${area}/?welcome=1` },
    });
    const actionLink = link.data?.action_link || link.data?.properties?.action_link;
    if (!link.ok || !actionLink) return send(res, 400, { error: "Could not create the link." });
    let emailed = null;
    if (body.sendEmail) {
      emailed = await sendEmail({ to: email, ...T.invite({ name: appMeta.full_name, link: actionLink, staff: kind === "staff" }), kind: "invite",
        log: { customer_id: appMeta.customer_id || null, sent_by: me.id } });
    }
    return send(res, 200, { link: actionLink, existing: Boolean(prof), email: emailed });
  } catch (e) {
    return send(res, e.status || 500, { error: e.status ? e.message : "Something went wrong." });
  }
}
