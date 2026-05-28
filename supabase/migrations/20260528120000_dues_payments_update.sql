-- Allow updating dues and payments (edit flows)

drop policy if exists "dues_update_own" on dues;
create policy "dues_update_own" on dues for update using (
  exists (select 1 from houses where houses.id = dues.house_id and houses.user_id = auth.uid())
) with check (
  exists (select 1 from houses where houses.id = dues.house_id and houses.user_id = auth.uid())
);

drop policy if exists "payments_update_own" on payments;
create policy "payments_update_own" on payments for update using (
  exists (select 1 from houses where houses.id = payments.house_id and houses.user_id = auth.uid())
) with check (
  exists (select 1 from houses where houses.id = payments.house_id and houses.user_id = auth.uid())
);
