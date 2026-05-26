import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'typesense';

const SEARCH_FIELDS = [
  "iata_code",
  "name",
  "city",
  "country_name",
  "state_province",
  "aliases",
  "aliases_cjk",
  "aliases_arabic",
  "aliases_cyrillic"
];

const SEARCH_WEIGHTS = [
  "10",
  "7", 
  "8", 
  "4", 
  "6", 
  "9", 
  "9", 
  "9", 
  "9"  
];

const SORT_ORDER = "_text_match:desc,commercial_rank:asc,popularity_score:desc";

const COMMERCIAL_TYPES = ["large_airport", "medium_airport", "small_airport"];

export interface SearchOptions {
  limit?: number;
  filterBy?: string;
}

/**
 * Service responsible for communicating with the Typesense search engine.
 * Abstracts the query building logic, weights, typo-tolerance, and connection handling.
 */
@Injectable()
export class TypesenseService {
  private readonly client: Client;
  private readonly logger = new Logger(TypesenseService.name);

  constructor(private configService: ConfigService) {
    this.client = new Client({
      nodes: [{
        host: this.configService.get<string>('TYPESENSE_HOST', 'localhost'),
        port: this.configService.get<number>('TYPESENSE_PORT', 8108),
        protocol: 'http'
      }],
      apiKey: this.configService.get<string>('TYPESENSE_API_KEY', 'flyfairlysecret'),
      connectionTimeoutSeconds: 10
    });
  }

  /**
   * Constructs the Typesense specific search parameters, defining fields to search,
   * typo configurations, weights, and filtering.
   *
   * @param query - The string query to search for.
   * @param options - Additional limits and filter overrides.
   * @returns An object containing the formatted Typesense search parameters.
   */
  buildSearchParams(query: string, options?: SearchOptions) {
    const filter = options?.filterBy 
      ? `(${options.filterBy}) && airport_type:[${COMMERCIAL_TYPES.join(",")}]`
      : `airport_type:[${COMMERCIAL_TYPES.join(",")}]`;

    return {
      q: query,
      query_by: SEARCH_FIELDS.join(","),
      query_by_weights: SEARCH_WEIGHTS.join(","),
      num_typos: 2,
      typo_tokens_threshold: 1,
      prefix: true,
      sort_by: SORT_ORDER,
      filter_by: filter,
      per_page: options?.limit ?? 8,
      highlight_full_fields: "name,city,iata_code",
    };
  }

  /**
   * Executes a search against the 'airports' collection in Typesense.
   *
   * @param query - The raw search query.
   * @param options - Pagination and filtering options.
   * @returns The raw Typesense search results object.
   * @throws Error if the Typesense client fails to connect or execute the query.
   */
  async searchAirports(query: string, options?: SearchOptions) {
    try {
      const searchParams = this.buildSearchParams(query, options);
      const results = await this.client.collections('airports').documents().search(searchParams);
      return results;
    } catch (error: any) {
      this.logger.error(`Typesense search failed: ${error.message}`, error.stack);
      throw new Error(`Search unavailable: ${error.message}`);
    }
  }

  /**
   * Retrieves a single airport document by its exact document ID.
   *
   * @param id - The Typesense document ID (typically the IATA or ICAO code).
   * @returns The corresponding document or null if not found.
   */
  async getDocument(id: string) {
    try {
      return await this.client.collections('airports').documents(id).retrieve();
    } catch (error: any) {
      this.logger.error(`Failed to retrieve document ${id}: ${error.message}`, error.stack);
      return null;
    }
  }
}
