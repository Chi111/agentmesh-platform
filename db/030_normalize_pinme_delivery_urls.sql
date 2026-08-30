-- PinMe may return a short publication code (for example `688355bf/`) rather
-- than a fully-qualified domain. Older Worker versions stored that code as a
-- dotless HTTPS host. Repair only PinMe/IPFS-backed deliverables.
UPDATE deliverables
SET uri = rtrim(uri, '/') || '.pinme.dev'
WHERE lower(uri) LIKE 'https://%'
  AND length(substr(rtrim(uri, '/'), 9)) >= 4
  AND instr(substr(rtrim(uri, '/'), 9), '.') = 0
  AND instr(substr(rtrim(uri, '/'), 9), '/') = 0
  AND EXISTS (
    SELECT 1
    FROM deliverable_ipfs_evidence evidence
    WHERE evidence.deliverable_id = deliverables.id
      AND evidence.provider = 'pinme_ipfs'
  );
