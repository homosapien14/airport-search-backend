import { Injectable, BadRequestException } from '@nestjs/common';
import { ClassifierService } from './classifier.service';
import { TypesenseService } from './typesense.service';
import { DisambiguatorService } from './disambiguator.service';
import { RankerService } from './ranker.service';
import { SearchResponse, SearchResult, MetroGroup, Region } from './types/airport';
import * as fs from 'fs';
import * as path from 'path';

const pipelineDataPath = path.join(process.cwd(), 'pipeline/data');
let metros: MetroGroup[] = [];
let regions: Region[] = [];

try {
  metros = JSON.parse(fs.readFileSync(path.join(pipelineDataPath, 'metro_groups.json'), 'utf-8'));
  regions = JSON.parse(fs.readFileSync(path.join(pipelineDataPath, 'regions.json'), 'utf-8'));
} catch (e) {
  console.error("Path attempted:", pipelineDataPath);
  console.error(e);
  console.warn("Could not load metro/regions data. Run data pipeline first.");
}

@Injectable()
export class SearchService {
  constructor(
    private classifier: ClassifierService,
    private typesense: TypesenseService,
    private disambiguator: DisambiguatorService,
    private ranker: RankerService
  ) {}

  /**
   * Executes a search query against the airport database.
   * Processes the query through the following pipeline:
   * 1. Query classification (IATA, ICAO, METRO, REGION, FREETEXT)
   * 2. Targeted Typesense search based on classification
   * 3. Disambiguation checks for ambiguous city queries
   * 4. Relevance ranking for raw search results
   *
   * @param query - The search query provided by the client (minimum 2 characters).
   * @param limitStr - Optional string representing the maximum number of results to return (default: 8).
   * @returns A Promise resolving to a strongly-typed SearchResponse object.
   * @throws BadRequestException if the query length is insufficient.
   * @throws HttpException (503) if the underlying search service is unavailable.
   */
  async search(query: string, limitStr?: string): Promise<SearchResponse> {
    if (!query || query.length < 2) {
      throw new BadRequestException({ error: "QUERY_TOO_SHORT", message: "Query must be at least 2 characters" });
    }

    const startMs = Date.now();
    const limit = limitStr ? parseInt(limitStr, 10) : 8;

    try {
      const qClass = this.classifier.classifyQuery(query, metros, regions);
      let results: SearchResult[] = [];

      if (qClass.type === 'IATA_CODE' || qClass.type === 'ICAO_CODE') {
        const tsRes = await this.typesense.searchAirports(qClass.code, { 
          filterBy: qClass.type === 'IATA_CODE' ? `iata_code:=${qClass.code}` : `icao_code:=${qClass.code}`
        });
        if (tsRes.hits && tsRes.hits.length > 0) {
          const doc = tsRes.hits[0].document as any;
          results = [{
            type: "airport",
            iata: doc.iata_code,
            name: doc.name,
            city: doc.city,
            country: doc.country_name,
            country_code: doc.country_code
          }];
        }
      } 
      else if (qClass.type === 'METRO_CODE') {
        const m = qClass.metro;
        const tsRes = await this.typesense.searchAirports("*", { 
          filterBy: `iata_code:[${m.iata_codes.join(",")}]`,
          limit: m.iata_codes.length
        });
        const rawResults = (tsRes.hits || []).map((h: any) => h.document);
        results = this.ranker.rankResults(query, rawResults);
      }
      else if (qClass.type === 'REGION') {
        const r = qClass.region;
        const tsRes = await this.typesense.searchAirports("*", { 
          filterBy: `iata_code:[${r.iata_codes.join(",")}]`,
          limit: r.iata_codes.length
        });
        const rawResults = (tsRes.hits || []).map((h: any) => h.document);
        results = this.ranker.rankResults(query, rawResults);
      }
      else {
        const tsRes = await this.typesense.searchAirports(qClass.query, { limit });
        const rawResults = (tsRes.hits || []).map((h: any) => h.document);

        const disambiguated = this.disambiguator.shouldDisambiguate(qClass.query, rawResults, metros);
        if (disambiguated) {
          results = disambiguated;
        } else {
          results = this.ranker.rankResults(qClass.query, rawResults);
        }
      }

      return {
        query: query,
        results: results,
        took_ms: Date.now() - startMs,
        total: results.length
      };
    } catch (e: any) {
      console.error("Search error:", e);
      return {
        query,
        results: [],
        took_ms: Date.now() - startMs,
        total: 0
      };
    }
  }
}
