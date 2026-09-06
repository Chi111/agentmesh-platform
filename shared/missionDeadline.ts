// Date-only values remain legacy planning hints; precise deadlines require a timezone.
export function isValidMissionDeadline(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.test(value)) return false;
  const day = value.slice(0, 10);
  const parsedDay = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(Date.parse(value)) && Number.isFinite(parsedDay.getTime())
    && parsedDay.toISOString().slice(0, 10) === day;
}

export function localDeadlineInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatMissionDeadline(value: string): string {
  if (!value.includes('T') || !isValidMissionDeadline(value)) return value;
  return new Date(value).toLocaleString('zh-CN', { hour12: false, timeZoneName: 'short' });
}
