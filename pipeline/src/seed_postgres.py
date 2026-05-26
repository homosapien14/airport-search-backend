import json
import logging
import os
import psycopg
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env")

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

SCHEMA = """
DROP TABLE IF EXISTS airport_aliases CASCADE;
DROP TABLE IF EXISTS regions CASCADE;
DROP TABLE IF EXISTS metro_groups CASCADE;
DROP TABLE IF EXISTS airports CASCADE;

CREATE TABLE airports (
  id              SERIAL PRIMARY KEY,
  iata_code       CHAR(3) UNIQUE NOT NULL,
  icao_code       CHAR(4),
  name            TEXT NOT NULL,
  city            TEXT NOT NULL,
  country_code    CHAR(2) NOT NULL,
  country_name    TEXT NOT NULL,
  region          TEXT,
  state_province  TEXT,
  latitude        DECIMAL(9,6),
  longitude       DECIMAL(9,6),
  airport_type    TEXT NOT NULL,
  commercial_rank INT DEFAULT 0,
  popularity_score INT DEFAULT 50,
  timezone        TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE airport_aliases (
  id           SERIAL PRIMARY KEY,
  iata_code    CHAR(3) REFERENCES airports(iata_code),
  alias        TEXT NOT NULL,
  alias_type   TEXT NOT NULL,
  language     TEXT,
  weight       INT DEFAULT 1
);

CREATE TABLE metro_groups (
  id           SERIAL PRIMARY KEY,
  metro_code   CHAR(3) NOT NULL,
  metro_name   TEXT NOT NULL,
  country_code CHAR(2) NOT NULL,
  iata_codes   TEXT[] NOT NULL
);

CREATE TABLE regions (
  id           SERIAL PRIMARY KEY,
  region_name  TEXT NOT NULL,
  region_type  TEXT NOT NULL,
  country_code CHAR(2) NOT NULL,
  iata_codes   TEXT[] NOT NULL,
  aliases      TEXT[]
);
"""

def main():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        logger.error("DATABASE_URL not set in .env")
        return
        
    conn = psycopg.connect(db_url)
    cur = conn.cursor()
    
    logger.info("Initializing database schema...")
    cur.execute(SCHEMA)
    
    # Insert Airports
    with open("data/airports_enriched.json", "r", encoding="utf-8") as f:
        airports = json.load(f)
        
    logger.info(f"Inserting {len(airports)} airports...")
    airport_rows = []
    for a in airports:
        icao = a["icao_code"][:4] if a["icao_code"] else None
        airport_rows.append((
            a["iata_code"], icao, a["name"], a["city"], a["country_code"], a["country_name"],
            a["region"], a["state_province"], a["_geo"]["lat"], a["_geo"]["lng"],
            a["airport_type"], a["commercial_rank"], a["popularity_score"]
        ))
        
    cur.executemany("""
        INSERT INTO airports (iata_code, icao_code, name, city, country_code, country_name, region, state_province, latitude, longitude, airport_type, commercial_rank, popularity_score)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, airport_rows)
    
    # Insert Aliases
    with open("data/aliases.json", "r", encoding="utf-8") as f:
        aliases = json.load(f)
        
    logger.info(f"Inserting {len(aliases)} aliases...")
    alias_rows = [(a["iata_code"], a["alias"], a["alias_type"], a.get("language"), a.get("weight", 1)) for a in aliases]
    cur.executemany("""
        INSERT INTO airport_aliases (iata_code, alias, alias_type, language, weight)
        VALUES (%s, %s, %s, %s, %s)
    """, alias_rows)
    
    # Insert Metros
    with open("data/metro_groups.json", "r", encoding="utf-8") as f:
        metros = json.load(f)
        
    logger.info(f"Inserting {len(metros)} metro groups...")
    metro_rows = [(m["metro_code"], m["metro_name"], m["country_code"], m["iata_codes"]) for m in metros]
    cur.executemany("""
        INSERT INTO metro_groups (metro_code, metro_name, country_code, iata_codes)
        VALUES (%s, %s, %s, %s)
    """, metro_rows)
    
    # Insert Regions
    with open("data/regions.json", "r", encoding="utf-8") as f:
        regions = json.load(f)
        
    logger.info(f"Inserting {len(regions)} regions...")
    region_rows = [(r["region_name"], r["region_type"], r["country_code"], r["iata_codes"], r.get("aliases", [])) for r in regions]
    cur.executemany("""
        INSERT INTO regions (region_name, region_type, country_code, iata_codes, aliases)
        VALUES (%s, %s, %s, %s, %s)
    """, region_rows)
    
    conn.commit()
    cur.close()
    conn.close()
    logger.info("Postgres seeding complete.")

if __name__ == "__main__":
    main()
