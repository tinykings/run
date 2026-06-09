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
  const [activeRouteDate, setActiveRouteDate] = useState<string | null>(null);

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
                  onMouseEnter={() => calendarDay.day && setActiveRouteDate(calendarDay.date)}
                  onMouseLeave={() => setActiveRouteDate(null)}
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

      <RouteMap
        activeDate={activeRouteDate}
        days={yearDays}
      />

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
  const scale = Math.min(drawableWidth / longitudeRange, drawableHeight / latitudeRange);
  const scaledWidth = longitudeRange * scale;
  const scaledHeight = latitudeRange * scale;
  const xOffset = ROUTE_MAP_PADDING + (drawableWidth - scaledWidth) / 2;
  const yOffset = ROUTE_MAP_PADDING + (drawableHeight - scaledHeight) / 2;

  return points.map((point) => ({
    x: xOffset + (point.longitude - minLongitude) * scale,
    y: yOffset + (maxLatitude - point.latitude) * scale,
  }));
}

function formatRoutePoint(point: { x: number; y: number }) {
  return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
}
