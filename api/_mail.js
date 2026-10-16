// Sends email through the shop's SMTP (cPanel mailbox or any email service). Every setting comes
// from environment variables, so changing the sender at handover needs no code change.
// EMAIL_TEST_TO (testing only) sends every email to that address instead of the real recipient.
import nodemailer from "nodemailer";
import { sb } from "./_lib.js";

let transport = null;
export const mailReady = () => ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"].every((k) => process.env[k]);

function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 465 = SSL from the start; 587 upgrades with STARTTLS
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    });
  }
  return transport;
}

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Sends one email and records it in email_log. Never throws: returns { ok, status, error, to }.
// `skip` = a reason not to send (e.g. the customer turned off update emails); it is logged only.
export async function sendEmail({ to, subject, html, text, kind, log = {}, skip = null }) {
  const entry = { kind, to_email: to || null, subject, ...log };
  if (skip) return record({ ...entry, status: "skipped", error: skip });
  if (!to) return record({ ...entry, status: "skipped", error: "No email address on file." });
  if (!mailReady()) return record({ ...entry, status: "skipped", error: "Email is not set up yet (SMTP settings are missing)." });
  const testTo = process.env.EMAIL_TEST_TO;
  try {
    await getTransport().sendMail({
      from: process.env.EMAIL_FROM,
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
      to: testTo || to,
      subject: testTo ? `[TEST for ${to}] ${subject}` : subject,
      html: testTo ? `<p style="background:#fff3cd;padding:10px;font-family:sans-serif">TEST MODE: this email was meant for <b>${esc(to)}</b>.</p>${html}` : html,
      text: testTo ? `TEST MODE: this email was meant for ${to}.\n\n${text}` : text,
    });
    return record({ ...entry, status: "sent" });
  } catch (e) {
    return record({ ...entry, status: "failed", error: `The email server said: ${String(e?.message || e)}`.slice(0, 500) });
  }
}

async function record(row) {
  await sb("/rest/v1/email_log", { method: "POST", body: row, prefer: "return=minimal" }).catch(() => {});
  return { ok: row.status === "sent", status: row.status, error: row.error || null, to: row.to_email };
}
