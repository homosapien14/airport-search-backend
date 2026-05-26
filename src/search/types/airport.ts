export interface Region {
  region_name: string;
  region_type: string;
  country_code: string;
  iata_codes: string[];
  aliases: string[];
}

export interface MetroGroup {
  metro_code: string;
  metro_name: string;
  country_code: string;
  iata_codes: string[];
}

export type QueryClass =
  | { type: "IATA_CODE"; code: string }
  | { type: "ICAO_CODE"; code: string }
  | { type: "METRO_CODE"; code: string; metro: MetroGroup }
  | { type: "REGION"; region: Region }
  | { type: "FREETEXT"; query: string };

export interface AirportResult {
  type: "airport";
  iata: string;
  name: string;
  city: string;
  country: string;
  country_code: string;
}

export interface MetroResult {
  type: "metro";
  metro_code: string;
  metro_name: string;
  country: string;
  airports: { iata: string; name: string }[];
}

export interface DisambiguationResult {
  type: "disambiguation";
  query: string;
  options: (
    | { type: "metro"; metro_code: string; country: string; hint: string }
    | { type: "airport"; iata: string; country: string; hint: string }
  )[];
}

export type SearchResult = AirportResult | MetroResult | DisambiguationResult;

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  took_ms: number;
  total: number;
}
