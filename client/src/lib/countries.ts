// ─────────────────────────────────────────────────────────────────────────────
// countries.ts — turns whatever the user's `country` field holds (a full name
// like "Ghana" or an ISO code like "GH") into a flag emoji and short code.
// ─────────────────────────────────────────────────────────────────────────────

/** Common country names → ISO 3166-1 alpha-2 code, for when the field stores a full name rather than a code. */
const NAME_TO_CODE: Record<string, string> = {
  ghana: "GH", nigeria: "NG", "south africa": "ZA", kenya: "KE", uganda: "UG", tanzania: "TZ",
  cameroon: "CM", "ivory coast": "CI", "côte d'ivoire": "CI", senegal: "SN", ethiopia: "ET",
  egypt: "EG", morocco: "MA", zambia: "ZM", zimbabwe: "ZW", rwanda: "RW", "sierra leone": "SL",
  liberia: "LR", "united kingdom": "GB", uk: "GB", england: "GB", "united states": "US",
  usa: "US", "united states of america": "US", canada: "CA", germany: "DE", france: "FR",
  spain: "ES", italy: "IT", "united arab emirates": "AE", uae: "AE", india: "IN", china: "CN",
  brazil: "BR", mali: "ML", "burkina faso": "BF", benin: "BJ", togo: "TG", niger: "NE",
  chad: "TD", gambia: "GM", guinea: "GN", "guinea-bissau": "GW", mozambique: "MZ", malawi: "MW",
  botswana: "BW", namibia: "NA", angola: "AO", congo: "CG", "dr congo": "CD", gabon: "GA",
  algeria: "DZ", tunisia: "TN", libya: "LY", sudan: "SD", somalia: "SO", eritrea: "ER",
  djibouti: "DJ", madagascar: "MG", mauritius: "MU", seychelles: "SC", lesotho: "LS",
  eswatini: "SZ", swaziland: "SZ", burundi: "BI", "south sudan": "SS", "central african republic": "CF",
  "equatorial guinea": "GQ", "cape verde": "CV", "guinea equatorial": "GQ", mauritania: "MR",
  australia: "AU", "new zealand": "NZ", ireland: "IE", netherlands: "NL", belgium: "BE",
  portugal: "PT", switzerland: "CH", austria: "AT", sweden: "SE", norway: "NO", denmark: "DK",
  poland: "PL", greece: "GR", turkey: "TR", "saudi arabia": "SA", qatar: "QA", "hong kong": "HK",
  japan: "JP", "south korea": "KR", singapore: "SG", malaysia: "MY", indonesia: "ID",
  philippines: "PH", thailand: "TH", vietnam: "VN", pakistan: "PK", bangladesh: "BD",
  mexico: "MX", argentina: "AR", chile: "CL", colombia: "CO", peru: "PE",
};

function codeToFlagEmoji(code: string): string {
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  return String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0)));
}

/** Real flag image URL — Unicode flag emojis render as plain letters on Windows/some browsers, so this is the reliable option for the header. */
export function flagImageUrl(country?: string | null, width: 20 | 24 | 40 | 80 = 40): string {
  const code = resolveCountryCode(country) || "GH";
  return `https://flagcdn.com/w${width}/${code.toLowerCase()}.png`;
}

/** ISO 3166-1 alpha-3 → alpha-2, for backends that store the 3-letter code (very common, e.g. "NGA", "GHA"). */
const ALPHA3_TO_ALPHA2: Record<string, string> = {
  gha: "GH", nga: "NG", zaf: "ZA", ken: "KE", uga: "UG", tza: "TZ", cmr: "CM", civ: "CI",
  sen: "SN", eth: "ET", egy: "EG", mar: "MA", zmb: "ZM", zwe: "ZW", rwa: "RW", sle: "SL",
  lbr: "LR", gbr: "GB", usa: "US", can: "CA", deu: "DE", fra: "FR", esp: "ES", ita: "IT",
  are: "AE", ind: "IN", chn: "CN", bra: "BR", mli: "ML", bfa: "BF", ben: "BJ", tgo: "TG",
  ner: "NE", tcd: "TD", gmb: "GM", gin: "GN", gnb: "GW", moz: "MZ", mwi: "MW", bwa: "BW",
  nam: "NA", ago: "AO", cog: "CG", cod: "CD", gab: "GA", dza: "DZ", tun: "TN", lby: "LY",
  sdn: "SD", som: "SO", eri: "ER", dji: "DJ", mdg: "MG", mus: "MU", syc: "SC", lso: "LS",
  swz: "SZ", bdi: "BI", ssd: "SS", caf: "CF", gnq: "GQ", cpv: "CV", mrt: "MR",
};

/** Resolves whatever the country field holds into a 2-letter ISO code, or "" if unrecognized.
 * Accepts a 2-letter code, a 3-letter code (e.g. "NGA"), or a full country name. */
export function resolveCountryCode(country?: string | null): string {
  if (!country) return "";
  const trimmed = country.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  if (/^[A-Za-z]{3}$/.test(trimmed)) {
    const fromAlpha3 = ALPHA3_TO_ALPHA2[trimmed.toLowerCase()];
    if (fromAlpha3) return fromAlpha3;
  }
  return NAME_TO_CODE[trimmed.toLowerCase()] ?? "";
}

/** Flag emoji for the user's registered country — falls back to a globe if we can't resolve it. */
export function flagForCountry(country?: string | null): string {
  const code = resolveCountryCode(country);
  return code ? codeToFlagEmoji(code) : "🌍";
}

/** Short display code for the header pill (e.g. "GH") — falls back to the given default. */
export function codeLabel(country?: string | null, fallback = "GH"): string {
  return resolveCountryCode(country) || fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// Currency helpers — single source of truth for code + symbol per country.
// ─────────────────────────────────────────────────────────────────────────────

export interface CurrencyInfo {
  code: string;   // e.g. "NGN" | "GHS"
  symbol: string; // e.g. "₦"  | "GHS"
}

/**
 * Returns the correct currency for a user's country field.
 * Accepts anything resolveCountryCode accepts (ISO code or full name).
 * Defaults to Ghana / GHS when the country is unrecognised.
 */
export function currencyForCountry(country?: string | null): CurrencyInfo {
  const code = resolveCountryCode(country);
  if (code === "NG") return { code: "NGN", symbol: "₦" };
  return { code: "GHS", symbol: "GHS" };
}

/** Curated list for country <select> inputs (registration, profile editing). */
export const COUNTRY_OPTIONS: Array<[string, string]> = [
  ["GH", "Ghana"], ["NG", "Nigeria"], ["KE", "Kenya"], ["ZA", "South Africa"], ["UG", "Uganda"],
  ["TZ", "Tanzania"], ["CM", "Cameroon"], ["CI", "Ivory Coast"], ["SN", "Senegal"], ["ET", "Ethiopia"],
  ["EG", "Egypt"], ["MA", "Morocco"], ["ZM", "Zambia"], ["ZW", "Zimbabwe"], ["RW", "Rwanda"],
  ["GB", "United Kingdom"], ["US", "United States"], ["CA", "Canada"], ["DE", "Germany"], ["FR", "France"],
  ["AE", "United Arab Emirates"], ["IN", "India"],
];
