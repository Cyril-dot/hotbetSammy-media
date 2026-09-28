// Country-specific betting configuration shared by the betslip surfaces.
// Withdrawal eligibility is handled by the wallet and does not depend on these
// values or on any upfront fee/deposit prerequisite.

export interface CountryConfig {
  currency: string;
  currencyCode: string;
  minStake: number;
}

export const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  GH: {
    currency: "GHS",
    currencyCode: "GHS",
    minStake: 1,
  },
  NG: {
    currency: "NGN",
    currencyCode: "NGN",
    minStake: 13000,
  },
};
