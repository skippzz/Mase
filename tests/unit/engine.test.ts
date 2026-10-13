import { describe, expect, it, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { PDFDocument, degrees, rgb } from "pdf-lib";
import "fake-indexeddb/auto";
import {
  parseWorkbook,
  tableData,
  asDate,
  columnLetter,
} from "../../src/lib/spreadsheet";
import {
  conflict,
  defaults,
  weekStart,
  calendarValues,
} from "../../src/lib/calendar";
import {
  resolveProfile,
  formatValue,
  uniqueFilename,
  safeFilename,
} from "../../src/lib/mapping";
import {
  fieldBox,
  layoutText,
  pdfTextPosition,
  rotatedPage,
} from "../../src/lib/layout";
import { defaultProfiles, makeField } from "../../src/lib/profiles";
import { generatePdf } from "../../src/lib/documents";
import {
  clearStorage,
  exportArchive,
  importArchive,
  loadStudio,
  removeProfile,
  replaceAll,
  saveProfile,
  saveStudio,
  validateProfile,
  validateState,
} from "../../src/lib/storage";
import type {
  Appointment,
  ResolveContext,
  TemplateProfile,
} from "../../src/types";

async function fixture() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sessions");
  sheet.addRow([
    "Client",
    "Date",
    "Time",
    "Amount",
    "Result",
    "Missing",
    "Notes",
  ]);
  sheet.addRow([
    "İpek Şahin",
    new Date("2026-10-14T00:00:00Z"),
    0.5,
    12450.75,
    { formula: "D2*2", result: 24901.5 },
    { formula: "D2+1" },
    "ÇĞİÖŞÜ çğıöşü",
  ]);
  sheet.getCell("B2").numFmt = "dd.mm.yyyy";
  sheet.addRow([]);
  sheet.addRow([
    "Özge",
    null,
    0.375,
    0,
    { formula: "1-1", result: 0 },
    null,
    null,
  ]);
  workbook.addWorksheet("Second sheet").getCell("B4").value = "Direct value";
  const file = new File(
    [(await workbook.xlsx.writeBuffer()) as ArrayBuffer],
    "sessions.xlsx",
  );
  return parseWorkbook(file);
}
describe("spreadsheet import and mappings", () => {
  it("reads XLSX, multiple sheets, Unicode, dates, blank rows, cached zero and missing formula results", async () => {
    const book = await fixture();
    expect(book.sheets.map((s) => s.name)).toEqual([
      "Sessions",
      "Second sheet",
    ]);
    expect(book.sheets[0].cells.A2.value).toBe("İpek Şahin");
    expect(book.sheets[0].cells.B2.value).toBeInstanceOf(Date);
    expect(book.sheets[0].cells.E4.value).toBe(0);
    expect(book.sheets[0].cells.F2.error).toContain("no saved result");
    expect(book.warnings).toHaveLength(1);
    expect(tableData(book.sheets[0], 1).records.map((r) => r.row)).toEqual([
      2, 4,
    ]);
  });
  it("rejects invalid, empty, wrong-extension and oversize files", async () => {
    await expect(
      parseWorkbook(new File(["invalid"], "bad.xlsx")),
    ).rejects.toThrow("not a readable");
    await expect(parseWorkbook(new File([], "empty.xlsx"))).rejects.toThrow(
      "empty",
    );
    await expect(parseWorkbook(new File(["csv"], "wrong.csv"))).rejects.toThrow(
      ".xlsx",
    );
    await expect(
      parseWorkbook(new File([new Uint8Array(21 * 1024 * 1024)], "big.xlsx")),
    ).rejects.toThrow("20 MB");
  });
  it("supports column and direct-cell sources, including other sheets", async () => {
    const workbook = await fixture(),
      record = tableData(workbook.sheets[0], 1).records[0];
    const p = {
      ...defaultProfiles()[0],
      fields: [
        makeField({
          label: "Client",
          source: { kind: "column", sheet: "Sessions", column: "A" },
        }),
        makeField({
          label: "Direct",
          source: { kind: "cell", sheet: "Second sheet", address: "$B$4" },
        }),
      ],
    };
    expect(
      resolveProfile(p, { workbook, record, locale: "tr-TR" }).map(
        (f) => f.text,
      ),
    ).toEqual(["İpek Şahin", "Direct value"]);
  });
  it("blocks required empty values, missing worksheets, and unresolved mapped formulas", async () => {
    const workbook = await fixture(),
      p = defaultProfiles()[0],
      context: ResolveContext = { workbook, locale: "tr-TR" };
    p.fields = [
      makeField({
        label: "Required",
        required: true,
        source: { kind: "cell", sheet: "Sessions", address: "Z2" },
      }),
    ];
    expect(() => resolveProfile(p, context)).toThrow("required");
    p.fields[0].source = { kind: "cell", sheet: "Absent", address: "A1" };
    expect(() => resolveProfile(p, context)).toThrow("missing");
    p.fields[0].source = { kind: "cell", sheet: "Sessions", address: "F2" };
    expect(() => resolveProfile(p, context)).toThrow("no saved result");
  });
  it("formats Turkish dates and numbers without coercing ambiguous strings", () => {
    expect(
      formatValue(
        new Date("2026-10-14T12:00:00Z"),
        makeField({ format: "date" }),
        "tr-TR",
      ),
    ).toBe("14.10.2026");
    expect(
      formatValue(12450.75, makeField({ format: "number" }), "tr-TR"),
    ).toBe("12.450,75");
    expect(
      formatValue(12450.75, makeField({ format: "currency" }), "tr-TR"),
    ).toContain("12.450,75");
    expect(formatValue(0.375, makeField({ format: "time" }), "tr-TR")).toBe(
      "09:00",
    );
    expect(() =>
      formatValue("12,450.75", makeField({ format: "number" }), "tr-TR"),
    ).toThrow("numeric");
    expect(asDate("31.02.2026")).toBeUndefined();
    expect(columnLetter(27)).toBe("AA");
  });
});
describe("document coordinates, text fitting and filenames", () => {
  it("keeps normalized placement invariant at different scales", () => {
    const field = makeField({
      x: 0.2,
      y: 0.3,
      width: 0.4,
      height: 0.1,
      fontSize: 15,
    });
    const small = fieldBox(field, 595, 842),
      large = fieldBox(field, 1190, 1684);
    for (const k of ["x", "top", "width", "height", "fontSize"] as const)
      expect(large[k]).toBe(small[k] * 2);
    expect(pdfTextPosition(small.x, small.top, small.fontSize, 842)).toEqual({
      x: 119,
      y: 842 - 842 * 0.3 - 15,
    });
  });
  it.each([0, 90, 180, 270])("normalizes a PDF rotated %i degrees", (angle) => {
    const transformed = rotatedPage(600, 800, angle);
    expect(transformed.width).toBe(angle === 90 || angle === 270 ? 800 : 600);
    expect(transformed.height).toBe(angle === 90 || angle === 270 ? 600 : 800);
    const r = (transformed.degrees * Math.PI) / 180;
    const corners = [
      [0, 0],
      [600, 0],
      [0, 800],
      [600, 800],
    ].map(([x, y]) => [
      transformed.x + x * Math.cos(r) - y * Math.sin(r),
      transformed.y + x * Math.sin(r) + y * Math.cos(r),
    ]);
    corners.forEach(([x, y]) => {
      expect(x).toBeGreaterThanOrEqual(-1e-8);
      expect(y).toBeGreaterThanOrEqual(-1e-8);
      expect(x).toBeLessThanOrEqual(transformed.width + 1e-8);
      expect(y).toBeLessThanOrEqual(transformed.height + 1e-8);
    });
  });
  const measure = (s: string, z: number) => [...s].length * z * 0.5;
  it("wraps long words without dropping Unicode characters", () => {
    const text = "ÇĞİÖŞÜçğıöşü";
    const layout = layoutText(text, 20, 200, 10, "wrap", measure);
    expect(layout.lines.join("")).toBe(text);
  });
  it("shrinks to fit and reports truncation; wrapping never silently clips", () => {
    expect(
      layoutText("a long sentence with words", 50, 35, 15, "shrink", measure)
        .fontSize,
    ).toBeLessThan(15);
    expect(
      layoutText("a long sentence with words", 50, 20, 15, "truncate", measure)
        .warning,
    ).toContain("shortened");
    expect(() =>
      layoutText("a long sentence with words", 10, 10, 15, "wrap", measure),
    ).toThrow("does not fit");
  });
  it("sanitizes filenames and avoids case-insensitive duplicate names", () => {
    expect(safeFilename("CON.pdf", [])).toBe("_CON");
    expect(
      safeFilename(
        "{Client}_{row}",
        [{ field: makeField({ label: "Client" }), text: "İpek / Şahin" }],
        3,
      ),
    ).toBe("İpek - Şahin_3");
    const used = new Set<string>();
    expect(uniqueFilename("Client", "pdf", used)).toBe("Client.pdf");
    expect(uniqueFilename("client", "pdf", used)).toBe("client-2.pdf");
  });
  it("generates readable multipage PDFs with real embedded Turkish fonts and rotated backgrounds", async () => {
    const original = await PDFDocument.create();
    for (const angle of [0, 90, 180, 270]) {
      const page = original.addPage([595, 842]);
      page.setRotation(degrees(angle));
      page.drawRectangle({
        x: 0,
        y: 0,
        width: 595,
        height: 842,
        color: rgb(0.95, 0.94, 0.9),
      });
    }
    const profile: TemplateProfile = {
      ...defaultProfiles()[0],
      type: "pdf",
      design: undefined,
      asset: new Blob([new Uint8Array(await original.save()).buffer]),
      pages: [0, 90, 180, 270].map((angle) => ({
        ...rotatedPage(595, 842, angle),
        rotation: angle,
      })),
      fields: [
        makeField({
          source: { kind: "text", text: "ÇĞİÖŞÜ çğıöşü\nİpek Şahin" },
          height: 0.2,
        }),
      ],
    };
    const sans = new Uint8Array(
        await readFile("public/fonts/Lato-Regular.ttf"),
      ),
      serif = new Uint8Array(
        await readFile("public/fonts/CormorantGaramond.otf"),
      );
    const output = await generatePdf(
      profile,
      { locale: "tr-TR" },
      { sans, serif },
    );
    const parsed = await PDFDocument.load(output.bytes);
    expect(parsed.getPageCount()).toBe(4);
    expect(parsed.getPages().map((p) => p.getSize())).toEqual([
      { width: 595, height: 842 },
      { width: 842, height: 595 },
      { width: 595, height: 842 },
      { width: 842, height: 595 },
    ]);
    expect(output.warnings).toEqual([]);
    expect(output.bytes.length).toBeGreaterThan(2000);
  });
});
describe("local storage, template archives and calendar privacy", () => {
  beforeEach(async () => {
    await clearStorage();
  });
  it("persists calendar data and template binaries separately; deleted templates stay deleted", async () => {
    const initial = await loadStudio();
    expect(initial.profiles).toHaveLength(2);
    await saveStudio({
      ...defaults,
      settings: { ...defaults.settings, studioName: "İpek Studio" },
    });
    for (const p of initial.profiles) await removeProfile(p.id);
    const result = await loadStudio();
    expect(result.state.settings.studioName).toBe("İpek Studio");
    expect(result.profiles).toHaveLength(0);
  });
  it("round-trips a backup with image data and readable JSON metadata", async () => {
    const p: TemplateProfile = {
      ...defaultProfiles()[0],
      type: "image",
      asset: new Blob(["test-image"], { type: "image/png" }),
      assetName: "card.png",
    };
    const blob = await exportArchive([p], defaults);
    const result = await importArchive(new File([blob], "backup.zip"));
    expect(result.state).toEqual(defaults);
    expect(await result.profiles[0].asset!.text()).toBe("test-image");
    await replaceAll(defaults, result.profiles);
    expect((await loadStudio()).profiles[0].assetName).toBe("card.png");
  });
  it("rejects malformed profiles and orphaned calendar sessions", () => {
    const p = defaultProfiles()[0];
    p.fields[0].x = 2;
    expect(() => validateProfile(p)).toThrow("invalid field");
    expect(() =>
      validateState({
        ...defaults,
        appointments: [{ id: "bad", clientId: "missing" }],
      }),
    ).toThrow("client");
  });
  it("detects session conflicts and excludes cancelled sessions and private notes from share text", () => {
    const a: Appointment = {
      id: "a",
      clientId: "client",
      date: "2026-10-14",
      start: "09:00",
      duration: 60,
      service: "Pilates",
      status: "confirmed",
      location: "Studio",
      notes: "PRIVATE HEALTH NOTE",
    };
    expect(conflict({ ...a, id: "b", start: "09:30" }, [a])?.id).toBe("a");
    expect(conflict({ ...a, id: "b", start: "10:00" }, [a])).toBeUndefined();
    expect(
      conflict({ ...a, id: "b", status: "cancelled" }, [a]),
    ).toBeUndefined();
    const state = {
      ...defaults,
      clients: [
        {
          id: "client",
          name: "İpek",
          email: "",
          phone: "",
          notes: "CLIENT PRIVATE",
        },
      ],
      appointments: [
        a,
        { ...a, id: "c", start: "12:00", status: "cancelled" as const },
      ],
    };
    const data = calendarValues(
      state,
      weekStart(new Date("2026-10-14T12:00:00")),
      "",
    );
    expect(data.schedule).toContain("İpek");
    expect(data.schedule).not.toContain("PRIVATE");
    expect(data.schedule).not.toContain("12:00");
  });
});
