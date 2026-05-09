import { formatAuditTimestamp } from '../lib/formatters';

describe('formatAuditTimestamp', () => {
  it('formats a UTC ISO string to MM/DD/YYYY hh:mm A', () => {
    // Create a date where we know the expected output
    // Use a fixed UTC string and compare the local-time formatted result
    const utcIso = '2024-01-15T13:30:00.000Z';
    const result = formatAuditTimestamp(utcIso);
    // Verify the format pattern matches MM/DD/YYYY hh:mm AM/PM
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} (AM|PM)$/);
  });

  it('produces a 12-hour format (never 00 for hours)', () => {
    // midnight UTC - should show 12:00 AM (in UTC) or adjusted for local time
    const result = formatAuditTimestamp('2024-03-01T12:00:00.000Z');
    // Just verify no "00:" hour appears in a 12-hour format
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} (AM|PM)$/);
    // 12-hour format: hours should be 01-12
    const hourPart = result.split(' ')[1];
    const hour = parseInt(hourPart.split(':')[0], 10);
    expect(hour).toBeGreaterThanOrEqual(1);
    expect(hour).toBeLessThanOrEqual(12);
  });

  it('pads month, day, hour, minute with leading zeros', () => {
    // 2024-01-01 01:01:00 - single-digit month, day, hour, minute
    const result = formatAuditTimestamp('2024-01-01T01:01:00.000Z');
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} (AM|PM)$/);
  });
});
