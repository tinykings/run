import { type CSSProperties, type MouseEvent, useMemo, useState } from "react";
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
const DESKTOP_CALENDAR_CELL = 18;
const DESKTOP_CALENDAR_GAP = 4;
const DESKTOP_WEEKDAY_LABEL_WIDTH = 20;
const DESKTOP_WEEKDAY_LABEL_GAP = 8;
const CHART_HEIGHT = 150;
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
  const metricSeries = getMetricSeries(yearDays, yearStats);
  const chartWidth = getDesktopCalendarWidth(weekCount);

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

      <CombinedMetricChart chartWidth={chartWidth} series={metricSeries} year={year} />
    </section>
  );
}

function CombinedMetricChart({
  chartWidth,
  series,
  year,
}: {
  chartWidth: number;
  series: MetricSeries[];
  year: number;
}) {
  const plottedSeries = series.map((metric) => ({
    ...metric,
    plottedPoints: getPlottedPoints(metric.points, chartWidth),
  }));
  const latestPoint = series[0]?.points.at(-1);
  const [tooltip, setTooltip] = useState<MetricTooltip | null>(null);

  function showTooltip(event: MouseEvent, text: string) {
    const chart = event.currentTarget.closest(".combined-metric-chart");

    if (!chart) {
      return;
    }

    const bounds = chart.getBoundingClientRect();

    setTooltip({
      text,
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
  }

  return (
    <section
      className="metric-chart combined-metric-chart"
      aria-label={`${year} running metrics over time`}
      style={{ "--chart-width": `${chartWidth}px` } as CSSProperties}
    >
      <svg className="metric-chart-svg" viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`} role="img">
        <title>{`${year} distance, time, BPM, and power line chart`}</title>
        {[1, 0.5, 0].map((tick) => {
          const y = scaleNormalizedChartValue(tick);

          return (
            <g className="chart-guide" key={`metric-${tick}`}>
              <line x1={CHART_LEFT_PADDING} x2={chartWidth - CHART_RIGHT_PADDING} y1={y} y2={y} />
            </g>
          );
        })}
        {plottedSeries.map((metric) => {
          const linePath = metric.plottedPoints.map((point) => `${point.x},${point.y}`).join(" ");
          const metricTooltip = `${metric.label}\n${metric.summaryLabel}`;

          return (
            <g
              className={`metric-series ${metric.className}`}
              key={metric.label}
              onMouseLeave={() => setTooltip(null)}
              onMouseMove={(event) => showTooltip(event, metricTooltip)}
            >
              {linePath && <polyline className="metric-chart-line" points={linePath} />}
              {linePath && <polyline className="metric-chart-hit-line" points={linePath} />}
              {metric.plottedPoints.map((point) => (
                <g
                  className="metric-chart-point"
                  key={`${metric.label}-${point.date}`}
                  onMouseMove={(event) =>
                    showTooltip(event, `${point.label}\n${metric.label}: ${metric.formatValue(point.value)}`)
                  }
                >
                  <circle cx={point.x} cy={point.y} r="3" />
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="metric-chart-axis" aria-hidden="true">
        <span>{series[0]?.points[0]?.label ?? "--"}</span>
        <span>{latestPoint?.label ?? "--"}</span>
      </div>
      {tooltip && (
        <div className="metric-chart-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.text}
        </div>
      )}
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

function formatCompactDistance(km: number) {
  const miles = km * 0.621371;

  return `${miles.toFixed(miles >= 10 ? 1 : 2)} mi`;
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

function getDesktopCalendarWidth(weekCount: number) {
  const calendarGridWidth = weekCount * DESKTOP_CALENDAR_CELL + (weekCount - 1) * DESKTOP_CALENDAR_GAP;

  return DESKTOP_WEEKDAY_LABEL_WIDTH + DESKTOP_WEEKDAY_LABEL_GAP + calendarGridWidth;
}

type ChartPoint = {
  date: string;
  label: string;
  value: number;
};

type MetricSeries = {
  className: string;
  formatValue: (value: number) => string;
  label: string;
  points: ChartPoint[];
  summaryLabel: string;
};

type MetricTooltip = {
  text: string;
  x: number;
  y: number;
};

function getMetricSeries(
  yearDays: { date: string; distanceKm: number; durationSec: number; runs: Run[] }[],
  yearStats: ReturnType<typeof getRunStats>,
): MetricSeries[] {
  const dayLabel = (date: string) => formatTooltipDate(date);

  return [
    {
      className: "metric-distance",
      formatValue: formatCompactDistance,
      label: "Distance",
      points: yearDays.map((day) => ({ date: day.date, label: dayLabel(day.date), value: day.distanceKm })),
      summaryLabel: formatDistance(yearStats.totalDistanceKm),
    },
    {
      className: "metric-time",
      formatValue: formatCompactDuration,
      label: "Time",
      points: yearDays.map((day) => ({ date: day.date, label: dayLabel(day.date), value: day.durationSec })),
      summaryLabel: formatDuration(yearStats.totalDurationSec),
    },
    {
      className: "metric-bpm",
      formatValue: (value) => `${Math.round(value)} bpm`,
      label: "BPM",
      points: yearDays.map((day) => ({
        date: day.date,
        label: dayLabel(day.date),
        value: getWeightedAverage(day.runs, "avgHeartRate") ?? 0,
      })),
      summaryLabel: formatHeartRate(yearStats.averageHeartRate),
    },
    {
      className: "metric-power",
      formatValue: (value) => `${value.toFixed(1)} pwr`,
      label: "Power",
      points: yearDays.map((day) => ({
        date: day.date,
        label: dayLabel(day.date),
        value: getWeightedAverage(day.runs, "intensity") ?? 0,
      })),
      summaryLabel: formatPower(yearStats.averagePower),
    },
  ];
}

function getWeightedAverage(runs: Run[], field: "avgHeartRate" | "intensity") {
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

  return totalDuration > 0 ? weightedTotal / totalDuration : null;
}

function getPlottedPoints(points: ChartPoint[], chartWidth: number) {
  const maxValue = Math.max(...points.map((point) => point.value), 0);
  const drawableWidth = chartWidth - CHART_LEFT_PADDING - CHART_RIGHT_PADDING;

  return points.map((point, index) => ({
    ...point,
    x:
      CHART_LEFT_PADDING +
      (points.length === 1 ? drawableWidth / 2 : (index / (points.length - 1)) * drawableWidth),
    y: scaleNormalizedChartValue(maxValue > 0 ? point.value / maxValue : 0),
  }));
}

function scaleNormalizedChartValue(value: number) {
  const drawableHeight = CHART_HEIGHT - CHART_VERTICAL_PADDING * 2;

  return CHART_VERTICAL_PADDING + drawableHeight - value * drawableHeight;
}
