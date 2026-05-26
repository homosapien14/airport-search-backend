import { Injectable } from '@nestjs/common';
import { MetroGroup, QueryClass, Region } from './types/airport';

@Injectable()
export class ClassifierService {
  /**
   * Classifies an incoming search query into a specific query type to determine the appropriate search strategy.
   *
   * The classification hierarchy evaluates in the following order:
   * 1. METRO_CODE: Exact 3-letter uppercase string matching a known metropolitan area code (e.g., 'LON', 'NYC').
   * 2. IATA_CODE: Exact 3-letter uppercase string not matching a metro code.
   * 3. ICAO_CODE: Exact 4-letter uppercase string.
   * 4. REGION: Case-insensitive match against known geographic regions or their predefined aliases (e.g., 'Hawaii', 'Bali').
   * 5. FREETEXT: Any query that does not satisfy the above deterministic rules.
   *
   * @param input - The raw search query string provided by the client.
   * @param metros - A collection of known metropolitan areas used to resolve metro code classifications.
   * @param regions - A collection of predefined geographic regions and their aliases used for region classification.
   * @returns A strongly-typed QueryClass object representing the classified type and its corresponding parsed payload.
   */
  classifyQuery(input: string, metros: MetroGroup[], regions: Region[]): QueryClass {
    const trimmed = input.trim();
    const upperTrimmed = trimmed.toUpperCase();

    if (trimmed.length === 3) {
      const metro = metros.find(m => m.metro_code === upperTrimmed);
      if (metro) {
        return { type: 'METRO_CODE', code: upperTrimmed, metro };
      }
    }

    if (/^[A-Z]{3}$/.test(trimmed)) {
      return { type: 'IATA_CODE', code: trimmed };
    }

    if (/^[A-Z]{4}$/.test(trimmed)) {
      return { type: 'ICAO_CODE', code: trimmed };
    }

    const lowerTrimmed = trimmed.toLowerCase();
    const region = regions.find(r =>
      r.region_name.toLowerCase() === lowerTrimmed ||
      r.aliases.some(a => a.toLowerCase() === lowerTrimmed)
    );

    if (region) {
      return { type: 'REGION', region };
    }

    return { type: 'FREETEXT', query: trimmed };
  }
}
