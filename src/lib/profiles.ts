import type { TemplateField, TemplateProfile } from "../types";

export function makeField(partial: Partial<TemplateField> = {}): TemplateField {
  return {
    id: crypto.randomUUID(),
    label: "New field",
    source: { kind: "text", text: "" },
    page: 0,
    x: 0.1,
    y: 0.3,
    width: 0.8,
    height: 0.08,
    fontSize: 14,
    fontFamily: "Lato",
    color: "#354b3d",
    align: "left",
    required: false,
    format: "text",
    overflow: "wrap",
    ...partial,
  };
}
export function defaultProfiles(): TemplateProfile[] {
  const base = {
    version: 1 as const,
    type: "builtin" as const,
    createdAt: new Date().toISOString(),
    filename: "{Client}-{row}",
  };
  return [
    {
      ...base,
      id: "weekly-schedule",
      name: "The weekly edit",
      design: "schedule",
      pages: [{ width: 1080, height: 1350, rotation: 0 }],
      fields: [
        makeField({
          id: "studio",
          label: "Studio",
          source: { kind: "calendar", key: "studio" },
          y: 0.065,
          fontSize: 13,
        }),
        makeField({
          id: "title",
          label: "Title",
          source: { kind: "calendar", key: "title" },
          y: 0.16,
          height: 0.12,
          fontSize: 29,
          fontFamily: "Serif",
        }),
        makeField({
          id: "period",
          label: "Period",
          source: { kind: "calendar", key: "period" },
          y: 0.285,
          fontSize: 13,
        }),
        makeField({
          id: "client",
          label: "Client",
          source: { kind: "calendar", key: "client" },
          y: 0.33,
          fontSize: 11,
          color: "#7c8174",
        }),
        makeField({
          id: "schedule",
          label: "Schedule",
          source: { kind: "calendar", key: "schedule" },
          y: 0.405,
          height: 0.48,
          fontSize: 12,
          overflow: "shrink",
          required: true,
        }),
      ],
    },
    {
      ...base,
      id: "session-brief",
      name: "Client session brief · example",
      design: "session",
      pages: [{ width: 595, height: 842, rotation: 0 }],
      fields: [
        makeField({
          id: "client",
          label: "Client",
          y: 0.26,
          fontSize: 30,
          height: 0.09,
          fontFamily: "Serif",
          required: true,
        }),
        makeField({ id: "session", label: "Session", y: 0.42, fontSize: 18 }),
        makeField({
          id: "date",
          label: "Date",
          y: 0.53,
          width: 0.4,
          fontSize: 15,
          format: "date",
        }),
        makeField({
          id: "time",
          label: "Time",
          x: 0.55,
          y: 0.53,
          width: 0.35,
          fontSize: 15,
          format: "time",
        }),
        makeField({ id: "location", label: "Location", y: 0.64, fontSize: 15 }),
        makeField({
          id: "notes",
          label: "Notes",
          y: 0.76,
          height: 0.1,
          fontSize: 12,
          overflow: "shrink",
        }),
      ],
    },
  ];
}
