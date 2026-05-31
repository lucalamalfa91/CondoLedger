-- Per-rate amounts from admin documents (non-uniform splits)
alter table dues
  add column if not exists split_amounts jsonb;

comment on column dues.split_amounts is
  'Array of { periodStart, periodEnd?, amount, label? } — exact installment amounts from imported document';

-- Audit trail for document imports (duplicate detection)
create table if not exists document_imports (
  id bigint generated always as identity primary key,
  house_id bigint not null references houses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_label text not null,
  file_hash text not null,
  mime_types text,
  status text not null default 'committed'
    check (status in ('pending', 'reviewed', 'committed', 'failed')),
  extraction_json jsonb,
  committed_due_ids bigint[],
  created_at timestamptz not null default now()
);

create index if not exists idx_document_imports_house_hash
  on document_imports(house_id, file_hash);

alter table document_imports enable row level security;

create policy document_imports_select on document_imports
  for select using (
    exists (select 1 from houses h where h.id = document_imports.house_id and h.user_id = auth.uid())
  );

create policy document_imports_insert on document_imports
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from houses h where h.id = house_id and h.user_id = auth.uid())
  );

create policy document_imports_update on document_imports
  for update using (
    exists (select 1 from houses h where h.id = document_imports.house_id and h.user_id = auth.uid())
  );

create policy document_imports_delete on document_imports
  for delete using (
    exists (select 1 from houses h where h.id = document_imports.house_id and h.user_id = auth.uid())
  );
