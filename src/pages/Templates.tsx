import { useEffect, useState } from "react";
import {
  Copy,
  Download,
  FileImage,
  FileText,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import type { StudioState, TemplateProfile } from "../types";
import { calendarValues } from "../lib/calendar";
import { download, importTemplate } from "../lib/documents";
import { exportArchive, importArchive } from "../lib/storage";
import { makeField } from "../lib/profiles";
import { TemplateEditor } from "../components/TemplateEditor";
import { Empty, FileDrop, Modal, Notice } from "../components/ui";

export function Templates({
  profiles,
  studio,
  start,
  save,
  remove,
  useTemplate,
}: {
  profiles: TemplateProfile[];
  studio: StudioState;
  start: Date;
  save: (p: TemplateProfile) => Promise<void>;
  remove: (id: string) => Promise<void>;
  useTemplate: (id: string) => void;
}) {
  const [editing, setEditing] = useState<TemplateProfile>(),
    [upload, setUpload] = useState(false),
    [deleting, setDeleting] = useState<TemplateProfile>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR SIGNATURE, EVERY TIME.</span>
          <h1>
            A collection of possibilities<span>.</span>
          </h1>
          <p>Create your look once. Let every schedule feel like you.</p>
        </div>
        <button className="button primary" onClick={() => setUpload(true)}>
          <Plus size={17} />
          New template
        </button>
      </div>
      <div className="section-toolbar">
        <span>{profiles.length} reusable templates · Saved on this device</span>
        <label className="button secondary small file-button">
          <Upload size={14} />
          Import template
          <input
            type="file"
            accept=".zip"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                run(async () => {
                  const imported = await importArchive(file);
                  for (const p of imported.profiles)
                    await save({ ...p, id: crypto.randomUUID() });
                });
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {error && <Notice error>{error}</Notice>}
      {!profiles.length ? (
        <Empty
          title="Make your first impression."
          text="Upload a branded image or PDF to create a reusable schedule template."
          action={() => setUpload(true)}
          label="Create a template"
        />
      ) : (
        <div className="template-grid">
          {profiles.map((p) => (
            <article className="template-card" key={p.id}>
              <TemplateThumbnail profile={p} />
              <div className="template-card-body">
                <span className="eyebrow">
                  {p.type === "builtin"
                    ? "STUDIO COLLECTION"
                    : p.type === "image"
                      ? "IMAGE BACKGROUND"
                      : "PDF BACKGROUND"}
                </span>
                <h2>{p.name}</h2>
                <p>
                  {p.fields.length} text fields · {p.pages.length}{" "}
                  {p.pages.length === 1 ? "page" : "pages"}
                </p>
                <div className="template-card-actions">
                  <button
                    className="button secondary small"
                    onClick={() => useTemplate(p.id)}
                  >
                    Use template
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Edit ${p.name}`}
                    onClick={() => setEditing(p)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label={`Duplicate ${p.name}`}
                    onClick={() =>
                      run(async () => {
                        await save({
                          ...p,
                          id: crypto.randomUUID(),
                          name: `${p.name} copy`,
                        });
                      })
                    }
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label={`Export ${p.name}`}
                    onClick={() =>
                      run(async () => {
                        download(
                          await exportArchive([p]),
                          `${p.name.replace(/[^\p{L}\p{N}_ -]/gu, "") || "template"}.mase.zip`,
                        );
                      })
                    }
                  >
                    <Download size={16} />
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => setDeleting(p)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="soft-note">
        <strong>A little care for your collection.</strong>
        <p>
          Browser storage can be cleared by the browser or device owner. Export
          your templates or a full studio backup to keep a copy somewhere safe.
        </p>
      </div>
      {editing && (
        <TemplateEditor
          profile={editing}
          context={{
            locale: studio.settings.locale,
            calendar: calendarValues(studio, start, ""),
          }}
          save={save}
          close={() => setEditing(undefined)}
          calendarMode
        />
      )}
      {upload && (
        <Modal
          title="A canvas for your plans."
          subtitle="Bring a background you love. A photo, a branded card, or a PDF."
          close={() => setUpload(false)}
        >
          <FileDrop
            accept=".png,.jpg,.jpeg,.pdf"
            label="Drop your template here"
            detail="PNG, JPEG, or PDF · Up to 20 MB"
            disabled={busy}
            onFile={(f) =>
              run(async () => {
                const p = await importTemplate(f);
                if (!p.fields.length)
                  p.fields.push(
                    makeField({
                      label: "Schedule",
                      source: { kind: "calendar", key: "schedule" },
                      height: 0.6,
                      overflow: "shrink",
                      required: true,
                    }),
                  );
                await save(p);
                setUpload(false);
                setEditing(p);
              })
            }
          />
          {error && <Notice error>{error}</Notice>}
        </Modal>
      )}
      {deleting && (
        <Modal
          title="Let this one go?"
          subtitle={`Delete “${deleting.name}” from this device. This cannot be undone.`}
          close={() => setDeleting(undefined)}
        >
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDeleting(undefined)}
            >
              Keep template
            </button>
            <button
              className="button danger-button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await remove(deleting.id);
                  setDeleting(undefined);
                })
              }
            >
              Delete template
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function TemplateThumbnail({ profile }: { profile: TemplateProfile }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (profile.type !== "image" || !profile.asset) return;
    const u = URL.createObjectURL(profile.asset);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [profile.asset, profile.type]);
  return (
    <div className={`template-thumbnail ${profile.design || profile.type}`}>
      {url ? (
        <img src={url} alt={profile.name} />
      ) : profile.type === "pdf" ? (
        <>
          <FileText size={34} strokeWidth={1} />
          <span>{profile.assetName}</span>
        </>
      ) : (
        <div className="mini-document">
          <span>MASE / PRIVATE STUDIO</span>
          <h3>
            {profile.design === "session" ? (
              <>
                Your session,
                <br />
                considered.
              </>
            ) : (
              <>
                Your week,
                <br />
                beautifully balanced.
              </>
            )}
          </h3>
          <i />
          <p>
            MONDAY
            <br />A little movement.
            <br />
            <br />
            WEDNESDAY
            <br />A little balance.
          </p>
          <small>A LITTLE TIME, JUST FOR YOU.</small>
        </div>
      )}
      {profile.type === "image" && !url && <FileImage size={30} />}
    </div>
  );
}
