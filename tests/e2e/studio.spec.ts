import { test, expect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { PDFDocument, degrees, rgb } from "pdf-lib";
import { addDays, dateKey, weekStart } from "../../src/lib/calendar";

const fixtureDir = ".local/fixtures";
test.beforeAll(async () => {
  await mkdir(fixtureDir, { recursive: true });
  const workbook = new ExcelJS.Workbook(),
    sheet = workbook.addWorksheet("Sessions");
  sheet.addRow([
    "Client",
    "Date",
    "Time",
    "Duration",
    "Session",
    "Location",
    "Notes",
  ]);
  const date = dateKey(weekStart(new Date()));
  sheet.addRow([
    "İpek Şahin",
    date,
    "09:00",
    60,
    "Pilates",
    "Private studio",
    "ÇĞİÖŞÜ çğıöşü",
  ]);
  sheet.addRow([
    "Özge Çelik",
    date,
    "11:00",
    45,
    "Mobility",
    "At home",
    "Gentle movement",
  ]);
  await workbook.xlsx.writeFile(`${fixtureDir}/sessions.xlsx`);
  const grid = new ExcelJS.Workbook(),
    gridSheet = grid.addWorksheet("Grid");
  gridSheet.getCell("A5").value = 0.375;
  gridSheet.getCell("A5").numFmt = "hh:mm";
  gridSheet.getCell("B5").value = "İpek";
  gridSheet.getCell("C5").value = "CYCLE";
  gridSheet.getCell("D5").value = "EXPRESS";
  gridSheet.getCell("A6").value = 0.5;
  gridSheet.getCell("A6").numFmt = "hh:mm";
  gridSheet.getCell("B6").value = "Özge";
  gridSheet.getCell("C6").value = "PILATES";
  await grid.xlsx.writeFile(`${fixtureDir}/grid.xlsx`);
  const ua = new ExcelJS.Workbook();
  for (const name of ["MASLAK", "GÖKTÜRK", "UA+ FILM"]) {
    const s = ua.addWorksheet(name);
    s.getCell("B2").value = "PAZARTESİ";
    s.getCell("G2").value = "SALI";
    for (const [col, header] of [
      ["B", "TRAINER"],
      ["C", "DERS"],
      ["D", name === "UA+ FILM" ? "SÜRE" : "THEME"],
      ["G", "TRAINER"],
      ["H", "DERS"],
      ["I", name === "UA+ FILM" ? "SÜRE" : "THEME"],
    ])
      s.getCell(`${col}3`).value = header;
    s.getCell("A4").value = 0.375;
    s.getCell("A4").numFmt = "hh:mm";
    s.getCell("B4").value = "İPEK";
    s.getCell("C4").value = "PILATES";
    s.getCell("D4").value = name === "UA+ FILM" ? 40 : "EXPRESS";
    s.getCell("F4").value = 0.5;
    s.getCell("F4").numFmt = "hh:mm";
    s.getCell("G4").value = "ÖZGE";
    s.getCell("H4").value = "STRENGTH";
    if (name === "UA+ FILM") {
      s.getCell("V2").value = "CUMA";
      s.getCell("V3").value = "TRAINER";
      s.getCell("W3").value = "DERS";
      s.getCell("X3").value = "SÜRE";
      for (const [index, trainer] of ["ÇİĞDEM", "ŞULE", "İPEK"].entries()) {
        const row = index + 4;
        s.getCell(`U${row}`).value = (10 + index) / 24;
        s.getCell(`U${row}`).numFmt = "hh:mm";
        s.getCell(`V${row}`).value = trainer;
        s.getCell(`W${row}`).value = "PILATES";
        s.getCell(`X${row}`).value = 40;
      }
    }
  }
  await ua.xlsx.writeFile(`${fixtureDir}/ua-week.xlsx`);
  await sharp({
    create: { width: 1080, height: 1350, channels: 4, background: "#f5e4d7" },
  })
    .png()
    .toFile(`${fixtureDir}/background.png`);
  const doc = await PDFDocument.create();
  for (const angle of [0, 90, 180, 270]) {
    const p = doc.addPage([595, 842]);
    p.setRotation(degrees(angle));
    p.drawRectangle({
      x: 0,
      y: 0,
      width: 595,
      height: 842,
      color: rgb(0.95, 0.94, 0.9),
    });
  }
  await writeFile(`${fixtureDir}/rotated.pdf`, await doc.save());
});
async function open(page: Page) {
  await page.goto("./#calendar");
  await expect(
    page.getByRole("heading", { name: "Your week, in balance." }),
  ).toBeVisible();
  await expect(page.getByText("Opening your studio…")).not.toBeVisible();
}
async function sample(page: Page) {
  await open(page);
  await page.getByRole("button", { name: "Explore a sample week" }).click();
  await expect(page.getByText("Sample studio ·")).toBeVisible();
}
async function share(page: Page) {
  await page.getByRole("button", { name: "Share schedule" }).click();
  await expect(page.getByAltText("Generated document preview")).toBeVisible({
    timeout: 45000,
  });
}

test("calendar CRUD, conflicts, private notes and persistence", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await open(page);
  await page.getByRole("button", { name: "New session", exact: true }).click();
  await page.getByLabel("Client", { exact: true }).selectOption("__new");
  await page.getByLabel("Client name", { exact: true }).fill("İpek Şahin");
  await page.getByLabel("Private notes").fill("Private note never to share");
  await page
    .getByRole("button", { name: "Create session", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: /İpek Şahin, Pilates/ }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: /İpek Şahin, Pilates/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New session", exact: true }).click();
  await page
    .getByLabel("Client", { exact: true })
    .selectOption({ label: "İpek Şahin" });
  await expect(page.getByText("Overlaps the session at 09:00.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create session", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Start time").fill("11:00");
  await page
    .getByRole("button", { name: "Create session", exact: true })
    .click();
  await page
    .getByRole("button", { name: /İpek Şahin, Pilates, 11:00/ })
    .click();
  await page.getByLabel("Status", { exact: true }).selectOption("cancelled");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /İpek Şahin, Pilates, 11:00/ }),
  ).not.toBeVisible();
  expect(pageErrors).toEqual([]);
});
test("polished sample calendar, mobile layout, default PNG and PDF downloads", async ({
  page,
}, info) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await sample(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${info.outputDir}/calendar-desktop.png`,
    fullPage: true,
  });
  await share(page);
  const imageDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download schedule image" }).click();
  const image = await imageDownload;
  const path = await image.path();
  const metadata = await sharp(await readFile(path!)).metadata();
  expect(metadata.width).toBe(1080);
  expect(metadata.height).toBe(1350);
  await image.saveAs(`${info.outputDir}/schedule.png`);
  await page.screenshot({
    path: `${info.outputDir}/documents-desktop.png`,
    fullPage: true,
  });
  const previousPreview = await page
    .getByAltText("Generated document preview")
    .getAttribute("src");
  await page.getByRole("button", { name: "PDF document", exact: true }).click();
  await expect(
    page.getByAltText("Generated document preview"),
  ).not.toHaveAttribute("src", previousPreview!);
  await expect(page.getByAltText("Generated document preview")).toBeVisible({
    timeout: 45000,
  });
  const renderedPdf = Buffer.from(
    await page
      .getByAltText("Generated document preview")
      .evaluate(async (img: HTMLImageElement) =>
        Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer())),
      ),
  );
  await writeFile(`${info.outputDir}/pdf-render.png`, renderedPdf);
  const ink = async (bytes: Buffer) => {
    const { data } = await sharp(bytes)
      .extract({ left: 108, top: 216, width: 864, height: 162 })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let count = 0;
    for (let i = 0; i < data.length; i += 3)
      if (data[i] < 110 && data[i + 1] < 130) count++;
    return count;
  };
  const pngInk = await ink(await readFile(path!)),
    pdfInk = await ink(renderedPdf);
  expect(pdfInk / pngInk).toBeGreaterThan(0.8);
  expect(pdfInk / pngInk).toBeLessThan(1.2);
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const pdf = await pdfDownload;
  const parsed = await PDFDocument.load(await readFile((await pdf.path())!));
  expect(parsed.getPageCount()).toBe(1);
  expect(parsed.getPage(0).getWidth()).toBe(540);
  await pdf.saveAs(`${info.outputDir}/schedule.pdf`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `${info.outputDir}/documents-mobile.png`,
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
});
test("custom image background, drag mapping, saved template reuse and original dimensions", async ({
  page,
}, info) => {
  await sample(page);
  await share(page);
  await page
    .getByLabel("Use your own background")
    .setInputFiles(`${fixtureDir}/background.png`);
  const modal = page.getByRole("dialog");
  await expect(modal.getByText("Make it your own.")).toBeVisible();
  await modal.getByLabel("Template name").fill("WhatsApp PT card");
  await modal
    .getByLabel("Selected text")
    .selectOption({ label: "Schedule · Page 1" });
  await modal.getByLabel("Text color").fill("#354b3d");
  const field = modal.getByRole("button", { name: "Position Schedule" });
  await field.scrollIntoViewIfNeeded();
  const bounds = await field.boundingBox();
  await page.mouse.move(bounds!.x + 10, bounds!.y + 10);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 24, bounds!.y + 28);
  await page.mouse.up();
  await expect(modal.getByLabel("Left %")).not.toHaveValue("10");
  await modal.getByRole("button", { name: "Save template" }).click();
  await expect(page.getByAltText("Generated document preview")).toBeVisible();
  const result = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download schedule image" }).click();
  const output = await result;
  const metadata = await sharp(
    await readFile((await output.path())!),
  ).metadata();
  expect([metadata.width, metadata.height]).toEqual([1080, 1350]);
  await output.saveAs(`${info.outputDir}/custom-image.png`);
  await page.reload();
  await page
    .getByLabel("Saved template")
    .selectOption({ label: "WhatsApp PT card" });
  await expect(page.getByAltText("Generated document preview")).toBeVisible();
});
test("Excel-to-calendar mapping imports all reviewed rows", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Import Excel" }).click();
  await page
    .getByLabel("Drop your session spreadsheet")
    .setInputFiles(`${fixtureDir}/sessions.xlsx`);
  const modal = page.getByRole("dialog");
  for (const [label, column] of [
    ["Client *", "A"],
    ["Date *", "B"],
    ["Time *", "C"],
    ["Duration", "D"],
    ["Movement", "E"],
    ["Location", "F"],
  ])
    await modal.getByLabel(label, { exact: true }).selectOption(column);
  await expect(
    modal.getByText("2 spreadsheet rows · 2 ready to import · 2 new clients."),
  ).toBeVisible();
  await modal.getByRole("button", { name: "Import 2 sessions" }).click();
  await expect(
    page.getByRole("button", { name: /İpek Şahin, Pilates/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Özge Çelik, Mobility/ }),
  ).toBeVisible();
});
test("Excel document mappings and ZIP batch output retain Turkish text", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await page.getByRole("button", { name: "Excel", exact: true }).click();
  await page
    .getByLabel("Drop your spreadsheet here")
    .setInputFiles(`${fixtureDir}/sessions.xlsx`);
  await expect(page.getByText("2 records detected")).toBeVisible();
  await page.getByRole("button", { name: "Match column names" }).click();
  await expect(page.getByAltText("Generated document preview")).toBeVisible({
    timeout: 45000,
  });
  await page.getByText("All 2 records as a ZIP").click();
  await page.getByRole("button", { name: "Prepare documents" }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download ZIP" }).click();
  const zip = await downloaded;
  const JSZip = (await import("jszip")).default;
  const archive = await JSZip.loadAsync(await readFile((await zip.path())!));
  expect(
    Object.keys(archive.files).filter((n) => n.endsWith(".pdf")),
  ).toHaveLength(2);
  expect(archive.file("ERRORS.txt")).toBeNull();
});
test("multipage rotated PDF template previews and exports correctly", async ({
  page,
}, info) => {
  await sample(page);
  await share(page);
  await page
    .getByLabel("Use your own background")
    .setInputFiles(`${fixtureDir}/rotated.pdf`);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save template" })
    .click();
  await page.getByRole("button", { name: "PDF document", exact: true }).click();
  await expect(page.getByAltText("Generated document preview")).toBeVisible({
    timeout: 45000,
  });
  await page.getByLabel("Preview page").selectOption("1");
  await expect(page.getByAltText("Generated document preview")).toBeVisible();
  await page.screenshot({
    path: `${info.outputDir}/rotated-pdf-preview.png`,
    fullPage: true,
  });
  const result = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const out = await result;
  const pdf = await PDFDocument.load(await readFile((await out.path())!));
  expect(pdf.getPages().map((p) => [p.getWidth(), p.getHeight()])).toEqual([
    [595, 842],
    [842, 595],
    [595, 842],
    [842, 595],
  ]);
});
test("studio backup restores calendar and templates after clearing local data", async ({
  page,
}) => {
  await sample(page);
  await page
    .getByRole("button", { name: "Studio settings", exact: true })
    .click();
  const result = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export studio backup" }).click();
  const backup = await result;
  const file = await backup.path();
  await page
    .getByRole("button", { name: "Delete all local studio data" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete all data", exact: true })
    .click();
  await expect(page.getByText("Sample studio ·")).not.toBeVisible();
  await page.getByLabel("Restore backup", { exact: true }).setInputFiles(file!);
  await expect(
    page
      .getByRole("dialog")
      .getByText(/4 clients, 12 sessions, and 2 templates/),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Restore backup", exact: true })
    .click();
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Ada \(sample\), Pilates/ }).first(),
  ).toBeVisible();
});
test("weekly grid source and solid panels generate a reusable class schedule image", async ({
  page,
}, info) => {
  await open(page);
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await page.getByRole("button", { name: "Excel", exact: true }).click();
  await page
    .getByLabel("Drop your spreadsheet here")
    .setInputFiles(`${fixtureDir}/grid.xlsx`);
  await expect(page.getByText("2 records detected")).toBeVisible();
  await page
    .getByLabel("Use your own background")
    .setInputFiles(`${fixtureDir}/background.png`);
  const modal = page.getByRole("dialog");
  await modal.getByRole("button", { name: "Add text", exact: true }).click();
  await modal.getByLabel("Template name").fill("Class grid card");
  await modal.getByLabel("Text from").selectOption("scheduleBlock");
  await modal.getByLabel("Last row", { exact: true }).fill("6");
  await modal.getByLabel("Height %", { exact: true }).fill("40");
  await modal.getByLabel("Text panel background").selectOption("solid");
  await modal.getByLabel("Text color", { exact: true }).fill("#ffffff");
  await expect(
    modal.getByRole("button", { name: "Position Field 1" }),
  ).toContainText("09:00  CYCLE");
  await modal
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await page.getByRole("button", { name: "PNG image", exact: true }).click();
  await expect(page.getByAltText("Generated document preview")).toBeVisible();
  const result = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download schedule image" }).click();
  const output = await result;
  const bytes = await readFile((await output.path())!);
  const pixel = await sharp(bytes)
    .extract({ left: 110, top: 407, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  expect([...pixel]).toEqual([0, 0, 0]);
  await output.saveAs(`${info.outputDir}/grid-panel.png`);
  await page.reload();
  await page
    .getByLabel("Saved template")
    .selectOption({ label: "Class grid card" });
  await page.getByRole("button", { name: "Excel", exact: true }).click();
  await page
    .getByLabel("Drop your spreadsheet here")
    .setInputFiles(`${fixtureDir}/grid.xlsx`);
  await expect(page.getByAltText("Generated document preview")).toBeVisible();
});

test("production PWA relaunches and generates PNG and PDF entirely offline", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Service-worker offline emulation is validated in Chromium; WebKit downloads are covered separately.",
  );
  const external: string[] = [];
  page.on("request", (request) => {
    if (
      !request.url().startsWith("http://127.0.0.1") &&
      !request.url().startsWith("blob:") &&
      !request.url().startsWith("data:")
    )
      external.push(request.url());
  });
  await sample(page);
  await share(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByAltText("Generated document preview")).toBeVisible({
    timeout: 45000,
  });
  const pngResult = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download schedule image" }).click();
  expect((await pngResult).suggestedFilename()).toMatch(/\.png$/);
  await page.getByRole("button", { name: "PDF document", exact: true }).click();
  await expect(page.getByAltText("Generated document preview")).toBeVisible({
    timeout: 45000,
  });
  const pdfResult = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  expect((await pdfResult).suggestedFilename()).toMatch(/\.pdf$/);
  expect(external).toEqual([]);
});

test("main UA workflow creates cover and all three schedules from one workbook, online and offline", async ({
  page,
  context,
  browserName,
}, info) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Excel in. Schedules out." }),
  ).toBeVisible();
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "UA story", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("UA artwork & Gotham included")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download cover PNG", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Drop the UA weekly workbook here").setInputFiles({
    name: "UA_Weekly_Schedule_MASLAK, GÖKTÜRK & LIVE.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await readFile(`${fixtureDir}/ua-week.xlsx`),
  });
  await expect(
    page.getByAltText("MASLAK weekly schedule preview"),
  ).toBeVisible();
  const result = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download all as ZIP", exact: true })
    .click();
  const output = await result;
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await readFile((await output.path())!));
  await mkdir(info.outputDir, { recursive: true });
  expect(Object.keys(zip.files)).toEqual([
    "MASLAK-Weekly-Schedule.png",
    "GÖKTÜRK-Weekly-Schedule.png",
    "LIVE-Weekly-Schedule.png",
    "01-Cover.png",
  ]);
  for (const [name, file] of Object.entries(zip.files)) {
    const bytes = await file.async("nodebuffer");
    const dimensions = await sharp(bytes).metadata();
    expect([dimensions.width, dimensions.height]).toEqual([1080, 1920]);
    if (name === "MASLAK-Weekly-Schedule.png")
      await writeFile(`${info.outputDir}/ua-maslak.png`, bytes);
    if (name === "LIVE-Weekly-Schedule.png") {
      const { data, info: pixels } = await sharp(bytes)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const yellowEdge = (left: number, top: number, bottom: number) => {
        for (let y = top; y < bottom; y++) {
          let yellow = 0;
          for (let x = left; x < left + 120; x++) {
            const index = (y * pixels.width + x) * pixels.channels;
            if (
              data[index] === 215 &&
              data[index + 1] === 223 &&
              data[index + 2] === 32
            )
              yellow++;
          }
          if (yellow > 80) return y;
        }
        throw new Error("The day card outline could not be found.");
      };
      const firstRowBottom = yellowEdge(95, 620, 655);
      const fridayTop = yellowEdge(610, 655, 950);
      expect(fridayTop - firstRowBottom).toBeGreaterThan(30);
      expect(fridayTop - firstRowBottom).toBeLessThan(50);
      await writeFile(`${info.outputDir}/ua-live.png`, bytes);
    }
  }
  await page.getByRole("button", { name: "LIVE", exact: true }).click();
  await expect(page.locator(".ua-page")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: `${info.outputDir}/ua-desktop.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Studio tools", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your week, in balance." }),
  ).toBeVisible();
  await expect(page.locator(".studio-page")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: `${info.outputDir}/studio-revealed.png`,
    fullPage: true,
    animations: "disabled",
  });
  for (const label of [
    "Calendar",
    "Clients",
    "Documents",
    "Templates",
    "Studio settings",
  ])
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toBeVisible();
  await page.getByRole("button", { name: "Clients", exact: true }).click();
  await page.getByRole("button", { name: "UA story", exact: true }).click();
  await expect(page.getByAltText("LIVE weekly schedule preview")).toBeVisible();
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await page.getByRole("button", { name: "Studio tools", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Clients", exact: true }),
  ).toHaveClass(/active/);
  await page.getByRole("button", { name: "UA story", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".ua-page")).toHaveCSS("animation-name", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const directImages = [
    ["Download cover PNG", "01-Cover.png"],
    ["Download MASLAK PNG", "MASLAK-Weekly-Schedule.png"],
    ["Download GÖKTÜRK PNG", "GÖKTÜRK-Weekly-Schedule.png"],
    ["Download LIVE PNG", "LIVE-Weekly-Schedule.png"],
  ];
  for (const [label, filename] of directImages) {
    const result = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const image = await result;
    expect(image.suggestedFilename()).toBe(filename);
    const bytes = await readFile((await image.path())!);
    expect(bytes.equals(await zip.file(filename)!.async("nodebuffer"))).toBe(
      true,
    );
  }
  await page.screenshot({
    path: `${info.outputDir}/ua-mobile.png`,
    fullPage: true,
    animations: "disabled",
  });
  if (browserName === "chromium") {
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await context.setOffline(true);
    await page.reload();
    await page.getByLabel("Drop the UA weekly workbook here").setInputFiles({
      name: "UA_Weekly_Schedule_MASLAK, GÖKTÜRK & LIVE.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: await readFile(`${fixtureDir}/ua-week.xlsx`),
    });
    await expect(
      page.getByAltText("MASLAK weekly schedule preview"),
    ).toBeVisible();
    const offline = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download all as ZIP", exact: true })
      .click();
    expect((await offline).suggestedFilename()).toBe("UA-Weekly-Schedules.zip");
    const image = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download cover PNG", exact: true })
      .click();
    expect((await image).suggestedFilename()).toBe("01-Cover.png");
  }
  await page
    .getByRole("button", { name: "Clear weekly workbook", exact: true })
    .click();
  for (const [label] of directImages)
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toBeDisabled();
});
