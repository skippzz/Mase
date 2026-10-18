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
  oblique = false,
) {
  if (activeFonts.roles.includes(role)) {
    const set = characterSets.get(role)!;
    for (const character of value)
      if (!set.has(character.codePointAt(0)!))
        throw new Error(
          `The Gotham ${role} font cannot render “${character}”. Select a Gotham font with Turkish character support in Brand style.`,
        );
  }
  if (oblique) {
    ctx.save();
    ctx.translate(x, y);
    ctx.transform(1, 0, -Math.tan((12 * Math.PI) / 180), 1, 0, 0);
    ctx.fillText(value, 0, 0);
    ctx.restore();
  } else ctx.fillText(value, x, y);
}
function font(ctx: CanvasRenderingContext2D, role: FontRole, size: number) {
  ctx.font = `${activeFonts.roles.includes(role) ? "" : role === "italic" ? "italic 700 " : role === "black" || role === "bold" ? "700 " : ""}${size}px ${activeFonts.roles.includes(role) ? fontNames[role] : "Lato"}`;
}
function trainerFont(
  ctx: CanvasRenderingContext2D,
  name: string,
  size: number,
) {
  const oblique =
    activeFonts.roles.includes("italic") &&
    [...name].some(
      (character) =>
        !characterSets.get("italic")!.has(character.codePointAt(0)!),
    ) &&
    activeFonts.roles.includes("bold");
  font(ctx, oblique ? "bold" : "italic", size);
  return oblique;
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
function sessionLayout(
  ctx: CanvasRenderingContext2D,
  session: ClassSession,
  rowHeight: number,
) {
  const theme = session.extra.toUpperCase();
  font(ctx, "bold", 19);
  const titleLines = splitTitle(ctx, session.title, 123);
  font(ctx, "regular", 9);
  if (!theme || ctx.measureText(theme).width <= 123)
    return {
      titleLines, themeLines: theme ? [theme] : [], themeSize: 9,
      themeX: 116, themeY: titleLines.length > 1 ? 34 : 20,
      height: rowHeight,
    };
  font(ctx, "regular", 11);
  const themeLines: string[] = [];
  let line = "";
  for (const word of theme.split(/\s+/)) {
    if (line && ctx.measureText(`${line} ${word}`).width > 211) {
      themeLines.push(line);
      line = "";
    }
    for (const character of (line ? ` ${word}` : word)) {
      if (line && ctx.measureText(line + character).width > 211) {
        themeLines.push(line);
        line = "";
      }
      line += character;
    }
  }
  if (line) themeLines.push(line);
  const themeY = titleLines.length > 1 ? 46 : 34;
  return {
    titleLines, themeLines, themeSize: 11, themeX: 17, themeY,
    height: Math.max(rowHeight, themeY + (themeLines.length - 1) * 13 + 22),
  };
}
function dayHeight(ctx: CanvasRenderingContext2D, day: ClassDay, rowHeight: number) {
  const groups = new Set(day.sessions.map((s) => s.group)).size;
  return (
    96 +
    (day.sessions.length
      ? day.sessions.reduce((sum, session) => sum + sessionLayout(ctx, session, rowHeight).height, 0)
      : rowHeight) +
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
    h = dayHeight(ctx, day, rowHeight);
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
    const layout = sessionLayout(ctx, session, rowHeight);
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
    const lines = layout.titleLines;
    lines.forEach((line, i) =>
      text(ctx, line, x + 116, baseline + i * 18, "bold"),
    );
    let nameSize = 13.5;
    const name = `W/ ${trainerDisplay(session.trainer)}`;
    const oblique = trainerFont(ctx, name, nameSize);
    while (ctx.measureText(name).width > w - 34 && nameSize > 11)
      trainerFont(ctx, name, (nameSize -= 0.25));
    if (ctx.measureText(name).width > w - 34)
      throw new Error(
        `Trainer name “${session.trainer}” is too long for this card. Use a shorter display name in Excel.`,
      );
    text(
      ctx,
      name,
      x + 17,
      baseline + 18,
      oblique ? "bold" : "italic",
      oblique,
    );
    if (session.extra) {
      font(ctx, "regular", layout.themeSize);
      layout.themeLines.forEach((theme, index) => text(
        ctx,
        theme,
        x + layout.themeX,
        baseline + layout.themeY + index * 13,
        "regular",
      ));
    }
    baseline += layout.height;
  }
}
function liveDayHeight(day: ClassDay) {
  return 140 + Math.max(0, day.sessions.length - 1) * 64;
}
function drawLiveDay(
  ctx: CanvasRenderingContext2D,
  day: ClassDay,
  y: number,
  scale: number,
) {
  const x = 317,
    width = 446,
    height = liveDayHeight(day) * scale;
  ctx.strokeStyle = YELLOW;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 40 * scale);
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = YELLOW;
  ctx.textAlign = "center";
  font(ctx, "black", 27 * scale);
  text(ctx, day.label, x + width / 2, y + 50 * scale, "black");
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  if (!day.sessions.length) {
    font(ctx, "regular", 20 * scale);
    text(ctx, "No classes", x + 30, y + 93 * scale, "regular");
    return;
  }
  const spacing = (day.sessions.length === 2 ? 55 : 64) * scale;
  day.sessions.forEach((session, index) => {
    const baseline = y + 93 * scale + index * spacing;
    ctx.textAlign = "left";
    font(ctx, "regular", 20 * scale);
    text(ctx, session.time, x + 30, baseline, "regular");
    text(ctx, "-", x + 141, baseline, "regular");
    font(ctx, "bold", 19 * scale);
    const lines = splitTitle(ctx, session.title, 136);
    ctx.textAlign = "center";
    lines.forEach((line, lineIndex) =>
      text(ctx, line, x + 228, baseline + lineIndex * 18 * scale, "bold"),
    );
    ctx.textAlign = "left";
    if (session.extra) {
      const duration = session.extra.replace(/\s*MIN$/i, "dk");
      font(ctx, "regular", 20 * scale);
      if (ctx.measureText(duration).width > 88)
        throw new Error(
          `LIVE duration “${session.extra}” does not fit in its column.`,
        );
      text(ctx, "-", x + 302, baseline, "regular");
      text(ctx, duration, x + 342, baseline, "regular");
    }
    const name = `W/ ${trainerDisplay(session.trainer)}`;
    let nameSize = 13.5 * scale;
    const oblique = trainerFont(ctx, name, nameSize);
    while (ctx.measureText(name).width > 110 && nameSize > 11 * scale)
      trainerFont(ctx, name, (nameSize -= 0.25 * scale));
    if (ctx.measureText(name).width > 110)
      throw new Error(
        `Trainer name “${session.trainer}” is too long for the LIVE time column. Use a shorter display name in Excel.`,
      );
    text(
      ctx,
      name,
      x + 30,
      baseline + 18 * scale,
      oblique ? "bold" : "italic",
      oblique,
    );
  });
}
function drawLiveSchedule(
  ctx: CanvasRenderingContext2D,
  schedule: LocationSchedule,
) {
  const days = [...schedule.days].sort((a, b) => a.day - b.day);
  const gap = 16,
    top = 439,
    bottom = 1660;
  const total = days.reduce((sum, day) => sum + liveDayHeight(day), 0);
  const scale = Math.min(
    1,
    (bottom - top - gap * Math.max(0, days.length - 1)) / total,
  );
  if (!days.length || scale < 0.8)
    throw new Error(
      "LIVE has too many classes for one readable story. Split the week across separate workbook exports.",
    );
  let y = top;
  for (const day of days) {
    drawLiveDay(ctx, day, y, scale);
    y += liveDayHeight(day) * scale + gap;
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
  if (schedule.location === "LIVE") {
    drawLiveSchedule(ctx, schedule);
  } else {
    const firstTop = schedule.location === "MASLAK" ? 394 : 486;
    const first = schedule.days.filter((d) => d.day < 4),
      last = schedule.days.filter((d) => d.day >= 4);
    const rowGap = 40;
    const tallest = (days: ClassDay[], size: number) =>
      days.length ? Math.max(...days.map((day) => dayHeight(ctx, day, size))) : 0;
    let rowHeight = 55;
    while (
      rowHeight >= 44 &&
      firstTop +
        tallest(first, rowHeight) +
        (first.length && last.length ? rowGap : 0) +
        tallest(last, rowHeight) >
        1670
    )
      rowHeight--;
    if (rowHeight < 44)
      throw new Error(
        `${schedule.location} has too many classes for one readable image. Split the week across separate workbook exports.`,
      );
    for (const day of first)
      drawDay(ctx, day, 35 + day.day * 256.5, firstTop, rowHeight);
    const lastTop = first.length
      ? firstTop + tallest(first, rowHeight) + rowGap
      : firstTop;
    for (const day of last) {
      const x = 35 + (day.day - 4) * 256.5;
      if (lastTop + dayHeight(ctx, day, rowHeight) > 1670)
        throw new Error(
          `${schedule.location} ${day.label} has too many classes to fit above the logo.`,
        );
      drawDay(ctx, day, x, lastTop, rowHeight);
    }
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
