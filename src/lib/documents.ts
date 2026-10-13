import { PDFDocument, PDFTextField, degrees, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { ResolveContext, ResolvedField, TemplateProfile } from "../types";
import { checkFile } from "./spreadsheet";
import { fieldBox, layoutText, pdfTextPosition, rotatedPage } from "./layout";
import { resolveProfile, safeFilename, uniqueFilename } from "./mapping";
import { makeField } from "./profiles";

let pdfModule:
  Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | undefined;
async function pdfjs() {
  pdfModule ??= import("pdfjs-dist/legacy/build/pdf.mjs").then(async (lib) => {
    const worker =
      await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return pdfModule;
}
async function openPdf(bytes: Uint8Array) {
  const lib = await pdfjs();
  return lib.getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    standardFontDataUrl: `${import.meta.env.BASE_URL}pdf-fonts/`,
    cMapUrl: `${import.meta.env.BASE_URL}cmaps/`,
    cMapPacked: true,
  }).promise;
}
export async function renderPdf(
  bytes: Uint8Array,
  pageIndex = 0,
  maxWidth = 1080,
) {
  const doc = await openPdf(bytes);
  try {
    const page = await doc.getPage(pageIndex + 1);
    const natural = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: Math.min(2, maxWidth / natural.width),
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport })
      .promise;
    return canvas;
  } finally {
    await doc.destroy();
  }
}
export async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(
          new Error("This image could not be opened. Choose a PNG or JPEG."),
        );
      image.src = url;
    });
    if (
      image.naturalWidth > 12000 ||
      image.naturalHeight > 12000 ||
      image.naturalWidth * image.naturalHeight > 24_000_000
    )
      throw new Error(
        "Use an image below 24 megapixels and 12,000 pixels per side.",
      );
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function importTemplate(file: File): Promise<TemplateProfile> {
  checkFile(file, "Template");
  const profile: TemplateProfile = {
    version: 1,
    id: crypto.randomUUID(),
    name: file.name.replace(/\.[^.]+$/, ""),
    type: "image",
    asset: file,
    assetName: file.name,
    pages: [],
    fields: [],
    filename: "{Client}-{row}",
    createdAt: new Date().toISOString(),
  };
  if (/\.pdf$/i.test(file.name)) {
    profile.type = "pdf";
    let doc: PDFDocument;
    try {
      doc = await PDFDocument.load(await file.arrayBuffer());
    } catch {
      throw new Error("Choose a readable, unencrypted PDF.");
    }
    if (doc.getPageCount() > 50)
      throw new Error("Use a PDF with no more than 50 pages.");
    profile.pages = doc.getPages().map((page) => {
      const crop = page.getCropBox();
      const size = rotatedPage(
        crop.width,
        crop.height,
        page.getRotation().angle,
      );
      if (size.width > 12000 || size.height > 12000)
        throw new Error("This PDF has an unsupported page size.");
      return {
        width: size.width,
        height: size.height,
        rotation: page.getRotation().angle,
      };
    });
    // AcroForm text fields become editable overlays with their existing identifiers.
    // Blank and flatten the original form on export to avoid duplicate text appearances.
    for (const field of doc.getForm().getFields()) {
      if (!(field instanceof PDFTextField)) continue;
      for (const [i, widget] of field.acroField.getWidgets().entries()) {
        const pageIndex = doc.getPages().findIndex((p) => p.ref === widget.P());
        if (pageIndex < 0) continue;
        const page = doc.getPage(pageIndex),
          crop = page.getCropBox(),
          rect = widget.getRectangle();
        const normalized = rotatedPage(
          crop.width,
          crop.height,
          page.getRotation().angle,
        );
        const angle = (normalized.degrees * Math.PI) / 180;
        const points = [
          [rect.x, rect.y],
          [rect.x + rect.width, rect.y + rect.height],
        ].map(([x, y]) => ({
          x:
            normalized.x +
            (x - crop.x) * Math.cos(angle) -
            (y - crop.y) * Math.sin(angle),
          y:
            normalized.y +
            (x - crop.x) * Math.sin(angle) +
            (y - crop.y) * Math.cos(angle),
        }));
        const x = Math.max(
          0,
          Math.min(...points.map((p) => p.x)) / normalized.width,
        );
        const y = Math.max(
          0,
          1 - Math.max(...points.map((p) => p.y)) / normalized.height,
        );
        profile.fields.push(
          makeField({
            id: `${field.getName()}-${i}`,
            label: field.getName(),
            page: pageIndex,
            x,
            y,
            width: Math.min(
              1 - x,
              Math.max(
                0.02,
                Math.abs(points[1].x - points[0].x) / normalized.width,
              ),
            ),
            height: Math.min(
              1 - y,
              Math.max(
                0.025,
                Math.abs(points[1].y - points[0].y) / normalized.height,
              ),
            ),
            source: { kind: "text", text: field.getText() || "" },
            overflow: "shrink",
          }),
        );
      }
    }
  } else if (/\.(png|jpe?g)$/i.test(file.name)) {
    const image = await loadImage(file);
    profile.pages = [
      { width: image.naturalWidth, height: image.naturalHeight, rotation: 0 },
    ];
  } else throw new Error("Choose a PDF, PNG, or JPEG template.");
  return profile;
}
export async function backgroundCanvas(
  profile: TemplateProfile,
  pageIndex = 0,
) {
  const size = profile.pages[pageIndex];
  if (!size) throw new Error("The selected template page is missing.");
  if (profile.type === "pdf") {
    if (!profile.asset) throw new Error("The template background is missing.");
    const doc = await PDFDocument.load(await profile.asset.arrayBuffer());
    for (const f of doc.getForm().getFields())
      if (f instanceof PDFTextField) f.setText("");
    doc.getForm().flatten();
    return renderPdf(await doc.save(), pageIndex);
  }
  const canvas = document.createElement("canvas");
  const scale = 1;
  canvas.width = Math.round(size.width * scale);
  canvas.height = Math.round(size.height * scale);
  const ctx = canvas.getContext("2d")!;
  if (profile.type === "image") {
    if (!profile.asset) throw new Error("The template background is missing.");
    ctx.drawImage(
      await loadImage(profile.asset),
      0,
      0,
      canvas.width,
      canvas.height,
    );
  } else
    drawBuiltin(ctx, canvas.width, canvas.height, profile.design || "schedule");
  return canvas;
}
function drawBuiltin(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  design: "session" | "schedule",
) {
  ctx.fillStyle = "#f7f4ed";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#354b3d";
  ctx.fillRect(w * 0.035, h * 0.028, 3, h * 0.944);
  ctx.strokeStyle = "#d7d6c9";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.1, h * 0.375);
  ctx.lineTo(w * 0.9, h * 0.375);
  ctx.stroke();
  ctx.strokeStyle = "#c7cdbd";
  ctx.lineWidth = w / 400;
  ctx.beginPath();
  ctx.ellipse(w * 0.95, h * 0.08, w * 0.19, h * 0.22, -0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(w * 0.96, h * 0.08, w * 0.16, h * 0.19, -0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#818776";
  ctx.font = `${w * 0.016}px Lato`;
  ctx.textBaseline = "top";
  ctx.fillText("A LITTLE TIME, JUST FOR YOU.", w * 0.1, h * 0.93);
  if (design === "session") {
    ctx.fillText("MASE  /  PRIVATE TRAINING", w * 0.1, h * 0.085);
    ctx.fillStyle = "#354b3d";
    ctx.font = `${w * 0.067}px CormorantPdf`;
    ctx.fillText("Your session, considered.", w * 0.1, h * 0.16);
    ctx.font = `${w * 0.017}px Lato`;
    ctx.fillStyle = "#818776";
    for (const [text, x, y] of [
      ["MOVEMENT", 0.1, 0.39],
      ["DATE", 0.1, 0.5],
      ["TIME", 0.55, 0.5],
      ["LOCATION", 0.1, 0.61],
      ["A NOTE FOR YOU", 0.1, 0.73],
    ] as [string, number, number][])
      ctx.fillText(text, w * x, h * y);
  }
}
let fontsReady: Promise<unknown> | undefined;
export function canvasFonts() {
  fontsReady ??= Promise.all([
    new FontFace(
      "Lato",
      `url(${import.meta.env.BASE_URL}fonts/Lato-Regular.ttf)`,
    ).load(),
    new FontFace(
      "CormorantPdf",
      `url(${import.meta.env.BASE_URL}fonts/CormorantGaramond.otf)`,
    ).load(),
  ]).then((fonts) => {
    fonts.forEach((font) => document.fonts.add(font));
  });
  return fontsReady;
}
export async function generateImage(
  profile: TemplateProfile,
  context: ResolveContext,
  pageIndex = 0,
) {
  await canvasFonts();
  const canvas = await backgroundCanvas(profile, pageIndex),
    ctx = canvas.getContext("2d")!;
  const warnings: string[] = [];
  for (const { field, text } of resolveProfile(profile, context).filter(
    (f) => f.field.page === pageIndex,
  )) {
    const box = fieldBox(field, canvas.width, canvas.height);
    const family = field.fontFamily === "Serif" ? "CormorantPdf" : "Lato";
    const measure = (s: string, size: number) => {
      ctx.font = `${size}px ${family}`;
      return ctx.measureText(s).width;
    };
    let layout;
    try {
      layout = layoutText(
        text,
        box.width,
        box.height,
        box.fontSize,
        field.overflow,
        measure,
      );
    } catch (e) {
      throw new Error(`“${field.label}”: ${(e as Error).message}`);
    }
    if (layout.warning) warnings.push(`${field.label}: ${layout.warning}`);
    ctx.font = `${layout.fontSize}px ${family}`;
    ctx.fillStyle = field.color;
    ctx.textBaseline = "alphabetic";
    layout.lines.forEach((line, i) => {
      const width = measure(line, layout.fontSize);
      const x =
        box.x +
        (field.align === "center"
          ? (box.width - width) / 2
          : field.align === "right"
            ? box.width - width
            : 0);
      ctx.fillText(line, x, box.top + layout.fontSize + i * layout.lineHeight);
    });
  }
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("The image could not be generated.")),
      "image/png",
    ),
  );
  return { blob, warnings, width: canvas.width, height: canvas.height };
}
const fontBytes = new Map<string, Promise<Uint8Array>>();
async function getFont(family: string) {
  if (!fontBytes.has(family))
    fontBytes.set(
      family,
      fetch(
        `${import.meta.env.BASE_URL}fonts/${family === "Serif" ? "CormorantGaramond.otf" : "Lato-Regular.ttf"}`,
      ).then(async (r) => {
        if (!r.ok)
          throw new Error(
            "The document font is unavailable. Open the app online once before using it offline.",
          );
        return new Uint8Array(await r.arrayBuffer());
      }),
    );
  return fontBytes.get(family)!;
}
export async function generatePdf(
  profile: TemplateProfile,
  context: ResolveContext,
  providedFonts?: { sans: Uint8Array; serif: Uint8Array },
) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const sans = await doc.embedFont(
    providedFonts?.sans || (await getFont("Lato")),
    { subset: true },
  );
  // Fontkit's CFF subset encoder corrupts this font. Embed its complete, static
  // font program so every glyph renders consistently in PDF.js and PDF readers.
  const serif = await doc.embedFont(
    providedFonts?.serif || (await getFont("Serif")),
    { subset: false },
  );
  const fields = resolveProfile(profile, context),
    warnings: string[] = [];
  let source: PDFDocument | undefined;
  if (profile.type === "pdf") {
    if (!profile.asset) throw new Error("Template background is missing.");
    source = await PDFDocument.load(await profile.asset.arrayBuffer());
    for (const f of source.getForm().getFields())
      if (f instanceof PDFTextField) f.setText("");
    source.getForm().updateFieldAppearances(sans);
    source.getForm().flatten({ updateFieldAppearances: false });
  }
  for (let index = 0; index < profile.pages.length; index++) {
    const size = profile.pages[index];
    // Image pixels become PDF points at 144dpi; normalize both against the same canvas.
    const scale =
      profile.type === "image" || profile.design === "schedule" ? 0.5 : 1;
    const page = doc.addPage([size.width * scale, size.height * scale]);
    const { width, height } = page.getSize();
    if (source) {
      const original = source.getPage(index),
        crop = original.getCropBox();
      const embedded = await doc.embedPage(original, {
        left: crop.x,
        bottom: crop.y,
        right: crop.x + crop.width,
        top: crop.y + crop.height,
      });
      const transform = rotatedPage(
        crop.width,
        crop.height,
        original.getRotation().angle,
      );
      page.drawPage(embedded, {
        x: transform.x,
        y: transform.y,
        rotate: degrees(transform.degrees),
      });
    } else {
      await canvasFonts();
      const background = await backgroundCanvas(profile, index);
      const image = await doc.embedPng(background.toDataURL("image/png"));
      page.drawImage(image, { x: 0, y: 0, width, height });
    }
    for (const { field, text } of fields.filter(
      (f) => f.field.page === index,
    )) {
      const box = fieldBox(field, width, height),
        font = field.fontFamily === "Serif" ? serif : sans;
      let layout;
      try {
        const characters = new Set(font.getCharacterSet());
        for (const character of text)
          if (character !== "\n" && !characters.has(character.codePointAt(0)!))
            throw new Error(
              `The font cannot render “${character}”. Use supported characters or another font.`,
            );
        layout = layoutText(
          text,
          box.width,
          box.height,
          box.fontSize,
          field.overflow,
          (s, z) => font.widthOfTextAtSize(s, z),
        );
      } catch (e) {
        throw new Error(`“${field.label}”: ${(e as Error).message}`);
      }
      if (layout.warning) warnings.push(`${field.label}: ${layout.warning}`);
      const color = field.color
        .match(/[a-f\d]{2}/gi)!
        .map((n) => parseInt(n, 16) / 255);
      layout.lines.forEach((line, lineIndex) => {
        const textWidth = font.widthOfTextAtSize(line, layout.fontSize);
        const x =
          box.x +
          (field.align === "center"
            ? (box.width - textWidth) / 2
            : field.align === "right"
              ? box.width - textWidth
              : 0);
        const position = pdfTextPosition(
          x,
          box.top + lineIndex * layout.lineHeight,
          layout.fontSize,
          height,
        );
        page.drawText(line, {
          ...position,
          font,
          size: layout.fontSize,
          color: rgb(color[0], color[1], color[2]),
        });
      });
    }
  }
  doc.setTitle(profile.name);
  doc.setCreator("Mase Studio");
  return { bytes: await doc.save(), warnings };
}
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export async function generateBatch(
  profile: TemplateProfile,
  contexts: { context: ResolveContext; row: number }[],
  format: "pdf" | "png",
  progress: (done: number, total: number) => void,
) {
  if (contexts.length > 200)
    throw new Error(
      "Generate up to 200 records per batch. Split larger workbooks.",
    );
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip(),
    used = new Set<string>(),
    errors: string[] = [],
    warnings: string[] = [];
  let count = 0;
  for (let i = 0; i < contexts.length; i++) {
    const { context, row } = contexts[i];
    try {
      const resolved: ResolvedField[] = resolveProfile(profile, context);
      const name = safeFilename(profile.filename, resolved, row);
      if (format === "pdf") {
        const output = await generatePdf(profile, context);
        zip.file(uniqueFilename(name, "pdf", used), output.bytes);
        warnings.push(...output.warnings.map((w) => `Row ${row}: ${w}`));
      } else {
        for (let page = 0; page < profile.pages.length; page++) {
          const output = await generateImage(profile, context, page);
          zip.file(
            uniqueFilename(
              profile.pages.length > 1 ? `${name}-page-${page + 1}` : name,
              "png",
              used,
            ),
            await output.blob.arrayBuffer(),
          );
          warnings.push(...output.warnings.map((w) => `Row ${row}: ${w}`));
        }
      }
      count++;
    } catch (e) {
      errors.push(`Row ${row}: ${(e as Error).message}`);
    }
    progress(i + 1, contexts.length);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (errors.length) zip.file("ERRORS.txt", errors.join("\n"));
  if (warnings.length) zip.file("WARNINGS.txt", warnings.join("\n"));
  if (!count)
    throw new Error(
      `No documents generated. ${errors[0] || "Choose records first."}`,
    );
  return {
    blob: await zip.generateAsync({ type: "blob", compression: "DEFLATE" }),
    errors,
    warnings,
    count,
  };
}
