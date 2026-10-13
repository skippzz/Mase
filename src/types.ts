export type Locale = "en-GB" | "tr-TR";
export type Service =
  "Pilates" | "Personal training" | "Strength" | "Mobility" | "Barre" | "Other";
export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
}
export interface Appointment {
  id: string;
  clientId: string;
  date: string;
  start: string;
  duration: number;
  service: Service;
  location: string;
  notes: string;
  status: "confirmed" | "tentative" | "cancelled";
}
export interface Settings {
  studioName: string;
  trainerName: string;
  locale: Locale;
  demo: boolean;
}
export interface StudioState {
  version: 1;
  clients: Client[];
  appointments: Appointment[];
  settings: Settings;
}
export type CellValue = string | number | boolean | Date | null;
export interface SheetCell {
  value: CellValue;
  text: string;
  error?: string;
}
export interface Worksheet {
  name: string;
  cells: Record<string, SheetCell>;
  rowCount: number;
  columnCount: number;
}
export interface WorkbookData {
  name: string;
  sheets: Worksheet[];
  warnings: string[];
}
export interface SheetColumn {
  key: string;
  label: string;
}
export interface SheetRecord {
  row: number;
  cells: Record<string, SheetCell>;
}
export type FieldSource =
  | { kind: "column"; sheet: string; column: string }
  | { kind: "cell"; sheet: string; address: string }
  | {
      kind: "scheduleBlock";
      sheet: string;
      firstRow: number;
      lastRow: number;
      timeColumn: string;
      titleColumn: string;
      trainerColumn: string;
      extraColumn: string;
      extraFormat: "text" | "minutes";
      skipRows: number[];
    }
  | { kind: "text"; text: string }
  | {
      kind: "calendar";
      key: "schedule" | "period" | "client" | "studio" | "title";
    };
export interface TemplateField {
  id: string;
  label: string;
  source: FieldSource;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: "Lato" | "Serif";
  color: string;
  background?: string;
  align: "left" | "center" | "right";
  required: boolean;
  format: "text" | "date" | "number" | "currency" | "time";
  overflow: "wrap" | "shrink" | "truncate";
}
export interface PageSize {
  width: number;
  height: number;
  rotation: number;
}
export interface TemplateProfile {
  version: 1;
  id: string;
  name: string;
  type: "builtin" | "pdf" | "image";
  design?: "session" | "schedule";
  asset?: Blob;
  assetName?: string;
  pages: PageSize[];
  fields: TemplateField[];
  filename: string;
  createdAt: string;
}
export interface ResolveContext {
  workbook?: WorkbookData;
  record?: SheetRecord;
  locale: Locale;
  calendar?: Record<
    "schedule" | "period" | "client" | "studio" | "title",
    string
  >;
}
export interface ResolvedField {
  field: TemplateField;
  text: string;
}
