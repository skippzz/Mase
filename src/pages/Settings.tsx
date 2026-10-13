import { useState } from "react";
import { Download, Save, ShieldCheck, Upload } from "lucide-react";
import type {
  Settings as StudioSettings,
  StudioState,
  TemplateProfile,
} from "../types";
import { defaults } from "../lib/calendar";
import { download } from "../lib/documents";
import {
  clearStorage,
  exportArchive,
  importArchive,
  replaceAll,
} from "../lib/storage";
import { Field, Modal, Notice } from "../components/ui";

export function Settings({
  studio,
  profiles,
  save,
  restored,
  reset,
  install,
  installAvailable,
}: {
  studio: StudioState;
  profiles: TemplateProfile[];
  save: (s: StudioSettings) => Promise<void>;
  restored: (s: StudioState, p: TemplateProfile[]) => void;
  reset: () => void;
  install: () => void;
  installAvailable: boolean;
}) {
  const [draft, setDraft] = useState(studio.settings),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [restore, setRestore] = useState<{
      state: StudioState;
      profiles: TemplateProfile[];
      fonts?: Partial<
        Record<"regular" | "bold" | "black" | "italic", ArrayBuffer>
      >;
    }>();
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
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
          <span className="eyebrow">A STUDIO THAT FEELS LIKE YOU.</span>
          <h1>
            The details, considered<span>.</span>
          </h1>
          <p>Your identity, your preferences, your peace of mind.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="control-card">
          <h2>Your studio</h2>
          <p className="muted">
            These details appear on your shared schedules.
          </p>
          <Field label="Studio name">
            <input
              value={draft.studioName}
              maxLength={100}
              onChange={(e) =>
                setDraft({ ...draft, studioName: e.target.value })
              }
            />
          </Field>
          <Field label="Trainer name">
            <input
              value={draft.trainerName}
              maxLength={100}
              onChange={(e) =>
                setDraft({ ...draft, trainerName: e.target.value })
              }
              placeholder="Your name"
            />
          </Field>
          <Field label="Document formatting">
            <select
              value={draft.locale}
              onChange={(e) =>
                setDraft({ ...draft, locale: e.target.value as "en-GB" })
              }
            >
              <option value="en-GB">English · 14/10/2026 · 12,450.75</option>
              <option value="tr-TR">Turkish · 14.10.2026 · 12.450,75</option>
            </select>
          </Field>
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                if (!draft.studioName.trim())
                  throw new Error("Enter a studio name.");
                await save({ ...draft, studioName: draft.studioName.trim() });
                setNotice("Your studio details have been saved.");
              })
            }
          >
            <Save size={16} />
            Save preferences
          </button>
        </section>
        <section className="control-card">
          <ShieldCheck className="settings-icon" size={28} strokeWidth={1.5} />
          <h2>A private space</h2>
          <p>
            Appointments, clients, and templates are saved only in this browser
            on this device. Imported spreadsheets stay in temporary memory.
            Nothing is sent to a server.
          </p>
          <p className="muted">
            Your studio does not sync between devices. Export a backup to move
            it or protect it against browser storage being cleared. A backup
            contains client details; keep it private.
          </p>
          <div className="settings-buttons">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  download(
                    await exportArchive(profiles, studio),
                    `Mase-backup-${new Date().toLocaleDateString("sv-SE")}.zip`,
                  );
                  setNotice(
                    "Your full studio backup is ready in your downloads.",
                  );
                })
              }
            >
              <Download size={16} />
              Export studio backup
            </button>
            <label className="button secondary file-button">
              <Upload size={16} />
              Restore backup
              <input
                type="file"
                accept=".zip"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    run(async () => {
                      const data = await importArchive(f);
                      if (!data.state)
                        throw new Error(
                          "This archive contains templates only. Import it in Templates.",
                        );
                      setRestore({
                        state: data.state,
                        profiles: data.profiles,
                        fonts: data.fonts,
                      });
                    });
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <button
            className="text-button danger"
            onClick={() => setConfirm(true)}
          >
            Delete all local studio data
          </button>
        </section>
        <section className="control-card">
          <span className="eyebrow">ALWAYS WITHIN REACH</span>
          <h2>Take your studio with you.</h2>
          <p>
            Install Mase for a quiet, dedicated workspace. After the application
            has fully loaded and cached once, scheduling and document creation
            work offline.
          </p>
          {installAvailable ? (
            <button className="button primary" onClick={install}>
              Install Mase
            </button>
          ) : (
            <div className="install-guide">
              <p>
                <strong>Mac Safari</strong> · File → Add to Dock
              </p>
              <p>
                <strong>iPhone / iPad</strong> · Share → Add to Home Screen
              </p>
              <p>
                <strong>Chrome / Edge</strong> · Use the install icon in the
                address bar when available.
              </p>
            </div>
          )}
          <p className="muted">
            Installation and downloads vary by browser. On iOS, a downloaded
            file may open in a preview; use Share → Save Image or Save to Files.
          </p>
        </section>
        <section className="control-card help-card">
          <span className="eyebrow">A QUICK GUIDE</span>
          <h2>Less admin. More movement.</h2>
          <ol>
            <li>
              <strong>Plan.</strong> Add clients and sessions in your calendar,
              or import an Excel schedule and select its columns.
            </li>
            <li>
              <strong>Style.</strong> Open Documents, choose Calendar or Excel,
              and select a template. Upload your own PNG, JPG, or PDF background
              if you prefer.
            </li>
            <li>
              <strong>Make it yours.</strong> In Customize, drag text into
              position, connect calendar details or spreadsheet columns, and set
              its style.
            </li>
            <li>
              <strong>Share.</strong> Review the exact preview, download PNG or
              PDF, and attach it to your WhatsApp group.
            </li>
          </ol>
          <p className="muted">
            Excel formulas use saved results and are never recalculated here. If
            a required formula has no result, recalculate and save in Excel or
            export again from Google Sheets.
          </p>
        </section>
      </div>
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      {confirm && (
        <Modal
          title="Clear your studio?"
          subtitle="This permanently deletes all local clients, sessions, and templates. Export a backup first if you need a copy."
          close={() => setConfirm(false)}
        >
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setConfirm(false)}
            >
              Keep my data
            </button>
            <button
              className="button danger-button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await clearStorage();
                  reset();
                  setDraft(defaults.settings);
                  setConfirm(false);
                })
              }
            >
              Delete all data
            </button>
          </div>
        </Modal>
      )}
      {restore && (
        <Modal
          title="Restore your studio?"
          subtitle={`Replace the current studio with ${restore.state.clients.length} clients, ${restore.state.appointments.length} sessions, and ${restore.profiles.length} templates from this backup.`}
          close={() => setRestore(undefined)}
        >
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setRestore(undefined)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await replaceAll(
                    restore.state,
                    restore.profiles,
                    restore.fonts,
                  );
                  restored(restore.state, restore.profiles);
                  setDraft(restore.state.settings);
                  setRestore(undefined);
                  setNotice("Your studio backup has been restored.");
                })
              }
            >
              Restore backup
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
