-- =============================================================================
-- Migration: 0018_candidate_documents.sql
-- Description: Candidate documents storage, types, metadata, self-upload links,
--              access logging, and security policies.
-- =============================================================================

-- 1. Private storage bucket for candidate documents
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidate-documents',
  'candidate-documents',
  false,
  10485760, -- 10MB physical max; app enforces 1MB image / 2MB PDF
  array['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

-- 2. Document Types (Master)
create table if not exists public.document_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  helper_text text,
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed predefined types
insert into public.document_types (name, slug, helper_text, display_order)
values
  ('10th certificate', '10th-certificate', 'Secondary school certificate / mark sheet', 10),
  ('12th certificate', '12th-certificate', 'Higher secondary certificate / mark sheet', 20),
  ('Degree certificate', 'Degree-certificate', 'Bachelor / Master degree certificate', 30),
  ('Degree marksheet / transcript', 'Degree-marksheet-transcript', 'Consolidated mark sheet or official semester transcripts', 40),
  ('ID proof: Aadhaar (masked) or Passport', 'id-proof-aadhaar-passport', 'For Aadhaar, upload the MASKED Aadhaar (only last 4 digits visible) from mAadhaar/UIDAI.', 50),
  ('Passport-size photo', 'passport-size-photo', 'Recent photo on white background, face clearly visible', 60),
  ('Other', 'other', 'Any additional relevant academic or employment document', 70)
on conflict (slug) do update set
  name = excluded.name,
  helper_text = excluded.helper_text,
  display_order = excluded.display_order;

-- 3. Document Upload Links (Candidate Self-Upload Tokens)
create table if not exists public.document_upload_links (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  token text not null unique,
  requested_types uuid[] not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  upload_count int not null default 0
);

create index if not exists idx_document_upload_links_token on public.document_upload_links(token);
create index if not exists idx_document_upload_links_student on public.document_upload_links(student_id);

-- 4. Candidate Documents Table
create table if not exists public.candidate_documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  document_type_id uuid not null references public.document_types(id),
  id_proof_kind text check (id_proof_kind in ('aadhaar_masked', 'passport') or id_proof_kind is null),
  title text not null,
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  original_size_bytes bigint,
  status text not null default 'received' check (status in ('received', 'verified', 'rejected')),
  uploaded_via text not null check (uploaded_via in ('staff', 'candidate_link')),
  uploaded_by uuid references auth.users(id),
  upload_link_id uuid references public.document_upload_links(id) on delete set null,
  notes text,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists idx_candidate_documents_student on public.candidate_documents(student_id);
create index if not exists idx_candidate_documents_type on public.candidate_documents(document_type_id);
create index if not exists idx_candidate_documents_status on public.candidate_documents(status);
create index if not exists idx_candidate_documents_created on public.candidate_documents(created_at desc);

-- 5. Document Access Log Table
create table if not exists public.document_access_log (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.candidate_documents(id) on delete set null,
  actor text not null, -- user UUID or 'candidate_link'
  action text not null check (action in ('upload', 'view', 'download', 'verify', 'reject', 'archive', 'zip')),
  at timestamptz not null default now(),
  ip text,
  metadata jsonb default '{}'::jsonb
);

create index if not exists idx_document_access_log_doc on public.document_access_log(document_id);
create index if not exists idx_document_access_log_at on public.document_access_log(at desc);

-- 6. Add document request templates to company_settings
alter table public.company_settings
  add column if not exists whatsapp_doc_request_template text
    default 'Dear {student_name}, please upload your documents for EduBridge Education using this secure link (valid until {expiry}): {upload_link}',
  add column if not exists email_doc_request_template text
    default 'Dear {student_name},\n\nPlease upload your documents for EduBridge Education using this secure link (valid until {expiry}):\n{upload_link}\n\nEduBridge Education\nDubai, UAE';

-- 7. RLS Configuration
alter table public.document_types enable row level security;
alter table public.document_upload_links enable row level security;
alter table public.candidate_documents enable row level security;
alter table public.document_access_log enable row level security;

-- Revoke all direct permissions from anon
revoke all on public.document_types from anon;
revoke all on public.document_upload_links from anon;
revoke all on public.candidate_documents from anon;
revoke all on public.document_access_log from anon;

-- Document Types Policies
create policy "Authenticated users can view active document types"
  on public.document_types for select
  to authenticated
  using (is_active = true or exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner' and is_active = true
  ));

create policy "Owners can manage document types"
  on public.document_types for all
  to authenticated
  using (exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner' and is_active = true
  ))
  with check (exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner' and is_active = true
  ));

-- Candidate Documents Policies
create policy "Staff can view candidate documents"
  on public.candidate_documents for select
  to authenticated
  using (exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active = true
  ));

create policy "Staff can insert candidate documents"
  on public.candidate_documents for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_active = true
    )
    and uploaded_via = 'staff'
    and uploaded_by = auth.uid()
  );

create policy "Owner or student creator can update verification/archive status"
  on public.candidate_documents for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'owner' and is_active = true
    )
    or exists (
      select 1 from public.students s
      where s.id = candidate_documents.student_id
        and s.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'owner' and is_active = true
    )
    or exists (
      select 1 from public.students s
      where s.id = candidate_documents.student_id
        and s.created_by = auth.uid()
    )
  );

-- No DELETE policy on candidate_documents -> hard deletes are impossible

-- Document Upload Links Policies
create policy "Staff can view upload links"
  on public.document_upload_links for select
  to authenticated
  using (exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active = true
  ));

create policy "Staff can create upload links"
  on public.document_upload_links for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_active = true
    )
    and created_by = auth.uid()
  );

create policy "Owner or creator can update upload links"
  on public.document_upload_links for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'owner' and is_active = true
    )
    or created_by = auth.uid()
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'owner' and is_active = true
    )
    or created_by = auth.uid()
  );

-- Document Access Log Policies
create policy "Staff can view document access logs"
  on public.document_access_log for select
  to authenticated
  using (exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active = true
  ));

create policy "Staff can insert document access logs"
  on public.document_access_log for insert
  to authenticated
  with check (exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active = true
  ));

-- 8. Functions & RPCs
-- Verification RPC
create or replace function public.verify_candidate_document(
  p_document_id uuid,
  p_status text,
  p_notes text default null
)
returns public.candidate_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_owner boolean;
  v_is_creator boolean;
  v_doc public.candidate_documents;
begin
  if v_user_id is null then
    raise exception 'unauthorized';
  end if;

  if p_status not in ('verified', 'rejected', 'received') then
    raise exception 'invalid status: %', p_status;
  end if;

  select (role = 'owner' and is_active = true) into v_is_owner
  from public.profiles where id = v_user_id;

  select exists (
    select 1 from public.candidate_documents cd
    join public.students s on s.id = cd.student_id
    where cd.id = p_document_id and s.created_by = v_user_id
  ) into v_is_creator;

  if not (coalesce(v_is_owner, false) or coalesce(v_is_creator, false)) then
    raise exception 'forbidden: only owner or admission staff can verify or reject documents';
  end if;

  update public.candidate_documents
  set
    status = p_status,
    notes = coalesce(p_notes, notes),
    verified_by = case when p_status = 'verified' then v_user_id else verified_by end,
    verified_at = case when p_status = 'verified' then now() else verified_at end
  where id = p_document_id
  returning * into v_doc;

  if not found then
    raise exception 'document not found';
  end if;

  -- Log action
  insert into public.document_access_log (document_id, actor, action, metadata)
  values (
    p_document_id,
    v_user_id::text,
    case when p_status = 'verified' then 'verify' when p_status = 'rejected' then 'reject' else 'view' end,
    jsonb_build_object('notes', p_notes, 'new_status', p_status)
  );

  return v_doc;
end;
$$;

-- Archive RPC (Soft delete)
create or replace function public.archive_candidate_document(
  p_document_id uuid
)
returns public.candidate_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_owner boolean;
  v_is_creator boolean;
  v_doc public.candidate_documents;
begin
  if v_user_id is null then
    raise exception 'unauthorized';
  end if;

  select (role = 'owner' and is_active = true) into v_is_owner
  from public.profiles where id = v_user_id;

  select exists (
    select 1 from public.candidate_documents cd
    join public.students s on s.id = cd.student_id
    where cd.id = p_document_id and s.created_by = v_user_id
  ) into v_is_creator;

  if not (coalesce(v_is_owner, false) or coalesce(v_is_creator, false)) then
    raise exception 'forbidden: only owner or admission staff can archive documents';
  end if;

  update public.candidate_documents
  set archived_at = now()
  where id = p_document_id
  returning * into v_doc;

  if not found then
    raise exception 'document not found';
  end if;

  -- Log action
  insert into public.document_access_log (document_id, actor, action)
  values (p_document_id, v_user_id::text, 'archive');

  return v_doc;
end;
$$;

-- Revoke link RPC
create or replace function public.revoke_document_upload_link(
  p_link_id uuid
)
returns public.document_upload_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_owner boolean;
  v_is_creator boolean;
  v_link public.document_upload_links;
begin
  if v_user_id is null then
    raise exception 'unauthorized';
  end if;

  select (role = 'owner' and is_active = true) into v_is_owner
  from public.profiles where id = v_user_id;

  select (created_by = v_user_id) into v_is_creator
  from public.document_upload_links where id = p_link_id;

  if not (coalesce(v_is_owner, false) or coalesce(v_is_creator, false)) then
    raise exception 'forbidden: only owner or link creator can revoke this link';
  end if;

  update public.document_upload_links
  set revoked_at = now()
  where id = p_link_id
  returning * into v_link;

  if not found then
    raise exception 'link not found';
  end if;

  return v_link;
end;
$$;

-- Dashboard / Stats Helper
create or replace function public.get_link_documents_stats(
  p_days int default 7
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_owner boolean;
  v_since timestamptz := now() - (p_days || ' days')::interval;
  v_total_received int;
  v_unverified int;
  v_active_links int;
begin
  if v_user_id is null then
    raise exception 'unauthorized';
  end if;

  select (role = 'owner' and is_active = true) into v_is_owner
  from public.profiles where id = v_user_id;

  if coalesce(v_is_owner, false) then
    select count(*) into v_total_received
    from public.candidate_documents
    where uploaded_via = 'candidate_link'
      and created_at >= v_since
      and archived_at is null;

    select count(*) into v_unverified
    from public.candidate_documents
    where uploaded_via = 'candidate_link'
      and status = 'received'
      and created_at >= v_since
      and archived_at is null;

    select count(*) into v_active_links
    from public.document_upload_links
    where expires_at > now()
      and revoked_at is null;
  else
    select count(*) into v_total_received
    from public.candidate_documents cd
    join public.students s on s.id = cd.student_id
    where cd.uploaded_via = 'candidate_link'
      and cd.created_at >= v_since
      and cd.archived_at is null
      and s.created_by = v_user_id;

    select count(*) into v_unverified
    from public.candidate_documents cd
    join public.students s on s.id = cd.student_id
    where cd.uploaded_via = 'candidate_link'
      and cd.status = 'received'
      and cd.created_at >= v_since
      and cd.archived_at is null
      and s.created_by = v_user_id;

    select count(*) into v_active_links
    from public.document_upload_links
    where expires_at > now()
      and revoked_at is null
      and created_by = v_user_id;
  end if;

  return jsonb_build_object(
    'days', p_days,
    'total_received', coalesce(v_total_received, 0),
    'unverified', coalesce(v_unverified, 0),
    'active_links', coalesce(v_active_links, 0)
  );
end;
$$;

-- Candidate documents summary helper (e.g. 4 of 6 types uploaded)
create or replace function public.get_candidate_documents_summary(
  p_student_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_types int;
  v_uploaded_types int;
  v_total_files int;
  v_unverified int;
  v_rejected int;
begin
  -- Total active document types excluding 'other'
  select count(*) into v_total_types
  from public.document_types
  where is_active = true and slug <> 'other';

  -- Types uploaded by this candidate
  select count(distinct document_type_id) into v_uploaded_types
  from public.candidate_documents cd
  join public.document_types dt on dt.id = cd.document_type_id
  where cd.student_id = p_student_id
    and cd.archived_at is null
    and dt.slug <> 'other';

  select
    count(*),
    count(*) filter (where status = 'received'),
    count(*) filter (where status = 'rejected')
  into
    v_total_files,
    v_unverified,
    v_rejected
  from public.candidate_documents
  where student_id = p_student_id
    and archived_at is null;

  return jsonb_build_object(
    'total_types', coalesce(v_total_types, 0),
    'uploaded_types', coalesce(v_uploaded_types, 0),
    'total_files', coalesce(v_total_files, 0),
    'unverified', coalesce(v_unverified, 0),
    'rejected', coalesce(v_rejected, 0)
  );
end;
$$;

-- Grants
grant execute on function public.verify_candidate_document to authenticated;
grant execute on function public.archive_candidate_document to authenticated;
grant execute on function public.revoke_document_upload_link to authenticated;
grant execute on function public.get_link_documents_stats to authenticated;
grant execute on function public.get_candidate_documents_summary to authenticated;
