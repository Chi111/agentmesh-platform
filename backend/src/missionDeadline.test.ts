import { describe, expect, it } from 'vitest';
import { isValidMissionDeadline, localDeadlineInput } from '../../shared/missionDeadline';
import { routeForMission } from '../../frontend/src/utils/missionState';

describe('mission deadline contract', () => {
  it.each(['2026-09-05', '2028-02-29', '2026-09-05T18:30+08:00', '2026-09-05T10:30:00.000Z'])('accepts valid legacy dates and zoned instants: %s', (value) => {
    expect(isValidMissionDeadline(value)).toBe(true);
  });
  it.each(['2026-02-29', '2026-02-30T12:00:00Z', '09/05/2026', '2026-09-05T18:30', '2026-13-01', '2026-09-05T24:00:00Z', ''])('rejects ambiguous or impossible dates: %s', (value) => {
    expect(isValidMissionDeadline(value)).toBe(false);
  });
  it('formats the device local calendar without converting it to UTC', () => {
    expect(localDeadlineInput(new Date(2026, 8, 5, 0, 15))).toBe('2026-09-05T00:15');
  });
  it('routes unfinished planning to the workflow instead of execution', () => {
    for (const status of ['draft', 'matching'] as const) {
      expect(routeForMission({ id: 'm', status, team: [] })).toBe('/missions/m/workflow');
    }
  });
});
