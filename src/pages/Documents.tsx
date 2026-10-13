import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  Check,
  FileSpreadsheet,
  Image as ImageIcon,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import type {
  ResolveContext,
  StudioState,
  TemplateProfile,
  WorkbookData,
} from "../types";
import { addDays, calendarValues, dateKey, periodLabel } from "../lib/calendar";
import { parseWorkbook, tableData } from "../lib/spreadsheet";
import {
  download,
  generateBatch,
  generateImage,
  generatePdf,
  importTemplate,
  renderPdf,
} from "../lib/documents";
import { resolveProfile, safeFilename } from "../lib/mapping";
import { makeField } from "../lib/profiles";
import { TemplateEditor } from "../components/TemplateEditor";
import { Field, FileDrop, Notice } from "../components/ui";

export function Documents({
  studio,
  profiles,
  save,
  start,
  setStart,
  initialClient,
  initialMode,
  initialProfile,
}: {
  studio: StudioState;
  profiles: TemplateProfile[];
  save: (p: TemplateProfile) => Promise<void>;
  start: Date;
  setStart: (d: Date) => void;
  initialClient: string;
  initialMode: "calendar" | "spreadsheet";
  initialProfile: string;
}) {
  const [mode, setMode] = useState(initialMode),
    [clientId, setClientId] = useState(initialClient),
    [selectedId, setSelectedId] = useState(
      initialProfile || profiles[0]?.id || "",
    ),
    [day, setDay] = useState("");
  const [workbook, setWorkbook] = useState<WorkbookData>(),
    [sheetName, setSheetName] = useState(""),
    [headerRow, setHeaderRow] = useState(1),
    [recordIndex, setRecordIndex] = useState(0);
  const [format, setFormat] = useState<"png" | "pdf">(
      initialMode === "calendar" ? "png" : "pdf",
    ),
    [batch, setBatch] = useState(false),
    [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(""),
    [previewError, setPreviewError] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [warnings, setWarnings] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [previewBusy, setPreviewBusy] = useState(false),
    [page, setPage] = useState(0),
    [progress, setProgress] = useState(0);
  const [preparedOutput, setPreparedOutput] = useState<Blob>();
  const [preparedBatch, setPreparedBatch] = useState<{
    blob: Blob;
    filename: string;
  }>();
  const profile = profiles.find((p) => p.id === selectedId);
  const supportsBatch = !!profile?.fields.some(
    (f) => f.source.kind === "column",
  );
  useEffect(() => {
    if (!supportsBatch) setBatch(false);
  }, [supportsBatch]);
  useEffect(() => {
    const source = profile?.fields.find((f) => "sheet" in f.source)?.source;
    if (
      source &&
      "sheet" in source &&
      workbook?.sheets.some((s) => s.name === source.sheet)
    ) {
      setSheetName(source.sheet);
      setRecordIndex(0);
    }
  }, [profile?.id, workbook]);
  const sheet = workbook?.sheets.find((s) => s.name === sheetName);
  const table = useMemo(
    () => (sheet ? tableData(sheet, headerRow) : { columns: [], records: [] }),
    [sheet, headerRow],
  );
  const context = useMemo<ResolveContext>(
    () => ({
      workbook,
      record: table.records[recordIndex],
      locale: studio.settings.locale,
      calendar:
        mode === "calendar"
          ? calendarValues(studio, start, clientId, day)
          : undefined,
    }),
    [workbook, table, recordIndex, studio, mode, start, clientId, day],
  );
  useEffect(() => {
    setDay("");
  }, [start]);
  const canGenerate =
    !!profile &&
    profile.fields.length > 0 &&
    !previewError &&
    !previewBusy &&
    !!preview &&
    !!preparedOutput &&
    !busy &&
    (mode === "calendar" || !!workbook);
  useEffect(() => {
    let live = true,
      url = "";
    setPreview("");
    setPreparedOutput(undefined);
    setPreparedBatch(undefined);
    setPreviewError("");
    setWarnings([]);
    if (
      !profile ||
      !profile.fields.length ||
      (mode === "spreadsheet" && !workbook)
    ) {
      setPreviewBusy(false);
      return;
    }
    setPreviewBusy(true);
    const timer = setTimeout(async () => {
      try {
        let blob: Blob, outputBlob: Blob, resultWarnings: string[];
        if (format === "pdf") {
          const output = await generatePdf(profile, context);
          outputBlob = new Blob([new Uint8Array(output.bytes).buffer], {
            type: "application/pdf",
          });
          const canvas = await renderPdf(output.bytes, page);
          blob = await new Promise<Blob>((resolve) =>
            canvas.toBlob((b) => resolve(b!), "image/png"),
          );
          resultWarnings = output.warnings;
        } else {
          const output = await generateImage(profile, context, page);
          blob = output.blob;
          outputBlob = output.blob;
          resultWarnings = output.warnings;
        }
        url = URL.createObjectURL(blob);
        if (live) {
          setPreview(url);
          setPreparedOutput(outputBlob);
          setWarnings(resultWarnings);
        } else URL.revokeObjectURL(url);
      } catch (e) {
        if (live) setPreviewError((e as Error).message);
      } finally {
        if (live) setPreviewBusy(false);
      }
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [profile, context, mode, workbook, page, format]);
  async function uploadWorkbook(file: File) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const book = await parseWorkbook(file);
      setWorkbook(book);
      setSheetName(book.sheets[0].name);
      setRecordIndex(0);
      setHeaderRow(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function uploadBackground(file: File) {
    setBusy(true);
    setError("");
    try {
      const p = await importTemplate(file);
      if (mode === "calendar" && !p.fields.length) {
        p.fields = [
          makeField({
            label: "Period",
            source: { kind: "calendar", key: "period" },
            y: 0.15,
            fontSize: 20,
          }),
          makeField({
            label: "Schedule",
            source: { kind: "calendar", key: "schedule" },
            y: 0.28,
            height: 0.6,
            fontSize: 14,
            overflow: "shrink",
            required: true,
          }),
        ];
      }
      await save(p);
      setSelectedId(p.id);
      setPage(0);
      setEditing(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function matchColumns() {
    if (!profile || !sheet) return;
    let matched = 0;
    const fields = profile.fields.map((f) => {
      const column = table.columns.find(
        (c) =>
          c.label.trim().toLocaleLowerCase() ===
          f.label.trim().toLocaleLowerCase(),
      );
      if (!column) return f;
      matched++;
      return {
        ...f,
        source: {
          kind: "column" as const,
          sheet: sheet.name,
          column: column.key,
        },
      };
    });
    await save({ ...profile, fields });
    setNotice(
      `${matched} matching column ${matched === 1 ? "name" : "names"} linked. Review the remaining fields in Customize.`,
    );
  }
  async function generate() {
    if (!profile || busy) return;
    if (batch && preparedBatch) {
      download(preparedBatch.blob, preparedBatch.filename);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    setProgress(0);
    try {
      if (batch && mode === "spreadsheet") {
        const output = await generateBatch(
          profile,
          table.records.map((record) => ({
            context: { ...context, record },
            row: record.row,
          })),
          format,
          (done, total) => setProgress(Math.round((done / total) * 100)),
        );
        const filename = `${profile.name.replace(/[^\p{L}\p{N}_ -]/gu, "") || "documents"}.zip`;
        setPreparedBatch({ blob: output.blob, filename });
        setNotice(
          `${output.count} of ${table.records.length} records generated.${output.errors.length ? ` ${output.errors.length} failed; the ZIP includes ERRORS.txt with row details. ${output.errors.slice(0, 3).join(" ")}` : ""}${output.warnings.length ? " Review WARNINGS.txt for shortened text." : ""}`,
        );
      } else {
        const name =
          mode === "calendar"
            ? `Schedule-${clientId ? studio.clients.find((c) => c.id === clientId)?.name || "client" : "studio"}-${day || dateKey(start)}`.replace(
                /[<>:"/\\|?*]/g,
                "-",
              )
            : safeFilename(
                profile.filename,
                resolveProfile(profile, context),
                context.record?.row || 1,
              );
        if (!preparedOutput)
          throw new Error("Wait for the preview to finish before downloading.");
        // Use the very file that produced the preview. Download starts within
        // the click gesture, which Safari/iOS require for dependable downloads.
        download(
          preparedOutput,
          `${name}${format === "png" && profile.pages.length > 1 ? `-page-${page + 1}` : ""}.${format}`,
        );
        setNotice(
          format === "png"
            ? "Your image is ready. Attach the downloaded PNG in your WhatsApp group."
            : "Your document is ready in your downloads.",
        );
      }
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
          <span className="eyebrow">
            THOUGHTFULLY PREPARED. BEAUTIFULLY SHARED.
          </span>
          <h1>
            The finishing touch<span>.</span>
          </h1>
          <p>Turn your plans into something lovely to send.</p>
        </div>
        <span className="private-badge">
          <i className="privacy-dot" />
          Created on your device
        </span>
      </div>
      <div className="document-workspace">
        <div className="document-controls">
          <div className="control-card">
            <span className="step-label">
              <i>01</i>Choose your source
            </span>
            <div className="source-tabs">
              <button
                className={mode === "calendar" ? "active" : ""}
                onClick={() => {
                  setMode("calendar");
                  setFormat("png");
                  setBatch(false);
                }}
              >
                <CalendarDays size={18} />
                Calendar
              </button>
              <button
                className={mode === "spreadsheet" ? "active" : ""}
                onClick={() => {
                  setMode("spreadsheet");
                  setFormat("pdf");
                  if (selectedId === "weekly-schedule")
                    setSelectedId("session-brief");
                }}
              >
                <FileSpreadsheet size={18} />
                Excel
              </button>
            </div>
            {mode === "calendar" ? (
              <>
                <Field label="Week">
                  <div className="week-select">
                    <button
                      className="icon-button"
                      aria-label="Previous schedule week"
                      onClick={() => setStart(addDays(start, -7))}
                    >
                      ‹
                    </button>
                    <span>{periodLabel(start, studio.settings.locale)}</span>
                    <button
                      className="icon-button"
                      aria-label="Next schedule week"
                      onClick={() => setStart(addDays(start, 7))}
                    >
                      ›
                    </button>
                  </div>
                </Field>
                <Field label="Share a day or the whole week">
                  <select value={day} onChange={(e) => setDay(e.target.value)}>
                    <option value="">Entire week</option>
                    {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map(
                      (d) => (
                        <option key={dateKey(d)} value={dateKey(d)}>
                          {d.toLocaleDateString(studio.settings.locale, {
                            weekday: "long",
                            day: "numeric",
                            month: "short",
                          })}
                        </option>
                      ),
                    )}
                  </select>
                </Field>
                <Field label="Who is it for?">
                  <select
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                  >
                    <option value="">Full studio schedule</option>
                    {studio.clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="muted">
                  Share a studio schedule with your trainers, or a personal plan
                  with one client. Private notes are always excluded.
                </p>
              </>
            ) : (
              <>
                {workbook ? (
                  <div className="uploaded-file">
                    <FileSpreadsheet size={21} />
                    <span>
                      <strong>{workbook.name}</strong>
                      <small>
                        {workbook.sheets.length} worksheets · Kept in memory
                      </small>
                    </span>
                    <button
                      className="icon-button"
                      aria-label="Clear spreadsheet"
                      onClick={() => {
                        setWorkbook(undefined);
                        setRecordIndex(0);
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <FileDrop
                    accept=".xlsx"
                    label="Drop your spreadsheet here"
                    detail="Excel or Google Sheets export · .xlsx · Up to 20 MB"
                    onFile={uploadWorkbook}
                    disabled={busy}
                  />
                )}
                {workbook && (
                  <>
                    <div className="form-grid">
                      <Field label="Worksheet">
                        <select
                          value={sheetName}
                          onChange={(e) => {
                            setSheetName(e.target.value);
                            setRecordIndex(0);
                          }}
                        >
                          {workbook.sheets.map((s) => (
                            <option key={s.name}>{s.name}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Header row">
                        <input
                          type="number"
                          min={1}
                          max={Math.max(1, sheet?.rowCount || 1)}
                          value={headerRow}
                          onChange={(e) => {
                            setHeaderRow(Math.max(1, Number(e.target.value)));
                            setRecordIndex(0);
                          }}
                        />
                      </Field>
                    </div>
                    <p className="records-found">
                      <Check size={14} />
                      {table.records.length} records detected
                    </p>
                    <Field label="Preview record">
                      <select
                        value={recordIndex}
                        onChange={(e) => setRecordIndex(Number(e.target.value))}
                      >
                        {table.records.map((r, i) => (
                          <option key={r.row} value={i}>
                            Row {r.row} ·{" "}
                            {Object.values(r.cells)
                              .find((c) => c.text)
                              ?.text.slice(0, 45)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        matchColumns().catch((e) => setError(e.message));
                      }}
                    >
                      Match column names
                      <ArrowRight size={14} />
                    </button>
                    {workbook.warnings.length > 0 && (
                      <Notice error>
                        {workbook.warnings.length} spreadsheet warnings.{" "}
                        {workbook.warnings.slice(0, 2).join(" ")}
                      </Notice>
                    )}
                  </>
                )}
              </>
            )}
          </div>
          <div className="control-card">
            <span className="step-label">
              <i>02</i>Make it look like you
            </span>
            <Field label="Saved template">
              <select
                value={selectedId}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">Choose a template</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="template-buttons">
              <button
                className="button secondary small"
                disabled={!profile || busy}
                onClick={() => setEditing(true)}
              >
                <Pencil size={14} />
                Customize
              </button>
            </div>
            <FileDrop
              accept=".png,.jpg,.jpeg,.pdf"
              label="Use your own background"
              detail="Drop a branded image or PDF, then position your schedule on it."
              onFile={uploadBackground}
              disabled={busy}
            />
          </div>
          <div className="control-card">
            <span className="step-label">
              <i>03</i>Ready to share
            </span>
            <div className="source-tabs">
              <button
                className={format === "png" ? "active" : ""}
                onClick={() => setFormat("png")}
              >
                <ImageIcon size={18} />
                PNG image
              </button>
              <button
                className={format === "pdf" ? "active" : ""}
                onClick={() => setFormat("pdf")}
              >
                PDF document
              </button>
            </div>
            {mode === "spreadsheet" && supportsBatch && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={batch}
                  onChange={(e) => setBatch(e.target.checked)}
                />
                All {table.records.length} records as a ZIP
              </label>
            )}
            {batch && profile && (
              <Field
                label="File naming"
                hint="Use {Field name} or {row}. Duplicates receive a number."
              >
                <input
                  value={profile.filename}
                  onChange={(e) => {
                    save({ ...profile, filename: e.target.value }).catch((e) =>
                      setError(e.message),
                    );
                  }}
                />
              </Field>
            )}
            <button
              className="button primary download-button"
              disabled={!canGenerate || (batch && !table.records.length)}
              onClick={generate}
            >
              <ArrowDownToLine size={17} />
              {busy
                ? batch
                  ? `Preparing ${progress}%…`
                  : "Preparing…"
                : batch
                  ? preparedBatch
                    ? "Download ZIP"
                    : "Prepare documents"
                  : format === "png"
                    ? "Download schedule image"
                    : "Download PDF"}
            </button>
            {busy && batch && <progress max={100} value={progress} />}
            {format === "png" && profile && profile.pages.length > 1 && (
              <p className="muted">
                Single-image download exports the previewed page. Batch ZIP
                includes every page.
              </p>
            )}
            <p className="muted">
              {format === "png"
                ? "High-quality image, ready for WhatsApp."
                : "A polished document, ready for your client."}
            </p>
          </div>
          {error && <Notice error>{error}</Notice>}
          {notice && <Notice>{notice}</Notice>}
        </div>
        <div className="document-preview-panel">
          <div className="preview-toolbar">
            <span>
              <i className="privacy-dot" />
              LIVE PREVIEW
            </span>
            {profile && profile.pages.length > 1 && (
              <select
                aria-label="Preview page"
                value={page}
                onChange={(e) => setPage(Number(e.target.value))}
              >
                {profile.pages.map((_, i) => (
                  <option key={i} value={i}>
                    Page {i + 1}
                  </option>
                ))}
              </select>
            )}
            <span>
              {profile
                ? `${Math.round(profile.pages[page]?.width || 0)} × ${Math.round(profile.pages[page]?.height || 0)}`
                : ""}
            </span>
          </div>
          <div className="preview-stage">
            {preview ? (
              <img
                src={preview}
                alt="Generated document preview"
                className="document-preview"
              />
            ) : (
              <div className="preview-placeholder">
                <span className="serif-mark">m.</span>
                <h2>
                  {previewBusy
                    ? "Preparing your preview…"
                    : previewError
                      ? "A little adjustment needed."
                      : "Your plans, beautifully presented."}
                </h2>
                <p>
                  {previewError ||
                    (mode === "spreadsheet" && !workbook
                      ? "Upload your workbook, choose a template, and connect your columns."
                      : !profile?.fields.length
                        ? "Add text fields in Customize to bring this template to life."
                        : "Plan a session in your calendar, then come back to share it.")}
                </p>
                {profile && !previewBusy && (
                  <button
                    className="button secondary"
                    onClick={() => setEditing(true)}
                  >
                    <Plus size={16} />
                    {profile.fields.length
                      ? "Customize template"
                      : "Add text fields"}
                  </button>
                )}
              </div>
            )}
          </div>
          {warnings.length > 0 && <Notice error>{warnings.join(" ")}</Notice>}
          <div className="preview-caption">
            <span>Exactly as it will appear in your download.</span>
            <span>
              {studio.settings.locale === "tr-TR"
                ? "Turkish formatting"
                : "English formatting"}
            </span>
          </div>
          {sheet && table.records.length > 0 && (
            <details className="data-review">
              <summary>
                Review spreadsheet data · {table.records.length} rows
              </summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>
                      {table.columns.map((c) => (
                        <th key={c.key}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.records.slice(0, 8).map((r) => (
                      <tr key={r.row}>
                        <td>{r.row}</td>
                        {table.columns.map((c) => (
                          <td key={c.key}>
                            {r.cells[c.key].error
                              ? "Unresolved formula"
                              : r.cells[c.key].text}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <small>
                Showing the first 8 records. Original row numbers are preserved.
              </small>
            </details>
          )}
        </div>
      </div>
      {editing && profile && (
        <TemplateEditor
          profile={profile}
          workbook={workbook}
          context={context}
          save={save}
          close={() => setEditing(false)}
          calendarMode={mode === "calendar"}
        />
      )}
    </>
  );
}
