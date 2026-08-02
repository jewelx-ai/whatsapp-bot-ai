-- Allow Word documents in the knowledge base (2026-07-25)
--
-- kb_documents.source_type was constrained to pdf/url/text. Word uploads are
-- now supported, so they need their own value rather than being mislabelled as
-- PDFs — the label is shown in the Knowledge list.

alter table kb_documents drop constraint if exists kb_documents_source_type_check;

alter table kb_documents
  add constraint kb_documents_source_type_check
  check (source_type in ('pdf', 'docx', 'url', 'text'));
