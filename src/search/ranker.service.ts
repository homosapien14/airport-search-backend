import { Injectable } from '@nestjs/common';
import { SearchResult } from './types/airport';

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(null));
  for (let i = 0; i <= a.length; i += 1) { matrix[i][0] = i; }
  for (let j = 0; j <= b.length; j += 1) { matrix[0][j] = j; }
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j] + 1, // deletion
        matrix[i - 1][j - 1] + indicator // substitution
      );
    }
  }
  return matrix[a.length][b.length];
}

@Injectable()
export class RankerService {
  /**
   * Calculates a relevance score for each airport result based on matched aliases, 
   * city names, commercial ranking, and popularity score. Sorts the results in 
   * descending order of relevance and formats them into the standard SearchResult structure.
   * 
   * Scoring heuristics:
   * - +10000 points for an exact match on an alias (including CJK aliases).
   * - +5000 points for an exact match or 1-typo match on the city name.
   * - Commercial rank bonus: Inversely proportional to rank (1 is highest, yielding highest bonus).
   * - Popularity bonus: Added directly based on predefined popularity metric.
   *
   * @param query - The normalized search query used for matching.
   * @param rawResults - The unstructured documents returned directly from the Typesense index.
   * @returns An array of SearchResult objects sorted from highest to lowest relevance.
   */
  rankResults(query: string, rawResults: any[]): SearchResult[] {
    const trimmedQuery = query.trim().toLowerCase();

    const scoredResults = rawResults.map(r => {
      let score = 0;

      const city = (r.city || "").toLowerCase();
      const aliases = r.aliases?.map((a: string) => a.toLowerCase()) || [];
      const aliasesCjk = r.aliases_cjk?.map((a: string) => a.toLowerCase()) || [];

      const matchAlias = aliases.some((a: string) => a === trimmedQuery || levenshtein(a, trimmedQuery) <= 1);
      const matchAliasCjk = aliasesCjk.includes(trimmedQuery);

      if (matchAlias || matchAliasCjk) {
        score += 10000;
      }
      if (city === trimmedQuery || levenshtein(city, trimmedQuery) <= 1) {
        score += 5000;
      }

      const commercialBonus = (5 - (r.commercial_rank || 4)) * 100;
      const popBonus = (r.popularity_score || 0);

      const finalScore = score + commercialBonus + popBonus;

      return {
        airport: r,
        score: finalScore
      };
    });

    let finalResults = scoredResults;
    const maxScore = Math.max(0, ...scoredResults.map(s => s.score));

    if (maxScore >= 5000) {
      finalResults = scoredResults.filter(s => s.score >= 5000);
    }

    finalResults.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.airport.commercial_rank !== b.airport.commercial_rank) {
        return (a.airport.commercial_rank || 4) - (b.airport.commercial_rank || 4);
      }
      if (b.airport.popularity_score !== a.airport.popularity_score) {
        return (b.airport.popularity_score || 0) - (a.airport.popularity_score || 0);
      }
      return (a.airport.iata_code || "").localeCompare(b.airport.iata_code || "");
    });

    return finalResults.map(sr => {
      const r = sr.airport;
      return {
        type: "airport",
        iata: r.iata_code,
        name: r.name,
        city: r.city,
        country: r.country_name,
        country_code: r.country_code
      } as SearchResult;
    });
  }
}
