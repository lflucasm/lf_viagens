import crypto from "node:crypto";

function slugify(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// Ex: "Eduarda Vargas de Freitas" -> "eduarda-vargas-a1b2"
export function makeInviteCodeFromName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] || "user";
  const second = parts[1] || "convite";
  const base = slugify(`${first}-${second}`);
  const suffix = crypto.randomBytes(2).toString("hex"); // 4 chars
  return `${base}-${suffix}`;
}
