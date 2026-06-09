import { type CSSProperties, useMemo } from "react";
import { buildCalendarDays, getIntensity } from "./calendar";
import {
  type HealthExport,
  formatDistance,
  formatDuration,
  getRunStats,
  getRunsByDate,
  getYearOptions,
  normalizeHealthExports,
} from "./health";

const workoutFiles = import.meta.glob("../data/workouts/*.json", { eager: true });
const data = normalizeHealthExports(Object.values(workoutFiles).map(getJsonExport));
const WEEK_DAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function App() {
  const runsByDate = useMemo(() => getRunsByDate(data), []);
  const years = useMemo(() => getYearOptions(runsByDate.values()), [runsByDate]);

  return (
    <main className="app">
      {years.map((year) => (
        <YearCard key={year} runsByDate={runsByDate} year={year} />
      ))}
    </main>
  );
}

function getJsonExport(file: unknown): HealthExport {
  if (file && typeof file === "object" && "default" in file) {
    return (file as { default: HealthExport }).default;
  }

  return file as HealthExport;
}

function YearCard({
  runsByDate,
  year,
}: {
  runsByDate: ReturnType<typeof getRunsByDate>;
  year: number;
}) {
  const calendarDays = buildCalendarDays(year, runsByDate);
  const yearStats = getRunStats([...runsByDate.values()].filter((day) => day.date.startsWith(String(year))));
  const monthLabels = getMonthLabels(year);
  const weekCount = calendarDays.length / 7;

  return (
    <section className="year-card" aria-label={`${year} running activity`}>
      <div className="year-card-header">
        <h2>{year}</h2>
        <div className="year-total">
          <span>Distance</span> {formatDistance(yearStats.totalDistanceKm)} <span>Time</span>{" "}
          {formatDuration(yearStats.totalDurationSec)}
          <span className="legend" aria-label="Distance intensity legend">
            Less
            {[0, 1, 2, 3, 4].map((level) => (
              <i className={`legend-box intensity-${level}`} key={level} />
            ))}
            More
          </span>
        </div>
      </div>

      <div className="calendar-wrap">
        <div className="weekday-labels" aria-hidden="true">
          {WEEK_DAYS.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="calendar-stack" style={{ "--weeks": weekCount } as CSSProperties}>
          <div className="calendar-grid" aria-label={`${year} running activity calendar`}>
            {calendarDays.map((calendarDay, dayIndex) => {
              const intensity = getIntensity(calendarDay.distanceKm);
              const tooltip = calendarDay.inYear ? `${calendarDay.date}: ${formatDistance(calendarDay.distanceKm)}` : "";

              return (
                <span
                  aria-label={tooltip || "Empty calendar cell"}
                  className={`day-cell intensity-${intensity}`}
                  data-tooltip={tooltip}
                  key={`${calendarDay.date}-${dayIndex}`}
                />
              );
            })}
          </div>
          <div className="month-labels" aria-hidden="true">
            {monthLabels.map((label) => (
              <span key={label.month} style={{ gridColumn: label.week }}>
                {label.month}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function getMonthLabels(year: number) {
  const labels = [];
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const leadingDays = yearStart.getUTCDay();
  const formatter = new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" });

  for (let month = 0; month < 12; month += 1) {
    const date = new Date(Date.UTC(year, month, 1));
    const dayOfYear = Math.floor((date.getTime() - yearStart.getTime()) / 86400000);

    labels.push({
      month: formatter.format(date),
      week: Math.floor((leadingDays + dayOfYear) / 7) + 1,
    });
  }

  return labels;
}
