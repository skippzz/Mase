import type {
  CellValue,
  ResolveContext,
  ResolvedField,
  SheetCell,
  TemplateField,
  TemplateProfile,
} from "../types";
import { asDate } from "./spreadsheet";

export function formatValue(
  value: CellValue,
  field: TemplateField,
  locale: string,
): string {
  if (value == null) return "";
  if (field.format === "date") {
    const date = asDate(value);
    if (!date)
      throw new Error(
        `“${field.label}” is not a valid date. Use an Excel date, YYYY-MM-DD, or DD.MM.YYYY.`,
      );
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  }
  if (field.format === "time" && typeof value === "number") {
    const total = Math.round((value % 1) * 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }
  if (field.format === "time" && value instanceof Date)
    return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
  if (field.format === "number" || field.format === "currency") {
    if (typeof value !== "number" || !Number.isFinite(value))
      throw new Error(`“${field.label}” must contain a numeric Excel value.`);
    return new Intl.NumberFormat(
      locale,
      field.format === "currency"
        ? { style: "currency", currency: "TRY" }
        : { maximumFractionDigits: 2 },
    ).format(value);
  }
  if (value instanceof Date)
    return value.toLocaleDateString(locale, { timeZone: "UTC" });
  return String(value);
}
export function resolveField(
  field: TemplateField,
  context: ResolveContext,
): string {
  const source = field.source;
  let cell: SheetCell | undefined;
  if (source.kind === "text") cell = { value: source.text, text: source.text };
  if (source.kind === "calendar")
    cell = {
      value: context.calendar?.[source.key] || "",
      text: context.calendar?.[source.key] || "",
    };
  if (source.kind === "cell" || source.kind === "column") {
    const sheet = context.workbook?.sheets.find((s) => s.name === source.sheet);
    if (!sheet)
      throw new Error(
        `“${field.label}”: worksheet “${source.sheet || "(not selected)"}” is missing. Update the field mapping.`,
      );
    const address =
      source.kind === "cell"
        ? source.address.toUpperCase().replace(/\$/g, "")
        : `${source.column.toUpperCase()}${context.record?.row ?? ""}`;
    if (!/^[A-Z]{1,3}[1-9]\d*$/.test(address))
      throw new Error(
        `“${field.label}”: choose a valid ${source.kind === "cell" ? "cell address" : "column and spreadsheet row"}.`,
      );
    cell = sheet.cells[address];
    if (cell?.error)
      throw new Error(
        `“${field.label}”, ${source.sheet}!${address}: ${cell.error}`,
      );
  }
  if (
    field.required &&
    (cell?.value == null || String(cell.value).trim() === "")
  )
    throw new Error(`“${field.label}” is required but has no value.`);
  return formatValue(cell?.value ?? null, field, context.locale);
}
export function resolveProfile(
  profile: TemplateProfile,
  context: ResolveContext,
): ResolvedField[] {
  return profile.fields.map((field) => ({
    field,
    text: resolveField(field, context),
  }));
}
export function safeFilename(
  pattern: string,
  fields: ResolvedField[],
  index = 1,
) {
  const values = Object.fromEntries(fields.map((f) => [f.field.label, f.text]));
  const raw = pattern.replace(/\{([^}]+)\}/g, (_, key: string) =>
    key === "row" ? String(index) : values[key] || key,
  );
  let name =
    raw
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .slice(0, 160)
      .trim() || `document-${index}`;
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name))
    name = `_${name}`;
  return name.replace(/\.(pdf|png|zip)$/i, "");
}
export function uniqueFilename(
  base: string,
  extension: string,
  used: Set<string>,
) {
  let name = `${base}.${extension}`,
    suffix = 2;
  while (used.has(name.toLocaleLowerCase()))
    name = `${base}-${suffix++}.${extension}`;
  used.add(name.toLocaleLowerCase());
  return name;
}
