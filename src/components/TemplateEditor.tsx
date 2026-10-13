import { useEffect, useRef, useState } from "react";
import { Copy, Plus, Save, Trash2 } from "lucide-react";
import type {
  FieldSource,
  ResolveContext,
  TemplateField,
  TemplateProfile,
  WorkbookData,
} from "../types";
import { backgroundCanvas, canvasFonts } from "../lib/documents";
import { makeField } from "../lib/profiles";
import { resolveField } from "../lib/mapping";
import { tableData } from "../lib/spreadsheet";
import { Field, Modal, Notice } from "./ui";
import { validateProfile } from "../lib/storage";
import { ScheduleBlockSource } from "./ScheduleBlockSource";

export function TemplateEditor({
  profile,
  workbook,
  context,
  save,
  close,
  calendarMode,
}: {
  profile: TemplateProfile;
  workbook?: WorkbookData;
  context: ResolveContext;
  save: (p: TemplateProfile) => Promise<void>;
  close: () => void;
  calendarMode: boolean;
}) {
  const [draft, setDraft] = useState<TemplateProfile>(() => ({
    ...profile,
    fields: profile.fields.map((f) => ({ ...f, source: { ...f.source } })),
  }));
  const [page, setPage] = useState(0),
    [selected, setSelected] = useState(profile.fields[0]?.id || ""),
    [background, setBackground] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null),
    drag = useRef<{
      id: string;
      clientX: number;
      clientY: number;
      x: number;
      y: number;
    } | null>(null);
  const field = draft.fields.find((f) => f.id === selected);
  useEffect(() => {
    let live = true,
      url = "";
    (async () => {
      await canvasFonts();
      const canvas = await backgroundCanvas(profile, page);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/png"),
      );
      url = URL.createObjectURL(blob);
      if (live) setBackground(url);
      else URL.revokeObjectURL(url);
    })().catch((e) => {
      if (live) setError(e.message);
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [profile, page]);
  const update = (patch: Partial<TemplateField>) =>
    setDraft((d) => ({
      ...d,
      fields: d.fields.map((f) => (f.id === selected ? { ...f, ...patch } : f)),
    }));
  const sourceChange = (source: FieldSource) => update({ source });
  const sheet =
    field && (field.source.kind === "column" || field.source.kind === "cell")
      ? workbook?.sheets.find(
          (s) => s.name === (field.source as { sheet: string }).sheet,
        )
      : undefined;
  function add() {
    const f = makeField({
      page,
      source: calendarMode
        ? { kind: "calendar", key: "schedule" }
        : workbook
          ? { kind: "column", sheet: workbook.sheets[0].name, column: "A" }
          : { kind: "text", text: "Your text" },
      label: calendarMode ? "Schedule" : `Field ${draft.fields.length + 1}`,
      height: calendarMode ? 0.45 : 0.08,
    });
    setDraft((d) => ({ ...d, fields: [...d.fields, f] }));
    setSelected(f.id);
  }
  return (
    <Modal
      title="Make it your own."
      subtitle="Drag text into place. Set its source and style. Save once, reuse any time."
      wide
      close={close}
    >
      <div className="editor-toolbar">
        <Field label="Template name">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            maxLength={120}
          />
        </Field>
        <Field label="Page">
          <select
            value={page}
            onChange={(e) => {
              setPage(Number(e.target.value));
              setSelected(
                draft.fields.find((f) => f.page === Number(e.target.value))
                  ?.id || "",
              );
            }}
          >
            {draft.pages.map((_, i) => (
              <option key={i} value={i}>
                Page {i + 1}
              </option>
            ))}
          </select>
        </Field>
        <button className="button secondary" onClick={add}>
          <Plus size={16} />
          Add text
        </button>
      </div>
      <div className="editor-layout">
        <div className="editor-paper-wrap">
          <div
            className="editor-paper"
            ref={canvasRef}
            style={{
              aspectRatio: `${draft.pages[page].width}/${draft.pages[page].height}`,
            }}
          >
            {background && (
              <img
                src={background}
                alt="Template background"
                draggable={false}
              />
            )}
            {draft.fields
              .filter((f) => f.page === page)
              .map((f) => {
                let text = f.label;
                try {
                  text = resolveField(f, context) || f.label;
                } catch {
                  /* Keep the field visible before mapping is complete. */
                }
                return (
                  <button
                    key={f.id}
                    className={`placed-field ${selected === f.id ? "selected" : ""}`}
                    aria-label={`Position ${f.label}`}
                    style={{
                      left: `${f.x * 100}%`,
                      top: `${f.y * 100}%`,
                      width: `${f.width * 100}%`,
                      height: `${f.height * 100}%`,
                      color: f.color,
                      backgroundColor: f.background,
                      textAlign: f.align,
                      fontFamily:
                        f.fontFamily === "Serif"
                          ? "CormorantPdf, serif"
                          : "Lato, sans-serif",
                      fontSize: `calc(var(--paper-width) * ${f.fontSize / 595})`,
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      setSelected(f.id);
                      e.currentTarget.setPointerCapture(e.pointerId);
                      drag.current = {
                        id: f.id,
                        clientX: e.clientX,
                        clientY: e.clientY,
                        x: f.x,
                        y: f.y,
                      };
                    }}
                    onPointerMove={(e) => {
                      const d = drag.current;
                      if (!d || d.id !== f.id || !canvasRef.current) return;
                      const bounds = canvasRef.current.getBoundingClientRect();
                      setDraft((p) => ({
                        ...p,
                        fields: p.fields.map((v) =>
                          v.id === f.id
                            ? {
                                ...v,
                                x: Math.max(
                                  0,
                                  Math.min(
                                    1 - v.width,
                                    d.x +
                                      (e.clientX - d.clientX) / bounds.width,
                                  ),
                                ),
                                y: Math.max(
                                  0,
                                  Math.min(
                                    1 - v.height,
                                    d.y +
                                      (e.clientY - d.clientY) / bounds.height,
                                  ),
                                ),
                              }
                            : v,
                        ),
                      }));
                    }}
                    onPointerUp={() => {
                      drag.current = null;
                    }}
                    onPointerCancel={() => {
                      drag.current = null;
                    }}
                    onKeyDown={(e) => {
                      const step = e.shiftKey ? 0.02 : 0.002;
                      if (
                        [
                          "ArrowLeft",
                          "ArrowRight",
                          "ArrowUp",
                          "ArrowDown",
                        ].includes(e.key)
                      ) {
                        e.preventDefault();
                        setSelected(f.id);
                        setDraft((d) => ({
                          ...d,
                          fields: d.fields.map((v) =>
                            v.id !== f.id
                              ? v
                              : {
                                  ...v,
                                  x: Math.max(
                                    0,
                                    Math.min(
                                      1 - v.width,
                                      v.x +
                                        (e.key === "ArrowRight"
                                          ? step
                                          : e.key === "ArrowLeft"
                                            ? -step
                                            : 0),
                                    ),
                                  ),
                                  y: Math.max(
                                    0,
                                    Math.min(
                                      1 - v.height,
                                      v.y +
                                        (e.key === "ArrowDown"
                                          ? step
                                          : e.key === "ArrowUp"
                                            ? -step
                                            : 0),
                                    ),
                                  ),
                                },
                          ),
                        }));
                      }
                    }}
                  >
                    <span>{text}</span>
                    <i>{f.label}</i>
                  </button>
                );
              })}
          </div>
          <p className="muted">
            Drag to position · Arrow keys to fine-tune · Exact preview is shown
            after saving.
          </p>
        </div>
        <aside className="field-properties">
          <Field label="Selected text">
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setPage(
                  draft.fields.find((f) => f.id === e.target.value)?.page || 0,
                );
              }}
            >
              <option value="">Choose a text field</option>
              {draft.fields.map((f) => (
                <option value={f.id} key={f.id}>
                  {f.label} · Page {f.page + 1}
                </option>
              ))}
            </select>
          </Field>
          {field ? (
            <>
              <Field label="Field name">
                <input
                  value={field.label}
                  onChange={(e) => update({ label: e.target.value })}
                  maxLength={100}
                />
              </Field>
              <Field label="Text from">
                <select
                  value={field.source.kind}
                  onChange={(e) => {
                    const kind = e.target.value;
                    sourceChange(
                      kind === "calendar"
                        ? { kind, key: "schedule" }
                        : kind === "scheduleBlock"
                          ? {
                              kind,
                              sheet: workbook?.sheets[0]?.name || "",
                              firstRow: 5,
                              lastRow: 20,
                              timeColumn: "A",
                              titleColumn: "C",
                              trainerColumn: "B",
                              extraColumn: "D",
                              extraFormat: "text",
                              skipRows: [],
                            }
                          : kind === "column"
                            ? {
                                kind,
                                sheet: workbook?.sheets[0]?.name || "",
                                column: "A",
                              }
                            : kind === "cell"
                              ? {
                                  kind,
                                  sheet: workbook?.sheets[0]?.name || "",
                                  address: "A1",
                                }
                              : { kind: "text", text: "" },
                    );
                  }}
                >
                  <option value="calendar">Calendar</option>
                  <option value="column">Spreadsheet column</option>
                  <option value="cell">Spreadsheet cell</option>
                  <option value="scheduleBlock">
                    Spreadsheet schedule block
                  </option>
                  <option value="text">Fixed text</option>
                </select>
              </Field>
              {field.source.kind === "calendar" && (
                <Field label="Calendar detail">
                  <select
                    value={field.source.key}
                    onChange={(e) =>
                      sourceChange({
                        kind: "calendar",
                        key: e.target.value as "schedule",
                      })
                    }
                  >
                    <option value="schedule">Session schedule</option>
                    <option value="period">Week dates</option>
                    <option value="client">Client name / subtitle</option>
                    <option value="studio">Studio name</option>
                    <option value="title">Heading</option>
                  </select>
                </Field>
              )}
              {field.source.kind === "scheduleBlock" && (
                <ScheduleBlockSource
                  source={field.source}
                  workbook={workbook}
                  change={sourceChange}
                />
              )}
              {field.source.kind === "text" && (
                <Field label="Text">
                  <textarea
                    rows={3}
                    value={field.source.text}
                    onChange={(e) =>
                      sourceChange({ kind: "text", text: e.target.value })
                    }
                    maxLength={15000}
                  />
                </Field>
              )}
              {(field.source.kind === "column" ||
                field.source.kind === "cell") && (
                <>
                  <Field label="Worksheet">
                    {workbook ? (
                      <select
                        value={field.source.sheet}
                        onChange={(e) =>
                          sourceChange({
                            ...(field.source as Extract<
                              FieldSource,
                              { kind: "column" | "cell" }
                            >),
                            sheet: e.target.value,
                          })
                        }
                      >
                        <option value="">Choose worksheet</option>
                        {workbook.sheets.map((s) => (
                          <option key={s.name}>{s.name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={field.source.sheet}
                        placeholder="Exact worksheet name"
                        onChange={(e) =>
                          sourceChange({
                            ...(field.source as Extract<
                              FieldSource,
                              { kind: "column" | "cell" }
                            >),
                            sheet: e.target.value,
                          })
                        }
                      />
                    )}
                  </Field>
                  {field.source.kind === "column" ? (
                    <Field label="Column">
                      {sheet ? (
                        <select
                          value={field.source.column}
                          onChange={(e) =>
                            sourceChange({
                              kind: "column",
                              sheet: sheet.name,
                              column: e.target.value,
                            })
                          }
                        >
                          {tableData(sheet, 1).columns.map((c) => (
                            <option key={c.key} value={c.key}>
                              {c.key} · {c.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={field.source.column}
                          onChange={(e) =>
                            sourceChange({
                              ...(field.source as Extract<
                                FieldSource,
                                { kind: "column" }
                              >),
                              column: e.target.value.toUpperCase(),
                            })
                          }
                          placeholder="A"
                        />
                      )}
                    </Field>
                  ) : (
                    <Field label="Cell address">
                      <input
                        value={field.source.address}
                        onChange={(e) =>
                          sourceChange({
                            ...(field.source as Extract<
                              FieldSource,
                              { kind: "cell" }
                            >),
                            address: e.target.value.toUpperCase(),
                          })
                        }
                        placeholder="B4"
                      />
                    </Field>
                  )}
                </>
              )}
              <Field
                label="Text panel background"
                hint="Use a solid panel to cover old text on a populated image. The original file stays intact."
              >
                <select
                  value={field.background ? "solid" : "transparent"}
                  onChange={(e) =>
                    update({
                      background:
                        e.target.value === "solid" ? "#000000" : undefined,
                    })
                  }
                >
                  <option value="transparent">Transparent</option>
                  <option value="solid">Solid color</option>
                </select>
              </Field>
              {field.background && (
                <Field label="Panel color">
                  <input
                    type="color"
                    value={field.background}
                    onChange={(e) => update({ background: e.target.value })}
                  />
                </Field>
              )}
              <div className="form-grid compact">
                <Field label="Font">
                  <select
                    value={field.fontFamily}
                    onChange={(e) =>
                      update({ fontFamily: e.target.value as "Lato" | "Serif" })
                    }
                  >
                    <option value="Lato">Clean sans</option>
                    <option value="Serif">Editorial serif</option>
                  </select>
                </Field>
                <Field label="Size">
                  <input
                    type="number"
                    min={4}
                    max={120}
                    value={field.fontSize}
                    onChange={(e) =>
                      update({ fontSize: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Alignment">
                  <select
                    value={field.align}
                    onChange={(e) =>
                      update({ align: e.target.value as "left" })
                    }
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </Field>
                <Field label="Text color">
                  <input
                    type="color"
                    value={field.color}
                    onChange={(e) => update({ color: e.target.value })}
                  />
                </Field>
              </div>
              <div className="form-grid compact">
                {(["x", "y", "width", "height"] as const).map((key) => (
                  <Field
                    key={key}
                    label={`${key === "x" ? "Left" : key === "y" ? "Top" : key[0].toUpperCase() + key.slice(1)} %`}
                  >
                    <input
                      type="number"
                      min={key === "width" || key === "height" ? 1 : 0}
                      max={100}
                      step={0.1}
                      value={Number((field[key] * 100).toFixed(1))}
                      onChange={(e) =>
                        update({ [key]: Number(e.target.value) / 100 })
                      }
                    />
                  </Field>
                ))}
              </div>
              <Field label="Formatting">
                <select
                  value={field.format}
                  onChange={(e) => update({ format: e.target.value as "text" })}
                >
                  <option value="text">As text</option>
                  <option value="date">Date</option>
                  <option value="time">Time</option>
                  <option value="number">Number</option>
                  <option value="currency">Turkish lira</option>
                </select>
              </Field>
              <Field label="When text is long">
                <select
                  value={field.overflow}
                  onChange={(e) =>
                    update({ overflow: e.target.value as "wrap" })
                  }
                >
                  <option value="wrap">Wrap to new lines</option>
                  <option value="shrink">Shrink to fit</option>
                  <option value="truncate">Shorten with a warning</option>
                </select>
              </Field>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => update({ required: e.target.checked })}
                />
                A value is required
              </label>
              <div className="field-actions">
                <button
                  className="button secondary small"
                  onClick={() => {
                    const f = {
                      ...field,
                      id: crypto.randomUUID(),
                      label: `${field.label} copy`,
                      y: Math.min(1 - field.height, field.y + 0.025),
                    };
                    setDraft((d) => ({ ...d, fields: [...d.fields, f] }));
                    setSelected(f.id);
                  }}
                >
                  <Copy size={14} />
                  Duplicate
                </button>
                <button
                  className="icon-button danger"
                  aria-label="Delete text field"
                  onClick={() => {
                    setDraft((d) => ({
                      ...d,
                      fields: d.fields.filter((f) => f.id !== selected),
                    }));
                    setSelected("");
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </>
          ) : (
            <p className="muted">
              Add a text field or select one on the page to style it.
            </p>
          )}
        </aside>
      </div>
      {error && <Notice error>{error}</Notice>}
      <div className="modal-actions">
        <button className="button secondary" onClick={close}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              validateProfile(draft);
              if (
                new Set(draft.fields.map((f) => f.label)).size !==
                draft.fields.length
              )
                throw new Error("Give each field a different name.");
              await save(draft);
              close();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Save size={16} />
          {busy ? "Saving…" : "Save template"}
        </button>
      </div>
    </Modal>
  );
}
