import type { TemplateField } from "../types";

export function fieldBox(field: TemplateField, width: number, height: number) {
  return {
    x: field.x * width,
    top: field.y * height,
    width: field.width * width,
    height: field.height * height,
    fontSize: (field.fontSize * width) / 595,
  };
}
export function pdfTextPosition(
  x: number,
  top: number,
  fontSize: number,
  pageHeight: number,
) {
  return { x, y: pageHeight - top - fontSize };
}
export function rotatedPage(width: number, height: number, angle: number) {
  const rotation = ((angle % 360) + 360) % 360;
  if (![0, 90, 180, 270].includes(rotation))
    throw new Error("Unsupported PDF page rotation.");
  return {
    width: rotation === 90 || rotation === 270 ? height : width,
    height: rotation === 90 || rotation === 270 ? width : height,
    x: rotation === 180 ? width : rotation === 270 ? height : 0,
    y: rotation === 90 ? width : rotation === 180 ? height : 0,
    degrees: rotation === 90 ? -90 : rotation === 270 ? 90 : rotation,
  };
}
export interface TextLayout {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  warning?: string;
}
export function layoutText(
  text: string,
  width: number,
  height: number,
  fontSize: number,
  overflow: TemplateField["overflow"],
  measure: (text: string, size: number) => number,
): TextLayout {
  if (!text) return { lines: [], fontSize, lineHeight: fontSize * 1.4 };
  const wrap = (size: number) =>
    text.split("\n").flatMap((paragraph) => {
      if (!paragraph) return [""];
      const lines: string[] = [];
      let current = "";
      // Split long words on Unicode code points without dropping text.
      for (const word of paragraph.split(/\s+/)) {
        if (measure(current ? `${current} ${word}` : word, size) <= width) {
          current = current ? `${current} ${word}` : word;
          continue;
        }
        if (current) {
          lines.push(current);
          current = "";
        }
        for (const character of word) {
          if (current && measure(current + character, size) > width) {
            lines.push(current);
            current = "";
          }
          current += character;
        }
      }
      lines.push(current);
      return lines;
    });
  let size = fontSize,
    lines = wrap(size);
  if (overflow === "shrink") {
    const minimum = fontSize * 0.35;
    while (lines.length * size * 1.4 > height && size > minimum) {
      size = Math.max(minimum, size - fontSize * 0.025);
      lines = wrap(size);
    }
  }
  const capacity = Math.floor(height / (size * 1.4));
  if (lines.length > capacity) {
    if (overflow !== "truncate")
      throw new Error(
        "Text does not fit. Enlarge the field, reduce the font size, or choose shrink to fit.",
      );
    lines = lines.slice(0, Math.max(0, capacity));
    if (lines.length) {
      let last = lines.at(-1)!;
      while (last && measure(`${last}…`, size) > width)
        last = [...last].slice(0, -1).join("");
      lines[lines.length - 1] = `${last}…`;
    }
    return {
      lines,
      fontSize: size,
      lineHeight: size * 1.4,
      warning: "Text was shortened to fit. Review before sharing.",
    };
  }
  return { lines, fontSize: size, lineHeight: size * 1.4 };
}
