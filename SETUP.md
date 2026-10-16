# Parceros website: setup guide

The project has three parts:

| Part | What it is | Where it runs |
|---|---|---|
| Public site | `index.html`, `garage.css`, `garage.js`, `assets/` | Vercel (and your PC) |
| Portals | `/portal` (customers), `/manage` (owner + staff), `/request` (public estimate form), `/print` | Vercel (and your PC) |
| Server functions | `api/config.js`, `api/vin.js`, `api/invite.js` | Vercel Functions (and `dev-server.mjs` on your PC) |
| Database, logins, photos | `supabase/schema.sql` | Supabase |

---

## 1. Create the Supabase project
1. Go to https://supabase.com, create a project (region: East US). Save the database password somewhere safe.
2. **SQL Editor > New query**, paste ALL of `supabase/schema.sql`, click **Run**. It should say "Success".
   (Safe to run again later; it only adds what is missing.)

## 2. Lock down sign-ups (invite-only)
**Authentication > Sign In / Providers**
- Email provider: **on**.
- **Allow new users to sign up: OFF.** Customers and staff only get in through invite links from the shop.
  (Even if someone signs up anyway, the database gives them no access; this just keeps the user list clean.)

**Authentication > URL Configuration**
- **Site URL**: your real domain, e.g. `https://parceroscollision.com` (use the `vercel.app` address until the domain is live).
- **Redirect URLs**: add all of these:
  - `http://localhost:3000/**`
  - `https://YOUR-PROJECT.vercel.app/**`
  - `https://YOUR-DOMAIN.com/**`

## 3. Make the owner account
1. **Authentication > Users > Add user > Create new user**: owner email + strong password, tick **Auto Confirm User**.
2. **SQL Editor**, run (with that email):
   ```sql
   update public.profiles set role = 'owner', full_name = 'Reynaldo Sosa'
    where email = 'owner@example.com';
   ```
3. Do the same for yourself if you want owner access while building.

## 4. Keys
**Project Settings > API** (or **API Keys**):
- `Project URL` -> `SUPABASE_URL`
- `anon` / publishable key -> `SUPABASE_ANON_KEY` (public, fine in the browser)
- `service_role` / secret key -> `SUPABASE_SERVICE_ROLE_KEY` (**secret**: only in `.env.local` and Vercel settings. Never in GitHub, the browser, or chat.)

On your PC: copy `.env.example` to `.env.local` and paste the values. `.env.local` is in `.gitignore`, so it never goes to GitHub.

## 5. Run it on your PC
1. Install Node.js LTS from https://nodejs.org (one time).
2. Open a terminal in this folder (in VS Code: **Terminal > New Terminal**) and run once: `npm install`
3. Start it: `npm run dev`, then open http://localhost:3000. Press **Ctrl+C** in the terminal to stop it.
   After changing `.env.local`, stop it and run `npm run dev` again.
   - Shop: http://localhost:3000/manage/ (sign in with the owner account)
   - Customers: http://localhost:3000/portal/
   - Estimate form: http://localhost:3000/request/

## 6. GitHub + Vercel (same as Modern Bella)
1. Copy this folder's contents into the GitHub repo that Vercel deploys (include the `assets/` folder). Do **not** copy `.env.local`.
2. In Vercel: **Project > Settings > Environment Variables**, add for Production (and Preview):
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `SITE_URL` = `https://YOUR-DOMAIN.com` (or the `vercel.app` address for now)
3. **Settings > Build**: Framework preset **Other**, no build command, output directory = root.
4. Push to GitHub. Vercel deploys automatically. `vercel.json` adds the security headers.
5. **Domains**: add the shop's domain in Vercel, then update `SITE_URL` (Vercel) and the Site URL (Supabase step 2).

## 7. Daily use
- **New customer**: Manage > Customers > Add customer > add vehicle (VIN look-up) > **Make invite link** > text or email it. The customer opens it and picks a password.
- **Car arrives**: New repair order. Move it across the **Board** (drag) as work progresses. Customers see each stage.
- **Estimate** (owner only): on the repair order > New estimate > lines > **Save & send**. The customer approves with a typed signature. Then **Turn into invoice** and **Mark paid**. **Print / PDF** for paper copies.
- **Website requests** land in **Requests**: schedule a drop-off, or **Car is here: create repair order**.
- **Staff**: Manage > Staff > invite. Staff can work cars, customers and photos but never see money; only owners manage staff.

## Notes and decisions to confirm
- **Sales tax** defaults to 6% on parts and paint materials, not on labor. Confirm with the shop's accountant; it can be changed per estimate.
- **Emails**: the portal emails customers and the shop through your own SMTP mailbox (cPanel). See **section 13**.
- **Photos** are private (signed links that expire in 1 hour). Phone photos are re-saved as JPEG in the browser, which also removes GPS location data.
- **Spam on the public form**: it has a hidden bot trap. If spam shows up, add Cloudflare Turnstile.
- **Backups**: check which backups your Supabase plan includes (Project Settings > Database > Backups) and make sure they are on before the shop relies on the portal.

## 8. Card payments with Stripe
Customers pay invoices by card from their portal. They pay on Stripe's own secure checkout page, so card
numbers never touch this website or Supabase.

**How it works**
- Owner opens a repair order > approved estimate > **Turn into invoice**.
- Optional: type what the **customer owes** (for example their insurance deductible) and **Save amount**. Blank = the full total.
- The customer sees **Pay $X by card** on their repair page, for whatever is still owed. Each payment gets a receipt
  number and a note on their timeline. The invoice turns **Paid in full** when the balance reaches $0.
- The amount is always calculated on the server from the invoice; nobody can change it in the browser.

**Setup**
1. Create a Stripe account for the shop (in the **shop's name**, with the shop's bank account for payouts).
2. **Developers > API keys**: copy the **Secret key** (`sk_test_...` while testing) into `STRIPE_SECRET_KEY`
   in `.env.local` and in Vercel's Environment Variables.
3. **Developers > Webhooks > Add endpoint**:
   - URL: `https://YOUR-DOMAIN/api/stripe-webhook`
   - Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`
   - Copy the **Signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET` (Vercel and `.env.local`).
4. Re-run `supabase/schema.sql` once (it adds the payment fields; safe to re-run).
5. Test with Stripe's test card `4242 4242 4242 4242`, any future date, any CVC.
6. When ready to go live, switch Stripe to **Live mode**, make a live webhook the same way, and replace both keys with the live ones in Vercel.

**Testing on your PC:** the portal confirms the payment when the customer returns from Stripe, so it works locally
without a webhook. To also test the webhook locally, install the Stripe CLI and run
`stripe listen --forward-to localhost:3000/api/stripe-webhook`, then put the `whsec_...` it prints in `.env.local`.

## 9. Cash, check and partial payments, receipts
- **Owner:** on the invoice, the **Payments** box shows what the customer owes, what's been paid and the balance.
  **Record a payment** (cash, check, card at the shop or insurance) takes a full or partial amount. Every payment
  gets a receipt number (starting at #5001) and a **Receipt** link to print.
- **Staff:** on any repair order, **Take a payment**: enter the amount and how they paid, then print the receipt.
  Staff never see prices, totals or the balance. If they type more than is owed, they're told to check with the owner.
  The owner sees who took every payment.
- **Customer:** sees each payment with its receipt, the balance left, and can pay the rest by card.
- **Mistakes:** the owner can **Void** a counter payment with a reason. It stays on record, marked void, and the
  balance goes back up. Online payments can't be voided here; refund them in the Stripe Dashboard.
- Re-run `supabase/schema.sql` once to add this (safe to re-run). Invoices already marked paid get a matching payment row.
- Receipt numbers can occasionally skip a number (that's how database counters work); they never repeat.

**Fees:** Stripe charges a fee on each card payment (see stripe.com/pricing). Refunds are done in the Stripe Dashboard;
after a refund, tell your developer so the payment can be corrected.

## 10. Writing and printing checks (owner only)
The owner writes checks to vendors, the landlord and others from **Manage > Checks**, and prints them on
pre-printed check paper. The website never stores the full bank account number, and the owner signs every check by hand.

**One-time setup**
1. Order **voucher checks for QuickBooks** (letter size: check on top, two stubs below) from the bank or a check
   printer. Bank name, routing/account numbers and check numbers come already printed. Leftover QuickBooks checks work too.
2. Re-run `supabase/schema.sql` once (adds the check tables; safe to re-run).
3. **Manage > Checks**: enter the account name, last 4 digits and the **number on the next blank check**.
4. **Print a test on plain paper**, hold it behind a blank check up to the light, and adjust **Move right / Move down**
   until the dashed boxes sit on the check's lines. Test again until it lines up.

**Daily use**
- **Write a check**: choose the payee (or add a new one), add what it pays for (link lines to a repair order to see
  what each job cost), **Save & print**. Put the matching check number in the printer. Print at **Scale 100%** with
  **Margins: None**, then sign it.
- **Misprinted** (jam, crooked): voids that number and copies the check onto the next one. Write VOID on the spoiled paper and keep it.
- **Void**: lost or wrong check. It stays in the register, marked void. If it was mailed, also ask the bank to stop payment.
- **Cleared bank**: tick checks off as they show on the bank statement. The register shows what's still outstanding.
- **Download list (CSV)**: for the accountant, or to send the bank for Positive Pay (check fraud protection) if they offer it.

## 11. Job profit: technicians, hours and costs
Shows what each repair order really made: **customer charge (before tax) - parts/paint/sublet costs - labor cost**.
Re-run `supabase/schema.sql` once to add it (safe to re-run). If you ran an earlier version that had a separate
"technicians" list, the re-run removes those old tables automatically (only while they are still empty).

**Setup (owner):** your staff are the technicians. Invite each one under **Staff** (they need a login to log
their hours), then click **Set rate** next to their name: what they cost per hour (wage, or wage plus payroll taxes for
true cost). For a raise, click **Change** and enter the new rate with its start date; older hours keep the old rate.
Only owners ever see rates, costs and profit. When someone leaves, turn them off: their past hours still count.

**On each repair order**
- **Job details > Technician on this job**: who's assigned (shows on the board too).
- **Hours worked > Log hours**: staff log their own hours per day; the owner can log for anyone. Staff see hours, never money.
- **Job profit** (owner): charged vs cost for parts, paint, labor and sublet, profit and margin, hours sold vs worked.
  **Add a cost** for parts paid by card, cash, bank transfer or vendor account; **Pay by check** for checks.
- Labor lines on the estimate should be entered as hours x rate (quantity = hours) so "hours sold" is meaningful.

**Reports (owner)**
- **Job profit**: every job invoiced in a month, its profit and margin, and hours and labor cost per technician.
- **Expenses**: all spending in a month by category (expenses + checks written in the portal).

Costs only count when linked to the repair order. Shop-wide costs like rent go in Expenses with no job.

## 12. Backups to the shop's own computer (owner only)
The portal never deletes anything. Backups are copies the shop keeps itself, in case anything ever happens to
Supabase or the account. Re-run `supabase/schema.sql` once to add the backup log (safe to re-run).

**Manage > Backups**
- **Monthly backup**: one zip per month with every repair order opened that month: a folder per job with its
  photos and `job.html` (opens in any browser: customer, vehicle, estimates and invoices with every line, payments,
  hours, costs, profit, timeline and photos), plus `jobs.csv`, `payments.csv`, `expenses.csv`, `checks.csv` and
  `hours.csv` for Excel or the accountant. The page shows which months were downloaded, when and by whom.
- **Full data export**: every record in the portal as data files a developer can load back into a new database
  (restore steps are in its README.txt), plus the same tables as spreadsheets. No photos (those are in the monthly zips).

**Monthly routine (about 10 minutes)**
1. Around the **5th of each month**, download the previous month's backup (wait until its cars are picked up;
   the page warns if some are still in the shop) and a fresh **full data export**.
2. Keep **two copies**: the shop computer, plus an external drive or a cloud folder (OneDrive, Google Drive).
   They contain customer details, so keep them private.
3. **Once a year**, open an old zip and check `job.html` and the photos open.

Busy months take a few minutes (photos download one by one); keep the tab open. If a photo fails, the zip still
finishes and lists it in its README.txt.

**Best protection:** these zips are readable records. The fastest full restore is still Supabase's own daily backups
on the paid plan (Project Settings > Database > Backups).

## 13. Emails (SMTP, e.g. a cPanel mailbox)
**Every** email comes from the Parceros mailbox through the portal, including "Forgot password?" (Supabase sends none).
The portal sends 7 emails plus password resets. Each one has an **"Email the customer"** checkbox, ticked by default, on the action that sends it:

| Email | Sent when |
|---|---|
| Portal invite / password link | Customer page or Staff page > Make invite link |
| Estimate ready | Estimate > Save & send to customer |
| Invoice | Turn into invoice |
| Payment receipt | Record a payment / Take a payment. Online card payments are emailed automatically |
| Car received / ready for pickup | New repair order, stage update, dragging a car on the board (it asks), Car is here |
| Drop-off confirmed | Requests > Schedule drop-off |
| New estimate request (to the shop) | Automatically, when someone sends the website form or books in their portal |

Every email sent is noted on the repair order timeline (shop only). Customers can be switched off update emails
on their customer page (**Email updates**); invites, receipts and password emails always go.

**Setup (all settings, no code)**
1. cPanel > **Email Accounts** > create a mailbox just for the portal, e.g. `portal@yourdomain.com`.
2. Open it > **Connect Devices**: note the outgoing (SMTP) server, port (465 SSL or 587) and username (the full address).
   If you get a certificate error later, use the server name shown there (e.g. `server123.yourhost.com`) instead of `mail.yourdomain.com`.
3. Put them in `.env.local` (your PC) and in **Vercel > Settings > Environment Variables** (see `.env.example`):
   `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `SHOP_NOTIFY_EMAIL`.
4. (Not needed) Supabase's own email settings: the portal sends password resets itself. "Forgot password?" is limited
   to 3 emails per address and 10 tries per visitor per hour, and always gives the same answer so nobody can check who has a login.
5. cPanel > **Email Deliverability**: fix/install **SPF and DKIM** for the domain. If the domain's DNS is managed
   elsewhere (e.g. where it points to Vercel), copy those records there. Keep the **MX** records pointing at cPanel.
   Without SPF/DKIM, emails go to spam.
6. Restart `npm run dev` (run `npm install` first if you haven't). On Vercel, redeploy after changing variables.

**Testing safely:** while `EMAIL_TEST_TO` is set, every email goes to that address instead of the customer, with
"[TEST for customer@...]" in the subject. Use real-looking records without bothering anyone.

**Handover to the shop (owner's email)**
1. In the owner's cPanel: create `portal@theirdomain.com` (step 1-2 above).
2. Vercel: update `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `SHOP_NOTIFY_EMAIL`,
   and **delete `EMAIL_TEST_TO`**. Redeploy. That's the only place email settings live.
3. Their domain: SPF and DKIM (step 5).
4. Send a test: invite yourself as a customer, and use "Forgot password" once.

If an email fails, the reason shows right away in the portal (for example a wrong password), and every attempt is
kept in the `email_log` table (also included in the Full data export).

