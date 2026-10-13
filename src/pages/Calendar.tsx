import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  Users,
  Sparkles,
  MapPin,
} from "lucide-react";
import type { Appointment, StudioState } from "../types";
import {
  addDays,
  dateKey,
  endTime,
  inWeek,
  localDate,
  minutes,
  periodLabel,
  weekStart,
} from "../lib/calendar";
import { Empty } from "../components/ui";

export function Calendar({
  studio,
  start,
  setStart,
  edit,
  add,
  share,
  demo,
  importExcel,
}: {
  studio: StudioState;
  start: Date;
  setStart: (d: Date) => void;
  edit: (a: Appointment) => void;
  add: (date?: string, time?: string) => void;
  share: () => void;
  demo: () => void;
  importExcel: () => void;
}) {
  const [view, setView] = useState<"week" | "day" | "agenda">("week"),
    [client, setClient] = useState(""),
    [selectedDay, setSelectedDay] = useState(dateKey(new Date()));
  const week = studio.appointments.filter(
    (a) => inWeek(a, start) && a.status !== "cancelled",
  );
  const shown = week.filter((a) => !client || a.clientId === client);
  const totalMinutes = week.reduce((sum, a) => sum + a.duration, 0);
  const today = dateKey(new Date());
  const first = Math.min(
    8,
    ...shown.map((a) => Math.floor(minutes(a.start) / 60)),
  );
  const last = Math.max(
    18,
    ...shown.map((a) => Math.ceil((minutes(a.start) + a.duration) / 60)),
  );
  const hours = Array.from({ length: last - first }, (_, i) => first + i);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const visibleDays =
    view === "day" ? days.filter((d) => dateKey(d) === selectedDay) : days;
  const initials = (name: string) =>
    name
      .split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("");
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            A LITTLE STRUCTURE. A LOT OF POSSIBILITY.
          </span>
          <h1>
            Your week, in balance<span>.</span>
          </h1>
          <p>A considered space for every client and every session.</p>
        </div>
        <div className="heading-actions">
          <button className="button secondary" onClick={importExcel}>
            Import Excel
          </button>
          <button className="button primary" onClick={() => add()}>
            <Plus size={17} />
            New session
          </button>
        </div>
      </div>
      <div className="stats-grid">
        <div className="stat">
          <span>
            Sessions this week
            <CalendarDays size={17} />
          </span>
          <strong>
            {week.length}
            <small>planned moments</small>
          </strong>
        </div>
        <div className="stat">
          <span>
            Time in movement
            <Clock3 size={17} />
          </span>
          <strong>
            {Number((totalMinutes / 60).toFixed(1))}
            <small>hours together</small>
          </strong>
        </div>
        <div className="stat">
          <span>
            Clients this week
            <Users size={17} />
          </span>
          <strong>
            {new Set(week.map((a) => a.clientId)).size}
            <small>individual journeys</small>
          </strong>
        </div>
        <div className="stat sage">
          <span>
            Your studio, your rhythm
            <Sparkles size={17} />
          </span>
          <p>
            Good things begin
            <br />
            with a little space.
          </p>
          <svg className="botanical" viewBox="0 0 100 100" aria-hidden="true">
            <path d="M48 90C43 65 53 38 65 9M49 67C24 64 18 48 21 36c18 2 31 12 29 25M53 48c20-5 26-19 23-33-16 7-25 18-24 31M44 86C22 84 11 70 13 58c19 0 32 12 31 24" />
          </svg>
        </div>
      </div>
      <section className="calendar-panel">
        <div className="calendar-toolbar">
          <div className="date-navigation">
            <button
              className="icon-button"
              aria-label="Previous week"
              onClick={() => {
                const d = addDays(start, -7);
                setStart(d);
                setSelectedDay(dateKey(d));
              }}
            >
              <ChevronLeft size={18} />
            </button>
            <h2>{periodLabel(start, studio.settings.locale)}</h2>
            <button
              className="icon-button"
              aria-label="Next week"
              onClick={() => {
                const d = addDays(start, 7);
                setStart(d);
                setSelectedDay(dateKey(d));
              }}
            >
              <ChevronRight size={18} />
            </button>
            <button
              className="button secondary small"
              onClick={() => {
                setStart(weekStart(new Date()));
                setSelectedDay(today);
              }}
            >
              Today
            </button>
          </div>
          <div className="segmented">
            {(["week", "day", "agenda"] as const).map((v) => (
              <button
                key={v}
                className={view === v ? "active" : ""}
                onClick={() => {
                  setView(v);
                  if (!days.some((d) => dateKey(d) === selectedDay))
                    setSelectedDay(dateKey(start));
                }}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="calendar-subbar">
          <div className="legend">
            <span>
              <i className="dot pilates" />
              Pilates / Barre
            </span>
            <span>
              <i className="dot strength" />
              Strength / PT
            </span>
            <span>
              <i className="dot mobility" />
              Mobility
            </span>
          </div>
          <div className="calendar-tools">
            <select
              aria-label="Filter clients"
              value={client}
              onChange={(e) => setClient(e.target.value)}
            >
              <option value="">All clients</option>
              {studio.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button className="text-button" onClick={share}>
              <ArrowDownToLine size={15} />
              Share schedule
            </button>
          </div>
        </div>
        {view === "day" && (
          <div className="day-picker">
            {days.map((d) => (
              <button
                className={dateKey(d) === selectedDay ? "active" : ""}
                key={dateKey(d)}
                onClick={() => setSelectedDay(dateKey(d))}
              >
                {d.toLocaleDateString(studio.settings.locale, {
                  weekday: "short",
                  day: "numeric",
                })}
              </button>
            ))}
          </div>
        )}
        {view === "agenda" ? (
          <div className="agenda">
            {!shown.length ? (
              <Empty
                title="A little room to breathe."
                text="There are no sessions in this view."
                action={() => add(dateKey(start))}
                label="Plan a session"
              />
            ) : (
              days.map((d) => {
                const sessions = shown
                  .filter((a) => a.date === dateKey(d))
                  .sort((a, b) => a.start.localeCompare(b.start));
                return sessions.length ? (
                  <div className="agenda-day" key={dateKey(d)}>
                    <h3>
                      {d.toLocaleDateString(studio.settings.locale, {
                        weekday: "long",
                        day: "numeric",
                        month: "short",
                      })}
                    </h3>
                    {sessions.map((a) => (
                      <button
                        className="agenda-event"
                        key={a.id}
                        onClick={() => edit(a)}
                      >
                        <span className="agenda-time">
                          {a.start}
                          <small>{endTime(a)}</small>
                        </span>
                        <span className={`avatar ${serviceClass(a.service)}`}>
                          {initials(
                            studio.clients.find((c) => c.id === a.clientId)
                              ?.name || "",
                          )}
                        </span>
                        <span>
                          <strong>
                            {
                              studio.clients.find((c) => c.id === a.clientId)
                                ?.name
                            }
                          </strong>
                          <small>
                            {a.service} · {a.duration} min
                          </small>
                        </span>
                        <span className="agenda-location">
                          <MapPin size={14} />
                          {a.location}
                        </span>
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                  </div>
                ) : null;
              })
            )}
          </div>
        ) : (
          <div className="calendar-scroll">
            <div
              className={`week-grid ${view === "day" ? "single-day" : ""}`}
              style={{
                gridTemplateColumns: `58px repeat(${visibleDays.length}, minmax(${view === "day" ? "250" : "114"}px, 1fr))`,
              }}
            >
              <div className="time-heading">LOCAL</div>
              {visibleDays.map((d) => (
                <div
                  className={`day-heading ${dateKey(d) === today ? "today" : ""}`}
                  key={dateKey(d)}
                >
                  <span>
                    {d.toLocaleDateString(studio.settings.locale, {
                      weekday: "short",
                    })}
                  </span>
                  <strong>{d.getDate()}</strong>
                  {dateKey(d) === today && <i />}
                </div>
              ))}
              <div className="time-column">
                {hours.map((hour) => (
                  <div key={hour}>{String(hour).padStart(2, "0")}:00</div>
                ))}
              </div>
              {visibleDays.map((d) => (
                <div
                  className={`day-column ${dateKey(d) === today ? "today" : ""}`}
                  key={dateKey(d)}
                  style={{ height: hours.length * 64 }}
                >
                  {hours.map((hour) => (
                    <button
                      key={hour}
                      className="hour-slot"
                      aria-label={`Add session ${dateKey(d)} at ${hour}:00`}
                      onClick={() =>
                        add(dateKey(d), `${String(hour).padStart(2, "0")}:00`)
                      }
                    />
                  ))}
                  {shown
                    .filter((a) => a.date === dateKey(d))
                    .map((a) => (
                      <button
                        className={`calendar-event ${serviceClass(a.service)} ${a.status === "tentative" ? "tentative" : ""}`}
                        key={a.id}
                        style={{
                          top: ((minutes(a.start) - first * 60) / 60) * 64 + 2,
                          height: Math.max(15, (a.duration / 60) * 64 - 4),
                        }}
                        onClick={() => edit(a)}
                        aria-label={`${studio.clients.find((c) => c.id === a.clientId)?.name}, ${a.service}, ${a.start} to ${endTime(a)}`}
                      >
                        <span className="event-time">
                          {a.start}
                          {a.duration >= 60 ? ` – ${endTime(a)}` : ""}
                        </span>
                        {a.duration >= 30 && (
                          <strong>
                            {
                              studio.clients.find((c) => c.id === a.clientId)
                                ?.name
                            }
                          </strong>
                        )}
                        {a.duration >= 60 && (
                          <span className="event-service">{a.service}</span>
                        )}
                      </button>
                    ))}
                </div>
              ))}
            </div>
          </div>
        )}
        {!studio.appointments.length && view !== "agenda" && (
          <div className="calendar-empty-note">
            <span>Your next chapter starts with one session.</span>
            <button className="text-button" onClick={demo}>
              Explore a sample week
              <ArrowUpRight size={15} />
            </button>
          </div>
        )}
      </section>
      <div className="page-footnote">
        <span>
          <i className="privacy-dot" />A private space. Saved only on this
          device.
        </span>
        <span>Made for a more considered day.</span>
      </div>
    </>
  );
}
function serviceClass(service: string) {
  return service === "Pilates" || service === "Barre"
    ? "pilates"
    : service === "Mobility" || service === "Other"
      ? "mobility"
      : "strength";
}
