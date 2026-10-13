import { canvasFonts, loadImage } from "./documents";
import { bundledGotham } from "../generated/uaFonts";
import { openDB } from "idb";
import fontkit from "@pdf-lib/fontkit";
import {
  trainerDisplay,
  type ClassDay,
  type ClassSession,
  type LocationSchedule,
} from "./uaSchedule";

export type FontRole = "regular" | "bold" | "black" | "italic";
export type UaFonts = Partial<Record<FontRole, ArrayBuffer>>;
export interface UaFontStatus {
  complete: boolean;
  roles: FontRole[];
}
export interface ScheduleImage {
  location: string;
  blob: Blob;
  count: number;
  filename: string;
  audit: string[];
}
const fontNames: Record<FontRole, string> = {
  regular: "UaBook",
  bold: "UaBold",
  black: "UaBlack",
  italic: "UaItalic",
};
let activeFonts: UaFontStatus = { complete: false, roles: [] };
const characterSets = new Map<FontRole, Set<number>>();
function inspectFont(bytes: ArrayBuffer, role: FontRole) {
  const font = fontkit.create(new Uint8Array(bytes));
  if (!/gotham/i.test(font.familyName || ""))
    throw new Error(
      `The ${role} file is not a Gotham font. Select the matching Gotham face.`,
    );
  return new Set(font.characterSet);
}
const storage = () => openDB("mase-studio", 1);
export async function loadUaFonts(): Promise<UaFontStatus> {
  await canvasFonts();
  const db = await storage();
  const custom = ((await db.get("data", "ua-fonts")) || {}) as UaFonts;
  const roles: FontRole[] = [];
  for (const role of ["regular", "bold", "black", "italic"] as const) {
    const source =
      custom[role] ||
      (bundledGotham[role]
        ? `url(${import.meta.env.BASE_URL}${bundledGotham[role]})`
        : undefined);
    if (!source) continue;
    const bytes =
      custom[role] ||
      (await fetch(`${import.meta.env.BASE_URL}${bundledGotham[role]}`).then(
        async (response) => {
          if (!response.ok)
            throw new Error("A bundled Gotham font is unavailable.");
          return response.arrayBuffer();
        },
      ));
    if (!bytes) throw new Error(`The Gotham ${role} font could not be loaded.`);
    const charset = inspectFont(bytes, role);
    const face = await new FontFace(fontNames[role], bytes).load();
    document.fonts.forEach((existing) => {
      if (existing.family === fontNames[role]) document.fonts.delete(existing);
    });
    document.fonts.add(face);
    characterSets.set(role, charset);
    roles.push(role);
  }
  activeFonts = { complete: roles.length === 4, roles };
  return activeFonts;
}
export async function storeUaFonts(fonts: UaFonts) {
  for (const [role, buffer] of Object.entries(fonts)) {
    inspectFont(buffer, role as FontRole);
    await new FontFace(`UaValidate-${role}`, buffer).load();
  }
  const db = await storage(),
    previous = ((await db.get("data", "ua-fonts")) || {}) as UaFonts;
  await db.put("data", { ...previous, ...fonts }, "ua-fonts");
  return loadUaFonts();
}
let background: Promise<Blob> | undefined;
async function getBackground() {
  background ??= fetch(`${import.meta.env.BASE_URL}ua/background.png`).then(
    async (r) => {
      if (!r.ok)
        throw new Error(
          "The UA background could not be loaded. Open the app online once.",
        );
      return r.blob();
    },
  );
  return background;
}
const YELLOW = "#d7df20";
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  role: FontRole,
) {
  if (activeFonts.roles.includes(role)) {
    const set = characterSets.get(role)!;
    for (const character of value)
      if (!set.has(character.codePointAt(0)!))
        throw new Error(
          `The Gotham ${role} font cannot render “${character}”. Select a Gotham font with Turkish character support in Brand style.`,
        );
  }
  ctx.fillText(value, x, y);
}
function font(ctx: CanvasRenderingContext2D, role: FontRole, size: number) {
  ctx.font = `${activeFonts.roles.includes(role) ? "" : role === "italic" ? "italic 700 " : role === "black" || role === "bold" ? "700 " : ""}${size}px ${activeFonts.roles.includes(role) ? fontNames[role] : "Lato"}`;
}
function splitTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.toUpperCase().split(/\s+/)) {
    if (ctx.measureText(line ? `${line} ${word}` : word).width <= width)
      line = line ? `${line} ${word}` : word;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > 2 || lines.some((s) => ctx.measureText(s).width > width))
    throw new Error(
      `Class name “${text}” does not fit at a readable size. Shorten the class label in Excel.`,
    );
  return lines;
}
function dayHeight(day: ClassDay, rowHeight: number) {
  const groups = new Set(day.sessions.map((s) => s.group)).size;
  return (
    96 +
    Math.max(1, day.sessions.length) * rowHeight +
    Math.max(0, groups - 1) * 12
  );
}
function drawDay(
  ctx: CanvasRenderingContext2D,
  day: ClassDay,
  x: number,
  y: number,
  rowHeight: number,
) {
  const w = 245,
    h = dayHeight(day, rowHeight);
  ctx.strokeStyle = YELLOW;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 43);
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fill();
  ctx.stroke();
  font(ctx, "black", 27);
  ctx.fillStyle = YELLOW;
  ctx.textAlign = "center";
  text(ctx, day.label, x + w / 2, y + 49, "black");
  ctx.textAlign = "left";
  if (!day.sessions.length) {
    font(ctx, "regular", 18);
    ctx.fillStyle = "#ffffff";
    text(ctx, "No classes", x + 18, y + 98, "regular");
    return;
  }
  let baseline = y + 93,
    previous = day.sessions[0].group;
  for (const session of day.sessions) {
    if (session.group !== previous) {
      ctx.strokeStyle = YELLOW;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 17, baseline - 14);
      ctx.lineTo(x + w - 17, baseline - 14);
      ctx.stroke();
      baseline += 12;
      previous = session.group;
    }
    ctx.fillStyle = "#ffffff";
    font(ctx, "regular", 20);
    text(ctx, session.time, x + 17, baseline, "regular");
    font(ctx, "bold", 19);
    text(ctx, "-", x + 94, baseline, "bold");
    const lines = splitTitle(ctx, session.title, w - 122);
    lines.forEach((line, i) =>
      text(ctx, line, x + 116, baseline + i * 18, "bold"),
    );
    let nameSize = 13.5;
    font(ctx, "italic", nameSize);
    const name = `W/ ${trainerDisplay(session.trainer)}`;
    while (ctx.measureText(name).width > w - 34 && nameSize > 11)
      font(ctx, "italic", (nameSize -= 0.25));
    if (ctx.measureText(name).width > w - 34)
      throw new Error(
        `Trainer name “${session.trainer}” is too long for this card. Use a shorter display name in Excel.`,
      );
    text(ctx, name, x + 17, baseline + 18, "italic");
    if (session.extra) {
      font(ctx, "regular", 9);
      const theme = session.extra.toUpperCase();
      if (ctx.measureText(theme).width > w - 122)
        throw new Error(
          `Theme “${session.extra}” does not fit. Shorten the theme in Excel.`,
        );
      text(
        ctx,
        theme,
        x + 116,
        baseline + (lines.length > 1 ? 34 : 20),
        "regular",
      );
    }
    baseline += rowHeight;
  }
}
export async function renderUaSchedule(
  schedule: LocationSchedule,
): Promise<ScheduleImage> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(await loadImage(await getBackground()), 0, 0, 1080, 1920);
  ctx.fillStyle = YELLOW;
  ctx.textAlign = "center";
  font(ctx, "black", 60);
  text(ctx, schedule.location, 793, 295, "black");
  ctx.textAlign = "left";
  const firstTop = schedule.location === "MASLAK" ? 394 : 486;
  const lastTop = schedule.location === "MASLAK" ? 1137 : 1090;
  const first = schedule.days.filter((d) => d.day < 4),
    last = schedule.days.filter((d) => d.day >= 4);
  const maxFirst = Math.max(1, ...first.map((d) => d.sessions.length));
  const rowHeight = Math.min(
    55,
    Math.floor((lastTop - firstTop - 45 - 108) / maxFirst),
  );
  if (rowHeight < 44)
    throw new Error(
      `${schedule.location} has too many classes for one readable image. Split the week across separate workbook exports.`,
    );
  for (const day of first)
    drawDay(ctx, day, 35 + day.day * 256.5, firstTop, rowHeight);
  for (const day of last) {
    const x =
      schedule.location === "LIVE" && last.length === 1
        ? 548
        : 35 + (day.day - 4) * 256.5;
    if (lastTop + dayHeight(day, 55) > 1670)
      throw new Error(
        `${schedule.location} ${day.label} has too many classes to fit above the logo.`,
      );
    drawDay(ctx, day, x, lastTop, 55);
  }
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(new Error("The schedule image could not be generated.")),
      "image/png",
    ),
  );
  return {
    location: schedule.location,
    blob,
    count: schedule.count,
    filename: `${schedule.location}-Weekly-Schedule.png`,
    audit: schedule.days.flatMap((d) =>
      d.sessions.map(
        (s) =>
          `${d.label}\t${s.time}\t${s.trainer}\t${s.title}\t${s.extra}\t${s.source}`,
      ),
    ),
  };
}
