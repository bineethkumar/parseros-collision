// Printable estimate / invoice (?id=), payment receipt (?receipt=), checks (?check=, owner only)
// or a check alignment test (?checktest=<bank account>). Row-level security decides
// who may open it: the owner; the customer it belongs to; staff only for receipts they took.
import { initSupabase, sb, html, raw, money, fdate, ftime, vehicleName, totals, payMethodLabel, invoiceDue, paidSum, amountWords, checkCategoryLabel, errMsg } from "/shared/core.js";

const app = document.getElementById("app");
const TYPES = { part: "Part", labor: "Labor", paint: "Paint & materials", sublet: "Sublet", other: "Other" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHOP = raw(`<h1 style="font-family:Cinzel,serif;text-transform:none;color:var(--teal-deep)">Parceros Collision Center</h1>
  <p>11322 Old Baltimore Pike<br>Beltsville, MD 20705<br>(301) 595-0888</p>`);

// Where each field prints on QuickBooks-style voucher checks (letter paper: check on top, two stubs).
// Inches from the top-left of the sheet; the bank account's alignment offset moves all of it.
const CHK = {
  date:    { left: 6.55, top: 0.80, width: 1.6 },
  payee:   { left: 1.00, top: 1.32, width: 5.2 },
  amount:  { left: 6.85, top: 1.32, width: 1.35 },
  words:   { left: 0.45, top: 1.67, width: 6.3 },
  address: { left: 1.00, top: 2.02, width: 3.6, height: 0.8 },
  memo:    { left: 0.70, top: 2.85, width: 3.4 },
};
const STUB_TOPS = [3.5, 7.0];
const at = (k) => raw(`left:${CHK[k].left}in;top:${CHK[k].top}in;width:${CHK[k].width}in${CHK[k].height ? `;height:${CHK[k].height}in` : ""}`);
const plainAmount = (cents) => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function checkSheet(c, lines, bank, roNum, test = false) {
  const field = (k, label, content, cls = "") => html`<div class="p-chk-f ${cls}" data-label="${label}" style="${at(k)}">${content}</div>`;
  const stub = (top) => html`<div class="p-chk-stub" style="top:${top}in">
    <div class="p-chk-stubhead"><b>Parceros Collision Center</b><span>Check #${c.check_number}</span><span>${fdate(c.check_date)}</span></div>
    <p><b>${c.payee_name}</b>${c.memo ? html` · ${c.memo}` : ""}</p>
    <table><tbody>${lines.map((l) => html`<tr><td>${l.description}</td><td>${checkCategoryLabel(l.category)}</td><td>${l.ro_id && roNum[l.ro_id] ? "RO #" + roNum[l.ro_id] : ""}</td><td class="num">${money(l.amount_cents)}</td></tr>`)}</tbody></table>
    <div class="p-chk-stubtotal"><span>${bank.name}${bank.last4 ? " ··" + bank.last4 : ""}</span><b>Check total ${money(c.amount_cents)}</b></div>
  </div>`;
  return html`<div class="p-chk-sheet ${test ? "is-test" : ""}">
    <div class="p-chk-print" style="transform:translate(${Number(bank.offset_x_in)}in,${Number(bank.offset_y_in)}in)">
      ${field("date", "Date", fdate(c.check_date))}
      ${field("payee", "Pay to the order of", c.payee_name)}
      ${field("amount", "Amount", "**" + plainAmount(c.amount_cents))}
      ${field("words", "Amount in words", amountWords(c.amount_cents) + " dollars", "p-chk-words")}
      ${field("address", "Address (envelope window)", c.payee_name + (c.payee_address ? "\n" + c.payee_address : ""), "p-chk-address")}
      ${field("memo", "Memo", c.memo || "")}
      ${STUB_TOPS.map(stub)}
    </div>
    ${test ? html`<div class="p-chk-perf" style="top:3.5in"></div><div class="p-chk-perf" style="top:7in"></div>` : ""}
  </div>`;
}

async function checksPage(ids) {
  const checks = (await sb.from("checks").select("*").in("id", ids)).data || [];
  if (checks.length !== ids.length) throw new Error("Check not found, or you do not have access.");
  checks.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const v = checks.find((c) => c.status === "void");
  if (v) throw new Error(`Check #${v.check_number} is void and cannot be printed.`);
  const lines = (await sb.from("check_lines").select("*").in("check_id", ids).order("sort")).data || [];
  const banks = (await sb.from("bank_accounts").select("*").in("id", [...new Set(checks.map((c) => c.bank_account_id))])).data || [];
  const roIds = [...new Set(lines.map((l) => l.ro_id).filter(Boolean))];
  const ros = roIds.length ? (await sb.from("repair_orders").select("id,number").in("id", roIds)).data || [] : [];
  const roNum = Object.fromEntries(ros.map((r) => [r.id, r.number]));
  const nums = checks.map((c) => "#" + c.check_number).join(", ");
  document.title = `Check ${nums} · Parceros Collision Center`;
  return html`<style>@page { size: letter; margin: 0; }</style><div class="p-chk-wrap">
    <div class="p-card p-noprint p-chk-bar">
      <p>Put check <b class="p-mono">${nums}</b> in the printer. The number printed on the paper must match.</p>
      <p class="p-hint">In the print window: <b>Scale 100%</b> (or "Actual size"), <b>Margins: None</b>, headers and footers off. Sign by hand.</p>
      ${checks.some((c) => c.print_count) ? html`<p class="p-hint" style="color:var(--red)">Already printed before. If that paper was spoiled, use <b>Misprinted</b> in the register instead, so the number on the paper matches.</p>` : ""}
      <button class="p-btn p-btn--go" id="pr">Print</button>
    </div>
    ${checks.map((c) => checkSheet(c, lines.filter((l) => l.check_id === c.id), banks.find((b) => b.id === c.bank_account_id), roNum))}
  </div>`;
}

async function checkTestPage(bankId) {
  const bank = (await sb.from("bank_accounts").select("*").eq("id", bankId).maybeSingle()).data;
  if (!bank) throw new Error("Bank account not found, or you do not have access.");
  const c = { check_number: bank.next_check_number, check_date: new Date().toLocaleDateString("en-CA"), payee_name: "Sample Parts Supplier",
    payee_address: "123 Main St\nBeltsville, MD 20705", amount_cents: 123456, memo: "Alignment test, not a check" };
  const lines = [{ description: "Invoice 44812", category: "parts", amount_cents: 100000 }, { description: "Invoice 44830", category: "paint", amount_cents: 23456 }];
  document.title = "Check alignment test · Parceros Collision Center";
  return html`<style>@page { size: letter; margin: 0; }</style><div class="p-chk-wrap">
    <div class="p-card p-noprint p-chk-bar">
      <p><b>Print this on plain paper</b>, then hold it behind a blank check up to a window or light.</p>
      <p class="p-hint">Each dashed box should sit on its line on the check. If everything is off by the same amount, change "Move right / Move down" under <b>Checks › Bank & printer</b> and test again. Use Scale 100% and Margins: None.</p>
      <button class="p-btn p-btn--go" id="pr">Print test</button>
    </div>
    ${checkSheet(c, lines, bank, {}, true)}
  </div>`;
}

async function receiptPage(pid) {
  const pay = (await sb.from("payments").select("*").eq("id", pid).maybeSingle()).data;
  if (!pay) throw new Error("Receipt not found, or you do not have access.");
  const ro = (await sb.from("repair_orders").select("*").eq("id", pay.ro_id).single()).data;
  const [cust, veh, est] = await Promise.all([
    sb.from("customers").select("*").eq("id", ro.customer_id).single().then((r) => r.data),
    ro.vehicle_id ? sb.from("vehicles").select("*").eq("id", ro.vehicle_id).maybeSingle().then((r) => r.data) : null,
    sb.from("estimates").select("*").eq("id", pay.estimate_id).maybeSingle().then((r) => r.data), // null for staff
  ]);
  // balance after this payment: only for people who can see the invoice (owner, the customer)
  let sums = null;
  if (est) {
    const [items, pays] = await Promise.all([
      sb.from("estimate_items").select("*").eq("estimate_id", est.id).then((r) => r.data || []),
      sb.from("payments").select("*").eq("estimate_id", est.id).then((r) => r.data || []),
    ]);
    const due = invoiceDue(est, items);
    const upTo = paidSum(pays.filter((p) => p.created_at <= pay.created_at));
    sums = { due, upTo, left: due - upTo };
  }
  document.title = `Receipt ${pay.receipt_number} · Parceros Collision Center`;
  return html`<main class="p-main" style="max-width:640px">
    <div class="p-row p-noprint" style="margin-bottom:16px"><button class="p-btn p-btn--go" id="pr">Print receipt</button></div>
    <div class="p-card">
      <div class="p-spread" style="align-items:flex-start">
        <div class="p-receipt-shop">${SHOP}</div>
        <div style="text-align:right;margin-left:auto"><h2>Receipt</h2><p class="p-mono">No. ${pay.receipt_number}<br>${ftime(pay.created_at)}</p>
          ${pay.voided_at ? html`<p><span class="p-badge p-badge--red">Void</span></p>` : ""}</div>
      </div>
      <div class="p-grid2" style="margin:18px 0">
        <div><p class="p-mono">Received from</p><p><b>${cust.full_name}</b><br>${cust.phone || ""}</p></div>
        <div><p class="p-mono">For</p><p><b>Repair order #${ro.number}</b><br>${vehicleName(veh)}${veh?.plate ? " · " + veh.plate : ""}</p></div>
      </div>
      <div class="p-total" style="max-width:none;margin-left:0">
        <span>Amount paid</span><b class="num">${money(pay.amount_cents)}</b>
        <span>Method</span><span class="num">${payMethodLabel(pay.method)}${pay.reference ? " · " + pay.reference : ""}</span>
        <span>Received by</span><span class="num">${pay.received_by_name || "Parceros Collision Center"}</span>
        ${sums ? html`<span>Invoice amount</span><span class="num">${money(sums.due)}</span>
          <span>Paid to date</span><span class="num">${money(sums.upTo)}</span>
          <span><b>Balance after this payment</b></span><span class="num"><b>${money(Math.max(0, sums.left))}</b></span>` : ""}
      </div>
      ${pay.note ? html`<p style="margin-top:14px">${pay.note}</p>` : ""}
      ${pay.voided_at ? html`<p style="margin-top:14px;color:var(--red)"><b>This payment was voided</b> on ${fdate(pay.voided_at)}: ${pay.void_reason}</p>`
        : html`<p style="margin-top:18px">${sums && sums.left <= 0 ? "Paid in full. " : ""}Thank you for choosing Parceros!</p>`}
    </div></main>`;
}

(async () => {
  try {
    await initSupabase();
    const qs = new URLSearchParams(location.search);
    const chk = qs.get("check"), test = qs.get("checktest");
    if (chk || test) {
      const ids = (chk || test).split(",").slice(0, 20);
      if (!ids.every((x) => UUID.test(x))) throw new Error("Missing check.");
      const { data: { session } } = await sb.auth.getSession();
      if (!session) throw new Error("Please sign in first, then open this page again.");
      app.innerHTML = String(chk ? await checksPage(ids) : await checkTestPage(ids[0]));
      document.getElementById("pr").addEventListener("click", async () => {
        if (chk) await Promise.all(ids.map((id) => sb.rpc("mark_check_printed", { p_check: id })));
        window.print();
      });
      return;
    }
    const rid = qs.get("receipt");
    if (rid) {
      if (!UUID.test(rid)) throw new Error("Missing receipt.");
      const { data: { session } } = await sb.auth.getSession();
      if (!session) throw new Error("Please sign in first, then open this page again.");
      app.innerHTML = String(await receiptPage(rid));
      document.getElementById("pr").addEventListener("click", () => window.print());
      return;
    }
    const id = qs.get("id") || "";
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Missing estimate.");
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error("Please sign in first, then open this page again.");
    const est = (await sb.from("estimates").select("*").eq("id", id).maybeSingle()).data;
    if (!est) throw new Error("Not found, or you do not have access.");
    const [items, ro, pays] = await Promise.all([
      sb.from("estimate_items").select("*").eq("estimate_id", id).order("sort").then((r) => r.data || []),
      sb.from("repair_orders").select("*").eq("id", est.ro_id).single().then((r) => r.data),
      est.kind === "invoice" ? sb.from("payments").select("*").eq("estimate_id", id).order("created_at").then((r) => r.data || []) : [],
    ]);
    const [cust, veh] = await Promise.all([
      sb.from("customers").select("*").eq("id", ro.customer_id).single().then((r) => r.data),
      ro.vehicle_id ? sb.from("vehicles").select("*").eq("id", ro.vehicle_id).maybeSingle().then((r) => r.data) : null,
    ]);
    const t = totals(items, est.tax_rate);
    const title = est.kind === "invoice" ? "Invoice" : "Estimate";
    document.title = `${title} RO ${ro.number} · Parceros Collision Center`;
    app.innerHTML = String(html`<main class="p-main" style="max-width:860px">
      <div class="p-row p-noprint" style="margin-bottom:16px"><button class="p-btn p-btn--go" id="pr">Print / save as PDF</button></div>
      <div class="p-card">
        <div class="p-spread" style="align-items:flex-start">
          <div>${SHOP}</div>
          <div style="text-align:right"><h2>${title}</h2><p class="p-mono">RO #${ro.number}<br>${fdate(est.sent_at || est.created_at)}</p>
            <p><span class="p-badge">${est.status}</span></p></div>
        </div>
        <div class="p-grid2" style="margin:18px 0">
          <div><p class="p-mono">Customer</p><p><b>${cust.full_name}</b><br>${cust.phone || ""}<br>${cust.email || ""}</p></div>
          <div><p class="p-mono">Vehicle</p><p><b>${vehicleName(veh)}</b>${veh?.vin ? raw("<br>VIN ") : ""}${veh?.vin || ""}${ro.claim_number ? html`<br>Claim ${ro.claim_number}${ro.insurance_company ? " · " + ro.insurance_company : ""}` : ""}</p></div>
        </div>
        <table class="p-table"><thead><tr><th>Type</th><th>Description</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th></tr></thead><tbody>
          ${items.map((i) => html`<tr><td>${TYPES[i.item_type] || ""}</td><td>${i.description}</td><td class="num">${i.qty}</td><td class="num">${money(i.unit_cents)}</td><td class="num">${money(Math.round(i.qty * i.unit_cents))}</td></tr>`)}
        </tbody></table>
        <div class="p-total"><span>Parts & paint</span><span class="num">${money(t.taxable)}</span><span>Labor & other</span><span class="num">${money(t.nontax)}</span><span>Tax (${Number(est.tax_rate)}% on parts & paint)</span><span class="num">${money(t.tax)}</span><b>Total</b><b class="num">${money(t.total)}</b></div>
        ${est.notes ? html`<p style="margin-top:18px">${est.notes}</p>` : ""}
        ${est.signer_name ? html`<p style="margin-top:18px">${est.status === "approved" ? "Approved" : "Declined"} electronically by <b>${est.signer_name}</b> on ${fdate(est.decided_at)}.</p>` : ""}
        ${est.kind === "invoice" ? (() => {
          const due = invoiceDue(est, items), live = pays.filter((p) => !p.voided_at), paid = paidSum(live);
          return html`<h3 style="margin-top:22px">Payments</h3>
            ${live.length ? html`<table class="p-table"><thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th class="num">Amount</th></tr></thead><tbody>
              ${live.map((p) => html`<tr><td class="p-mono">#${p.receipt_number}</td><td>${fdate(p.created_at)}</td><td>${payMethodLabel(p.method)}${p.reference ? " · " + p.reference : ""}</td><td class="num">${money(p.amount_cents)}</td></tr>`)}
            </tbody></table>` : html`<p class="p-muted">No payments yet.</p>`}
            <div class="p-total">${est.customer_due_cents != null ? html`<span>Amount due from customer</span><span class="num">${money(due)}</span>` : ""}
              <span>Paid</span><span class="num">${money(paid)}</span><b>Balance due</b><b class="num">${money(Math.max(0, due - paid))}</b></div>
            ${est.status === "paid" ? html`<p style="margin-top:12px"><b>Paid in full</b> ${fdate(est.paid_at)}. Thank you!</p>` : ""}`;
        })() : ""}
      </div></main>`);
    document.getElementById("pr").addEventListener("click", () => window.print());
  } catch (e) {
    app.innerHTML = String(html`<main class="p-main"><div class="p-card"><h2>Cannot open</h2><p>${errMsg(e)}</p></div></main>`);
  }
})();
