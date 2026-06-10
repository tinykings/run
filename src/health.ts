export type HealthExport = {
  activity?: {
    timeZone?: string;
    workouts?: HealthWorkout[];
  };
  data?: {
    workouts?: HealthAutoExportWorkout[];
  };
  meta?: {
    exportedAt?: string;
    rangeEnd?: string;
    rangeStart?: string;
    timeZone?: string;
  };
};

export type HealthWorkout = {
  activeEnergyKcal?: number;
  avgHeartRate?: number;
  averagePaceSecPerKm?: number;
  averageSpeedKmh?: number;
  distanceKm?: number;
  durationSec?: number;
  elevationAscendedM?: number;
  end?: string;
  id?: string;
  intensity?: number;
  isIndoor?: boolean;
  maxSpeedKmh?: number;
  name?: string;
  route?: RoutePoint[];
  source?: string;
  start?: string;
  startLocal?: string;
  temperatureC?: number;
  totalEnergyKcal?: number;
  type?: string;
  weatherTemperatureC?: number;
};

export type RoutePoint = {
  latitude: number;
  longitude: number;
};

type HealthAutoExportWorkout = {
  activeEnergyBurned?: Quantity;
  avgHeartRate?: Quantity;
  avgSpeed?: Quantity;
  distance?: Quantity;
  duration?: number;
  elevationUp?: Quantity;
  end?: string;
  id?: string;
  intensity?: Quantity;
  isIndoor?: boolean;
  maxSpeed?: Quantity;
  name?: string;
  route?: HealthAutoExportRoutePoint[];
  speed?: Quantity;
  start?: string;
  temperature?: Quantity;
};

type HealthAutoExportRoutePoint = {
  latitude?: number;
  longitude?: number;
};

type Quantity = {
  qty?: number;
  units?: string;
};

export type Run = Required<
  Pick<HealthWorkout, "distanceKm" | "durationSec" | "start">
> &
  HealthWorkout & {
    date: string;
  };

export type DayRuns = {
  date: string;
  runs: Run[];
  distanceKm: number;
  durationSec: number;
  temperatureF: number | null;
};

export type RunStats = {
  totalDistanceKm: number;
  totalDurationSec: number;
  totalRuns: number;
  totalElevationGainM: number;
  averageElevationGainM: number | null;
  averageSpeedKmh: number | null;
  averagePaceSecPerKm: number | null;
  averageHeartRate: number | null;
  averagePower: number | null;
};

const KILOJOULES_PER_KILOCALORIE = 4.184;
const MILES_PER_KILOMETER = 0.621371;
const MAX_ROUTE_POINTS = 250;

export function normalizeHealthExports(exports: HealthExport[]): HealthExport {
  const workouts = dedupeWorkouts(exports.flatMap((healthExport) => getWorkouts(healthExport)));

  return {
    activity: {
      timeZone: "source",
      workouts,
    },
  };
}

export function getTimeZone(data: HealthExport) {
  return data.activity?.timeZone ?? data.meta?.timeZone ?? "UTC";
}

export function getRunsByDate(data: HealthExport) {
  const timeZone = getTimeZone(data);
  const byDate = new Map<string, DayRuns>();

  for (const workout of data.activity?.workouts ?? []) {
    if (workout.type !== "Running" || !workout.start) {
      continue;
    }

    const distanceKm = workout.distanceKm ?? 0;
    const durationSec = workout.durationSec ?? 0;
    const date = formatDateInTimeZone(workout.startLocal ?? workout.start, timeZone);
    const run: Run = { ...workout, date, distanceKm, durationSec, start: workout.start };
    const day = byDate.get(date) ?? {
      date,
      runs: [],
      distanceKm: 0,
      durationSec: 0,
      temperatureF: null,
    };

    day.runs.push(run);
    day.distanceKm += distanceKm;
    day.durationSec += durationSec;
    byDate.set(date, day);
  }

  for (const day of byDate.values()) {
    day.runs.sort((a, b) => a.start.localeCompare(b.start));
    day.temperatureF = getWeightedWeatherAverage(day.runs, (run) => {
      const temperatureC = run.temperatureC ?? run.weatherTemperatureC;

      return temperatureC === undefined ? undefined : (temperatureC * 9) / 5 + 32;
    });
  }

  return byDate;
}

function getWeightedWeatherAverage(runs: Run[], getValue: (run: Run) => number | undefined) {
  let weightedTotal = 0;
  let totalDuration = 0;

  for (const run of runs) {
    const value = getValue(run);

    if (value === undefined || !Number.isFinite(value)) {
      continue;
    }

    weightedTotal += value * run.durationSec;
    totalDuration += run.durationSec;
  }

  return totalDuration > 0 ? weightedTotal / totalDuration : null;
}

export function getRunStats(days: Iterable<DayRuns>): RunStats {
  let totalDistanceKm = 0;
  let totalDurationSec = 0;
  let totalElevationGainM = 0;
  let totalRuns = 0;
  let heartRateWeightedTotal = 0;
  let heartRateDurationSec = 0;
  let powerWeightedTotal = 0;
  let powerDurationSec = 0;

  for (const day of days) {
    totalDistanceKm += day.distanceKm;
    totalDurationSec += day.durationSec;
    totalRuns += day.runs.length;

    for (const run of day.runs) {
      totalElevationGainM += run.elevationAscendedM ?? 0;

      if (run.avgHeartRate !== undefined && Number.isFinite(run.avgHeartRate)) {
        heartRateWeightedTotal += run.avgHeartRate * run.durationSec;
        heartRateDurationSec += run.durationSec;
      }

      if (run.intensity !== undefined && Number.isFinite(run.intensity)) {
        powerWeightedTotal += run.intensity * run.durationSec;
        powerDurationSec += run.durationSec;
      }
    }
  }

  return {
    totalDistanceKm,
    totalDurationSec,
    totalElevationGainM,
    totalRuns,
    averageElevationGainM: totalRuns > 0 ? totalElevationGainM / totalRuns : null,
    averageSpeedKmh: totalDurationSec > 0 ? (totalDistanceKm / totalDurationSec) * 3600 : null,
    averagePaceSecPerKm: totalDistanceKm > 0 ? totalDurationSec / totalDistanceKm : null,
    averageHeartRate: heartRateDurationSec > 0 ? heartRateWeightedTotal / heartRateDurationSec : null,
    averagePower: powerDurationSec > 0 ? powerWeightedTotal / powerDurationSec : null,
  };
}

export function getYearOptions(days: Iterable<DayRuns>) {
  const years = new Set<number>();

  for (const day of days) {
    years.add(Number(day.date.slice(0, 4)));
  }

  return [...years].sort((a, b) => b - a);
}

export function formatDistance(km: number) {
  const miles = km * MILES_PER_KILOMETER;

  return `${miles.toFixed(miles >= 10 ? 1 : 2)} mi`;
}

export function formatDuration(totalSeconds: number) {
  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}:${minutes.toString().padStart(2, "0")}`;
}

export function formatPace(secondsPerKm: number | null | undefined) {
  if (!secondsPerKm || !Number.isFinite(secondsPerKm)) {
    return "-- /km";
  }

  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);

  return `${minutes}:${seconds.toString().padStart(2, "0")} /km`;
}

export function formatSpeed(kmh: number | null | undefined) {
  if (!kmh || !Number.isFinite(kmh)) {
    return "-- km/h";
  }

  return `${kmh.toFixed(1)} km/h`;
}

export function formatTemperature(celsius: number | null | undefined) {
  if (celsius === null || celsius === undefined || !Number.isFinite(celsius)) {
    return "-- C";
  }

  return `${celsius.toFixed(1)} C`;
}

export function formatDay(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function formatTime(isoDate: string, timeZone: string) {
  if (timeZone === "source") {
    const time = isoDate.match(/(?:T| )(\d{2}):(\d{2})/);

    if (time) {
      const hour = Number(time[1]);
      const period = hour >= 12 ? "PM" : "AM";
      const displayHour = hour % 12 || 12;

      return `${displayHour}:${time[2]} ${period}`;
    }
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(isoDate));
}

function formatDateInTimeZone(isoDate: string, timeZone: string) {
  if (timeZone === "source") {
    return isoDate.slice(0, 10);
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(isoDate));

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function getWorkouts(data: HealthExport) {
  if (data.data?.workouts) {
    return data.data.workouts.flatMap(normalizeHealthAutoExportWorkout);
  }

  return data.activity?.workouts ?? [];
}

function normalizeHealthAutoExportWorkout(workout: HealthAutoExportWorkout): HealthWorkout[] {
  if (!workout.name?.includes("Run") || !workout.start) {
    return [];
  }

  const distanceKm = workout.distance?.qty ?? 0;
  const durationSec = workout.duration ?? 0;
  const activeEnergyKcal = convertEnergyToKcal(workout.activeEnergyBurned);
  const temperatureC = workout.temperature?.qty;

  return [
    {
      activeEnergyKcal,
      avgHeartRate: workout.avgHeartRate?.qty,
      averagePaceSecPerKm: distanceKm > 0 ? durationSec / distanceKm : undefined,
      averageSpeedKmh: workout.avgSpeed?.qty ?? workout.speed?.qty,
      distanceKm,
      durationSec,
      elevationAscendedM: workout.elevationUp?.qty,
      end: toIsoWithOffset(workout.end),
      id: workout.id,
      intensity: workout.intensity?.qty,
      isIndoor: workout.isIndoor ?? workout.name.includes("Indoor"),
      maxSpeedKmh: workout.maxSpeed?.qty ?? workout.speed?.qty,
      name: workout.name,
      route: normalizeRoute(workout.route),
      source: "Health Auto Export",
      start: toIsoWithOffset(workout.start),
      startLocal: workout.start,
      temperatureC,
      totalEnergyKcal: activeEnergyKcal,
      type: "Running",
      weatherTemperatureC: temperatureC,
    },
  ];
}

function normalizeRoute(route: HealthAutoExportRoutePoint[] | undefined) {
  const points = route
    ?.filter((point) => point.latitude !== undefined && point.longitude !== undefined)
    .map((point) => ({ latitude: point.latitude as number, longitude: point.longitude as number }));

  if (!points || points.length <= MAX_ROUTE_POINTS) {
    return points;
  }

  const step = Math.ceil(points.length / MAX_ROUTE_POINTS);
  const sampled = points.filter((_, index) => index % step === 0);
  const lastPoint = points.at(-1);

  if (lastPoint && sampled.at(-1) !== lastPoint) {
    sampled.push(lastPoint);
  }

  return sampled;
}

function dedupeWorkouts(workouts: HealthWorkout[]) {
  const seen = new Set<string>();
  const deduped: HealthWorkout[] = [];

  for (const workout of workouts) {
    const key = workout.id ?? [workout.start, workout.name, workout.distanceKm, workout.durationSec].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(workout);
  }

  return deduped;
}

function convertEnergyToKcal(quantity: Quantity | undefined) {
  if (quantity?.qty === undefined) {
    return undefined;
  }

  return quantity.units === "kJ" ? quantity.qty / KILOJOULES_PER_KILOCALORIE : quantity.qty;
}

function toIsoWithOffset(date: string | undefined) {
  if (!date) {
    return undefined;
  }

  const match = date.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/);

  if (!match) {
    return date;
  }

  return `${match[1]}T${match[2]}${match[3]}${match[4]}:${match[5]}`;
}
