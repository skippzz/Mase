import { describe, expect, it } from "vitest";
import {
  extractUaSchedules,
  extractLocation,
  classTime,
  uaWorksheetChoices,
} from "../../src/lib/uaSchedule";
import type { Worksheet, WorkbookData } from "../../src/types";
function grid(): Worksheet {
  const cell = (value: string | number | Date) => ({
    value,
    text: String(value),
  });
  return {
    name: "MASLAK",
    rowCount: 8,
    columnCount: 9,
    cells: {
      B2: cell("PAZARTESİ"),
      G2: cell("SALI"),
      B3: cell("TRAINER"),
      C3: cell("DERS"),
      D3: cell("THEME"),
      G3: cell("TRAINER"),
      H3: cell("DERS"),
      I3: cell("THEME"),
      A4: cell("INDOOR CYCLE"),
      A5: cell(new Date("1899-12-30T18:30:00Z")),
      B5: cell("İPEK"),
      C5: cell("CYCLE"),
      D5: cell("EXPRESS"),
      F5: cell(0.5),
      G5: cell("ÖZGE"),
      H5: cell("CYCLE"),
      A6: cell(0.375),
      F6: cell(0.375),
      A7: cell("STUDIO / PILATES · STRENGTH"),
      A8: cell(0.375),
      B8: cell("ÇİĞDEM"),
      C8: cell("PILATES"),
    },
  };
}
describe("UA weekly schedule extraction", () => {
  it("uses the single weekly copy instead of the undated base, including decomposed Turkish sheet names", () => {
    const base = grid();
    const weekly = structuredClone(base);
    weekly.name = "Maslak 19-25 EKİM";
    weekly.cells.D5 = { value: "Artist One, Artist Two & Artist Three", text: "Artist One, Artist Two & Artist Three" };
    const gokturk = structuredClone(base);
    gokturk.name = "GÖKTÜRK 19-25 EKİM";
    const workbook: WorkbookData = { name: "week.xlsx", sheets: [base, weekly, gokturk], warnings: [] };
    const result = extractUaSchedules(workbook);
    expect(result.locations[0].sheet).toBe(weekly.name);
    expect(result.locations[0].days[0].sessions[0].extra).toBe(weekly.cells.D5.value);
    expect(result.locations[1].location).toBe("GÖKTÜRK");
    expect(extractUaSchedules(workbook, { MASLAK: "MASLAK" }).locations[0].sheet).toBe("MASLAK");
  });
  it("requires a worksheet choice when multiple weekly copies exist, regardless of tab order", () => {
    const one = grid(), two = grid();
    one.name = "Maslak 19-25 EKİM";
    two.name = "Maslak 26 EKİM-1 KASIM";
    const workbook: WorkbookData = { name: "week.xlsx", sheets: [grid(), two, one], warnings: [] };
    expect(uaWorksheetChoices(workbook)[0].preferred).toBeUndefined();
    expect(() => extractUaSchedules(workbook)).toThrow("Choose the MASLAK worksheet");
    expect(extractUaSchedules(workbook, { MASLAK: one.name }).locations[0].sheet).toBe(one.name);
  });
  it("skips an unlabeled unused day block but rejects it when a class is assigned", () => {
    const sheet = grid();
    sheet.columnCount = 14;
    sheet.cells.L3 = { value: "TRAINER", text: "TRAINER" };
    sheet.cells.M3 = { value: "DERS", text: "DERS" };
    sheet.cells.K5 = { value: "09:00", text: "09:00" };
    expect(extractLocation(sheet, "LIVE").days).toHaveLength(2);
    sheet.cells.L5 = { value: "İPEK", text: "İPEK" };
    sheet.cells.M5 = { value: "CYCLE", text: "CYCLE" };
    expect(() => extractLocation(sheet, "LIVE")).toThrow("weekday heading is missing");
  });
  it("discovers day blocks, retains source order and sections, and ignores unassigned time slots", () => {
    const schedule = extractLocation(grid(), "MASLAK");
    expect(schedule.count).toBe(3);
    expect(schedule.days.map((d) => d.label)).toEqual(["MONDAY", "TUESDAY"]);
    expect(
      schedule.days[0].sessions.map((s) => [
        s.time,
        s.trainer,
        s.title,
        s.group,
      ]),
    ).toEqual([
      ["18:30", "İPEK", "CYCLE", "cycle"],
      ["09:00", "ÇİĞDEM", "PILATES", "studio"],
    ]);
    expect(schedule.days[0].sessions[0].extra).toBe("EXPRESS");
  });
  it("reads LIVE durations from UA+ FILM instead of copying the image reference data", () => {
    const sheet = grid();
    sheet.name = "UA+ FILM";
    sheet.cells.D3 = { value: "SÜRE", text: "SÜRE" };
    sheet.cells.D5 = { value: 40, text: "40" };
    delete sheet.cells.A4;
    delete sheet.cells.A7;
    const workbook: WorkbookData = {
      name: "week.xlsx",
      sheets: [sheet],
      warnings: [],
    };
    const result = extractUaSchedules(workbook);
    expect(result.locations[0].location).toBe("LIVE");
    expect(result.locations[0].days[0].sessions[0].extra).toBe("40 MIN");
    expect(result.warnings).toHaveLength(2);
  });
  it("identifies malformed headers, missing classes, missing trainers and invalid class times by cell address", () => {
    let sheet = grid();
    sheet.cells.B5 = { value: null, text: "" };
    expect(() => extractLocation(sheet, "MASLAK")).toThrow("MASLAK!B5");
    sheet = grid();
    sheet.cells.C5 = { value: null, text: "" };
    expect(() => extractLocation(sheet, "MASLAK")).toThrow("MASLAK!C5");
    sheet = grid();
    sheet.cells.A5 = { value: null, text: "" };
    expect(() => extractLocation(sheet, "MASLAK")).toThrow("MASLAK!A5");
    sheet = grid();
    sheet.cells.C3 = { value: "WRONG", text: "WRONG" };
    expect(() => extractLocation(sheet, "MASLAK")).toThrow("DERS");
  });
  it("blocks unresolved mapped formulas and preserves Excel wall-clock times", () => {
    const sheet = grid();
    sheet.cells.B5 = {
      value: null,
      text: "",
      error: "Formula has no saved result.",
    };
    expect(() => extractLocation(sheet, "MASLAK")).toThrow(
      "Formula has no saved result",
    );
    expect(classTime(new Date("1899-12-30T07:15:00Z"))).toBe("07:15");
    expect(classTime(0.75)).toBe("18:00");
    expect(classTime("8:30")).toBe("08:30");
    expect(classTime("25:00")).toBe("");
  });
});
