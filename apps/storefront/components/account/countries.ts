/** Countries offered in the address book (ISO 3166-1 alpha-2); other stored codes are still shown as-is. */
export const COUNTRIES = [
  { code: "AT", label: "Austria" },
  { code: "BE", label: "Belgium" },
  { code: "DK", label: "Denmark" },
  { code: "FI", label: "Finland" },
  { code: "FR", label: "France" },
  { code: "GE", label: "Georgia" },
  { code: "DE", label: "Germany" },
  { code: "IE", label: "Ireland" },
  { code: "IT", label: "Italy" },
  { code: "LU", label: "Luxembourg" },
  { code: "NL", label: "Netherlands" },
  { code: "NO", label: "Norway" },
  { code: "PL", label: "Poland" },
  { code: "PT", label: "Portugal" },
  { code: "ES", label: "Spain" },
  { code: "SE", label: "Sweden" },
  { code: "CH", label: "Switzerland" },
  { code: "GB", label: "United Kingdom" },
  { code: "US", label: "United States" },
] as const;

export function countryName(code: string) {
  return COUNTRIES.find((c) => c.code === code)?.label ?? code;
}
