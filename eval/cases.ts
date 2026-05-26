export interface EvalCase {
  query: string;
  expectType: "airport" | "metro" | "disambiguation" | "airport_list";
  expectIATA?: string;
  expectContains?: string[];
  expectNotContains?: string[];
  expectCountry?: string;
  expectMetro?: string;
  expectOptionCount?: number;
}

export const EVAL_CASES: EvalCase[] = [
  // Region searches
  { query: "Hawaii",   expectType: "airport_list", expectContains: ["HNL","OGG","KOA","LIH"] },
  { query: "Ontario",  expectType: "airport_list", expectContains: ["YYZ","YOW","YHM"] },

  // Tourism aliases
  { query: "Bali",     expectType: "airport",  expectIATA: "DPS", expectNotContains: ["BPN"] },
  { query: "Goa",      expectType: "airport",  expectIATA: "GOI" },

  // Fuzzy traps
  { query: "Florida",  expectType: "airport_list", expectCountry: "US", expectNotContains: ["CJC"] },

  // City-to-airport
  { query: "Manama",   expectType: "airport",  expectIATA: "BAH" },
  { query: "Brussels", expectType: "airport",  expectIATA: "BRU" },
  { query: "Bengaluru",expectType: "airport",  expectIATA: "BLR" },

  // IATA both directions
  { query: "TUL",      expectType: "airport",  expectIATA: "TUL" },
  { query: "Tulsa",    expectType: "airport",  expectIATA: "TUL" },
  { query: "CTA",      expectType: "airport",  expectIATA: "CTA" },
  { query: "Catania",  expectType: "airport",  expectIATA: "CTA" },

  // Typo tolerance
  { query: "Londn",    expectType: "airport_list", expectContains: ["LHR", "LGW"] },
  { query: "Sydeny",   expectType: "airport",  expectIATA: "SYD" },
  { query: "Tokio",    expectType: "airport_list", expectContains: ["HND","NRT"] },

  // Metro codes
  { query: "LON",      expectType: "airport_list", expectContains: ["LHR","LGW","STN"] },
  { query: "NYC",      expectType: "airport_list", expectContains: ["JFK","EWR","LGA"] },

  // Disambiguation
  { query: "London",   expectType: "disambiguation", expectOptionCount: 3 },

  // CJK
  { query: "東京",     expectType: "airport_list", expectContains: ["HND","NRT"] },
  { query: "北京",     expectType: "airport_list", expectContains: ["PEK"] },
  { query: "서울",     expectType: "airport_list", expectContains: ["ICN","GMP"] },
  { query: "دبي",      expectType: "airport",  expectIATA: "DXB" },

  // Accent / endonym
  { query: "Sao Paulo",     expectType: "airport_list", expectContains: ["GRU","CGH"] },
  { query: "São Paulo",     expectType: "airport_list", expectContains: ["GRU","CGH"] },
  { query: "Roma",          expectType: "airport",  expectIATA: "FCO" },
  { query: "München",       expectType: "airport",  expectIATA: "MUC" },
  { query: "Munich",        expectType: "airport",  expectIATA: "MUC" },
];
