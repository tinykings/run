import type { DayRuns } from "./health";

export type CalendarDay = {
  date: string;
  day: DayRuns | null;
  distanceKm: number;
  inYear: boolean;
};

export function buildCalendarDays(year: number, runsByDate: Map<string, DayRuns>) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));
  const days: CalendarDay[] = [];

  for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const key = toDateKey(date);
    const day = runsByDate.get(key) ?? null;

    days.push({
      date: key,
      day,
      distanceKm: day?.distanceKm ?? 0,
      inYear: true,
    });
  }

  const leadingDays = start.getUTCDay();
  const trailingDays = 6 - end.getUTCDay();

  for (let index = 0; index < leadingDays; index += 1) {
    days.unshift({ date: "", day: null, distanceKm: 0, inYear: false });
  }

  for (let index = 0; index < trailingDays; index += 1) {
    days.push({ date: "", day: null, distanceKm: 0, inYear: false });
  }

  return days;
}

export function getIntensity(distanceKm: number) {
  if (distanceKm >= 10) {
    return 4;
  }

  if (distanceKm >= 5) {
    return 3;
  }

  if (distanceKm >= 2) {
    return 2;
  }

  if (distanceKm > 0) {
    return 1;
  }

  return 0;
}

function toDateKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
