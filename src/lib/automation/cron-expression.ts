/** Build a standard 5-field cron expression from flow schedule UI (used by node-cron and cron-parser). */
export function getCronExpression(schedule: {
  type?: string;
  time?: string;
  dayOfWeek?: string;
  dayOfMonth?: number;
}): string {
  if (!schedule || typeof schedule !== 'object') return '0 0 * * *';
  const time = schedule.time || '09:00';
  const parts = String(time).trim().split(':');
  const hour = parts[0] != null && /^\d{1,2}$/.test(parts[0]) ? parts[0] : '9';
  const minute = parts[1] != null && /^\d{1,2}$/.test(parts[1]) ? parts[1] : '0';

  switch (schedule.type) {
    case 'hourly':
      return '0 * * * *';
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekly': {
      const dayOfWeek = schedule.dayOfWeek != null ? String(schedule.dayOfWeek) : '1';
      return `${minute} ${hour} * * ${/^[0-6]$/.test(dayOfWeek) ? dayOfWeek : '1'}`;
    }
    case 'monthly': {
      const d = schedule.dayOfMonth != null ? parseInt(String(schedule.dayOfMonth), 10) : 1;
      const dayOfMonth = d >= 1 && d <= 31 ? String(d) : '1';
      return `${minute} ${hour} ${dayOfMonth} * *`;
    }
    default:
      return '0 0 * * *';
  }
}
