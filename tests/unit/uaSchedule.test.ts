import { describe, expect, it } from "vitest";
import {
  extractUaSchedules,
  extractLocation,
  classTime,
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
