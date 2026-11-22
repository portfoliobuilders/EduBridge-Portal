-- ==============================================================================
-- Migration: 0019_prevent_candidate_document_delete_trigger.sql
-- Description: Enforces table-level prevention of hard deletes on candidate_documents
-- ==============================================================================

create or replace function public.prevent_candidate_document_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Direct deletion of candidate documents is prohibited. Use archive instead.';
end;
$$;

drop trigger if exists trg_prevent_candidate_document_delete on public.candidate_documents;

create trigger trg_prevent_candidate_document_delete
before delete on public.candidate_documents
for each row
execute function public.prevent_candidate_document_delete();
