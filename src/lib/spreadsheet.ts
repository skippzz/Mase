import type {
  CellValue,
  SheetCell,
  SheetColumn,
  SheetRecord,
  WorkbookData,
  Worksheet,
} from "../types";

export const MAX_FILE_SIZE = 20 * 1024 * 1024;
export function checkFile(file: Blob, kind: string) {
  if (!file.size) throw new Error(`${kind} is empty.`);
  if (file.size > MAX_FILE_SIZE)
    throw new Error(`${kind} must be smaller than 20 MB.`);
}
export function columnLetter(index: number): string {
  let result = "";
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26))
    result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
  return result;
}
export function columnIndex(letter: string) {
  return [...letter.toUpperCase()].reduce(
    (a, c) => a * 26 + c.charCodeAt(0) - 64,
    0,
  );
}
function cellData(input: unknown): SheetCell {
  if (input == null) return { value: null, text: "" };
  if (input instanceof Date)
    return { value: input, text: input.toLocaleDateString("en-GB") };
  if (
    typeof input === "string" ||
    typeof input === "number" ||
    typeof input === "boolean"
  )
    return { value: input, text: String(input) };
  const v = input as {
    formula?: string;
    sharedFormula?: string;
    result?: unknown;
    richText?: { text: string }[];
    text?: string;
    error?: string;
  };
  if (v.formula || v.sharedFormula) {
    if (v.result == null)
      return {
        value: null,
        text: "",
        error:
          "Formula has no saved result. Recalculate and save the workbook in Excel or export again from Google Sheets.",
      };
    return cellData(v.result);
  }
  if (v.error)
    return { value: null, text: "", error: `Spreadsheet error: ${v.error}` };
  const text = v.richText ? v.richText.map((p) => p.text).join("") : v.text;
  return { value: text ?? null, text: text ?? "" };
}
export async function guardZip(buffer: ArrayBuffer) {
  const { default: JSZip } = await import("jszip");
  const archive = await JSZip.loadAsync(buffer);
  let size = 0;
  for (const member of Object.values(archive.files)) {
    size +=
      (member as unknown as { _data?: { uncompressedSize?: number } })._data
        ?.uncompressedSize || 0;
    if (size > 100 * 1024 * 1024)
      throw new Error(
        "This archive expands beyond the 100 MB safety limit. Use a smaller file.",
      );
  }
  if (Object.keys(archive.files).length > 5000)
    throw new Error("This archive contains too many files.");
  return archive;
}
export async function parseWorkbook(file: File): Promise<WorkbookData> {
  checkFile(file, "Spreadsheet");
  if (!/\.xlsx$/i.test(file.name))
    throw new Error(
      "Choose an .xlsx workbook. In Google Sheets, use File → Download → Microsoft Excel (.xlsx).",
    );
  const bytes = await file.arrayBuffer();
  try {
    const zip = await guardZip(bytes);
    if (!zip.file("xl/workbook.xml"))
      throw new Error("This is not an Excel workbook.");
  } catch (e) {
    throw new Error(
      e instanceof Error && /safety limit|too many/.test(e.message)
        ? e.message
        : "This file is not a readable .xlsx workbook. Check that it is not password protected.",
    );
  }
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes);
  } catch {
    throw new Error(
      "The workbook could not be read. Save an unencrypted .xlsx copy and try again.",
    );
  }
  if (workbook.worksheets.length > 20)
    throw new Error("Use a workbook with no more than 20 sheets.");
  const warnings: string[] = [];
  let cellCount = 0;
  const sheets = workbook.worksheets.map((sheet) => {
    if (sheet.rowCount > 5000 || sheet.columnCount > 100)
      throw new Error(
        `“${sheet.name}” exceeds 5,000 rows or 100 columns. Export only the area you need.`,
      );
    const cells: Record<string, SheetCell> = {};
    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        if (++cellCount > 200000)
          throw new Error(
            "Use a workbook with fewer than 200,000 populated cells.",
          );
        // ExcelJS's formula value getter drops falsy cached results (0 / false).
        // Its dedicated result getter preserves them.
        const data = cellData(
          cell.type === ExcelJS.ValueType.Formula
            ? { formula: cell.formula, result: cell.result }
            : cell.value,
        );
        cells[cell.address] = data;
        if (data.error)
          warnings.push(`${sheet.name}!${cell.address}: ${data.error}`);
      }),
    );
    return {
      name: sheet.name,
      cells,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
    };
  });
  if (!sheets.length) throw new Error("This workbook has no worksheets.");
  return { name: file.name, sheets, warnings };
}
export function tableData(
  sheet: Worksheet,
  headerRow: number,
): { columns: SheetColumn[]; records: SheetRecord[] } {
  const columns = Array.from({ length: sheet.columnCount }, (_, i) => {
    const key = columnLetter(i + 1);
    return {
      key,
      label: sheet.cells[`${key}${headerRow}`]?.text || `Column ${key}`,
    };
  });
  const records: SheetRecord[] = [];
  for (let row = headerRow + 1; row <= sheet.rowCount; row++) {
    const cells = Object.fromEntries(
      columns.map((c) => [
        c.key,
        sheet.cells[`${c.key}${row}`] || { value: null, text: "" },
      ]),
    );
    if (Object.values(cells).some((c) => c.value != null || c.error))
      records.push({ row, cells });
  }
  return { columns, records };
}
export function asDate(value: CellValue): Date | undefined {
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value === "number")
    return new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000));
  if (typeof value !== "string") return undefined;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  const local = value.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (!iso && !local) return undefined;
  const key = iso
    ? `${iso[1]}-${iso[2]}-${iso[3]}`
    : `${local![3]}-${local![2].padStart(2, "0")}-${local![1].padStart(2, "0")}`;
  const d = new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) &&
    d.getUTCDate() === Number(key.slice(8)) &&
    d.getUTCMonth() + 1 === Number(key.slice(5, 7))
    ? d
    : undefined;
}
