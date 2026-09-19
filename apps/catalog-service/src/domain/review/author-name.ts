export const FORMER_CUSTOMER = "Former customer";
const FALLBACK = "Verified buyer";

function capitalise(word: string): string {
  return word ? word[0].toLocaleUpperCase() + word.slice(1) : word;
}

/**
 * Public review byline: first name and last initial only ("Nino B."). Falls back to the email's local part, then to
 * "Verified buyer", so a review never exposes a full name or an email address.
 */
export function reviewAuthorName(fullName: string | null | undefined, email?: string | null): string {
  const parts = (fullName ?? "").replace(/[<>]/g, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${capitalise(parts[0]).slice(0, 40)} ${parts[parts.length - 1][0].toLocaleUpperCase()}.`;
  if (parts.length === 1) return capitalise(parts[0]).slice(0, 40);
  const local = (email ?? "").split("@")[0]?.split(/[._+-]/).find((p) => /^[\p{L}]{2,}$/u.test(p));
  return local ? capitalise(local.toLowerCase()).slice(0, 40) : FALLBACK;
}
