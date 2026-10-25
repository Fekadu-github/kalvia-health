export const money = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const currentMonth = () => new Date().toISOString().slice(0, 7);
export const TYPE_LABEL: Record<string, string> = {
  registration: "Registration",
  first_consultation: "First consultation",
  video_consultation: "Video consultation",
  prescription: "Prescription",
  video: "Video",
  audio: "Audio",
  in_person: "In person",
};
