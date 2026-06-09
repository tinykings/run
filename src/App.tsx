import { type CSSProperties, useMemo } from "react";
import { buildCalendarDays, getIntensity } from "./calendar";
import {
  type HealthExport,
  type Run,
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
const CHART_WIDTH = 520;
const CHART_HEIGHT = 170;
const CHART_LEFT_PADDING = 56;
const CHART_RIGHT_PADDING = 18;
const CHART_VERTICAL_PADDING = 18;

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
  const yearDays = [...runsByDate.values()]
    .filter((day) => day.date.startsWith(String(year)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const yearStats = getRunStats(yearDays);
  const monthLabels = getMonthLabels(year);
  const weekCount = calendarDays.length / 7;
  const mobileColumnCount = Math.ceil(weekCount / 2);
  const distancePoints = yearDays.map((day) => ({
    date: day.date,
    label: formatTooltipDate(day.date),
    tooltip: `${formatTooltipDate(day.date)}\n${formatDistance(day.distanceKm)}`,
    value: day.distanceKm,
  }));
  const timePoints = yearDays.map((day) => ({
    date: day.date,
    label: formatTooltipDate(day.date),
    tooltip: `${formatTooltipDate(day.date)}\n${formatTooltipDuration(day.durationSec)}`,
    value: day.durationSec,
  }));

  return (
    <section className="year-card" aria-label={`${year} running activity`}>
      <div className="year-card-header">
        <div className="year-title-stack">
          <h2>{year}</h2>
        </div>
        <div className="year-total">
          <span>Distance</span> {formatDistance(yearStats.totalDistanceKm)} <span>Time</span>{" "}
          {formatDuration(yearStats.totalDurationSec)} <span>BPM</span>{" "}
          {formatHeartRate(yearStats.averageHeartRate)} <span>Power</span>{" "}
          {formatPower(yearStats.averagePower)}
        </div>
      </div>

      <div className="calendar-wrap">
        <div className="weekday-labels" aria-hidden="true">
          {WEEK_DAYS.map((day, index) => (
            <span key={`${day}-${index}`}>{day}</span>
          ))}
        </div>
        <div className="mobile-weekday-labels" aria-hidden="true">
          {[...WEEK_DAYS, ...WEEK_DAYS].map((day, index) => (
            <span key={`${day}-${index}`}>{day}</span>
          ))}
        </div>
        <div
          className="calendar-stack"
          style={{ "--mobile-columns": mobileColumnCount, "--weeks": weekCount } as CSSProperties}
        >
          <div className="calendar-grid" aria-label={`${year} running activity calendar`}>
            {calendarDays.map((calendarDay, dayIndex) => {
              const intensity = getIntensity(calendarDay.distanceKm);
              const tooltip = calendarDay.day
                ? [
                    formatTooltipDate(calendarDay.date),
                    formatDistance(calendarDay.distanceKm),
                    formatTooltipDuration(calendarDay.day.durationSec),
                    formatAverage(calendarDay.day.runs, "avgHeartRate", "bpm"),
                    formatAverage(calendarDay.day.runs, "intensity", "pwr"),
                  ].join("\n")
                : undefined;

              return (
                <span
                  aria-label={tooltip ?? (calendarDay.inYear ? `${calendarDay.date}: no running data` : "Empty calendar cell")}
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

      <div className="year-legend-row">
        <span className="legend" aria-label="Distance intensity legend">
          Less
          {[0, 1, 2, 3, 4].map((level) => (
            <i className={`legend-box intensity-${level}`} key={level} />
          ))}
          More
        </span>
      </div>

      <div className="metric-chart-grid" aria-label={`${year} running line charts`}>
        <LineChart
          label="Distance"
          points={distancePoints}
          summaryLabel={formatDistance(yearStats.totalDistanceKm)}
          yLabel={(value) => `${(value * 0.621371).toFixed(value >= 16.1 ? 0 : 1)} mi`}
        />
        <LineChart
          label="Time"
          points={timePoints}
          summaryLabel={formatDuration(yearStats.totalDurationSec)}
          yLabel={(value) => formatCompactDuration(value)}
        />
      </div>
    </section>
  );
}

function LineChart({
  label,
  points,
  summaryLabel,
  yLabel,
}: {
  label: string;
  points: ChartPoint[];
  summaryLabel: string;
  yLabel: (value: number) => string;
}) {
  const plottedPoints = getPlottedPoints(points);
  const linePath = plottedPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const latestPoint = points.at(-1);
  const maxValue = Math.max(...points.map((point) => point.value), 0);
  const yTicks = [maxValue, maxValue / 2, 0];

  return (
    <section className="metric-chart" aria-label={`${label} by run date`}>
      <header className="metric-chart-header">
        <span>{label}</span>
        <strong>{summaryLabel}</strong>
      </header>
      <svg className="metric-chart-svg" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img">
        <title>{`${label} line chart`}</title>
        {yTicks.map((tick, index) => {
          const y = scaleChartValue(tick, maxValue);

          return (
            <g className="chart-guide" key={`${label}-${tick}-${index}`}>
              <line x1={CHART_LEFT_PADDING} x2={CHART_WIDTH - CHART_RIGHT_PADDING} y1={y} y2={y} />
              <text x="0" y={y - 5}>
                {yLabel(tick)}
              </text>
            </g>
          );
        })}
        {linePath && <polyline className="metric-chart-line" points={linePath} />}
        {plottedPoints.map((point) => (
          <g className="metric-chart-point" key={point.date}>
            <circle cx={point.x} cy={point.y} r="3.5" />
            <title>{point.tooltip}</title>
          </g>
        ))}
      </svg>
      <div className="metric-chart-axis" aria-hidden="true">
        <span>{points[0]?.label ?? "--"}</span>
        <span>{latestPoint?.label ?? "--"}</span>
      </div>
    </section>
  );
}

function formatHeartRate(heartRate: number | null | undefined) {
  if (heartRate === null || heartRate === undefined || !Number.isFinite(heartRate)) {
    return "--";
  }

  return Math.round(heartRate).toString();
}

function formatPower(power: number | null | undefined) {
  if (power === null || power === undefined || !Number.isFinite(power)) {
    return "--";
  }

  return power.toFixed(1);
}

function formatTooltipDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function formatTooltipDuration(totalSeconds: number) {
  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return hours > 0 ? `${hours}h:${minutes}m` : `${minutes} min`;
}

function formatCompactDuration(totalSeconds: number) {
  const totalMinutes = Math.round(totalSeconds / 60);

  if (totalMinutes >= 60) {
    return `${(totalMinutes / 60).toFixed(totalMinutes >= 600 ? 0 : 1)}h`;
  }

  return `${totalMinutes}m`;
}

function formatAverage(
  runs: Run[],
  field: "avgHeartRate" | "intensity",
  unit = "",
) {
  let weightedTotal = 0;
  let totalDuration = 0;

  for (const run of runs) {
    const value = run[field];

    if (value === undefined || !Number.isFinite(value)) {
      continue;
    }

    weightedTotal += value * run.durationSec;
    totalDuration += run.durationSec;
  }

  if (totalDuration === 0) {
    return unit ? `-- ${unit}` : "--";
  }

  const average = weightedTotal / totalDuration;
  const displayValue = field === "avgHeartRate" ? Math.round(average).toString() : average.toFixed(1);

  return unit ? `${displayValue} ${unit}` : displayValue;
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

type ChartPoint = {
  date: string;
  label: string;
  tooltip: string;
  value: number;
};

function getPlottedPoints(points: ChartPoint[]) {
  const maxValue = Math.max(...points.map((point) => point.value), 0);
  const drawableWidth = CHART_WIDTH - CHART_LEFT_PADDING - CHART_RIGHT_PADDING;

  return points.map((point, index) => ({
    ...point,
    x:
      CHART_LEFT_PADDING +
      (points.length === 1 ? drawableWidth / 2 : (index / (points.length - 1)) * drawableWidth),
    y: scaleChartValue(point.value, maxValue),
  }));
}

function scaleChartValue(value: number, maxValue: number) {
  const drawableHeight = CHART_HEIGHT - CHART_VERTICAL_PADDING * 2;

  if (maxValue <= 0) {
    return CHART_HEIGHT - CHART_VERTICAL_PADDING;
  }

  return CHART_VERTICAL_PADDING + drawableHeight - (value / maxValue) * drawableHeight;
}
