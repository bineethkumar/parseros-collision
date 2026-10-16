// Public "request an estimate" form (no login). Anyone can submit; nobody can read it back.
import { initSupabase, sb, html, raw, fdate, SLOTS, toast, errMsg, formData, nn, busy, wireVin } from "/shared/core.js";

const app = document.getElementById("app");
const LOGO = raw(`<svg viewBox="0 0 200 52" aria-hidden="true"><path d="M66 24 C92 6 140 3 170 21 L175 25 C146 11 100 11 66 24Z" fill="#fff"/><path d="M4 40 C38 26 110 23 186 30 L196 33 L190 34 C140 32 66 32 8 42Z" fill="#fff"/><path d="M10 45 C64 34 140 34 194 38" stroke="#3fae86" stroke-width="2.6" fill="none"/></svg>`);

function nextWeekdays(n) {
  const out = []; const d = new Date(); d.setHours(12, 0, 0, 0);
  while (out.length < n) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) out.push(d.toISOString().slice(0, 10)); }
  return out;
}

render();
function render() {
  const days = nextWeekdays(15);
  app.innerHTML = String(html`
  <header class="p-top"><a class="p-logo" href="/">${LOGO}<span><b>Parceros</b><small>Collision Center</small></span></a>
    <nav class="p-nav"><a href="/">Home</a><a href="/portal/">Customer login</a></nav>
    <div class="p-who"><a href="tel:+13015950888" style="color:#fff">301-595-0888</a></div></header>
  <main class="p-main">
    <div class="p-head"><div><p class="p-crumb">Free estimates · We accept all insurance estimates</p><h1>Request an estimate</h1></div></div>
    <form class="p-card p-form" id="rform" style="max-width:820px">
      <div class="p-grid3">
        <label class="p-field"><span>Your name *</span><input name="full_name" required maxlength="120" autocomplete="name"></label>
        <label class="p-field"><span>Phone *</span><input name="phone" type="tel" required maxlength="40" autocomplete="tel"></label>
        <label class="p-field"><span>Email</span><input name="email" type="email" maxlength="200" autocomplete="email"></label>
      </div>
      <h3 style="margin-top:8px">Your vehicle</h3>
      <div class="p-vin"><label class="p-field"><span>VIN (optional, fills in the rest)</span><input name="vin" maxlength="17" placeholder="17 characters" style="text-transform:uppercase"></label>
        <button type="button" class="p-btn" data-vin-lookup>Look up</button></div>
      <p class="p-hint" data-vin-result>Find the VIN at the bottom of the windshield on the driver side, or on your insurance card.</p>
      <div class="p-grid3">
        <label class="p-field"><span>Year</span><input name="year" type="number" min="1950" max="2100"></label>
        <label class="p-field"><span>Make</span><input name="make" maxlength="60"></label>
        <label class="p-field"><span>Model</span><input name="model" maxlength="80"></label>
      </div>
      <label class="p-field"><span>What happened? *</span><textarea name="description" required maxlength="4000" placeholder="Rear bumper damage after being hit in a parking lot"></textarea></label>
      <div class="p-grid2">
        <label class="p-field"><span>Best day to bring it in</span><select name="preferred_date"><option value="">Any weekday</option>${days.map((d) => html`<option value="${d}">${fdate(d)} (${new Date(d + "T12:00").toLocaleDateString("en-US", { weekday: "long" })})</option>`)}</select></label>
        <label class="p-field"><span>Time</span><select name="preferred_slot"><option value="">Any time</option>${SLOTS.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
      </div>
      <label class="p-field" style="position:absolute;left:-9999px" aria-hidden="true"><span>Leave empty</span><input name="website" tabindex="-1" autocomplete="off"></label>
      <button class="p-btn p-btn--go" type="submit">Send request</button>
      <p class="p-hint">We call you back during business hours (Mon to Fri, 8 AM to 5 PM). In a hurry? Call <a href="tel:+13015950888">301-595-0888</a>.</p>
    </form>
  </main>`);
  const form = document.getElementById("rform");
  wireVin(form);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formData(form);
    if (f.website) return; // bot trap
    busy(e.submitter, async () => {
      try { await initSupabase(); } catch (err) { return toast(errMsg(err), "err"); }
      const vin = (f.vin || "").toUpperCase();
      const id = crypto.randomUUID(); // the public form can't read the row back, so it picks the id
      const { error } = await sb.from("requests").insert({
        id, full_name: f.full_name, phone: nn(f.phone), email: nn(f.email?.toLowerCase()),
        vin: /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : null, year: f.year ? Number(f.year) : null, make: nn(f.make), model: nn(f.model),
        description: f.description, preferred_date: nn(f.preferred_date), preferred_slot: nn(f.preferred_slot),
      });
      if (error) return toast(errMsg(error), "err");
      fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "request", requestId: id }) }).catch(() => {}); // email the shop
      app.querySelector("main").innerHTML = String(html`<div class="p-card" style="max-width:560px;margin:30px auto;text-align:center">
        <h1>Thank you!</h1><p>We got your request and will call you at <b>${f.phone}</b> to set up your free estimate.</p>
        <a class="p-btn p-btn--go" href="/">Back to the website</a></div>`);
    });
  });
}
