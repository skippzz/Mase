import type { Appointment, Client, Locale, StudioState } from "../types";

export const SERVICES = [
  "Pilates",
  "Personal training",
  "Strength",
  "Mobility",
  "Barre",
  "Other",
] as const;
export const defaults: StudioState = {
  version: 1,
  clients: [],
  appointments: [],
  settings: {
    studioName: "Mase Studio",
    trainerName: "",
    locale: "en-GB",
    demo: false,
  },
};
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function localDate(key: string) {
  return new Date(`${key}T12:00:00`);
}
export function addDays(date: Date, count: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + count);
  return d;
}
export function weekStart(date: Date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}
export function minutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function timeString(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
export function endTime(a: Appointment) {
  return timeString(minutes(a.start) + a.duration);
}
export function periodLabel(start: Date, locale: Locale) {
  const end = addDays(start, 6);
  return `${start.toLocaleDateString(locale, { day: "numeric", month: "short" })} – ${end.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}`;
}
export function inWeek(a: Appointment, start: Date) {
  return a.date >= dateKey(start) && a.date <= dateKey(addDays(start, 6));
}
export function conflict(appointment: Appointment, others: Appointment[]) {
  if (appointment.status === "cancelled") return undefined;
  return others.find(
    (a) =>
      a.id !== appointment.id &&
      a.status !== "cancelled" &&
      a.date === appointment.date &&
      minutes(a.start) < minutes(appointment.start) + appointment.duration &&
      minutes(appointment.start) < minutes(a.start) + a.duration,
  );
}
export function validateAppointment(a: Appointment, clients: Client[]) {
  if (!clients.some((c) => c.id === a.clientId))
    throw new Error("Choose a client for this session.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(a.date) ||
    dateKey(localDate(a.date)) !== a.date
  )
    throw new Error("Choose a valid session date.");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(a.start))
    throw new Error("Choose a valid start time.");
  if (
    !Number.isFinite(a.duration) ||
    a.duration < 15 ||
    a.duration > 480 ||
    minutes(a.start) + a.duration > 1440
  )
    throw new Error(
      "Sessions must last 15–480 minutes and finish by midnight.",
    );
}
export function calendarValues(
  state: StudioState,
  start: Date,
  clientId: string,
  day = "",
) {
  const appointments = state.appointments
    .filter(
      (a) =>
        inWeek(a, start) &&
        (!day || a.date === day) &&
        a.status !== "cancelled" &&
        (!clientId || a.clientId === clientId),
    )
    .sort((a, b) =>
      `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`),
    );
  const lines: string[] = [];
  let previous = "";
  for (const a of appointments) {
    if (a.date !== previous) {
      if (lines.length) lines.push("");
      lines.push(
        localDate(a.date)
          .toLocaleDateString(state.settings.locale, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })
          .toLocaleUpperCase(state.settings.locale),
      );
      previous = a.date;
    }
    const name =
      state.clients.find((c) => c.id === a.clientId)?.name || "Unknown client";
    lines.push(
      `${a.start}–${endTime(a)}  ${a.service}${clientId ? "" : ` · ${name}`}${a.status === "tentative" ? " (tentative)" : ""}`,
    );
    if (a.location) lines.push(a.location);
  }
  return {
    schedule: lines.join("\n"),
    period: day
      ? localDate(day).toLocaleDateString(state.settings.locale, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : periodLabel(start, state.settings.locale),
    client: clientId
      ? state.clients.find((c) => c.id === clientId)?.name || ""
      : "Private training & considered movement",
    studio: state.settings.studioName,
    title: day
      ? "Your day, beautifully balanced."
      : "Your week, beautifully balanced.",
  };
}
export function demonstration(start = weekStart(new Date())): StudioState {
  const clients: Client[] = [
    "Ada (sample)",
    "Defne (sample)",
    "Lara (sample)",
    "Mina (sample)",
  ].map((name, i) => ({
    id: `sample-${i}`,
    name,
    email: "",
    phone: "",
    notes: "",
  }));
  const slots: [number, string, number, (typeof SERVICES)[number], number][] = [
    [0, "08:00", 60, "Pilates", 0],
    [0, "10:30", 60, "Strength", 1],
    [0, "14:00", 60, "Personal training", 2],
    [1, "09:00", 60, "Pilates", 3],
    [1, "12:00", 45, "Mobility", 0],
    [2, "08:30", 60, "Strength", 2],
    [2, "11:00", 60, "Pilates", 1],
    [2, "15:00", 45, "Barre", 3],
    [3, "09:00", 60, "Personal training", 0],
    [3, "13:00", 60, "Pilates", 2],
    [4, "08:00", 60, "Pilates", 1],
    [4, "11:30", 45, "Mobility", 3],
  ];
  return {
    version: 1,
    clients,
    settings: { ...defaults.settings, demo: true },
    appointments: slots.map(
      ([day, startTime, duration, service, client], i) => ({
        id: `sample-session-${i}`,
        clientId: clients[client].id,
        date: dateKey(addDays(start, day)),
        start: startTime,
        duration,
        service,
        location: i % 3 === 0 ? "Private studio" : "At home",
        notes: "",
        status: i === 7 ? "tentative" : "confirmed",
      }),
    ),
  };
}
