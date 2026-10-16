// The emails the portal sends. Each returns { subject, html, text }. HTML uses inline styles
// and a single table so it looks right in Gmail, Outlook and phone mail apps.

export const SHOP = {
  name: "Parceros Collision Center",
  address: "11322 Old Baltimore Pike, Beltsville, MD 20705",
  phone: "(301) 595-0888",
  hours: "Monday to Friday, 8 AM to 5 PM",
};
const TZ = () => process.env.SHOP_TIMEZONE || "America/New_York";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const usd = (cents) => (Number(cents || 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
export const whenText = (ts) => new Date(ts).toLocaleString("en-US", { timeZone: TZ(), weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
const first = (name) => String(name || "").trim().split(/\s+/)[0] || "there";

// paragraphs: plain strings (escaped here). rows: [label, value] pairs shown as a small table.
function build({ subject, greeting, paragraphs = [], rows = [], button, after = [], updates = false }) {
  const p = (t) => `<p style="margin:0 0 14px">${esc(t)}</p>`;
  const html = `<!doctype html><html><body style="margin:0;background:#eef0ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0ec;padding:24px 10px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0f1412">
<tr><td style="background:#0f1412;color:#ffffff;padding:18px 24px;border-radius:10px 10px 0 0;font-size:18px;font-weight:bold">${esc(SHOP.name)}</td></tr>
<tr><td style="padding:24px">
${p(greeting)}${paragraphs.map(p).join("")}
${rows.length ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;border-top:1px solid #dddddd">${rows.map(([k, v]) => `<tr><td style="padding:7px 0;border-bottom:1px solid #dddddd;color:#56645f">${esc(k)}</td><td style="padding:7px 0;border-bottom:1px solid #dddddd;text-align:right;font-weight:bold">${esc(v)}</td></tr>`).join("")}</table>` : ""}
${button ? `<p style="margin:22px 0"><a href="${esc(button.href)}" style="background:#1f7a5a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;display:inline-block">${esc(button.label)}</a></p>` : ""}
${after.map(p).join("")}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #dddddd;font-size:13px;color:#56645f">
${esc(SHOP.name)} · ${esc(SHOP.address)} · ${esc(SHOP.phone)}<br>Questions? Reply to this email or give us a call.${updates ? "<br>Don't want these updates by email? Reply and we'll turn them off." : ""}
</td></tr></table></td></tr></table></body></html>`;
  const text = [greeting, "", ...paragraphs.flatMap((t) => [t, ""]), ...rows.map(([k, v]) => `${k}: ${v}`), rows.length ? "" : null,
    button ? `${button.label}: ${button.href}` : null, button ? "" : null, ...after.flatMap((t) => [t, ""]),
    "--", `${SHOP.name} · ${SHOP.address} · ${SHOP.phone}`, "Questions? Reply to this email or give us a call.",
    updates ? "Don't want these updates by email? Reply and we'll turn them off." : null].filter((x) => x !== null).join("\n");
  return { subject, html, text };
}

export const invite = ({ name, link, staff }) => build({
  subject: staff ? `Your ${SHOP.name} staff login` : `Your ${SHOP.name} customer portal`,
  greeting: `Hi ${first(name)},`,
  paragraphs: staff
    ? ["You've been given a login for the Parceros shop portal. Click below to choose your password."]
    : ["You now have your own customer portal with Parceros. You can follow your repair step by step, see photos, approve estimates and pay online.",
       "Click below to choose your password."],
  button: { label: "Choose my password", href: link },
  after: ["This link works once and expires after 24 hours. If it has expired, contact us for a new one."],
});

export const passwordReset = ({ name, link }) => build({
  subject: `Reset your ${SHOP.name} password`,
  greeting: `Hi ${first(name)},`,
  paragraphs: ["Someone (hopefully you) asked to reset the password for your Parceros login. Click below to choose a new one."],
  button: { label: "Choose a new password", href: link },
  after: ["This link works once and expires after 24 hours.", "Didn't ask for this? You can ignore this email. Your password stays the same."],
});

export const estimate =({ name, ro, vehicle, total, link }) => build({
  subject: `Your estimate for RO #${ro} is ready`,
  greeting: `Hi ${first(name)},`,
  paragraphs: [`The estimate for your ${vehicle} is ready to review. You can see every line and approve it in your portal.`],
  rows: [["Repair order", `#${ro}`], ["Vehicle", vehicle], ["Estimate total", usd(total)]],
  button: { label: "Review my estimate", href: link },
  updates: true,
});

export const invoice = ({ name, ro, vehicle, total, due, balance, link }) => build({
  subject: `Your invoice for RO #${ro}`,
  greeting: `Hi ${first(name)},`,
  paragraphs: [`Your invoice for the ${vehicle} is ready.${balance > 0 ? " You can pay it by card in your portal, or when you pick up your vehicle." : ""}`],
  rows: [["Repair order", `#${ro}`], ["Invoice total", usd(total)], ...(due !== total ? [["Your share", usd(due)]] : []), ["Balance due", usd(Math.max(0, balance))]],
  button: { label: balance > 0 ? "View and pay" : "View invoice", href: link },
  updates: true,
});

export const receipt = ({ name, receiptNo, amount, method, ro, vehicle, balance, when, link }) => build({
  subject: `Receipt #${receiptNo}: ${usd(amount)} received`,
  greeting: `Hi ${first(name)},`,
  paragraphs: ["Thank you! Here is your receipt."],
  rows: [["Receipt", `#${receiptNo}`], ["Date", when], ["Amount paid", usd(amount)], ["Paid by", method], ["For", `Repair order #${ro} · ${vehicle}`],
    ...(balance != null ? [["Balance left", balance > 0 ? usd(balance) : "Paid in full"]] : [])],
  button: link ? { label: "Open my portal", href: link } : null,
});

export const status = ({ name, ro, vehicle, stage, link }) => stage === "ready"
  ? build({
      subject: `Your ${vehicle} is ready for pickup`,
      greeting: `Hi ${first(name)},`,
      paragraphs: [`Good news: your ${vehicle} (repair order #${ro}) is ready for pickup.`, `We're open ${SHOP.hours} at ${SHOP.address}.`],
      button: { label: "See details and pay", href: link },
      after: [`Need another time? Call us at ${SHOP.phone}.`],
      updates: true,
    })
  : build({
      subject: `We have your ${vehicle}`,
      greeting: `Hi ${first(name)},`,
      paragraphs: [`Your ${vehicle} is checked in at Parceros (repair order #${ro}). We'll inspect it and send your estimate soon.`,
        "You can follow every step and see photos in your portal."],
      button: { label: "Follow my repair", href: link },
      updates: true,
    });

export const dropoff = ({ name, when, vehicle, link }) => build({
  subject: `Drop-off confirmed: ${when}`,
  greeting: `Hi ${first(name)},`,
  paragraphs: [`You're booked to drop off your ${vehicle || "vehicle"} on ${when}.`, `Address: ${SHOP.address}.`],
  button: link ? { label: "Open my portal", href: link } : null,
  after: [`Need to change the time? Reply to this email or call ${SHOP.phone}.`],
  updates: true,
});

export const newRequest = ({ r, link }) => build({
  subject: `New estimate request: ${r.full_name}`,
  greeting: "New request from the website.",
  rows: [["Name", r.full_name], ["Phone", r.phone || ""], ["Email", r.email || ""],
    ["Vehicle", [r.year, r.make, r.model].filter(Boolean).join(" ") || "Not given"],
    ["Wants", [r.preferred_date || "Any day", r.preferred_slot || ""].filter(Boolean).join(", ")]],
  paragraphs: r.description ? [`Damage: ${r.description}`] : [],
  button: { label: "Open requests", href: link },
});
