import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchResponse } from './types/airport';

/**
 * Controller responsible for handling the core search functionality.
 * Exposes the main search API endpoints.
 */
@Controller('api')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * Health check endpoint to verify service status.
   */
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * Executes a search query against the airport database.
   *
   * @param query - The search query provided by the client (minimum 2 characters).
   * @param limit - Optional string representing the maximum number of results to return (default: 8).
   * @returns A Promise resolving to a strongly-typed SearchResponse object.
   */
  @Get('search')
  async search(@Query('q') query: string, @Query('limit') limit?: string): Promise<SearchResponse> {
    return this.searchService.search(query, limit);
  }
}
