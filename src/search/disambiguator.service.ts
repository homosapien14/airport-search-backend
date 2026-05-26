import { Injectable } from '@nestjs/common';
import { SearchResult, DisambiguationResult, MetroGroup } from './types/airport';

@Injectable()
export class DisambiguatorService {
  /**
   * Analyzes search results to determine if a query requires user disambiguation.
   * Disambiguation is triggered when a search query exactly matches the city name 
   * of multiple distinct airports located in different countries.
   * 
   * For example, a search for "London" matches London (United Kingdom) and London (Canada).
   * In such scenarios, instead of returning an unstructured list, it groups the 
   * results by country and returns a structured disambiguation payload.
   *
   * @param query - The raw search query string provided by the user.
   * @param rawResults - The top documents returned by the search engine.
   * @param metros - A dataset of predefined metropolitan areas used to elevate airports into metro groups during disambiguation.
   * @returns An array containing a single DisambiguationResult if disambiguation is required; otherwise, returns null.
   */
  shouldDisambiguate(query: string, rawResults: any[], metros: MetroGroup[]): SearchResult[] | null {
    if (!rawResults || rawResults.length < 2) return null;

    const trimmedQuery = query.trim().toLowerCase();
    const matchesByCountry = new Map<string, any[]>();
    
    for (const r of rawResults) {
      const city = (r.city || "").toLowerCase();
      
      if (city === trimmedQuery || r.name.toLowerCase().includes(trimmedQuery) || (r.aliases && r.aliases.map((a:string)=>a.toLowerCase()).includes(trimmedQuery))) {
        if (city === trimmedQuery) {
            const cCode = r.country_code;
            if (!matchesByCountry.has(cCode)) {
              matchesByCountry.set(cCode, []);
            }
            matchesByCountry.get(cCode)!.push(r);
        }
      }
    }

    if (matchesByCountry.size > 1) {
      const options: DisambiguationResult["options"] = [];
      
      for (const [countryCode, airports] of Array.from(matchesByCountry.entries())) {
        const metro = metros.find(m => m.metro_name.toLowerCase() === trimmedQuery && m.country_code === countryCode);
        
        if (metro) {
          options.push({
            type: "metro",
            metro_code: metro.metro_code,
            country: airports[0].country_name,
            hint: `${metro.iata_codes.slice(0,2).join(", ")} +${Math.max(0, metro.iata_codes.length - 2)}`
          });
        } else {
          const topAirport = airports.sort((a,b) => a.commercial_rank - b.commercial_rank)[0];
          options.push({
            type: "airport",
            iata: topAirport.iata_code,
            country: topAirport.country_name,
            hint: topAirport.state_province || topAirport.name
          });
        }
      }

      if (options.length > 1) {
        return [{
          type: "disambiguation",
          query: query,
          options: options
        }];
      }
    }

    return null;
  }
}
