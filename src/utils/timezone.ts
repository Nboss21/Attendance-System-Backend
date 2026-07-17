/** Fallback when an employee has no branch (or the branch has no timezone). */
export const DEFAULT_TIMEZONE = 'Africa/Addis_Ababa';

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
}

function partsIn(instant: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

export function localDateFor(instant: Date, timeZone: string = DEFAULT_TIMEZONE): Date {
  const { year, month, day } = partsIn(instant, timeZone);
  return new Date(Date.UTC(year, month - 1, day));
}

export function localTimeFor(instant: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  const { hour, minute } = partsIn(instant, timeZone);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function previousDay(day: Date): Date {
  return new Date(day.getTime() - 86_400_000);
}
