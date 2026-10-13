import { mkdir, writeFile, readFile, cp } from "node:fs/promises";
import sharp from "sharp";
await mkdir("public/icons", { recursive: true });
await mkdir("public/fonts", { recursive: true });
const svg = await readFile("public/favicon.svg");
for (const [name, size] of [
  ["icon-192", 192],
  ["icon-512", 512],
  ["apple-touch-icon", 180],
]) {
  await sharp(svg).resize(size, size).png().toFile(`public/icons/${name}.png`);
}
await sharp(svg)
  .resize(320, 320)
  .extend({ top: 96, bottom: 96, left: 96, right: 96, background: "#354b3d" })
  .png()
  .toFile("public/icons/maskable-512.png");
for (const [name, url] of [
  [
    "Lato-Regular.ttf",
    "https://raw.githubusercontent.com/google/fonts/main/ofl/lato/Lato-Regular.ttf",
  ],
  [
    "OFL.txt",
    "https://raw.githubusercontent.com/google/fonts/main/ofl/lato/OFL.txt",
  ],
  [
    "CormorantGaramond.otf",
    "https://raw.githubusercontent.com/CatharsisFonts/Cormorant/master/fonts/otf/CormorantGaramond-Regular.otf",
  ],
  [
    "Cormorant-OFL.txt",
    "https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/OFL.txt",
  ],
]) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Font asset ${name}: HTTP ${response.status}`);
  await writeFile(
    `public/fonts/${name}`,
    new Uint8Array(await response.arrayBuffer()),
  );
}
await cp("node_modules/pdfjs-dist/standard_fonts", "public/pdf-fonts", {
  recursive: true,
});
await cp("node_modules/pdfjs-dist/cmaps", "public/cmaps", { recursive: true });
console.log("Local icons and licensed Unicode PDF font prepared.");
