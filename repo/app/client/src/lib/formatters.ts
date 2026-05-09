/**
 * Formats a UTC ISO string to MM/DD/YYYY hh:mm A (local time)
 * Used by the audit log UI and wherever timestamps appear.
 */
export function formatAuditTimestamp(utcIso: string): string {
  const date = new Date(utcIso);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${month}/${day}/${year} ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}
