import csv
import re
import logging
from typing import Dict, Any

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

VALID_IATA = re.compile(r'^[A-Z]{3}$')

EXCLUDE_TYPES = {
    "heliport", "seaplane_base", "balloonport", "closed"
}

def clean_airport(row: Dict[str, Any]) -> bool:
    """Returns True if the airport should be kept."""
    # Check IATA
    iata = row.get("iata_code", "")
    if not iata or not VALID_IATA.match(iata):
        return False
        
    # Check Type
    airport_type = row.get("type", "")
    if airport_type in EXCLUDE_TYPES:
        return False
        
    # Check small airport scheduled service
    if airport_type == "small_airport":
        if row.get("scheduled_service", "no") != "yes":
            return False
            
    # Exclude military bases
    name = row.get("name", "").lower()
    military_keywords = ["air base", "air force", "military", "naval", "army", "afb", "naf ", "mcas ", "afrb "]
    for kw in military_keywords:
        if kw in name:
            return False
            
    return True

def main():
    input_file = "data/airports.csv"
    output_file = "data/airports_clean.csv"
    
    total_rows = 0
    kept_rows = 0
    seen_iatas = set()
    
    with open(input_file, "r", encoding="utf-8") as infile, \
         open(output_file, "w", encoding="utf-8", newline="") as outfile:
         
        reader = csv.DictReader(infile)
        writer = csv.DictWriter(outfile, fieldnames=reader.fieldnames)
        writer.writeheader()
        
        for row in reader:
            total_rows += 1
            if clean_airport(row):
                iata = row["iata_code"]
                if iata not in seen_iatas:
                    seen_iatas.add(iata)
                    writer.writerow(row)
                    kept_rows += 1
                    
    logger.info(f"Loaded {total_rows} rows → {kept_rows} commercial airports after filtering")

if __name__ == "__main__":
    main()
