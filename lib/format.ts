// Format a stored phone string for display. US 10-digit → 201-555-0142,
// 11-digit leading 1 → 1-201-555-0142. Anything else (international, partial,
// already-formatted in an unexpected way) is returned unchanged.
export function formatPhone(raw: string | null | undefined): string {
  const value = raw ?? "";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return value;
}
