import { useMemo, useState } from "react";
import type { Appointment, Client, StudioState, WorkbookData } from "../types";
import { asDate, parseWorkbook, tableData } from "../lib/spreadsheet";
import {
  SERVICES,
  conflict,
  dateKey,
  timeString,
  validateAppointment,
} from "../lib/calendar";
import { Field, FileDrop, Modal, Notice } from "./ui";

type ImportKey =
  "client" | "date" | "time" | "duration" | "service" | "location";
export function CalendarImport({
  studio,
  save,
  close,
}: {
  studio: StudioState;
  save: (s: StudioState) => Promise<void>;
  close: () => void;
}) {
  const [workbook, setWorkbook] = useState<WorkbookData>(),
    [sheetName, setSheetName] = useState(""),
    [header, setHeader] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [mapping, setMapping] = useState<Record<ImportKey, string>>({
    client: "",
    date: "",
    time: "",
    duration: "",
    service: "",
    location: "",
  });
  const [defaultDuration, setDefaultDuration] = useState(60),
    [service, setService] = useState<(typeof SERVICES)[number]>("Pilates");
  const sheet = workbook?.sheets.find((s) => s.name === sheetName);
  const table = useMemo(
    () => (sheet ? tableData(sheet, header) : { columns: [], records: [] }),
    [sheet, header],
  );
  const result = useMemo(() => {
    const clients = [...studio.clients],
      appointments: Appointment[] = [],
      errors: string[] = [];
    if (!mapping.client || !mapping.date || !mapping.time)
      return { clients, appointments, errors };
    for (const record of table.records) {
      try {
        const get = (key: ImportKey) => {
          const cell = record.cells[mapping[key]];
          if (cell?.error) throw new Error(cell.error);
          return cell?.value;
        };
        const name = String(get("client") ?? "").trim();
        if (!name) throw new Error("Client name is missing.");
        const dateValue = get("date");
        const d = asDate(dateValue ?? null);
        if (!d)
          throw new Error(
            "Date must be an Excel date, YYYY-MM-DD, or DD.MM.YYYY.",
          );
        const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
        const time = get("time");
        let start = "";
        if (typeof time === "number" && time >= 0 && time < 1)
          start = timeString(Math.round(time * 1440) % 1440);
        else if (time instanceof Date)
          start = `${String(time.getUTCHours()).padStart(2, "0")}:${String(time.getUTCMinutes()).padStart(2, "0")}`;
        else {
          const matched = String(time || "").match(/^(\d{1,2}):([0-5]\d)$/);
          if (matched) start = `${matched[1].padStart(2, "0")}:${matched[2]}`;
        }
        if (!start)
          throw new Error(
            "Time must be an Excel time or HH:MM, using a 24-hour clock.",
          );
        let client = clients.find(
          (c) => c.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        );
        if (!client) {
          client = {
            id: `import-client-${clients.length}`,
            name,
            email: "",
            phone: "",
            notes: "",
          };
          clients.push(client);
        }
        const duration = mapping.duration
          ? Number(get("duration"))
          : defaultDuration;
        const movement = mapping.service
          ? String(get("service") || "")
          : service;
        if (!SERVICES.includes(movement as (typeof SERVICES)[number]))
          throw new Error(
            `Unknown movement “${movement}”. Map a supported name or use a default movement.`,
          );
        const a: Appointment = {
          id: `import-row-${record.row}`,
          clientId: client.id,
          date: day,
          start,
          duration,
          service: movement as (typeof SERVICES)[number],
          location: String(get("location") || ""),
          notes: "",
          status: "confirmed",
        };
        validateAppointment(a, clients);
        const overlap = conflict(a, [...studio.appointments, ...appointments]);
        if (overlap)
          throw new Error(
            `Overlaps another session on ${a.date} at ${overlap.start}.`,
          );
        appointments.push(a);
      } catch (e) {
        errors.push(`Row ${record.row}: ${(e as Error).message}`);
      }
    }
    return { clients, appointments, errors };
  }, [studio, table, mapping, defaultDuration, service]);
  const valid = result.appointments.length > 0 && !result.errors.length;
  return (
    <Modal
      title="Bring your plans together."
      subtitle="Import sessions from Excel. Choose the columns, review, then add them to your calendar."
      wide
      close={close}
    >
      {!workbook ? (
        <FileDrop
          accept=".xlsx"
          label="Drop your session spreadsheet"
          detail="Google Sheets exports work too · .xlsx · Up to 20 MB"
          disabled={busy}
          onFile={async (f) => {
            setBusy(true);
            setError("");
            try {
              const w = await parseWorkbook(f);
              setWorkbook(w);
              setSheetName(w.sheets[0].name);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : (
        <>
          <div className="form-grid">
            <Field label="Worksheet">
              <select
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
              >
                {workbook.sheets.map((s) => (
                  <option key={s.name}>{s.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Header row">
              <input
                type="number"
                value={header}
                min={1}
                max={Math.max(1, sheet?.rowCount || 1)}
                onChange={(e) => setHeader(Math.max(1, Number(e.target.value)))}
              />
            </Field>
          </div>
          <div className="import-mappings">
            {(
              [
                "client",
                "date",
                "time",
                "duration",
                "service",
                "location",
              ] as const
            ).map((key) => (
              <Field
                key={key}
                label={`${key === "service" ? "Movement" : key[0].toUpperCase() + key.slice(1)}${["client", "date", "time"].includes(key) ? " *" : ""}`}
              >
                <select
                  value={mapping[key]}
                  onChange={(e) =>
                    setMapping({ ...mapping, [key]: e.target.value })
                  }
                >
                  <option value="">
                    {key === "duration" || key === "service"
                      ? "Use default below"
                      : key === "location"
                        ? "Leave empty"
                        : "Choose column"}
                  </option>
                  {table.columns.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.key} · {c.label}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <div className="form-grid">
            <Field label="Default duration">
              <select
                value={defaultDuration}
                onChange={(e) => setDefaultDuration(Number(e.target.value))}
              >
                {[30, 45, 60, 75, 90, 120].map((n) => (
                  <option key={n} value={n}>
                    {n} minutes
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Default movement">
              <select
                value={service}
                onChange={(e) => setService(e.target.value as typeof service)}
              >
                {SERVICES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
          <Notice>
            {table.records.length} spreadsheet rows ·{" "}
            {result.appointments.length} ready to import ·{" "}
            {result.clients.length - studio.clients.length} new clients.
            Existing sessions are preserved.
          </Notice>
          {result.errors.length > 0 && (
            <Notice error>
              {result.errors.length} rows need attention. Nothing will be
              imported until every row is valid.
              <ul>
                {result.errors.slice(0, 8).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </Notice>
          )}
          {result.appointments.length > 0 && (
            <div className="table-scroll import-preview">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Movement</th>
                    <th>Minutes</th>
                  </tr>
                </thead>
                <tbody>
                  {result.appointments.slice(0, 8).map((a) => (
                    <tr key={a.id}>
                      <td>
                        {result.clients.find((c) => c.id === a.clientId)?.name}
                      </td>
                      <td>{a.date}</td>
                      <td>{a.start}</td>
                      <td>{a.service}</td>
                      <td>{a.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {error && <Notice error>{error}</Notice>}
      <div className="modal-actions">
        <button className="button secondary" onClick={close}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const replacements = new Map<string, string>();
              const clients: Client[] = result.clients.map((c) => {
                if (!studio.clients.some((existing) => existing.id === c.id)) {
                  const id = crypto.randomUUID();
                  replacements.set(c.id, id);
                  return { ...c, id };
                }
                return c;
              });
              const appointments = result.appointments.map((a) => ({
                ...a,
                id: crypto.randomUUID(),
                clientId: replacements.get(a.clientId) || a.clientId,
              }));
              await save({
                ...studio,
                clients,
                appointments: [...studio.appointments, ...appointments],
              });
              close();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? "Importing…"
            : `Import ${result.appointments.length} sessions`}
        </button>
      </div>
    </Modal>
  );
}
