export function makeTrackingRef(id: string, createdAt = new Date()) {
  const year = createdAt.getFullYear();
  const seq = id.replace(/[^a-z0-9]/gi, "").slice(-5).toUpperCase().padStart(5, "0");
  return `ICT-${year}-${seq}`;
}

export function parseTrackingRef(value: string) {
  const normalized = value.trim().toUpperCase();
  return /^ICT-\d{4}-[A-Z0-9]{5,}$/.test(normalized) ? normalized : null;
}
