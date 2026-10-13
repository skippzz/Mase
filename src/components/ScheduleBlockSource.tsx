import type { FieldSource, WorkbookData } from "../types";
import { Field } from "./ui";
import { columnLetter } from "../lib/spreadsheet";
type Block = Extract<FieldSource, { kind: "scheduleBlock" }>;
export function ScheduleBlockSource({
  source,
  workbook,
  change,
}: {
  source: Block;
  workbook?: WorkbookData;
  change: (s: Block) => void;
}) {
  const sheet = workbook?.sheets.find((s) => s.name === source.sheet);
  const columns = Array.from({ length: sheet?.columnCount || 34 }, (_, i) =>
    columnLetter(i + 1),
  );
  return (
    <>
      <Field label="Worksheet">
        {workbook ? (
          <select
            value={source.sheet}
            onChange={(e) => change({ ...source, sheet: e.target.value })}
          >
            <option value="">Choose worksheet</option>
            {workbook.sheets.map((s) => (
              <option key={s.name}>{s.name}</option>
            ))}
          </select>
        ) : (
          <input
            value={source.sheet}
            onChange={(e) => change({ ...source, sheet: e.target.value })}
          />
        )}
      </Field>
      <div className="form-grid compact">
        <Field label="First row">
          <input
            type="number"
            min={1}
            max={5000}
            value={source.firstRow}
            onChange={(e) =>
              change({ ...source, firstRow: Number(e.target.value) })
            }
          />
        </Field>
        <Field label="Last row">
          <input
            type="number"
            min={1}
            max={5000}
            value={source.lastRow}
            onChange={(e) =>
              change({ ...source, lastRow: Number(e.target.value) })
            }
          />
        </Field>
      </div>
      <div className="form-grid compact">
        {(
          [
            ["timeColumn", "Time column"],
            ["titleColumn", "Class column"],
            ["trainerColumn", "Trainer column"],
            ["extraColumn", "Theme / duration"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label}>
            <select
              value={source[key]}
              onChange={(e) => change({ ...source, [key]: e.target.value })}
            >
              {key === "trainerColumn" || key === "extraColumn" ? (
                <option value="">None</option>
              ) : (
                <option value="">Choose</option>
              )}
              {columns.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        ))}
      </div>
      <Field label="Extra detail">
        <select
          value={source.extraFormat}
          onChange={(e) =>
            change({
              ...source,
              extraFormat: e.target.value as "text" | "minutes",
            })
          }
        >
          <option value="text">Theme as text</option>
          <option value="minutes">Duration in minutes</option>
        </select>
      </Field>
      <Field
        label="Skip heading rows"
        hint="Comma-separated row numbers. Empty class slots are skipped automatically."
      >
        <input
          value={source.skipRows.join(", ")}
          onChange={(e) =>
            change({
              ...source,
              skipRows: e.target.value
                .split(",")
                .map((s) => Number(s.trim()))
                .filter((n) => n > 0),
            })
          }
          placeholder="4, 11"
        />
      </Field>
    </>
  );
}
