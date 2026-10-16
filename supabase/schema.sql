-- =====================================================================
-- Parceros Collision Center: customer + management portal
-- Run this whole file once in Supabase: Dashboard > SQL Editor > New query.
-- Safe to re-run: it only creates what is missing and replaces policies/functions.
-- =====================================================================


-- ---------- tables ----------------------------------------------------

create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null check (char_length(full_name) between 1 and 120),
  email       text check (email is null or char_length(email) <= 200),
  phone       text check (phone is null or char_length(phone) <= 40),
  address     text check (address is null or char_length(address) <= 300),
  notes       text check (notes is null or char_length(notes) <= 4000),
  created_at  timestamptz not null default now()
);

-- One row per signed-in person. Role comes ONLY from app_metadata set by the
-- invite function (users cannot change app_metadata themselves).
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         text not null default 'none' check (role in ('owner','staff','customer','none')),
  full_name    text,
  email        text,
  customer_id  uuid references public.customers(id) on delete set null,
  disabled     boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists public.vehicles (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers(id) on delete cascade,
  vin          text check (vin is null or vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  year         int check (year is null or year between 1950 and 2100),
  make         text check (make is null or char_length(make) <= 60),
  model        text check (model is null or char_length(model) <= 80),
  trim_level   text check (trim_level is null or char_length(trim_level) <= 80),
  color        text check (color is null or char_length(color) <= 40),
  plate        text check (plate is null or char_length(plate) <= 20),
  created_at   timestamptz not null default now()
);

create sequence if not exists public.ro_number_seq start 1001;

create table if not exists public.repair_orders (
  id                uuid primary key default gen_random_uuid(),
  number            int not null unique default nextval('public.ro_number_seq'),
  customer_id       uuid not null references public.customers(id) on delete restrict,
  vehicle_id        uuid references public.vehicles(id) on delete set null,
  status            text not null default 'received'
                    check (status in ('received','estimate','approval','parts','body','paint','reassembly','ready','delivered')),
  description       text check (description is null or char_length(description) <= 4000),
  insurance_company text check (insurance_company is null or char_length(insurance_company) <= 120),
  claim_number      text check (claim_number is null or char_length(claim_number) <= 80),
  promised_date     date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.ro_events (
  id                   uuid primary key default gen_random_uuid(),
  ro_id                uuid not null references public.repair_orders(id) on delete cascade,
  status               text,
  note                 text check (note is null or char_length(note) <= 2000),
  visible_to_customer  boolean not null default true,
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now()
);

create table if not exists public.estimates (
  id           uuid primary key default gen_random_uuid(),
  ro_id        uuid not null references public.repair_orders(id) on delete cascade,
  kind         text not null default 'estimate' check (kind in ('estimate','invoice')),
  status       text not null default 'draft'
               check (status in ('draft','sent','approved','declined','unpaid','paid')),
  tax_rate     numeric(5,3) not null default 6.000 check (tax_rate between 0 and 30),
  notes        text check (notes is null or char_length(notes) <= 4000),
  signer_name  text check (signer_name is null or char_length(signer_name) <= 120),
  sent_at      timestamptz,
  decided_at   timestamptz,
  paid_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- Payments (added later; additive so re-running is safe)
alter table public.estimates add column if not exists customer_due_cents int
  check (customer_due_cents is null or customer_due_cents between 0 and 100000000);   -- e.g. deductible; null = full total
alter table public.estimates add column if not exists paid_cents int check (paid_cents is null or paid_cents >= 0);
alter table public.estimates add column if not exists paid_method text
  check (paid_method is null or paid_method in ('online','card','cash','check','insurance'));
alter table public.estimates add column if not exists stripe_session_id text;
alter table public.estimates add column if not exists stripe_payment_intent text;
create unique index if not exists estimates_stripe_session_uq on public.estimates(stripe_session_id) where stripe_session_id is not null;

create table if not exists public.estimate_items (
  id           uuid primary key default gen_random_uuid(),
  estimate_id  uuid not null references public.estimates(id) on delete cascade,
  item_type    text not null default 'part' check (item_type in ('part','labor','paint','sublet','other')),
  description  text not null check (char_length(description) between 1 and 300),
  qty          numeric(10,2) not null default 1 check (qty > 0 and qty < 100000),
  unit_cents   int not null default 0 check (unit_cents between 0 and 100000000),
  sort         int not null default 0
);

create table if not exists public.requests (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid references public.customers(id) on delete set null,
  vehicle_id      uuid references public.vehicles(id) on delete set null,
  full_name       text not null check (char_length(full_name) between 1 and 120),
  email           text check (email is null or char_length(email) <= 200),
  phone           text check (phone is null or char_length(phone) <= 40),
  vin             text check (vin is null or vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  year            int check (year is null or year between 1950 and 2100),
  make            text check (make is null or char_length(make) <= 60),
  model           text check (model is null or char_length(model) <= 80),
  description     text check (description is null or char_length(description) <= 4000),
  preferred_date  date,
  preferred_slot  text check (preferred_slot is null or preferred_slot in ('8-10','10-12','12-2','2-5')),
  status          text not null default 'new' check (status in ('new','scheduled','converted','closed')),
  scheduled_for   timestamptz,
  shop_notes      text check (shop_notes is null or char_length(shop_notes) <= 2000),
  created_at      timestamptz not null default now()
);

create table if not exists public.photos (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          uuid not null references public.customers(id) on delete cascade,
  ro_id                uuid references public.repair_orders(id) on delete cascade,
  request_id           uuid references public.requests(id) on delete cascade,
  storage_path         text not null unique,
  caption              text check (caption is null or char_length(caption) <= 200),
  visible_to_customer  boolean not null default true,
  uploaded_by          uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now()
);

create index if not exists vehicles_customer_idx on public.vehicles(customer_id);
create index if not exists ros_customer_idx     on public.repair_orders(customer_id);
create index if not exists ros_status_idx       on public.repair_orders(status);
create index if not exists events_ro_idx        on public.ro_events(ro_id);
create index if not exists estimates_ro_idx     on public.estimates(ro_id);
create index if not exists items_estimate_idx   on public.estimate_items(estimate_id);
create index if not exists photos_ro_idx        on public.photos(ro_id);
create index if not exists photos_customer_idx  on public.photos(customer_id);
create index if not exists requests_status_idx  on public.requests(status);

-- ---------- role helpers (security definer, read-only) -------------------

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid() and not disabled), 'none')
$$;

create or replace function public.my_customer_id() returns uuid
language sql stable security definer set search_path = public as $$
  select customer_id from public.profiles where id = auth.uid() and not disabled and role = 'customer'
$$;

create or replace function public.is_shop() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() in ('owner','staff')
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'owner'
$$;

-- ---------- new auth user -> profile (role from app_metadata only) ---------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r   text := coalesce(new.raw_app_meta_data->>'role', 'none');
  cid uuid;
begin
  if r not in ('owner','staff','customer') then r := 'none'; end if;
  begin
    cid := nullif(new.raw_app_meta_data->>'customer_id', '')::uuid;
  exception when others then cid := null;
  end;
  if r <> 'customer' then cid := null; end if;
  insert into public.profiles (id, role, full_name, email, customer_id)
  values (new.id, r, coalesce(new.raw_app_meta_data->>'full_name', new.email), new.email, cid)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Supabase's admin API creates the user FIRST and attaches app_metadata in a
-- second UPDATE, so also sync the profile when app_metadata.role / customer_id
-- change. Only the service role can change app_metadata (users cannot), and we
-- only act when app_metadata actually carries a role, so an owner promoted by
-- SQL is never downgraded by routine sign-in updates.
create or replace function public.sync_profile_from_app_meta() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r   text := new.raw_app_meta_data->>'role';
  cid uuid;
begin
  if r is null or r not in ('owner','staff','customer') then return new; end if;
  if (old.raw_app_meta_data->>'role') is not distinct from r
     and (old.raw_app_meta_data->>'customer_id') is not distinct from (new.raw_app_meta_data->>'customer_id') then
    return new;
  end if;
  begin
    cid := nullif(new.raw_app_meta_data->>'customer_id', '')::uuid;
  exception when others then cid := null;
  end;
  if r <> 'customer' then cid := null; end if;
  insert into public.profiles (id, role, full_name, email, customer_id)
  values (new.id, r, coalesce(new.raw_app_meta_data->>'full_name', new.email), new.email, cid)
  on conflict (id) do update
    set role = excluded.role,
        customer_id = excluded.customer_id,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end $$;

drop trigger if exists on_auth_user_meta_updated on auth.users;
create trigger on_auth_user_meta_updated after update of raw_app_meta_data on auth.users
  for each row execute function public.sync_profile_from_app_meta();

-- One-time repair for logins that were invited before this fix (safe to re-run).
update public.profiles p
   set role = u.raw_app_meta_data->>'role',
       customer_id = case when u.raw_app_meta_data->>'role' = 'customer'
                          then nullif(u.raw_app_meta_data->>'customer_id', '')::uuid end
  from auth.users u
 where u.id = p.id
   and p.role = 'none'
   and u.raw_app_meta_data->>'role' in ('owner','staff','customer');

-- ---------- updated_at ---------------------------------------------------

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists ros_touch on public.repair_orders;
create trigger ros_touch before update on public.repair_orders
  for each row execute function public.touch_updated_at();

-- ---------- row level security -----------------------------------------

alter table public.customers      enable row level security;
alter table public.profiles       enable row level security;
alter table public.vehicles       enable row level security;
alter table public.repair_orders  enable row level security;
alter table public.ro_events      enable row level security;
alter table public.estimates      enable row level security;
alter table public.estimate_items enable row level security;
alter table public.requests       enable row level security;
alter table public.photos         enable row level security;

-- profiles
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_shop());
drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update on public.profiles for update to authenticated
  using (public.is_owner() and id <> auth.uid()) with check (public.is_owner());

-- customers
drop policy if exists customers_read on public.customers;
create policy customers_read on public.customers for select to authenticated
  using (public.is_shop() or id = public.my_customer_id());
drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers for insert to authenticated
  with check (public.is_shop());
drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers for update to authenticated
  using (public.is_shop()) with check (public.is_shop());
drop policy if exists customers_delete on public.customers;
create policy customers_delete on public.customers for delete to authenticated
  using (public.is_owner());

-- vehicles
drop policy if exists vehicles_read on public.vehicles;
create policy vehicles_read on public.vehicles for select to authenticated
  using (public.is_shop() or customer_id = public.my_customer_id());
drop policy if exists vehicles_insert on public.vehicles;
create policy vehicles_insert on public.vehicles for insert to authenticated
  with check (public.is_shop() or customer_id = public.my_customer_id());
drop policy if exists vehicles_update on public.vehicles;
create policy vehicles_update on public.vehicles for update to authenticated
  using (public.is_shop()) with check (public.is_shop());
drop policy if exists vehicles_delete on public.vehicles;
create policy vehicles_delete on public.vehicles for delete to authenticated
  using (public.is_owner());

-- repair orders
drop policy if exists ros_read on public.repair_orders;
create policy ros_read on public.repair_orders for select to authenticated
  using (public.is_shop() or customer_id = public.my_customer_id());
drop policy if exists ros_insert on public.repair_orders;
create policy ros_insert on public.repair_orders for insert to authenticated
  with check (public.is_shop());
drop policy if exists ros_update on public.repair_orders;
create policy ros_update on public.repair_orders for update to authenticated
  using (public.is_shop()) with check (public.is_shop());
drop policy if exists ros_delete on public.repair_orders;
create policy ros_delete on public.repair_orders for delete to authenticated
  using (public.is_owner());

-- events
drop policy if exists events_read on public.ro_events;
create policy events_read on public.ro_events for select to authenticated
  using (public.is_shop() or (visible_to_customer and exists (
    select 1 from public.repair_orders r where r.id = ro_id and r.customer_id = public.my_customer_id())));
drop policy if exists events_insert on public.ro_events;
create policy events_insert on public.ro_events for insert to authenticated
  with check (public.is_shop());

-- estimates: money is owner-only for the shop side
drop policy if exists estimates_read on public.estimates;
create policy estimates_read on public.estimates for select to authenticated
  using (public.is_owner() or (status <> 'draft' and exists (
    select 1 from public.repair_orders r where r.id = ro_id and r.customer_id = public.my_customer_id())));
drop policy if exists estimates_owner_write on public.estimates;
create policy estimates_owner_write on public.estimates for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists items_read on public.estimate_items;
create policy items_read on public.estimate_items for select to authenticated
  using (exists (select 1 from public.estimates e where e.id = estimate_id));  -- inherits estimates_read
drop policy if exists items_owner_write on public.estimate_items;
create policy items_owner_write on public.estimate_items for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- requests: anyone may submit (insert only, cannot read back); customers see their own
drop policy if exists requests_public_insert on public.requests;
create policy requests_public_insert on public.requests for insert to anon
  with check (customer_id is null and vehicle_id is null and status = 'new'
              and scheduled_for is null and shop_notes is null);
drop policy if exists requests_customer_insert on public.requests;
create policy requests_customer_insert on public.requests for insert to authenticated
  with check (public.is_shop() or (customer_id = public.my_customer_id() and status = 'new'
              and scheduled_for is null and shop_notes is null
              and (vehicle_id is null or exists (select 1 from public.vehicles v
                   where v.id = vehicle_id and v.customer_id = public.my_customer_id()))));
drop policy if exists requests_read on public.requests;
create policy requests_read on public.requests for select to authenticated
  using (public.is_shop() or customer_id = public.my_customer_id());
drop policy if exists requests_update on public.requests;
create policy requests_update on public.requests for update to authenticated
  using (public.is_shop()) with check (public.is_shop());

-- photos (rows; the files themselves are in the private "photos" bucket)
drop policy if exists photos_read on public.photos;
create policy photos_read on public.photos for select to authenticated
  using (public.is_shop() or (customer_id = public.my_customer_id() and visible_to_customer));
drop policy if exists photos_insert on public.photos;
create policy photos_insert on public.photos for insert to authenticated
  with check (
    uploaded_by = auth.uid() and (
      public.is_shop()
      or (customer_id = public.my_customer_id() and visible_to_customer
          and storage_path like (public.my_customer_id()::text || '/%')
          and (ro_id is null or exists (select 1 from public.repair_orders r
               where r.id = ro_id and r.customer_id = public.my_customer_id()))
          and (request_id is null or exists (select 1 from public.requests q
               where q.id = request_id and q.customer_id = public.my_customer_id())))));
drop policy if exists photos_update on public.photos;
create policy photos_update on public.photos for update to authenticated
  using (public.is_shop()) with check (public.is_shop());
drop policy if exists photos_delete on public.photos;
create policy photos_delete on public.photos for delete to authenticated
  using (public.is_owner());

-- ---------- RPCs (atomic actions with their own checks) -------------------

-- Shop moves a car to a new stage and logs it on the customer timeline.
create or replace function public.set_ro_status(p_ro uuid, p_status text, p_note text, p_visible boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_shop() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('received','estimate','approval','parts','body','paint','reassembly','ready','delivered') then
    raise exception 'bad status';
  end if;
  update public.repair_orders set status = p_status where id = p_ro;
  if not found then raise exception 'not found'; end if;
  insert into public.ro_events (ro_id, status, note, visible_to_customer, created_by)
  values (p_ro, p_status, nullif(left(coalesce(p_note,''), 2000), ''), coalesce(p_visible, true), auth.uid());
end $$;

-- Customer approves or declines a sent estimate (only theirs, only once).
create or replace function public.decide_estimate(p_estimate uuid, p_decision text, p_signer text)
returns void language plpgsql security definer set search_path = public as $$
declare v_ro uuid;
begin
  if p_decision not in ('approved','declined') then raise exception 'bad decision'; end if;
  if coalesce(trim(p_signer),'') = '' then raise exception 'signature required'; end if;
  select e.ro_id into v_ro from public.estimates e
    join public.repair_orders r on r.id = e.ro_id
   where e.id = p_estimate and e.kind = 'estimate' and e.status = 'sent'
     and r.customer_id = public.my_customer_id();
  if v_ro is null then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.estimates set status = p_decision, decided_at = now(), signer_name = left(trim(p_signer), 120)
   where id = p_estimate;
  insert into public.ro_events (ro_id, status, note, visible_to_customer, created_by)
  values (v_ro, null, 'Estimate ' || p_decision || ' by ' || left(trim(p_signer),120), true, auth.uid());
  if p_decision = 'approved' then
    update public.repair_orders set status = 'parts' where id = v_ro and status in ('received','estimate','approval');
  end if;
end $$;

revoke all on function public.set_ro_status(uuid,text,text,boolean) from public, anon;
revoke all on function public.decide_estimate(uuid,text,text) from public, anon;
grant execute on function public.set_ro_status(uuid,text,text,boolean) to authenticated;
grant execute on function public.decide_estimate(uuid,text,text) to authenticated;
grant execute on function public.my_role() to authenticated;

-- ---------- payments: partial payments, receipts, who took the money -----------
-- Every payment (cash, check, card at the counter, insurance, online) is one row with
-- its own receipt number. The invoice turns "paid" when the balance reaches $0.
-- Rows are only written through the functions below, never directly from the browser.

alter table public.estimates drop constraint if exists estimates_paid_method_check;
alter table public.estimates add constraint estimates_paid_method_check
  check (paid_method is null or paid_method in ('online','card','cash','check','insurance','mixed'));

create sequence if not exists public.receipt_number_seq start 5001;

create table if not exists public.payments (
  id                     uuid primary key default gen_random_uuid(),
  receipt_number         int not null unique default nextval('public.receipt_number_seq'),
  estimate_id            uuid not null references public.estimates(id) on delete restrict,
  ro_id                  uuid not null references public.repair_orders(id) on delete restrict,
  amount_cents           int not null check (amount_cents > 0 and amount_cents <= 100000000),
  method                 text not null check (method in ('cash','check','card','insurance','online')),
  reference              text check (reference is null or char_length(reference) <= 80),   -- check number, claim payment id, last 4
  note                   text check (note is null or char_length(note) <= 500),
  received_by            uuid references auth.users(id) on delete set null,
  received_by_name       text check (received_by_name is null or char_length(received_by_name) <= 120),
  stripe_session_id      text unique,
  stripe_payment_intent  text,
  voided_at              timestamptz,
  voided_by_name         text,
  void_reason            text check (void_reason is null or char_length(void_reason) <= 300),
  created_at             timestamptz not null default now()
);
create index if not exists payments_estimate_idx on public.payments(estimate_id);
create index if not exists payments_ro_idx on public.payments(ro_id);

alter table public.payments enable row level security;
-- owner: everything; staff: only payments they took (so they can reprint the receipt,
-- without seeing what else was paid); customer: payments on their own invoices.
drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments for select to authenticated
  using (public.is_owner()
         or (public.my_role() = 'staff' and received_by = auth.uid())
         or exists (select 1 from public.estimates e join public.repair_orders r on r.id = e.ro_id
                     where e.id = estimate_id and e.status <> 'draft' and r.customer_id = public.my_customer_id()));
-- no insert/update/delete policies on purpose

-- What is owed on an invoice before any payments (the owner-set amount, or items + tax).
-- Must match invoiceTotalCents() in api/_lib.js and totals() in shared/core.js.
create or replace function public.invoice_due_cents(p_estimate uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(e.customer_due_cents,
           (coalesce(sum(round(i.qty * i.unit_cents)), 0)
            + round(coalesce(sum(round(i.qty * i.unit_cents)) filter (where i.item_type in ('part','paint')), 0) * e.tax_rate / 100))::int)
    from public.estimates e left join public.estimate_items i on i.estimate_id = e.id
   where e.id = p_estimate
   group by e.id, e.customer_due_cents, e.tax_rate
$$;

create or replace function public.invoice_balance_cents(p_estimate uuid)
returns int language sql stable security definer set search_path = public as $$
  select public.invoice_due_cents(p_estimate)
         - coalesce((select sum(amount_cents) from public.payments
                      where estimate_id = p_estimate and voided_at is null), 0)::int
$$;

-- Recomputes paid/unpaid from the payment rows. Internal.
create or replace function public.settle_invoice(p_estimate uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_paid int; v_methods int; v_method text; v_last timestamptz;
begin
  select coalesce(sum(amount_cents),0), count(distinct method), min(method), max(created_at)
    into v_paid, v_methods, v_method, v_last
    from public.payments where estimate_id = p_estimate and voided_at is null;
  if v_paid > 0 and public.invoice_balance_cents(p_estimate) <= 0 then
    update public.estimates set status = 'paid', paid_at = coalesce(v_last, now()), paid_cents = v_paid,
           paid_method = case when v_methods = 1 then v_method else 'mixed' end
     where id = p_estimate and kind = 'invoice';
    return true;
  end if;
  update public.estimates set status = 'unpaid', paid_at = null, paid_cents = nullif(v_paid, 0),
         paid_method = case when v_methods = 1 then v_method when v_methods > 1 then 'mixed' end
   where id = p_estimate and kind = 'invoice' and status in ('unpaid','paid');
  return false;
end $$;

-- Owner or staff takes a payment at the counter. Staff pass only the repair order:
-- they never see the invoice, prices or balance. Returns the receipt number.
create or replace function public.record_payment(p_ro uuid, p_estimate uuid, p_amount_cents int,
                                                 p_method text, p_reference text, p_note text)
returns json language plpgsql security definer set search_path = public as $$
declare v_est uuid; v_bal int; v_id uuid; v_receipt int; v_name text; v_full boolean;
begin
  if not public.is_shop() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_method not in ('cash','check','card','insurance') then raise exception 'Choose how they paid.'; end if;
  if p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 100000000 then raise exception 'Enter the amount received.'; end if;
  if p_estimate is not null and not public.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;

  select e.id into v_est from public.estimates e
   where e.ro_id = p_ro and e.kind = 'invoice' and e.status = 'unpaid'
     and (p_estimate is null or e.id = p_estimate)
   order by e.created_at desc limit 1
   for update;
  if v_est is null then
    raise exception 'There is no open invoice on this repair order yet. Ask the owner to send the invoice first.';
  end if;

  v_bal := public.invoice_balance_cents(v_est);
  if p_amount_cents > v_bal then
    if public.is_owner() then
      raise exception 'That is more than the balance ($%).', to_char(v_bal / 100.0, 'FM999999990.00');
    end if;
    raise exception 'That is more than what is owed on this invoice. Please check the amount with the owner.';
  end if;

  select full_name into v_name from public.profiles where id = auth.uid();
  insert into public.payments (estimate_id, ro_id, amount_cents, method, reference, note, received_by, received_by_name)
  values (v_est, p_ro, p_amount_cents, p_method,
          nullif(left(trim(coalesce(p_reference,'')), 80), ''), nullif(left(trim(coalesce(p_note,'')), 500), ''),
          auth.uid(), left(coalesce(v_name, 'Shop'), 120))
  returning id, receipt_number into v_id, v_receipt;

  v_full := public.settle_invoice(v_est);
  insert into public.ro_events (ro_id, status, note, visible_to_customer, created_by)
  values (p_ro, null, 'Payment received: $' || to_char(p_amount_cents / 100.0, 'FM999999990.00') || ' (' || p_method || '). Receipt #' || v_receipt
          || case when v_full then '. Paid in full, thank you!' else '' end, true, auth.uid());
  return json_build_object('id', v_id, 'receipt_number', v_receipt, 'paid_in_full', v_full);
end $$;

-- Owner cancels a payment entered by mistake. The row stays, marked void.
create or replace function public.void_payment(p_payment uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_est uuid; v_ro uuid; v_receipt int; v_name text;
begin
  if not public.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Give a reason.'; end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  update public.payments set voided_at = now(), voided_by_name = left(coalesce(v_name,'Owner'),120), void_reason = left(trim(p_reason), 300)
   where id = p_payment and voided_at is null and method <> 'online'
  returning estimate_id, ro_id, receipt_number into v_est, v_ro, v_receipt;
  if v_est is null then raise exception 'Payment not found, already void, or paid online (refund it in Stripe).'; end if;
  perform public.settle_invoice(v_est);
  insert into public.ro_events (ro_id, status, note, visible_to_customer, created_by)
  values (v_ro, null, 'Receipt #' || v_receipt || ' was cancelled (entered by mistake). Your balance has been updated.', true, auth.uid());
end $$;

-- Server only (Stripe webhook / return page): records a paid Checkout session once.
create or replace function public.record_online_payment(p_estimate uuid, p_amount_cents int, p_session text, p_intent text)
returns json language plpgsql security definer set search_path = public as $$
declare v_ro uuid; v_id uuid; v_receipt int; v_full boolean;
begin
  select ro_id into v_ro from public.estimates where id = p_estimate and kind = 'invoice' for update;
  if v_ro is null then raise exception 'invoice not found'; end if;
  if exists (select 1 from public.payments where stripe_session_id = p_session) then
    return json_build_object('already', true, 'ro_id', v_ro);
  end if;
  insert into public.payments (estimate_id, ro_id, amount_cents, method, received_by_name, stripe_session_id, stripe_payment_intent)
  values (p_estimate, v_ro, p_amount_cents, 'online', 'Online (Stripe)', p_session, p_intent)
  returning id, receipt_number into v_id, v_receipt;
  v_full := public.settle_invoice(p_estimate);
  update public.estimates set stripe_session_id = p_session, stripe_payment_intent = p_intent
   where id = p_estimate and stripe_session_id is null;
  insert into public.ro_events (ro_id, status, note, visible_to_customer)
  values (v_ro, null, 'Payment received online: $' || to_char(p_amount_cents / 100.0, 'FM999999990.00') || '. Receipt #' || v_receipt
          || case when v_full then '. Paid in full, thank you!' else '' end, true);
  return json_build_object('id', v_id, 'receipt_number', v_receipt, 'paid_in_full', v_full, 'ro_id', v_ro);
end $$;

-- One-time: invoices marked paid before the payments table existed get a matching row.
insert into public.payments (estimate_id, ro_id, amount_cents, method, received_by_name, stripe_session_id, stripe_payment_intent, created_at)
select e.id, e.ro_id, e.paid_cents, case when e.paid_method in ('cash','check','card','insurance','online') then e.paid_method else 'cash' end,
       'Recorded before receipts', e.stripe_session_id, e.stripe_payment_intent, coalesce(e.paid_at, now())
  from public.estimates e
 where e.kind = 'invoice' and e.status = 'paid' and coalesce(e.paid_cents,0) > 0
   and not exists (select 1 from public.payments p where p.estimate_id = e.id);

revoke all on function public.invoice_due_cents(uuid) from public, anon, authenticated;
revoke all on function public.invoice_balance_cents(uuid) from public, anon, authenticated;
revoke all on function public.settle_invoice(uuid) from public, anon, authenticated;
revoke all on function public.record_online_payment(uuid,int,text,text) from public, anon, authenticated;
revoke all on function public.record_payment(uuid,uuid,int,text,text,text) from public, anon;
revoke all on function public.void_payment(uuid,text) from public, anon;
grant execute on function public.invoice_balance_cents(uuid) to service_role;
grant execute on function public.record_online_payment(uuid,int,text,text) to service_role;
grant execute on function public.record_payment(uuid,uuid,int,text,text,text) to authenticated;
grant execute on function public.void_payment(uuid,text) to authenticated;

-- ---------- checks the shop writes (owner only) ---------------------------
-- Printed on pre-printed voucher check stock (bank name, routing/account numbers and
-- check numbers already on the paper). We only print date, payee, amount and stubs.
-- The owner signs by hand. Full bank account numbers are never stored here.

create table if not exists public.bank_accounts (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (char_length(name) between 1 and 80),          -- "Operating account"
  bank_name          text check (bank_name is null or char_length(bank_name) <= 80),
  last4              text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  next_check_number  int not null default 1001 check (next_check_number between 1 and 99999999),
  offset_x_in        numeric(4,2) not null default 0 check (offset_x_in between -1 and 1),  -- printer alignment
  offset_y_in        numeric(4,2) not null default 0 check (offset_y_in between -1 and 1),
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

create table if not exists public.payees (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  address     text check (address is null or char_length(address) <= 300),   -- printed in the envelope window
  phone       text check (phone is null or char_length(phone) <= 40),
  notes       text check (notes is null or char_length(notes) <= 1000),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.checks (
  id                uuid primary key default gen_random_uuid(),
  bank_account_id   uuid not null references public.bank_accounts(id) on delete restrict,
  check_number      int not null check (check_number between 1 and 99999999),
  payee_id          uuid references public.payees(id) on delete restrict,
  payee_name        text not null check (char_length(payee_name) between 1 and 120),   -- as printed
  payee_address     text check (payee_address is null or char_length(payee_address) <= 300),
  amount_cents      int not null check (amount_cents > 0 and amount_cents <= 100000000),
  check_date        date not null,
  memo              text check (memo is null or char_length(memo) <= 120),
  status            text not null default 'issued' check (status in ('issued','cleared','void')),
  created_by        uuid references auth.users(id) on delete set null,
  created_by_name   text check (created_by_name is null or char_length(created_by_name) <= 120),
  printed_at        timestamptz,
  print_count       int not null default 0,
  cleared_at        timestamptz,
  voided_at         timestamptz,
  voided_by_name    text,
  void_reason       text check (void_reason is null or char_length(void_reason) <= 300),
  created_at        timestamptz not null default now(),
  unique (bank_account_id, check_number)
);
create index if not exists checks_date_idx on public.checks(check_date desc);

create table if not exists public.check_lines (
  id            uuid primary key default gen_random_uuid(),
  check_id      uuid not null references public.checks(id) on delete restrict,
  description   text not null check (char_length(description) between 1 and 120),
  category      text not null default 'other' check (category in ('parts','paint','sublet','rent','utilities','tools','supplies','insurance','refund','other')),
  ro_id         uuid references public.repair_orders(id) on delete restrict,
  amount_cents  int not null check (amount_cents > 0 and amount_cents <= 100000000),
  sort          int not null default 0
);
create index if not exists check_lines_check_idx on public.check_lines(check_id);
create index if not exists check_lines_ro_idx on public.check_lines(ro_id);

alter table public.bank_accounts enable row level security;
alter table public.payees        enable row level security;
alter table public.checks        enable row level security;
alter table public.check_lines   enable row level security;

drop policy if exists bank_accounts_owner on public.bank_accounts;
create policy bank_accounts_owner on public.bank_accounts for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists payees_owner on public.payees;
create policy payees_owner on public.payees for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
-- checks: owner can read; every change goes through the functions below (no insert/update/delete policies)
drop policy if exists checks_owner_read on public.checks;
create policy checks_owner_read on public.checks for select to authenticated using (public.is_owner());
drop policy if exists check_lines_owner_read on public.check_lines;
create policy check_lines_owner_read on public.check_lines for select to authenticated using (public.is_owner());

-- Owner writes a check. Takes the next check number for that bank account (or p_number when the
-- paper is out of sync) so two people can never get the same number. p_lines is a JSON array of
-- {description, category, ro_id, amount_cents}; the check amount is their sum.
create or replace function public.issue_check(p_bank uuid, p_payee uuid, p_date date, p_memo text, p_lines json, p_number int)
returns json language plpgsql security definer set search_path = public as $$
declare v_next int; v_num int; v_id uuid; v_total bigint := 0; v_name text; v_payee public.payees; v_line json; v_k int := 0;
begin
  if not public.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_payee from public.payees where id = p_payee;
  if v_payee.id is null then raise exception 'Choose who the check is to.'; end if;
  if p_date is null then raise exception 'Enter the check date.'; end if;
  if p_lines is null or json_typeof(p_lines) <> 'array' or json_array_length(p_lines) = 0 then raise exception 'Add at least one line.'; end if;
  if json_array_length(p_lines) > 10 then raise exception 'The check stub fits up to 10 lines.'; end if;
  for v_line in select * from json_array_elements(p_lines) loop
    if coalesce(trim(v_line->>'description'), '') = '' then raise exception 'Every line needs a description.'; end if;
    if coalesce((v_line->>'amount_cents')::int, 0) < 1 then raise exception 'Every line needs an amount.'; end if;
    v_total := v_total + (v_line->>'amount_cents')::int;
  end loop;
  if v_total > 100000000 then raise exception 'That amount is too large.'; end if;

  select next_check_number into v_next from public.bank_accounts where id = p_bank and active for update;
  if v_next is null then raise exception 'Choose a bank account.'; end if;
  v_num := coalesce(p_number, v_next);
  if exists (select 1 from public.checks where bank_account_id = p_bank and check_number = v_num) then
    raise exception 'Check #% was already used. Check the number on the paper in the printer.', v_num;
  end if;
  update public.bank_accounts set next_check_number = greatest(v_next, v_num + 1) where id = p_bank;

  select full_name into v_name from public.profiles where id = auth.uid();
  insert into public.checks (bank_account_id, check_number, payee_id, payee_name, payee_address, amount_cents, check_date, memo, created_by, created_by_name)
  values (p_bank, v_num, v_payee.id, v_payee.name, v_payee.address, v_total, p_date,
          nullif(left(trim(coalesce(p_memo, '')), 120), ''), auth.uid(), left(coalesce(v_name, 'Owner'), 120))
  returning id into v_id;
  for v_line in select * from json_array_elements(p_lines) loop
    insert into public.check_lines (check_id, description, category, ro_id, amount_cents, sort)
    values (v_id, left(trim(v_line->>'description'), 120), coalesce(nullif(v_line->>'category', ''), 'other'),
            nullif(v_line->>'ro_id', '')::uuid, (v_line->>'amount_cents')::int, v_k);
    v_k := v_k + 1;
  end loop;
  return json_build_object('id', v_id, 'check_number', v_num, 'amount_cents', v_total);
end $$;

-- Owner cancels a check (lost, written wrong, never sent). The row stays, marked void.
create or replace function public.void_check(p_check uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not public.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason.'; end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  update public.checks set status = 'void', voided_at = now(), voided_by_name = left(coalesce(v_name, 'Owner'), 120), void_reason = left(trim(p_reason), 300)
   where id = p_check and status = 'issued';
  if not found then raise exception 'Check not found, already void, or already cleared the bank.'; end if;
end $$;

-- The paper jammed or printed crooked: void that number and copy the check onto the next one.
create or replace function public.reprint_check(p_check uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_old public.checks; v_next int; v_id uuid; v_name text;
begin
  if not public.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v_old from public.checks where id = p_check and status = 'issued' for update;
  if v_old.id is null then raise exception 'Only an open check can be reprinted.'; end if;
  select next_check_number into v_next from public.bank_accounts where id = v_old.bank_account_id for update;
  while exists (select 1 from public.checks where bank_account_id = v_old.bank_account_id and check_number = v_next) loop
    v_next := v_next + 1;
  end loop;
  update public.bank_accounts set next_check_number = v_next + 1 where id = v_old.bank_account_id;
  select full_name into v_name from public.profiles where id = auth.uid();
  insert into public.checks (bank_account_id, check_number, payee_id, payee_name, payee_address, amount_cents, check_date, memo, created_by, created_by_name)
  values (v_old.bank_account_id, v_next, v_old.payee_id, v_old.payee_name, v_old.payee_address, v_old.amount_cents, v_old.check_date, v_old.memo,
          auth.uid(), left(coalesce(v_name, 'Owner'), 120))
  returning id into v_id;
  insert into public.check_lines (check_id, description, category, ro_id, amount_cents, sort)
  select v_id, description, category, ro_id, amount_cents, sort from public.check_lines where check_id = p_check;
  update public.checks set status = 'void', voided_at = now(), voided_by_name = left(coalesce(v_name, 'Owner'), 120),
         void_reason = 'Misprinted. Reprinted as check #' || v_next
   where id = p_check;
  return json_build_object('id', v_id, 'check_number', v_next);
end $$;

-- Owner ticks a check off when it shows on the bank statement (or un-ticks a mistake).
create or replace function public.set_check_cleared(p_check uuid, p_cleared boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.checks set status = case when p_cleared then 'cleared' else 'issued' end,
         cleared_at = case when p_cleared then now() end
   where id = p_check and status in ('issued','cleared');
  if not found then raise exception 'Check not found or void.'; end if;
end $$;

-- The print page calls this when the owner presses Print.
create or replace function public.mark_check_printed(p_check uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.checks set printed_at = now(), print_count = print_count + 1 where id = p_check and status <> 'void';
end $$;

revoke all on function public.issue_check(uuid,uuid,date,text,json,int) from public, anon;
revoke all on function public.void_check(uuid,text) from public, anon;
revoke all on function public.reprint_check(uuid) from public, anon;
revoke all on function public.set_check_cleared(uuid,boolean) from public, anon;
revoke all on function public.mark_check_printed(uuid) from public, anon;
grant execute on function public.issue_check(uuid,uuid,date,text,json,int) to authenticated;
grant execute on function public.void_check(uuid,text) to authenticated;
grant execute on function public.reprint_check(uuid) to authenticated;
grant execute on function public.set_check_cleared(uuid,boolean) to authenticated;
grant execute on function public.mark_check_printed(uuid) to authenticated;

-- ---------- job costing: staff hours, staff pay rates, expenses ------------
-- Profit per repair order = invoice before tax - parts/paint/sublet costs - (hours x staff hourly cost).
-- Staff are the technicians: each logs their own hours; only the owner sees pay rates, costs and profit.

-- One-time cleanup of an earlier draft that kept technicians in their own list.
-- Only runs while those tables are still empty, so it can never delete real data.
do $$
begin
  if to_regclass('public.technicians') is not null then
    if exists (select 1 from public.technicians) then
      raise exception 'public.technicians has rows. Move them to staff by hand before re-running.';
    end if;
    drop table if exists public.time_entries;
    drop table if exists public.technician_rates;
    alter table public.repair_orders drop column if exists assigned_tech_id;
    drop table public.technicians;
  end if;
end $$;

-- What a staff member costs the shop per hour, from a date on (keeps old jobs right after a raise).
create table if not exists public.staff_rates (
  id                 uuid primary key default gen_random_uuid(),
  staff_id           uuid not null references public.profiles(id) on delete cascade,
  hourly_cost_cents  int not null check (hourly_cost_cents between 0 and 100000),
  effective_from     date not null default current_date,
  created_at         timestamptz not null default now(),
  unique (staff_id, effective_from)
);

alter table public.repair_orders add column if not exists assigned_staff_id uuid references public.profiles(id) on delete set null;

create table if not exists public.time_entries (
  id          uuid primary key default gen_random_uuid(),
  ro_id       uuid not null references public.repair_orders(id) on delete cascade,
  staff_id    uuid not null references public.profiles(id) on delete restrict,
  work_date   date not null default current_date,
  hours       numeric(5,2) not null check (hours > 0 and hours <= 24),
  note        text check (note is null or char_length(note) <= 300),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists time_entries_ro_idx on public.time_entries(ro_id);

-- Spending not paid by a portal check: card, cash, ACH, vendor account.
create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  expense_date  date not null default current_date,
  vendor        text not null check (char_length(vendor) between 1 and 120),
  description   text check (description is null or char_length(description) <= 300),
  category      text not null default 'parts' check (category in ('parts','paint','sublet','rent','utilities','tools','supplies','insurance','refund','other')),
  paid_with     text not null default 'card' check (paid_with in ('card','cash','ach','account','other')),
  amount_cents  int not null check (amount_cents > 0 and amount_cents <= 100000000),
  ro_id         uuid references public.repair_orders(id) on delete set null,
  reference     text check (reference is null or char_length(reference) <= 80),   -- vendor invoice #
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists expenses_date_idx on public.expenses(expense_date desc);
create index if not exists expenses_ro_idx on public.expenses(ro_id);

alter table public.staff_rates  enable row level security;
alter table public.time_entries enable row level security;
alter table public.expenses     enable row level security;

-- pay rates: owner only
drop policy if exists staff_rates_owner on public.staff_rates;
create policy staff_rates_owner on public.staff_rates for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- hours: the shop sees hours (never money); staff log only their own, the owner logs for anyone
drop policy if exists time_read on public.time_entries;
create policy time_read on public.time_entries for select to authenticated using (public.is_shop());
drop policy if exists time_insert on public.time_entries;
create policy time_insert on public.time_entries for insert to authenticated
  with check (public.is_shop() and created_by = auth.uid() and (public.is_owner() or staff_id = auth.uid()));
drop policy if exists time_delete on public.time_entries;
create policy time_delete on public.time_entries for delete to authenticated
  using (public.is_owner() or (public.is_shop() and created_by = auth.uid()));

drop policy if exists expenses_owner on public.expenses;
create policy expenses_owner on public.expenses for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---------- backups log (owner only) --------------------------------------
-- The owner downloads backups to the shop's own computer (Manage > Backups). Nothing is deleted;
-- this table only records which backups were made, when and by whom.
create table if not exists public.backups (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('month','full')),
  month            text check (month is null or month ~ '^[0-9]{4}-[0-9]{2}$'),
  jobs             int,
  photos           int,
  missing          int,
  bytes            bigint,
  created_by       uuid references auth.users(id) on delete set null,
  created_by_name  text check (created_by_name is null or char_length(created_by_name) <= 120),
  created_at       timestamptz not null default now()
);
alter table public.backups enable row level security;
drop policy if exists backups_owner_read on public.backups;
create policy backups_owner_read on public.backups for select to authenticated using (public.is_owner());
drop policy if exists backups_owner_insert on public.backups;
create policy backups_owner_insert on public.backups for insert to authenticated
  with check (public.is_owner() and created_by = auth.uid());

-- ---------- emails ---------------------------------------------------------
-- Sent by the server functions (api/notify.js, api/invite.js, Stripe) through the shop's SMTP.
-- Customers can turn off update emails (estimate, invoice, car status, drop-off);
-- invites, receipts and password emails always go.
alter table public.customers add column if not exists email_updates boolean not null default true;

create table if not exists public.email_log (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('invite','estimate','invoice','receipt','status','dropoff','request')),
  to_email     text,
  subject      text,
  status       text not null check (status in ('sent','failed','skipped')),
  error        text check (error is null or char_length(error) <= 500),
  ro_id        uuid references public.repair_orders(id) on delete set null,
  customer_id  uuid references public.customers(id) on delete set null,
  request_id   uuid references public.requests(id) on delete set null,
  ref_id       uuid,                                   -- estimate / payment this email was about
  sent_by      uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists email_log_ro_idx on public.email_log(ro_id);
create index if not exists email_log_request_idx on public.email_log(request_id);
-- "Forgot password" emails are sent by the portal too (api/reset.js). ip_hash is a one-way hash of
-- the visitor's IP, kept only to limit how many reset emails one visitor can trigger.
alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('invite','estimate','invoice','receipt','status','dropoff','request','reset'));
alter table public.email_log add column if not exists ip_hash text check (ip_hash is null or char_length(ip_hash) <= 64);
create index if not exists email_log_limits_idx on public.email_log(kind, created_at);
alter table public.email_log enable row level security;
-- owner can read; only the server (service role) writes
drop policy if exists email_log_owner_read on public.email_log;
create policy email_log_owner_read on public.email_log for select to authenticated using (public.is_owner());

-- ---------- storage: private bucket for photos ------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif'];

-- Files live at  <customer_id>/<random>.<ext>
drop policy if exists photos_bucket_read on storage.objects;
create policy photos_bucket_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (public.is_shop()
         or (storage.foldername(name))[1] = public.my_customer_id()::text));
drop policy if exists photos_bucket_insert on storage.objects;
create policy photos_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (public.is_shop()
         or (storage.foldername(name))[1] = public.my_customer_id()::text));
drop policy if exists photos_bucket_delete on storage.objects;
create policy photos_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_owner());

-- =====================================================================
-- AFTER the first run: make yourself the owner.
--   1. Supabase Dashboard > Authentication > Users > Add user > "Create new user"
--      (your email + a strong password, tick "Auto Confirm User").
--   2. Run (with your email):
--        update public.profiles set role = 'owner', full_name = 'Reynaldo Sosa'
--         where email = 'you@example.com';
-- =====================================================================
