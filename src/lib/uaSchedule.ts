import type { CellValue, WorkbookData, Worksheet } from "../types";
import { columnLetter } from "./spreadsheet";

export const UA_DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;
const TURKISH_DAYS = [
  "PAZARTESI",
  "SALI",
  "CARSAMBA",
  "PERSEMBE",
  "CUMA",
  "CUMARTESI",
  "PAZAR",
];
export interface ClassSession {
  time: string;
  trainer: string;
  title: string;
  extra: string;
  group: "cycle" | "studio" | "live";
  row: number;
  source: string;
}
export interface ClassDay {
  day: number;
  label: string;
  sessions: ClassSession[];
}
export interface LocationSchedule {
  location: "MASLAK" | "GÖKTÜRK" | "LIVE";
  sheet: string;
  days: ClassDay[];
  count: number;
}
export interface ScheduleImport {
  locations: LocationSchedule[];
  warnings: string[];
}
function normalized(text: string) {
  return text
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/İ/g, "I");
}
function value(sheet: Worksheet, address: string): CellValue {
  const cell = sheet.cells[address];
  if (cell?.error) throw new Error(`${sheet.name}!${address}: ${cell.error}`);
  return cell?.value ?? null;
}
export function classTime(input: CellValue) {
  if (input instanceof Date)
    return `${String(input.getUTCHours()).padStart(2, "0")}:${String(input.getUTCMinutes()).padStart(2, "0")}`;
  if (typeof input === "number" && input >= 0 && input < 1) {
    const n = Math.round(input * 1440) % 1440;
    return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  }
  const match = String(input ?? "")
    .trim()
    .match(/^(\d{1,2}):([0-5]\d)$/);
  return match && Number(match[1]) < 24
    ? `${match[1].padStart(2, "0")}:${match[2]}`
    : "";
}
export function extractLocation(
  sheet: Worksheet,
  location: LocationSchedule["location"],
): LocationSchedule {
  let headerRow = 0;
  for (let row = 1; row <= Math.min(12, sheet.rowCount); row++) {
    if (
      Object.entries(sheet.cells).filter(
        ([a, c]) =>
          a.replace(/[A-Z]/g, "") === String(row) &&
          normalized(c.text.trim()) === "TRAINER",
      ).length >= 2
    ) {
      headerRow = row;
      break;
    }
  }
  if (!headerRow)
    throw new Error(
      `“${sheet.name}”: the TRAINER / DERS headers could not be found. Keep the weekly grid's headers in the first 12 rows.`,
    );
  const days: ClassDay[] = [];
  for (let col = 2; col <= sheet.columnCount - 1; col++) {
    const trainerColumn = columnLetter(col);
    if (
      normalized(
        String(value(sheet, `${trainerColumn}${headerRow}`) || "").trim(),
      ) !== "TRAINER"
    )
      continue;
    const titleColumn = columnLetter(col + 1),
      timeColumn = columnLetter(col - 1),
      extraColumn = columnLetter(col + 2);
    if (
      normalized(
        String(value(sheet, `${titleColumn}${headerRow}`) || "").trim(),
      ) !== "DERS"
    )
      throw new Error(
        `${sheet.name}!${titleColumn}${headerRow}: expected a DERS column next to TRAINER.`,
      );
    const label = normalized(
      String(
        value(sheet, `${trainerColumn}${headerRow - 1}`) ||
          value(sheet, `${timeColumn}${headerRow - 1}`) ||
          "",
      ).trim(),
    );
    const day =
      TURKISH_DAYS.indexOf(label) >= 0
        ? TURKISH_DAYS.indexOf(label)
        : UA_DAYS.indexOf(label as (typeof UA_DAYS)[number]);
    if (day < 0)
      throw new Error(
        `${sheet.name}!${trainerColumn}${headerRow - 1}: weekday heading is missing or unsupported.`,
      );
    if (days.some((d) => d.day === day))
      throw new Error(
        `“${sheet.name}” contains duplicate ${UA_DAYS[day]} blocks.`,
      );
    const extraLabel = normalized(
      String(value(sheet, `${extraColumn}${headerRow}`) || ""),
    );
    const sessions: ClassSession[] = [];
    let group: ClassSession["group"] = location === "LIVE" ? "live" : "cycle";
    for (let row = headerRow + 1; row <= sheet.rowCount; row++) {
      const section = normalized(String(value(sheet, `A${row}`) ?? ""));
      if (section.includes("INDOOR CYCLE")) {
        group = "cycle";
        continue;
      }
      if (section.startsWith("STUDIO /") || section.startsWith("STUDIO ")) {
        group = "studio";
        continue;
      }
      const title = String(value(sheet, `${titleColumn}${row}`) ?? "").trim(),
        trainer = String(value(sheet, `${trainerColumn}${row}`) ?? "").trim();
      if (!title && !trainer) continue;
      if (!title)
        throw new Error(
          `${sheet.name}!${titleColumn}${row}: a trainer is assigned but the class is missing.`,
        );
      if (!trainer)
        throw new Error(
          `${sheet.name}!${trainerColumn}${row}: ${title} has no trainer.`,
        );
      const time = classTime(value(sheet, `${timeColumn}${row}`));
      if (!time)
        throw new Error(
          `${sheet.name}!${timeColumn}${row}: ${title} has no valid class time.`,
        );
      const detail = value(sheet, `${extraColumn}${row}`);
      const extra =
        detail == null || String(detail).trim() === ""
          ? ""
          : extraLabel === "SURE"
            ? `${detail} MIN`
            : String(detail).trim();
      sessions.push({
        time,
        title,
        trainer,
        extra,
        group,
        row,
        source: `${sheet.name}!${timeColumn}${row}:${extraColumn}${row}`,
      });
    }
    days.push({ day, label: UA_DAYS[day], sessions });
  }
  if (!days.length)
    throw new Error(`“${sheet.name}” has no recognized day blocks.`);
  days.sort((a, b) => a.day - b.day);
  const count = days.reduce((sum, d) => sum + d.sessions.length, 0);
  if (!count) throw new Error(`“${sheet.name}” contains no scheduled classes.`);
  return { location, sheet: sheet.name, days, count };
}
export function extractUaSchedules(workbook: WorkbookData): ScheduleImport {
  const locations: LocationSchedule[] = [],
    warnings: string[] = [];
  for (const [location, candidates] of [
    ["MASLAK", ["MASLAK"]],
    ["GÖKTÜRK", ["GOKTURK"]],
    ["LIVE", ["UA+ FILM", "UA+ LIVE", "LIVE"]],
  ] as const) {
    const sheet = workbook.sheets.find((s) =>
      candidates.some((name) => normalized(s.name.trim()) === name),
    );
    if (sheet) locations.push(extractLocation(sheet, location));
    else
      warnings.push(
        `${location} worksheet is absent. Its image will not be generated.`,
      );
  }
  if (!locations.length)
    throw new Error(
      "This workbook has no MASLAK, GÖKTÜRK, or UA+ FILM worksheets. Upload the UA weekly schedule workbook.",
    );
  return { locations, warnings };
}
export function trainerDisplay(name: string) {
  return name
    .toLocaleLowerCase("en-GB")
    .replace(/\u0307/g, "")
    .replace(
      /(^|\s)(\p{L})/gu,
      (_, space, letter: string) => space + letter.toLocaleUpperCase("tr-TR"),
    );
}
