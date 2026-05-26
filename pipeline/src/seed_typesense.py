import json
import logging
import os
import typesense
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env")

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def main():
    host = os.environ.get("TYPESENSE_HOST", "localhost")
    port = os.environ.get("TYPESENSE_PORT", "8108")
    api_key = os.environ.get("TYPESENSE_API_KEY", "flyfairlysecret")
    
    client = typesense.Client({
        'nodes': [{
            'host': host,
            'port': port,
            'protocol': 'http'
        }],
        'api_key': api_key,
        'connection_timeout_seconds': 10
    })
    
    collection_name = 'airports'
    
    try:
        client.collections[collection_name].retrieve()
        logger.info(f"Deleting existing collection {collection_name}...")
        client.collections[collection_name].delete()
    except typesense.exceptions.ObjectNotFound:
        pass
        
    schema = {
        'name': collection_name,
        'enable_nested_fields': True,
        'fields': [
            {'name': 'iata_code', 'type': 'string'},
            {'name': 'icao_code', 'type': 'string'},
            {'name': 'name', 'type': 'string'},
            {'name': 'name_short', 'type': 'string'},
            {'name': 'city', 'type': 'string'},
            {'name': 'country_code', 'type': 'string'},
            {'name': 'country_name', 'type': 'string'},
            {'name': 'state_province', 'type': 'string'},
            {'name': 'region', 'type': 'string'},
            {'name': 'aliases', 'type': 'string[]'},
            {'name': 'aliases_cjk', 'type': 'string[]'},
            {'name': 'aliases_arabic', 'type': 'string[]'},
            {'name': 'aliases_cyrillic', 'type': 'string[]'},
            {'name': 'airport_type', 'type': 'string'},
            {'name': 'commercial_rank', 'type': 'int32'},
            {'name': 'popularity_score', 'type': 'int32'},
            {'name': '.*', 'type': 'auto'} # for geo
        ]
    }
    
    logger.info(f"Creating collection {collection_name}...")
    client.collections.create(schema)
    
    with open("data/airports_enriched.json", "r", encoding="utf-8") as f:
        airports = json.load(f)
        
    logger.info(f"Indexing {len(airports)} documents...")
    client.collections[collection_name].documents.import_(airports, {'action': 'create'})
    logger.info("Typesense seeding complete.")

if __name__ == "__main__":
    main()
