import { useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Mail,
  MapPin,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import type { Client, StudioState } from "../types";
import { Field, Empty, Modal, Notice } from "../components/ui";
import { localDate } from "../lib/calendar";

export function Clients({
  studio,
  save,
  remove,
  session,
  share,
}: {
  studio: StudioState;
  save: (c: Client) => Promise<void>;
  remove: (id: string) => Promise<void>;
  session: (id: string) => void;
  share: (id: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Client | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState(false);
  const shown = studio.clients.filter((c) =>
    c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const open = (c: Client) => {
    setSelected({ ...c });
    setError("");
    setDeleting(false);
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (!selected?.name.trim()) throw new Error("Enter a client name.");
      await save({ ...selected!, name: selected!.name.trim() });
      setSelected(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">INDIVIDUAL CARE, BY DESIGN.</span>
          <h1>
            Every journey matters<span>.</span>
          </h1>
          <p>The people at the heart of your studio.</p>
        </div>
        <button
          className="button primary"
          onClick={() =>
            open({
              id: crypto.randomUUID(),
              name: "",
              email: "",
              phone: "",
              notes: "",
            })
          }
        >
          <Plus size={17} />
          New client
        </button>
      </div>
      <div className="section-toolbar">
        <span>{studio.clients.length} clients in your studio</span>
        <div className="search-input">
          <Search size={16} />
          <input
            placeholder="Find a client…"
            aria-label="Search clients"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      {!shown.length ? (
        <Empty
          title={search ? "No matching clients." : "A space for personal care."}
          text={
            search
              ? "Try a different name."
              : "Add your first client and start planning their movement journey."
          }
          action={() =>
            open({
              id: crypto.randomUUID(),
              name: "",
              email: "",
              phone: "",
              notes: "",
            })
          }
          label="Add a client"
        />
      ) : (
        <div className="client-grid">
          {shown.map((c) => {
            const sessions = studio.appointments.filter(
              (a) => a.clientId === c.id && a.status !== "cancelled",
            );
            const next = sessions
              .filter(
                (a) =>
                  `${a.date}T${a.start}` >=
                  new Date().toLocaleDateString("sv-SE") +
                    "T" +
                    new Date().toTimeString().slice(0, 5),
              )
              .sort((a, b) =>
                `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`),
              )[0];
            return (
              <article className="client-card" key={c.id}>
                <div className="client-card-top">
                  <span className="avatar large">
                    {c.name
                      .split(" ")
                      .slice(0, 2)
                      .map((s) => s[0])
                      .join("")}
                  </span>
                  <button
                    className="icon-button"
                    aria-label={`Edit ${c.name}`}
                    onClick={() => open(c)}
                  >
                    <ArrowUpRight size={19} />
                  </button>
                </div>
                <h2>{c.name}</h2>
                <p>
                  {sessions.length}{" "}
                  {sessions.length === 1 ? "session" : "sessions"} planned
                </p>
                <div className="client-detail">
                  {c.email && (
                    <span>
                      <Mail size={14} />
                      {c.email}
                    </span>
                  )}
                  {next ? (
                    <span>
                      <MapPin size={14} />
                      Next:{" "}
                      {localDate(next.date).toLocaleDateString(
                        studio.settings.locale,
                        { month: "short", day: "numeric" },
                      )}{" "}
                      · {next.start}
                    </span>
                  ) : (
                    <span>
                      <Users size={14} />
                      Ready for the next chapter
                    </span>
                  )}
                </div>
                <div className="client-actions">
                  <button
                    className="button secondary small"
                    onClick={() => session(c.id)}
                  >
                    Plan session
                  </button>
                  <button className="text-button" onClick={() => share(c.id)}>
                    Schedule
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {selected && (
        <Modal
          title={
            studio.clients.some((c) => c.id === selected.id)
              ? "Personal, by nature."
              : "A new journey begins."
          }
          subtitle="A few details for a more personal experience."
          close={() => setSelected(null)}
        >
          <form onSubmit={submit}>
            <Field label="Full name">
              <input
                autoFocus
                value={selected.name}
                onChange={(e) =>
                  setSelected({ ...selected, name: e.target.value })
                }
                required
                maxLength={120}
              />
            </Field>
            <div className="form-grid">
              <Field label="Email">
                <input
                  type="email"
                  value={selected.email}
                  onChange={(e) =>
                    setSelected({ ...selected, email: e.target.value })
                  }
                  maxLength={200}
                />
              </Field>
              <Field label="Phone">
                <input
                  type="tel"
                  value={selected.phone}
                  onChange={(e) =>
                    setSelected({ ...selected, phone: e.target.value })
                  }
                  maxLength={80}
                />
              </Field>
            </div>
            <Field label="Private notes">
              <textarea
                rows={4}
                value={selected.notes}
                onChange={(e) =>
                  setSelected({ ...selected, notes: e.target.value })
                }
                maxLength={5000}
              />
            </Field>
            {error && <Notice error>{error}</Notice>}
            {deleting && (
              <Notice error>
                Deleting this client also deletes their sessions.{" "}
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await remove(selected.id);
                      setSelected(null);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Confirm delete
                </button>
              </Notice>
            )}
            <div className="modal-actions">
              {studio.clients.some((c) => c.id === selected.id) && (
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label="Delete client"
                  onClick={() => setDeleting(true)}
                >
                  <Trash2 size={18} />
                </button>
              )}
              <button
                type="button"
                className="button secondary"
                onClick={() => setSelected(null)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Saving…" : "Save client"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
