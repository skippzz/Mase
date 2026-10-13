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
  await page.goto("./");
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
  await page.locator('input[type="file"]').setInputFiles(file!);
  await expect(
    page
      .getByRole("dialog")
      .getByText(/4 clients, 12 sessions, and 2 templates/),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Restore backup", exact: true })
    .click();
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Ada \(sample\), Pilates/ }).first(),
  ).toBeVisible();
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
