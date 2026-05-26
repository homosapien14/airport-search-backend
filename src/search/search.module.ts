import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SearchController } from './search.controller';
import { ClassifierService } from './classifier.service';
import { TypesenseService } from './typesense.service';
import { DisambiguatorService } from './disambiguator.service';
import { RankerService } from './ranker.service';
import { SearchService } from './search.service';

@Module({
  imports: [ConfigModule],
  controllers: [SearchController],
  providers: [
    ClassifierService,
    TypesenseService,
    DisambiguatorService,
    RankerService,
    SearchService
  ],
})
export class SearchModule {}
