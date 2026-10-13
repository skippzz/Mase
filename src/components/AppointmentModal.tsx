import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import type { Appointment, StudioState } from "../types";
import { SERVICES, conflict, validateAppointment } from "../lib/calendar";
import { Field, Modal, Notice } from "./ui";

export function AppointmentModal({
  initial,
  studio,
  save,
  remove,
  close,
}: {
  initial: Appointment;
  studio: StudioState;
  save: (a: Appointment, newClient?: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  close: () => void;
}) {
  const [data, setData] = useState(initial),
    [newClient, setNewClient] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState(false);
  const existing = studio.appointments.some((a) => a.id === initial.id);
  const overlap = conflict(data, studio.appointments);
  const change = (key: keyof Appointment, value: string | number) =>
    setData((d) => ({ ...d, [key]: value }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (data.clientId !== "__new") validateAppointment(data, studio.clients);
      else {
        if (!newClient.trim()) throw new Error("Enter the client’s name.");
        validateAppointment({ ...data, clientId: "new" }, [
          { id: "new", name: newClient, email: "", phone: "", notes: "" },
        ]);
      }
      if (overlap)
        throw new Error(
          `This overlaps your ${overlap.start} session. Change the time or cancel the other session first.`,
        );
      await save(
        data,
        data.clientId === "__new" ? newClient.trim() : undefined,
      );
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={existing ? "A moment to move." : "Make room for movement."}
      subtitle={
        existing
          ? "Edit this session’s details."
          : "A thoughtful session starts with a little planning."
      }
      close={close}
    >
      <form onSubmit={submit}>
        <Field label="Client">
          <select
            value={data.clientId}
            onChange={(e) => change("clientId", e.target.value)}
            required
          >
            <option value="">Choose a client</option>
            {studio.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="__new">+ Add a new client</option>
          </select>
        </Field>
        {data.clientId === "__new" && (
          <Field label="Client name">
            <input
              autoFocus
              value={newClient}
              onChange={(e) => setNewClient(e.target.value)}
              required
              maxLength={120}
              placeholder="Full name"
            />
          </Field>
        )}
        <div className="form-grid">
          <Field label="Date">
            <input
              type="date"
              value={data.date}
              onChange={(e) => change("date", e.target.value)}
              required
            />
          </Field>
          <Field label="Movement">
            <select
              value={data.service}
              onChange={(e) => change("service", e.target.value)}
            >
              {SERVICES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Start time">
            <input
              type="time"
              value={data.start}
              onChange={(e) => change("start", e.target.value)}
              required
            />
          </Field>
          <Field label="Duration">
            <select
              value={data.duration}
              onChange={(e) => change("duration", Number(e.target.value))}
            >
              {[15, 30, 45, 60, 75, 90, 120, 180, 240, 480].map((n) => (
                <option value={n} key={n}>
                  {n} minutes
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Location">
          <input
            value={data.location}
            onChange={(e) => change("location", e.target.value)}
            placeholder="Private studio, at home, or a location"
            maxLength={200}
          />
        </Field>
        <Field label="Status">
          <select
            value={data.status}
            onChange={(e) => change("status", e.target.value)}
          >
            <option value="confirmed">Confirmed</option>
            <option value="tentative">Tentative</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </Field>
        <Field
          label="Private notes"
          hint="Notes stay in your studio and are excluded from shared schedules."
        >
          <textarea
            rows={3}
            value={data.notes}
            onChange={(e) => change("notes", e.target.value)}
            maxLength={3000}
            placeholder="Anything to keep in mind…"
          />
        </Field>
        {overlap && (
          <Notice error>
            Overlaps the session at {overlap.start}. Choose another time.
          </Notice>
        )}
        {error && <Notice error>{error}</Notice>}
        {deleting && (
          <Notice error>
            Delete this session permanently?{" "}
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await remove(data.id);
                  close();
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(false);
                }
              }}
            >
              Confirm delete
            </button>
          </Notice>
        )}
        <div className="modal-actions">
          {existing && (
            <button
              type="button"
              className="icon-button danger"
              aria-label="Delete session"
              onClick={() => setDeleting(true)}
            >
              <Trash2 size={18} />
            </button>
          )}
          <button type="button" className="button secondary" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || !!overlap}>
            {busy ? "Saving…" : existing ? "Save changes" : "Create session"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
