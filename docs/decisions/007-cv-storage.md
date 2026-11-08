# 007: CV file storage design and its limits

- Status: accepted
- Date: 2026-11-05
- Module: 2.4 (CV storage backend)

## Context

Job seekers upload one CV (PDF or Word, at most 5 MB). The file is personal data. The requirements
ask for validation by extension, size and magic bytes, random storage names, a
download that cannot run or be sniffed by the browser, and ownership checks on the server.

## Decisions

- **Storage behind a protocol.** `FileStorage` (`save`, `open`, `delete`) with `LocalFileStorage`
  chosen by `STORAGE_BACKEND`. Keys are `uuid4().hex`; anything else is rejected, so a key can
  never be a path. Writes go to a temporary file and are moved into place with `os.replace`.
- **One active CV per user, enforced by the database.** Partial unique index
  `uq_cvs_user_id_active` on `user_id WHERE deleted_at IS NULL`. Replacing soft-deletes the old
  row and inserts the new one in one transaction; the old file is removed only after the commit
  (BackgroundTasks), and the new file is removed again if anything fails after it was saved.
- **No id in any URL.** Routes are `/cv/me` and `/cv/me/download`; the CV is always found through
  the logged-in user, so another user's CV simply does not exist for the caller (404).
- **The server decides the content type** from the extension that passed the content check, never
  from the client's header. The stored display name is cleaned (folder parts, control and
  bidi characters removed).
- **Size limit is enforced before the body is buffered.** Starlette reads a whole multipart body
  before the route runs, so a small ASGI middleware refuses a declared `Content-Length` over
  `MAX_CV_BYTES` + 64 KiB (form overhead) and counts bytes when no length is declared. The service
  checks the exact file size again.
- **Downloads** are streamed with `Content-Disposition: attachment`, `X-Content-Type-Options:
  nosniff` and `Cache-Control: private, no-store`. The storage path and key are never returned.
- **Uploads are rate limited** per IP (`UPLOAD_RATE_LIMIT`, default `10/minute`).

## Known limits (accepted for the pilot)

- No virus or macro scanning. Files are stored and handed back only to their owner, as downloads.
- A `.doc` check accepts any OLE2 file (an old `.xls` renamed `.doc` passes). `.docx` must be a zip
  holding `[Content_Types].xml` and `word/document.xml`, and is listed but never unpacked.
- Hard-deleting a user in the database cascades the CV rows but not the files. Account deletion
  must delete the files first.
- The rate limiter is in memory and keyed on the socket IP; behind a proxy this needs the real
  client IP and, with several processes, a shared store (Phase 6).
- Security headers and global request-size limits at the proxy are part of the hardening step.

## Consequences

- Moving to S3 or similar later means a new class implementing `FileStorage`; routes and services
  do not change.
- Tests run against a temporary directory by overriding the `file_storage` dependency.
