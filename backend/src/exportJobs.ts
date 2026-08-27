export const MAX_DIRECT_LEDGER_EXPORT_ROWS = 5_000;
export const EXPORT_JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
export const EXPORT_ARTIFACT_RETENTION_MS = 24 * 60 * 60 * 1_000;
export const EXPORT_LEASE_MS = 5 * 60 * 1_000;
export const EXPORT_DOWNLOAD_TOKEN_MS = 5 * 60 * 1_000;

export function exportJobExpiresAt(createdAt: string): string {
  return new Date(Date.parse(createdAt) + EXPORT_JOB_RETENTION_MS).toISOString();
}

export function exportArtifactExpiresAt(completedAt: string): string {
  return new Date(Date.parse(completedAt) + EXPORT_ARTIFACT_RETENTION_MS).toISOString();
}

export function exportLeaseExpiresAt(claimedAt: string): string {
  return new Date(Date.parse(claimedAt) + EXPORT_LEASE_MS).toISOString();
}

export function exportProgress(processedRows: number, totalRows: number): number {
  return Math.max(0, Math.min(99, Math.floor((Math.max(0, processedRows) / Math.max(1, totalRows)) * 100)));
}
