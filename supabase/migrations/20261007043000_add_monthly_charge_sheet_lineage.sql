-- Spreadsheet lineage for monthly charges.
-- The spreadsheet is the monthly roster source; payment records remain managed
-- separately in the application and are never inferred from spreadsheet amounts.
alter table public.monthly_charges
  add column if not exists source_system text not null default 'manual',
  add column if not exists source_key text,
  add column if not exists source_sheet text,
  add column if not exists source_row integer,
  add column if not exists source_active boolean not null default true,
  add column if not exists source_synced_at timestamptz;

create index if not exists monthly_charges_source_month_active_idx
  on public.monthly_charges(source_system, month, source_active);

create unique index if not exists monthly_charges_source_key_unique
  on public.monthly_charges(source_system, source_key)
  where source_key is not null;

comment on column public.monthly_charges.source_system is 'Lineage of the monthly roster. google_sheets means the row is controlled by the monthly spreadsheet.';
comment on column public.monthly_charges.source_key is 'Stable spreadsheet-row identity used for synchronization. It must not be based only on the visible row number.';
comment on column public.monthly_charges.source_active is 'Whether the source row currently exists in the spreadsheet snapshot. Historical payment rows are retained even when the source row is removed.';
