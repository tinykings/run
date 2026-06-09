import { type CSSProperties, useEffect, useMemo, useState } from "react";
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

const WEEK_DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const ROUTE_MAP_WIDTH = 960;
const ROUTE_MAP_HEIGHT = 240;
const ROUTE_MAP_PADDING = 16;
const METRIC_GRAPH_WIDTH = 520;
const METRIC_GRAPH_HEIGHT = 240;
const METRIC_GRAPH_PADDING = { top: 18, right: 16, bottom: 28, left: 24 };
const METRIC_KEYS = ["distance", "time", "bpm", "power", "elevation", "speed"] as const;

export default function App() {
  const [data, setData] = useState<HealthExport | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkoutData() {
      try {
        const baseUrl = import.meta.env.BASE_URL;
        const manifestResponse = await fetch(`${baseUrl}data/workouts/index.json`);

        if (!manifestResponse.ok) {
          throw new Error(`Unable to load workout manifest: ${manifestResponse.status}`);
        }

        const files = (await manifestResponse.json()) as string[];
        const exports = await Promise.all(
          files.map(async (file) => {
            const response = await fetch(`${baseUrl}data/workouts/${file}`);

            if (!response.ok) {
              throw new Error(`Unable to load workout file: ${file}`);
            }

            return getTextExport(await response.text());
          }),
        );

        if (!cancelled) {
          setData(normalizeHealthExports(exports));
        }
      } catch (error) {
        console.error(error);

        if (!cancelled) {
          setLoadError(true);
        }
      }
    }

    loadWorkoutData();

    return () => {
      cancelled = true;
    };
  }, []);

  const runsByDate = useMemo(() => getRunsByDate(data ?? { activity: { workouts: [] } }), [data]);
  const years = useMemo(() => getYearOptions(runsByDate.values()), [runsByDate]);

  if (loadError) {
    return <main className="app app-message">Unable to load run data.</main>;
  }

  if (!data) {
    return <main className="app app-message">Loading runs...</main>;
  }

  return (
    <main className="app">
      {years.map((year) => (
        <YearCard key={year} runsByDate={runsByDate} year={year} />
      ))}
    </main>
  );
}

function getTextExport(file: unknown): HealthExport {
  const text = String(file);
  const jsonStart = text.indexOf("{");

  if (jsonStart === -1) {
    return JSON.parse(text) as HealthExport;
  }

  return JSON.parse(text.slice(jsonStart)) as HealthExport;
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
  const dayStreak = getLongestDayStreak(yearDays);
  const monthLabels = getMonthLabels(year);
  const weekCount = calendarDays.length / 7;
  const mobileColumnCount = Math.ceil(weekCount / 2);
  const [activeDate, setActiveDate] = useState<string | null>(null);

  return (
    <section className="year-card" aria-label={`${year} running activity`}>
      <div className="year-card-header">
        <div className="year-heading">
          <h2>{year}</h2>
          <div className="year-streak">
            <strong>{dayStreak}</strong>
            <span>Day Streak</span>
          </div>
        </div>
        <div className="year-total">
          <span>Distance</span> {formatDistance(yearStats.totalDistanceKm)} <span>Time</span>{" "}
          {formatDuration(yearStats.totalDurationSec)} <span>BPM</span>{" "}
          {formatHeartRate(yearStats.averageHeartRate)} <span>Power</span>{" "}
          {formatPower(yearStats.averagePower)} <span>Elevation</span>{" "}
          {formatElevation(yearStats.averageElevationGainM)} <span>Speed</span>{" "}
          {formatSpeedMph(yearStats.averageSpeedKmh)}
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
              const tooltip = calendarDay.day ? getDayTooltip(calendarDay.date, calendarDay.day) : undefined;

              return (
                <span
                  aria-label={tooltip ?? (calendarDay.inYear ? `${calendarDay.date}: no running data` : "Empty calendar cell")}
                  className={`day-cell intensity-${intensity}`}
                  data-tooltip={tooltip}
                  key={`${calendarDay.date}-${dayIndex}`}
                  onMouseEnter={() => calendarDay.day && setActiveDate(calendarDay.date)}
                  onMouseLeave={() => setActiveDate(null)}
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

      <div className="year-visuals">
        <RouteMap activeDate={activeDate} days={yearDays} />
        <MetricGraph activeDate={activeDate} days={yearDays} />
      </div>

    </section>
  );
}

function RouteMap({
  activeDate,
  days,
}: {
  activeDate: string | null;
  days: { date: string; distanceKm: number; durationSec: number; runs: Run[] }[];
}) {
  const routes = getRouteMapRoutes(days);

  if (routes.length === 0) {
    return null;
  }

  return (
    <section className="route-map" aria-label="Running routes map">
      <h3 className="visual-heading">Routes</h3>
      <svg className="route-map-svg" viewBox={`0 0 ${ROUTE_MAP_WIDTH} ${ROUTE_MAP_HEIGHT}`} role="img">
        <title>Running routes</title>
        {routes.map((route) => {
          const active = activeDate === route.date;
          const hidden = activeDate !== null && !active;
          const normalizedPoints = projectNormalizedRoute(route.points);
          const points = normalizedPoints.map(formatRoutePoint).join(" ");
          const start = normalizedPoints[0];
          const end = normalizedPoints[normalizedPoints.length - 1];

          return (
            <g
              className={`route-layer intensity-${route.intensity}${active ? " route-active" : ""}${hidden ? " route-hidden" : ""}`}
              key={`${route.date}-${route.index}`}
            >
              <polyline className="route-path" points={points} />
              <circle className="route-marker route-start" cx={start.x} cy={start.y} r="3" />
              <rect className="route-marker route-end" height="6" width="6" x={end.x - 3} y={end.y - 3} />
            </g>
          );
        })}
      </svg>
    </section>
  );
}

type MetricKey = (typeof METRIC_KEYS)[number];

type MetricGraphPoint = {
  date: string;
  timestamp: number;
  time: number;
  distance: number;
  bpm: number | null;
  power: number | null;
  elevation: number;
  speed: number | null;
};

type MetricDefinition = {
  key: MetricKey;
  label: string;
  format: (value: number | null) => string;
};

const METRIC_DEFINITIONS: MetricDefinition[] = [
  { key: "distance", label: "Distance", format: (value) => (value === null ? "-- mi" : formatDistance(value)) },
  { key: "time", label: "Time", format: (value) => (value === null ? "--" : formatDuration(value)) },
  { key: "bpm", label: "BPM", format: formatHeartRate },
  { key: "power", label: "Power", format: formatPower },
  { key: "elevation", label: "Elevation", format: formatElevation },
  { key: "speed", label: "Speed", format: formatSpeedMph },
];

function MetricGraph({
  activeDate,
  days,
}: {
  activeDate: string | null;
  days: { date: string; distanceKm: number; durationSec: number; runs: Run[] }[];
}) {
  const points = getMetricGraphPoints(days);

  if (points.length === 0) {
    return null;
  }

  const ranges = getMetricRanges(points);
  const dateRange = getMetricDateRange(points);
  const activePoint = points.find((point) => point.date === activeDate) ?? null;
  const drawableWidth = METRIC_GRAPH_WIDTH - METRIC_GRAPH_PADDING.left - METRIC_GRAPH_PADDING.right;
  const drawableHeight = METRIC_GRAPH_HEIGHT - METRIC_GRAPH_PADDING.top - METRIC_GRAPH_PADDING.bottom;
  const activeX = activePoint ? getMetricGraphX(activePoint.timestamp, dateRange, drawableWidth) : null;

  return (
    <section className="metric-graph" aria-label="Relative running metrics graph">
      <h3 className="visual-heading">Metrics</h3>
      <svg className="metric-graph-svg" viewBox={`0 0 ${METRIC_GRAPH_WIDTH} ${METRIC_GRAPH_HEIGHT}`} role="img">
        <title>Relative yearly range for distance, time, BPM, power, elevation, and speed</title>
        <g className="metric-grid" aria-hidden="true">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = METRIC_GRAPH_PADDING.top + drawableHeight * ratio;

            return <line key={ratio} x1={METRIC_GRAPH_PADDING.left} x2={METRIC_GRAPH_WIDTH - METRIC_GRAPH_PADDING.right} y1={y} y2={y} />;
          })}
        </g>

        {METRIC_DEFINITIONS.map((metric) => {
          const polylinePoints = getMetricPolylinePoints(points, ranges, dateRange, metric.key);

          if (!polylinePoints) {
            return null;
          }

          return <polyline className={`metric-line metric-${metric.key}`} key={metric.key} points={polylinePoints} />;
        })}

        {activeX !== null && (
          <line
            className="metric-cursor"
            x1={activeX}
            x2={activeX}
            y1={METRIC_GRAPH_PADDING.top}
            y2={METRIC_GRAPH_HEIGHT - METRIC_GRAPH_PADDING.bottom}
          />
        )}

        {activePoint &&
          METRIC_DEFINITIONS.map((metric) => {
            const value = activePoint[metric.key];

            if (value === null) {
              return null;
            }

            const point = projectMetricPoint(activePoint.timestamp, value, ranges[metric.key], dateRange);

            return <circle className={`metric-dot metric-${metric.key}`} cx={point.x} cy={point.y} key={metric.key} r="3.2" />;
          })}

      </svg>
    </section>
  );
}

function getMetricGraphPoints(days: { date: string; distanceKm: number; durationSec: number; runs: Run[] }[]): MetricGraphPoint[] {
  return days.map((day) => ({
    date: day.date,
    timestamp: Date.parse(`${day.date}T00:00:00Z`),
    distance: day.distanceKm,
    time: day.durationSec,
    bpm: getWeightedAverage(day.runs, "avgHeartRate"),
    power: getWeightedAverage(day.runs, "intensity"),
    elevation: getTotalElevationGain(day.runs),
    speed: getAverageSpeedKmh(day.runs),
  }));
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

function getMetricRanges(points: MetricGraphPoint[]) {
  return METRIC_KEYS.reduce(
    (ranges, key) => {
      const values = points
        .map((point) => point[key])
        .filter((value): value is number => value !== null && Number.isFinite(value));
      const min = Math.min(...values);
      const max = Math.max(...values);

      ranges[key] = {
        min: values.length > 0 ? min : 0,
        max: values.length > 0 ? max : 1,
      };

      return ranges;
    },
    {} as Record<MetricKey, { min: number; max: number }>,
  );
}

function getMetricPolylinePoints(
  points: MetricGraphPoint[],
  ranges: Record<MetricKey, { min: number; max: number }>,
  dateRange: { min: number; max: number },
  key: MetricKey,
) {
  const projectedPoints = points.flatMap((point) => {
    const value = point[key];

    if (value === null) {
      return [];
    }

    const projectedPoint = projectMetricPoint(point.timestamp, value, ranges[key], dateRange);

    return [`${projectedPoint.x.toFixed(2)},${projectedPoint.y.toFixed(2)}`];
  });

  return projectedPoints.length > 1 ? projectedPoints.join(" ") : null;
}

function projectMetricPoint(
  time: number,
  value: number,
  range: { min: number; max: number },
  dateRange: { min: number; max: number },
) {
  const drawableWidth = METRIC_GRAPH_WIDTH - METRIC_GRAPH_PADDING.left - METRIC_GRAPH_PADDING.right;
  const drawableHeight = METRIC_GRAPH_HEIGHT - METRIC_GRAPH_PADDING.top - METRIC_GRAPH_PADDING.bottom;
  const x = getMetricGraphX(time, dateRange, drawableWidth);
  const normalizedValue = range.max === range.min ? 0.5 : (value - range.min) / (range.max - range.min);
  const y = METRIC_GRAPH_PADDING.top + (1 - normalizedValue) * drawableHeight;

  return { x, y };
}

function getMetricDateRange(points: MetricGraphPoint[]) {
  const times = points.map((point) => point.timestamp);

  return {
    min: Math.min(...times),
    max: Math.max(...times),
  };
}

function getMetricGraphX(time: number, dateRange: { min: number; max: number }, drawableWidth: number) {
  const progress = dateRange.max === dateRange.min ? 0.5 : (time - dateRange.min) / (dateRange.max - dateRange.min);

  return METRIC_GRAPH_PADDING.left + Math.min(Math.max(progress, 0), 1) * drawableWidth;
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

function formatElevation(elevationM: number | null | undefined) {
  if (elevationM === null || elevationM === undefined || !Number.isFinite(elevationM)) {
    return "-- ft";
  }

  return `${Math.round(elevationM * 3.28084)} ft`;
}

function formatSpeedMph(speedKmh: number | null | undefined) {
  if (speedKmh === null || speedKmh === undefined || !Number.isFinite(speedKmh)) {
    return "-- mph";
  }

  return `${(speedKmh * 0.621371).toFixed(1)} mph`;
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

function getDayTooltip(date: string, day: { distanceKm: number; durationSec: number; runs: Run[] }) {
  return [
    formatTooltipDate(date),
    formatDistance(day.distanceKm),
    formatTooltipDuration(day.durationSec),
    formatAverage(day.runs, "avgHeartRate", "bpm"),
    formatAverage(day.runs, "intensity", "pwr"),
    formatElevation(getTotalElevationGain(day.runs)),
    formatSpeedMph(getAverageSpeedKmh(day.runs)),
  ].join("\n");
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

function getTotalElevationGain(runs: Run[]) {
  return runs.reduce((total, run) => total + (run.elevationAscendedM ?? 0), 0);
}

function getAverageSpeedKmh(runs: Run[]) {
  const totalDistanceKm = runs.reduce((total, run) => total + run.distanceKm, 0);
  const totalDurationSec = runs.reduce((total, run) => total + run.durationSec, 0);

  return totalDurationSec > 0 ? (totalDistanceKm / totalDurationSec) * 3600 : null;
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

function getLongestDayStreak(days: { date: string }[]) {
  let longestStreak = 0;
  let currentStreak = 0;
  let previousTime: number | null = null;

  for (const day of days) {
    const currentTime = Date.parse(`${day.date}T00:00:00Z`);

    currentStreak = previousTime !== null && currentTime - previousTime === 86400000 ? currentStreak + 1 : 1;
    longestStreak = Math.max(longestStreak, currentStreak);
    previousTime = currentTime;
  }

  return longestStreak;
}

type RouteMapPoint = {
  latitude: number;
  longitude: number;
};

function getRouteMapRoutes(days: { date: string; distanceKm: number; durationSec: number; runs: Run[] }[]) {
  return days.flatMap((day) =>
    day.runs.flatMap((run, index) => {
      if (!run.route || run.route.length < 2) {
        return [];
      }

      return [
        {
          date: day.date,
          index,
          intensity: getIntensity(day.distanceKm),
          points: run.route,
          tooltip: getDayTooltip(day.date, day),
        },
      ];
    }),
  );
}

function projectNormalizedRoute(points: RouteMapPoint[]) {
  const maxLatitude = Math.max(...points.map((point) => point.latitude));
  const maxLongitude = Math.max(...points.map((point) => point.longitude));
  const minLatitude = Math.min(...points.map((point) => point.latitude));
  const minLongitude = Math.min(...points.map((point) => point.longitude));
  const latitudeRange = maxLatitude - minLatitude || 1;
  const longitudeRange = maxLongitude - minLongitude || 1;
  const drawableWidth = ROUTE_MAP_WIDTH - ROUTE_MAP_PADDING * 2;
  const drawableHeight = ROUTE_MAP_HEIGHT - ROUTE_MAP_PADDING * 2;

  return points.map((point) => ({
    x: ROUTE_MAP_PADDING + ((point.longitude - minLongitude) / longitudeRange) * drawableWidth,
    y: ROUTE_MAP_PADDING + ((maxLatitude - point.latitude) / latitudeRange) * drawableHeight,
  }));
}

function formatRoutePoint(point: { x: number; y: number }) {
  return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
}
