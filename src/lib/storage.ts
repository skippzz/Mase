import { openDB } from "idb";
import type { StudioState, TemplateProfile } from "../types";
import { defaults, SERVICES, validateAppointment } from "./calendar";
import { defaultProfiles } from "./profiles";
import { checkFile, guardZip } from "./spreadsheet";

const database = () =>
  openDB("mase-studio", 1, {
    upgrade(db) {
      db.createObjectStore("data");
      db.createObjectStore("templates", { keyPath: "id" });
    },
  });
type StoredProfile = Omit<TemplateProfile, "asset"> & {
  assetBytes?: ArrayBuffer;
  assetMime?: string;
  asset?: Blob;
};
async function encodeProfile(profile: TemplateProfile): Promise<StoredProfile> {
  const { asset, ...rest } = profile;
  // Persist plain binary buffers: Safari/WebKit can reject filesystem-backed
  // File/Blob objects during IndexedDB serialization.
  return {
    ...rest,
    assetBytes: asset ? await asset.arrayBuffer() : undefined,
    assetMime: asset?.type,
  };
}
function decodeProfile(stored: StoredProfile): TemplateProfile {
  const { assetBytes, assetMime, ...profile } = stored;
  return {
    ...profile,
    asset: assetBytes
      ? new Blob([assetBytes], {
          type: assetMime || "application/octet-stream",
        })
      : profile.asset,
  };
}
export async function loadStudio() {
  const db = await database();
  const state = (await db.get("data", "studio")) as StudioState | undefined;
  const profiles = ((await db.getAll("templates")) as StoredProfile[]).map(
    decodeProfile,
  );
  const initialized = await db.get("data", "templates-initialized");
  if (!initialized) {
    const initial = defaultProfiles();
    const tx = db.transaction(["data", "templates"], "readwrite");
    for (const p of initial) await tx.objectStore("templates").put(p);
    await tx.objectStore("data").put(true, "templates-initialized");
    await tx.done;
    return { state: state || structuredClone(defaults), profiles: initial };
  }
  return { state: state || structuredClone(defaults), profiles };
}
export async function saveStudio(state: StudioState) {
  const db = await database();
  await db.put("data", state, "studio");
}
export async function saveProfile(profile: TemplateProfile) {
  const encoded = await encodeProfile(profile);
  const db = await database();
  await db.put("templates", encoded);
}
export async function removeProfile(id: string) {
  const db = await database();
  await db.delete("templates", id);
}
export async function clearStorage() {
  const db = await database();
  const tx = db.transaction(["data", "templates"], "readwrite");
  await Promise.all([
    tx.objectStore("data").clear(),
    tx.objectStore("templates").clear(),
  ]);
  await tx.done;
}
export function validateState(value: unknown): StudioState {
  const s = value as StudioState;
  if (
    s?.version !== 1 ||
    !Array.isArray(s.clients) ||
    !Array.isArray(s.appointments) ||
    !s.settings ||
    !["en-GB", "tr-TR"].includes(s.settings.locale) ||
    typeof s.settings.studioName !== "string" ||
    typeof s.settings.trainerName !== "string" ||
    typeof s.settings.demo !== "boolean"
  )
    throw new Error("This is not a supported Mase backup.");
  if (s.clients.length > 5000 || s.appointments.length > 30000)
    throw new Error("Backup exceeds the supported record limit.");
  if (
    new Set(s.clients.map((c) => c.id)).size !== s.clients.length ||
    new Set(s.appointments.map((a) => a.id)).size !== s.appointments.length
  )
    throw new Error("Backup has duplicate identifiers.");
  for (const c of s.clients)
    if (
      !c.id ||
      !c.name?.trim() ||
      ["id", "name", "email", "phone", "notes"].some(
        (k) => typeof c[k as keyof typeof c] !== "string",
      )
    )
      throw new Error("Backup has an invalid client.");
  for (const a of s.appointments) {
    validateAppointment(a, s.clients);
    if (
      !a.id ||
      !SERVICES.includes(a.service) ||
      !["confirmed", "tentative", "cancelled"].includes(a.status) ||
      typeof a.location !== "string" ||
      typeof a.notes !== "string"
    )
      throw new Error("Backup has an invalid session.");
  }
  return s;
}
export function validateProfile(value: unknown): TemplateProfile {
  const p = value as TemplateProfile;
  if (
    p?.version !== 1 ||
    typeof p.id !== "string" ||
    typeof p.name !== "string" ||
    !p.name.trim() ||
    typeof p.filename !== "string" ||
    !["builtin", "pdf", "image"].includes(p.type) ||
    !Array.isArray(p.fields) ||
    !Array.isArray(p.pages) ||
    !p.pages.length ||
    p.pages.length > 50 ||
    p.fields.length > 200
  )
    throw new Error("This is not a supported template profile.");
  if (p.type === "builtin" && !["schedule", "session"].includes(p.design || ""))
    throw new Error("Unknown template design.");
  if (p.type !== "builtin" && !p.asset)
    throw new Error("The template background file is missing.");
  for (const page of p.pages)
    if (
      !Number.isFinite(page.width) ||
      !Number.isFinite(page.height) ||
      page.width < 1 ||
      page.height < 1 ||
      page.width > 12000 ||
      page.height > 12000
    )
      throw new Error("Invalid page size.");
  if (new Set(p.fields.map((f) => f.id)).size !== p.fields.length)
    throw new Error("Template field identifiers must be unique.");
  for (const f of p.fields) {
    if (
      typeof f.id !== "string" ||
      typeof f.label !== "string" ||
      !Number.isInteger(f.page) ||
      f.page < 0 ||
      f.page >= p.pages.length ||
      !["x", "y", "width", "height", "fontSize"].every((k) =>
        Number.isFinite(f[k as keyof typeof f]),
      ) ||
      f.x < 0 ||
      f.y < 0 ||
      f.width <= 0 ||
      f.height <= 0 ||
      f.x + f.width > 1.001 ||
      f.y + f.height > 1.001 ||
      f.fontSize < 1 ||
      f.fontSize > 120 ||
      !/^#[0-9a-f]{6}$/i.test(f.color) ||
      !["left", "center", "right"].includes(f.align) ||
      !["Lato", "Serif"].includes(f.fontFamily) ||
      !["wrap", "shrink", "truncate"].includes(f.overflow) ||
      !["text", "date", "number", "currency", "time"].includes(f.format) ||
      typeof f.required !== "boolean"
    )
      throw new Error("The profile contains an invalid field.");
    const source = f.source;
    if (
      !source ||
      !["column", "cell", "text", "calendar", "scheduleBlock"].includes(
        source.kind,
      )
    )
      throw new Error("Invalid field source.");
    if (f.background && !/^#[0-9a-f]{6}$/i.test(f.background))
      throw new Error("Invalid text background color.");
    if (source.kind === "scheduleBlock") {
      if (
        typeof source.sheet !== "string" ||
        !Number.isInteger(source.firstRow) ||
        !Number.isInteger(source.lastRow) ||
        source.firstRow < 1 ||
        source.lastRow < source.firstRow ||
        source.lastRow > 5000 ||
        !/^[a-z]{1,3}$/i.test(source.timeColumn) ||
        !/^[a-z]{1,3}$/i.test(source.titleColumn) ||
        !/^(?:[a-z]{1,3})?$/i.test(source.trainerColumn) ||
        !/^(?:[a-z]{1,3})?$/i.test(source.extraColumn) ||
        !["text", "minutes"].includes(source.extraFormat) ||
        !Array.isArray(source.skipRows) ||
        source.skipRows.some((r) => !Number.isInteger(r) || r < 1 || r > 5000)
      )
        throw new Error("Invalid spreadsheet schedule block.");
    }
    if (source.kind === "text" && typeof source.text !== "string")
      throw new Error("Invalid fixed text.");
    if (
      source.kind === "calendar" &&
      !["schedule", "period", "client", "studio", "title"].includes(source.key)
    )
      throw new Error("Invalid calendar source.");
    if (
      (source.kind === "cell" || source.kind === "column") &&
      typeof source.sheet !== "string"
    )
      throw new Error("Invalid worksheet.");
    if (
      source.kind === "cell" &&
      !/^\$?[a-z]{1,3}\$?[1-9]\d*$/i.test(source.address)
    )
      throw new Error("Invalid cell address.");
    if (source.kind === "column" && !/^[a-z]{1,3}$/i.test(source.column))
      throw new Error("Invalid column.");
  }
  return p;
}
export async function exportArchive(
  profiles: TemplateProfile[],
  state?: StudioState,
) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const metadata = [];
  for (let i = 0; i < profiles.length; i++) {
    const { asset, ...profile } = profiles[i];
    const assetPath = asset
      ? `assets/${i}.${profile.type === "pdf" ? "pdf" : asset.type === "image/jpeg" ? "jpg" : "png"}`
      : undefined;
    if (asset && assetPath) zip.file(assetPath, await asset.arrayBuffer());
    metadata.push({ ...profile, assetPath });
  }
  zip.file(
    "templates.json",
    JSON.stringify({ version: 1, profiles: metadata }, null, 2),
  );
  if (state) {
    zip.file("studio.json", JSON.stringify(state, null, 2));
    const db = await database();
    const fonts = (await db.get("data", "ua-fonts")) as
      Record<string, ArrayBuffer> | undefined;
    if (fonts) {
      const roles: string[] = [];
      for (const role of ["regular", "bold", "black", "italic"])
        if (fonts[role]) {
          roles.push(role);
          zip.file(`ua-fonts/${role}.bin`, fonts[role]);
        }
      zip.file("ua-fonts.json", JSON.stringify({ version: 1, roles }));
    }
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
export async function importArchive(
  file: File,
): Promise<{
  state?: StudioState;
  profiles: TemplateProfile[];
  fonts?: Partial<Record<"regular" | "bold" | "black" | "italic", ArrayBuffer>>;
}> {
  checkFile(file, "Backup");
  const zip = await guardZip(await file.arrayBuffer());
  const raw = zip.file("templates.json");
  if (!raw) throw new Error("This archive has no Mase template metadata.");
  const data = JSON.parse(await raw.async("string"));
  if (
    data.version !== 1 ||
    !Array.isArray(data.profiles) ||
    data.profiles.length > 100
  )
    throw new Error("Unsupported template archive.");
  const profiles: TemplateProfile[] = [];
  for (const profile of data.profiles) {
    if (profile.assetPath) {
      const asset = zip.file(profile.assetPath);
      if (!asset)
        throw new Error(`Background file for “${profile.name}” is missing.`);
      profile.asset = new Blob([await asset.async("arraybuffer")], {
        type:
          profile.type === "pdf"
            ? "application/pdf"
            : /\.jpg$/i.test(profile.assetPath)
              ? "image/jpeg"
              : "image/png",
      });
    }
    profiles.push(validateProfile(profile));
  }
  const stateFile = zip.file("studio.json");
  let fonts:
    | Partial<Record<"regular" | "bold" | "black" | "italic", ArrayBuffer>>
    | undefined;
  const fontMetadata = zip.file("ua-fonts.json");
  if (fontMetadata) {
    const info = JSON.parse(await fontMetadata.async("string"));
    if (
      info.version !== 1 ||
      !Array.isArray(info.roles) ||
      info.roles.some(
        (r: string) => !["regular", "bold", "black", "italic"].includes(r),
      )
    )
      throw new Error("Invalid brand font metadata.");
    fonts = {};
    for (const role of info.roles as (
      "regular" | "bold" | "black" | "italic"
    )[]) {
      const file = zip.file(`ua-fonts/${role}.bin`);
      if (!file)
        throw new Error("A saved brand font is missing from the backup.");
      fonts[role] = await file.async("arraybuffer");
    }
  }
  return {
    profiles,
    fonts,
    state: stateFile
      ? validateState(JSON.parse(await stateFile.async("string")))
      : undefined,
  };
}
export async function replaceAll(
  state: StudioState,
  profiles: TemplateProfile[],
  fonts?: Partial<Record<"regular" | "bold" | "black" | "italic", ArrayBuffer>>,
) {
  const encoded = await Promise.all(profiles.map(encodeProfile));
  const db = await database();
  const tx = db.transaction(["data", "templates"], "readwrite");
  await tx.objectStore("templates").clear();
  await tx.objectStore("data").put(state, "studio");
  await tx.objectStore("data").put(true, "templates-initialized");
  await tx.objectStore("data").delete("ua-fonts");
  if (fonts) await tx.objectStore("data").put(fonts, "ua-fonts");
  for (const p of encoded) await tx.objectStore("templates").put(p);
  await tx.done;
}
