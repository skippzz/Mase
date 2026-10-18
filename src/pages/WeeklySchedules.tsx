import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  FileSpreadsheet,
  Palette,
  X,
} from "lucide-react";
import { FileDrop, Field, Modal, Notice } from "../components/ui";
import { parseWorkbook } from "../lib/spreadsheet";
import {
  extractUaSchedules,
  uaWorksheetChoices,
  type ScheduleImport,
  type WorksheetSelection,
} from "../lib/uaSchedule";
import type { WorkbookData } from "../types";
import {
  loadUaFonts,
  renderUaSchedule,
  storeUaFonts,
  type FontRole,
  type ScheduleImage,
  type UaFonts,
  type UaFontStatus,
} from "../lib/uaRenderer";
import { download } from "../lib/documents";
import { bundledGotham } from "../generated/uaFonts";

const roles: [FontRole, string][] = [
  ["regular", "Gotham Book / Regular"],
  ["bold", "Gotham Bold"],
  ["black", "Gotham Black"],
  ["italic", "Gotham Bold Italic"],
];
export function WeeklySchedules({
  resourceRevision = 0,
}: {
  resourceRevision?: number;
}) {
  const uploadVersion = useRef(0);
  const [workbook, setWorkbook] = useState<WorkbookData>();
  const [worksheets, setWorksheets] = useState<WorksheetSelection>({});
  const [uploading, setUploading] = useState(false);
  const [imported, setImported] = useState<ScheduleImport>(),
    [filename, setFilename] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState("");
  const [images, setImages] = useState<(ScheduleImage & { url: string })[]>([]),
    [coverImage, setCoverImage] = useState<Blob>(),
    [zip, setZip] = useState<Blob>(),
    [selected, setSelected] = useState("MASLAK");
  const [fonts, setFonts] = useState<UaFontStatus>(),
    [fontRevision, setFontRevision] = useState(0),
    [styleOpen, setStyleOpen] = useState(false),
    [fontFiles, setFontFiles] = useState<UaFonts>({}),
    [fontNames, setFontNames] = useState<Partial<Record<FontRole, string>>>({}),
    [fontSaving, setFontSaving] = useState(false);
  useEffect(() => {
    loadUaFonts()
      .then(setFonts)
      .catch((e) => setError(`Brand fonts could not be loaded: ${e.message}`));
  }, [resourceRevision]);
  useEffect(() => {
    let live = true;
    const urls: string[] = [];
    setImages([]);
    setCoverImage(undefined);
    setZip(undefined);
    if (!imported || !fonts) {
      setBusy(false);
      return;
    }
    setBusy(true);
    setError("");
    (async () => {
      const output: (ScheduleImage & { url: string })[] = [];
      for (const schedule of imported.locations) {
        if (!live) return;
        setProgress(`Preparing ${schedule.location}…`);
        const image = await renderUaSchedule(schedule);
        if (!live) return;
        const url = URL.createObjectURL(image.blob);
        urls.push(url);
        output.push({ ...image, url });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const { default: JSZip } = await import("jszip");
      const archive = new JSZip();
      for (const image of output)
        archive.file(image.filename, await image.blob.arrayBuffer());
      const cover = await fetch(`${import.meta.env.BASE_URL}ua/cover.png`);
      if (!cover.ok) throw new Error("The cover artwork could not be loaded.");
      const coverBlob = await cover.blob();
      archive.file("01-Cover.png", await coverBlob.arrayBuffer());
      const pack = await archive.generateAsync({
        type: "blob",
        compression: "STORE",
      });
      if (live) {
        setImages(output);
        setCoverImage(coverBlob);
        setZip(pack);
        setSelected(output[0].location);
        setProgress("");
      }
    })()
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imported, fonts, fontRevision]);
  async function upload(file: File) {
    const version = ++uploadVersion.current;
    setUploading(true);
    setError("");
    setImported(undefined);
    setWorkbook(undefined);
    setWorksheets({});
    setProgress("Reading your Excel…");
    try {
      const workbook = await parseWorkbook(file);
      if (version !== uploadVersion.current) return;
      const choices = uaWorksheetChoices(workbook);
      const selection = Object.fromEntries(
        choices.filter((choice) => choice.preferred).map(
          (choice) => [choice.location, choice.preferred!],
        ),
      ) as WorksheetSelection;
      setFilename(file.name);
      setWorkbook(workbook);
      setWorksheets(selection);
      importWorksheets(workbook, selection);
    } catch (e) {
      if (version !== uploadVersion.current) return;
      setError((e as Error).message);
      setFilename("");
    } finally {
      if (version === uploadVersion.current) {
        setUploading(false);
        setProgress("");
      }
    }
  }
  function importWorksheets(source: WorkbookData, selection: WorksheetSelection) {
    setImported(undefined);
    setError("");
    if (uaWorksheetChoices(source).some(
      (choice) => choice.sheets.length && !selection[choice.location],
    )) return;
    try {
      setImported(extractUaSchedules(source, selection));
    } catch (error) {
      setError((error as Error).message);
    }
  }
  const worksheetChoices = workbook ? uaWorksheetChoices(workbook) : [];
  const shown = images.find((i) => i.location === selected);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">URBAN ACTIVE / WEEKLY SCHEDULES</span>
          <h1>
            Excel in. Schedules out<span>.</span>
          </h1>
          <p>
            Upload the weekly workbook. Your branded images are prepared
            automatically.
          </p>
        </div>
      </div>
      <div className="ua-workspace">
        <div className="ua-controls">
          <section className="control-card">
            <span className="step-label">
              <i>01</i>Upload your weekly Excel
            </span>
            <FileDrop
              accept=".xlsx"
              label="Drop the UA weekly workbook here"
              detail="MASLAK · GÖKTÜRK · UA+ FILM / LIVE. Everything is processed on this device."
              disabled={busy || uploading}
              onFile={upload}
            />
            {filename && (
              <div className="uploaded-file">
                <FileSpreadsheet size={20} />
                <span>
                  <strong>{filename}</strong>
                  <small>Temporary · Not stored or uploaded</small>
                </span>
                <button
                  className="icon-button"
                  aria-label="Clear weekly workbook"
                  onClick={() => {
                    uploadVersion.current++;
                    setUploading(false);
                    setBusy(false);
                    setProgress("");
                    setImported(undefined);
                    setWorkbook(undefined);
                    setWorksheets({});
                    setFilename("");
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {worksheetChoices.some((choice) => choice.sheets.length > 1) && (
              <div className="ua-worksheet-choices">
                <p className="muted">
                  A weekly copy is used ahead of its undated base sheet. You can
                  change the worksheet below.
                </p>
                {worksheetChoices.filter((choice) => choice.sheets.length > 1).map(
                  (choice) => (
                    <Field key={choice.location} label={`${choice.location} worksheet`}>
                      <select
                        value={worksheets[choice.location] ?? ""}
                        disabled={busy || uploading}
                        onChange={(event) => {
                          const selection = { ...worksheets, [choice.location]: event.target.value };
                          setWorksheets(selection);
                          importWorksheets(workbook!, selection);
                        }}
                      >
                        <option value="" disabled>Choose this week's worksheet</option>
                        {choice.sheets.map((sheet) => (
                          <option key={sheet.name} value={sheet.name}>{sheet.name}</option>
                        ))}
                      </select>
                    </Field>
                  ),
                )}
              </div>
            )}
            <p className="muted">
              No field mapping. No copying names or times. The same Excel
              structure works again next week.
            </p>
          </section>
          <section className="control-card">
            <span className="step-label">
              <i>02</i>Your weekly image set
            </span>
            <div className="ua-location-list">
              {(["MASLAK", "GÖKTÜRK", "LIVE"] as const).map((location) => {
                const data = imported?.locations.find(
                  (s) => s.location === location,
                );
                return (
                  <div key={location}>
                    <span
                      className={`ua-location-dot ${data ? "ready" : ""}`}
                    />
                    <strong>{location}</strong>
                    <span>
                      {data
                        ? `${data.count} classes · ${data.days.length} days`
                        : "Waiting for workbook"}
                    </span>
                    {data && <Check size={14} />}
                  </div>
                );
              })}
            </div>
            <p className="muted">
              Class times, trainers, themes, and LIVE durations come from Excel.
              Empty slots are omitted. Cycle and studio sections keep their
              source order.
            </p>
            {imported?.warnings.map((w) => (
              <Notice key={w} error>
                {w}
              </Notice>
            ))}
          </section>
          <section className="control-card">
            <span className="step-label">
              <i>03</i>Download & share
            </span>
            <div
              className="ua-image-downloads"
              role="group"
              aria-label="Download individual story images"
            >
              {(["Cover", "MASLAK", "GÖKTÜRK", "LIVE"] as const).map(
                (label) => {
                  const image = images.find(
                    (image) => image.location === label,
                  );
                  const blob = label === "Cover" ? coverImage : image?.blob;
                  const imageFilename =
                    label === "Cover" ? "01-Cover.png" : image?.filename;
                  return (
                    <button
                      key={label}
                      className="button primary"
                      aria-label={`Download ${label === "Cover" ? "cover" : label} PNG`}
                      disabled={!blob || busy || uploading}
                      onClick={() =>
                        blob && imageFilename && download(blob, imageFilename)
                      }
                    >
                      <ArrowDownToLine size={15} />
                      {label}
                    </button>
                  );
                },
              )}
            </div>
            {(busy || uploading) && (
              <p className="muted" role="status">
                {progress || "Preparing your images…"}
              </p>
            )}
            <button
              className="button secondary download-button ua-zip-download"
              disabled={!zip || busy || uploading}
              onClick={() => zip && download(zip, "UA-Weekly-Schedules.zip")}
            >
              <ArrowDownToLine size={17} />
              Download all as ZIP
            </button>
            <p className="muted">
              Full-resolution 1080 × 1920 PNGs for Instagram Stories.
            </p>
            {fonts && (
              <div
                className={`ua-font-status ${fonts.complete ? "complete" : ""}`}
              >
                {fonts.complete ? (
                  <>
                    <Check size={13} />
                    UA artwork & Gotham included
                  </>
                ) : (
                  <>
                    <Palette size={13} />
                    Preview typography · Gotham setup needed
                    <button
                      className="text-button"
                      onClick={() => setStyleOpen(true)}
                    >
                      Set fonts
                    </button>
                  </>
                )}
              </div>
            )}
          </section>
          <details className="control-card ua-resources">
            <summary>Included UA resources</summary>
            <p className="muted">
              The story template, artwork, and fonts are ready. Each week only
              needs your Excel.
            </p>
            <div className="ua-resource-links">
              <a
                href={`${import.meta.env.BASE_URL}ua/background.png`}
                download="UA-Story-Background.png"
              >
                Blank story background <ArrowDownToLine size={13} />
              </a>
              <a
                href={`${import.meta.env.BASE_URL}ua/cover.png`}
                download="UA-Story-Cover.png"
              >
                Story cover <ArrowDownToLine size={13} />
              </a>
              {roles.map(
                ([role, label]) =>
                  bundledGotham[role] && (
                    <a
                      key={role}
                      href={`${import.meta.env.BASE_URL}${bundledGotham[role]}`}
                      download
                    >
                      {label} <ArrowDownToLine size={13} />
                    </a>
                  ),
              )}
            </div>
            <button className="text-button" onClick={() => setStyleOpen(true)}>
              Change brand fonts
            </button>
          </details>
          {error && <Notice error>{error}</Notice>}
        </div>
        <div className="ua-preview-panel">
          <div className="ua-preview-tabs">
            {images.length ? (
              images.map((image) => (
                <button
                  key={image.location}
                  className={selected === image.location ? "active" : ""}
                  onClick={() => setSelected(image.location)}
                >
                  {image.location}
                </button>
              ))
            ) : (
              <span>YOUR UA SCHEDULE PREVIEW</span>
            )}
          </div>
          {shown ? (
            <>
              <div className="ua-preview-stage">
                <img
                  src={shown.url}
                  alt={`${shown.location} weekly schedule preview`}
                />
              </div>
              <div className="ua-preview-bottom">
                <span>{shown.count} classes · 1080 × 1920</span>
                <button
                  className="button secondary small"
                  onClick={() => download(shown.blob, shown.filename)}
                >
                  <ArrowDownToLine size={15} />
                  Download {shown.location}
                </button>
              </div>
              <details className="data-review">
                <summary>Check the extracted sessions</summary>
                <p className="muted">
                  Worksheet: {imported?.locations.find((location) => location.location === shown.location)?.sheet}
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th>Time</th>
                        <th>Trainer</th>
                        <th>Class</th>
                        <th>Theme / duration</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.audit.map((line, i) => (
                        <tr key={i}>
                          {line.split("\t").map((part, j) => (
                            <td key={j}>{part}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          ) : (
            <div className="ua-empty-preview">
              <img
                src={`${import.meta.env.BASE_URL}ua/cover.png`}
                alt="UA weekly schedule cover"
              />
              <div>
                <strong>
                  {busy ? progress : "Ready for this week’s workbook."}
                </strong>
                <span>
                  {busy
                    ? "Building your branded image set…"
                    : "Your schedules will appear here after upload."}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="page-footnote">
        <span>
          <i className="privacy-dot" />
          Your workbook stays on this device.
        </span>
        <span>Original UA artwork. Accurate Excel data.</span>
      </div>
      {styleOpen && (
        <Modal
          title="Your UA brand style."
          subtitle="Gotham and the original artwork are included. You can replace a font here if your brand changes."
          close={() => setStyleOpen(false)}
        >
          <div className="ua-font-upload">
            {roles.map(([role, label]) => (
              <Field
                key={role}
                label={label}
                hint={
                  fonts?.roles.includes(role)
                    ? "Ready · Leave empty to keep this font."
                    : "Choose the matching .otf, .ttf, or .woff file."
                }
              >
                <input
                  type="file"
                  accept=".otf,.ttf,.woff,.woff2"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      if (file.size > 10 * 1024 * 1024)
                        throw new Error("Font files must be below 10 MB.");
                      const bytes = await file.arrayBuffer();
                      await new FontFace(`UaTest-${role}`, bytes).load();
                      setFontFiles((previous) => ({
                        ...previous,
                        [role]: bytes,
                      }));
                      setFontNames((previous) => ({
                        ...previous,
                        [role]: file.name,
                      }));
                    } catch {
                      setError(
                        `${label} could not be read. Choose a valid font file below 10 MB.`,
                      );
                    }
                  }}
                />
                {fontNames[role] && <small>{fontNames[role]}</small>}
              </Field>
            ))}
          </div>
          <p className="muted">
            Fonts are saved on this device. The workbook is never saved. Borders
            and separators are drawn at the correct scale and adjust to the
            number of classes.
          </p>
          {error && <Notice error>{error}</Notice>}
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setStyleOpen(false)}
            >
              Close
            </button>
            <button
              className="button primary"
              disabled={fontSaving || !Object.keys(fontFiles).length}
              onClick={async () => {
                setFontSaving(true);
                setError("");
                try {
                  const result = await storeUaFonts(fontFiles);
                  setFonts(result);
                  setFontRevision((r) => r + 1);
                  setFontFiles({});
                  setStyleOpen(false);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setFontSaving(false);
                }
              }}
            >
              {fontSaving ? "Saving…" : "Save brand fonts"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
