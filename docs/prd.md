# Fly Fairly — Airport Search Engine
## Product Requirements Document + Coding Agent Rules
**Version**: 1.0 | **Target**: Senior Full-Stack Engineer Take-Home Assignment

---

## PART 1: PRODUCT REQUIREMENTS DOCUMENT

---

### 1. Product Overview

#### 1.1 Problem Statement
Every booking on Fly Fairly starts with a search box. Airport search is deceptively hard:
users type IATA codes, city names, country names, regional aliases, non-Latin scripts, and typos.
Naive substring or fuzzy matching fails the majority of real-world inputs.
This PRD defines a production-quality airport search engine that handles all known failure classes.

#### 1.2 Goals
- Handle all 15+ documented production failure cases
- Sub-100ms p99 query latency
- Support English, Chinese (Simplified + Traditional), Japanese, Arabic, Cyrillic, and Latin with diacritics
- Rank results by travel relevance (commercial airports first, major hubs ranked highest)
- Disambiguate ambiguous queries (multi-airport metros, same-name cities in different countries)
- Beat naive substring matching on a documented eval harness

#### 1.3 Non-Goals
- Full booking flow (out of scope)
- Flight availability (out of scope)
- User authentication (out of scope)
- Mobile-native app (web UI only)

---

### 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
│  React + Vite (TypeScript) · Debounced search · Keyboard nav    │
└─────────────────────────┬───────────────────────────────────────┘
                           │ HTTP GET /api/search?q=...
┌─────────────────────────▼───────────────────────────────────────┐
│                        API LAYER                                 │
│  Node.js + TypeScript (Hono) · Input sanitisation · Rate limit  │
└──────────────────┬──────────────────────┬───────────────────────┘
                   │                      │
       ┌───────────▼──────────┐  ┌────────▼───────────────┐
       │   TYPESENSE ENGINE   │  │  POSTGRES (source of    │
       │  Search · Ranking    │  │  truth) Airport records │
       │  Typo tolerance      │  │  Aliases · Metros       │
       └──────────────────────┘  └────────────────────────┘
                   │
┌──────────────────▼─────────────────────────────────────────────┐
│                    DATA PIPELINE (Python)                        │
│  OurAirports CSV → Clean → Enrich → Alias → Seed Typesense     │
└────────────────────────────────────────────────────────────────┘
```

---

### 3. Data Model

#### 3.1 Airport Record (Postgres source of truth)

```sql
CREATE TABLE airports (
  id              SERIAL PRIMARY KEY,
  iata_code       CHAR(3) UNIQUE NOT NULL,        -- "JFK"
  icao_code       CHAR(4),                         -- "KJFK"
  name            TEXT NOT NULL,                   -- "John F. Kennedy International"
  city            TEXT NOT NULL,                   -- "New York"
  country_code    CHAR(2) NOT NULL,                -- "US"
  country_name    TEXT NOT NULL,                   -- "United States"
  region          TEXT,                            -- "New York"
  state_province  TEXT,                            -- "New York"
  latitude        DECIMAL(9,6),
  longitude       DECIMAL(9,6),
  airport_type    TEXT NOT NULL,                   -- "large_airport" | "medium_airport"
  commercial_rank INT DEFAULT 0,                   -- 1=hub, 2=major, 3=regional
  timezone        TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE airport_aliases (
  id           SERIAL PRIMARY KEY,
  iata_code    CHAR(3) REFERENCES airports(iata_code),
  alias        TEXT NOT NULL,        -- "Heathrow", "London Heathrow", "ロンドン"
  alias_type   TEXT NOT NULL,        -- "colloquial" | "endonym" | "cjk" | "arabic" | "cyrillic" | "legacy"
  language     TEXT,                 -- "ja", "ar", "zh-CN", etc.
  weight       INT DEFAULT 1         -- boosting weight for ranking
);

CREATE TABLE metro_groups (
  id           SERIAL PRIMARY KEY,
  metro_code   CHAR(3) NOT NULL,     -- "LON", "NYC", "PAR"
  metro_name   TEXT NOT NULL,        -- "London"
  country_code CHAR(2) NOT NULL,
  iata_codes   TEXT[] NOT NULL       -- ["LHR","LGW","STN","LCY","LTN"]
);

CREATE TABLE regions (
  id           SERIAL PRIMARY KEY,
  region_name  TEXT NOT NULL,        -- "Hawaii", "Bali", "Ontario"
  region_type  TEXT NOT NULL,        -- "state" | "province" | "island" | "territory"
  country_code CHAR(2) NOT NULL,
  iata_codes   TEXT[] NOT NULL,      -- ["HNL","OGG","KOA","LIH"]
  aliases      TEXT[]                -- ["Hawaiian Islands"]
);
```

#### 3.2 Typesense Document Schema

```typescript
interface AirportDocument {
  id: string;                    // iata_code
  iata_code: string;             // "JFK"
  icao_code: string;             // "KJFK"
  name: string;                  // "John F. Kennedy International Airport"
  name_short: string;            // "JFK" display label
  city: string;                  // "New York"
  country_code: string;          // "US"
  country_name: string;          // "United States"
  state_province: string;        // "New York"
  region: string;                // for region grouping
  aliases: string[];             // ["Kennedy", "New York JFK", "纽约肯尼迪"]
  aliases_cjk: string[];         // CJK-specific aliases, separate field
  aliases_arabic: string[];      // Arabic script aliases
  aliases_cyrillic: string[];    // Cyrillic aliases
  airport_type: string;          // "large_airport"
  commercial_rank: number;       // 1=hub, 2=major, 3=regional (lower = higher priority)
  _geo: { lat: number; lng: number };
  popularity_score: number;      // computed from pax data / Wikidata prominence
}
```

---

### 4. Search Logic Specification

#### 4.1 Query Classification (pre-search routing)

Before hitting Typesense, classify the query:

| Pattern | Classification | Action |
|---|---|---|
| Exactly 3 uppercase chars | `IATA_CODE` | Exact match on `iata_code` first |
| Exactly 4 uppercase chars | `ICAO_CODE` | Exact match on `icao_code` first |
| Known metro code (LON, NYC) | `METRO_CODE` | Return metro group result |
| Known region name | `REGION` | Return all airports in region |
| Everything else | `FREETEXT` | Full Typesense fuzzy search |

#### 4.2 Typesense Search Configuration

```typescript
const searchParams = {
  q: query,
  query_by: [
    "iata_code",          // weight 10 — exact IATA wins
    "name",               // weight 7
    "city",               // weight 8 — city match is very strong signal
    "country_name",       // weight 4
    "state_province",     // weight 6
    "aliases",            // weight 9 — covers colloquial names
    "aliases_cjk",        // weight 9 — CJK searches
    "aliases_arabic",     // weight 9
    "aliases_cyrillic",   // weight 9
  ].join(","),
  query_by_weights: "10,7,8,4,6,9,9,9,9",
  typo_tokens_threshold: 1,
  num_typos: 2,
  prefix: true,
  sort_by: "_text_match:desc,commercial_rank:asc,popularity_score:desc",
  filter_by: "airport_type:[large_airport, medium_airport]",  // exclude heliports, military
  per_page: 8,
  highlight_full_fields: "name,city,iata_code",
};
```

#### 4.3 Result Types

Three distinct result shapes, all returned from the same endpoint:

**Type A: Single Airport**
```json
{
  "type": "airport",
  "iata": "JFK",
  "name": "John F. Kennedy International Airport",
  "city": "New York",
  "country": "United States",
  "country_code": "US"
}
```

**Type B: Metro Group** (triggered by "LON", "NYC", "London", "New York")
```json
{
  "type": "metro",
  "metro_code": "LON",
  "metro_name": "London",
  "country": "United Kingdom",
  "airports": [
    { "iata": "LHR", "name": "Heathrow" },
    { "iata": "LGW", "name": "Gatwick" },
    { "iata": "STN", "name": "Stansted" },
    { "iata": "LCY", "name": "City" },
    { "iata": "LTN", "name": "Luton" }
  ]
}
```

**Type C: Disambiguation** (triggered when same name exists in 2+ countries)
```json
{
  "type": "disambiguation",
  "query": "London",
  "options": [
    { "type": "metro", "metro_code": "LON", "country": "United Kingdom", "hint": "Heathrow, Gatwick, +3" },
    { "type": "airport", "iata": "YXU", "country": "Canada", "hint": "Ontario" },
    { "type": "airport", "iata": "LKY", "country": "United States", "hint": "Kentucky" }
  ]
}
```

---

### 5. Specific Failure Case Handling

#### 5.1 Region Search: "Hawaii" → [HNL, OGG, KOA, LIH]
- Maintain a `regions` table with pre-mapped IATA codes
- On query match to `regions.region_name` or `regions.aliases`, return all region airports sorted by commercial_rank
- Same logic for "Ontario", "Bali", "Goa", "Tuscany"

#### 5.2 Tourism Alias: "Bali" → DPS (not BPN)
- "Bali" is an alias for DPS (Denpasar, Ngurah Rai) — stored in `airport_aliases`
- BPN (Balikpapan, East Kalimantan) must not fuzzy-match
- Prevention: exact alias match beats fuzzy name match in ranking; alias weight=9 > name substring weight

#### 5.3 Florida Trap: "Florida" → US, not Chile's "La Florida"
- "Florida" maps to `regions` table → state search → all FL airports
- `La Florida` (CJC) is a Chilean city — different region, different country
- Region match fires first; country-rank bonus applied (US airports rank above Chile for ambiguous names)
- Typesense filter: when query matches a US state name, boost `country_code:US`

#### 5.4 City-to-Airport: "Manama" → BAH, "Brussels" → BRU
- City name aliases stored in `airport_aliases` with `alias_type = "city"`
- Zaventem (the municipality) is the raw OurAirports city — "Brussels" alias must be manually added
- Enrichment script adds 200+ such mappings from Wikipedia and common sense

#### 5.5 IATA Reverse: "TUL" → Tulsa, and "Tulsa" → TUL
- IATA codes indexed as `iata_code` field with weight 10
- Both directions work because both fields are indexed
- "TUL" gets exact match; "Tulsa" gets city field match
- The known bug was OurAirports missing some IATA codes → fixed in cleaning script

#### 5.6 Typo: "Londn" → London
- Typesense `num_typos: 2` handles 1-2 character errors
- Edit distance of 1 ("Londn" vs "London") is within default tolerance
- Do NOT use overly loose tolerance — "Florida" must not match "La Florida"

#### 5.7 Metro Code: "LON" → LHR, LGW, STN, LCY, LTN
- Pre-classification step: if query === known metro code → return metro group result
- Metro codes stored in `metro_groups` table
- "LON" is NOT an IATA code for any single airport — the classifier must route correctly

#### 5.8 Disambiguation: "London" → UK vs Ontario vs Kentucky
- After Typesense search, if results contain 2+ entries with the same city name in different countries → trigger disambiguation result type
- Show UK/metro first (highest popularity_score), then Canada, then US small city
- User sees a picker, not a wrong result

#### 5.9 CJK Search: "東京" → HND, NRT
- CJK aliases stored in `aliases_cjk` field in Typesense
- OurAirports has English only — CJK aliases added via enrichment script (Wikidata + manual)
- Typesense handles CJK tokenisation natively in v0.25+
- "東京" → aliases_cjk contains "東京" for both HND and NRT → both surface, sorted by commercial_rank
- Same pattern: "北京" → PEK/PKX, "서울" → ICN/GMP, "دبي" → DXB

#### 5.10 Accent Normalisation: "Sao Paulo" = "São Paulo"
- Typesense `enable_nested_fields` + locale-aware normalisation handles Latin diacritics
- Additionally store accent-stripped version in aliases: "Sao Paulo" alias for GRU/CGH
- "Roma" / "Rome", "München" / "Munich" — endonym aliases stored in enrichment step

---

### 6. API Specification

#### 6.1 Endpoints

```
GET  /api/search?q={query}&limit={n}   → SearchResult[]
GET  /api/airport/{iata}               → AirportDetail
GET  /api/metro/{code}                 → MetroGroup
GET  /health                           → { status: "ok", typesense: "ok", pg: "ok" }
```

#### 6.2 Search Response

```typescript
interface SearchResponse {
  query: string;
  results: SearchResult[];
  took_ms: number;
  total: number;
}

type SearchResult = AirportResult | MetroResult | DisambiguationResult;
```

#### 6.3 Error Responses
```json
{ "error": "QUERY_TOO_SHORT", "message": "Query must be at least 2 characters" }
{ "error": "SEARCH_UNAVAILABLE", "message": "Search service temporarily unavailable" }
```

---

### 7. Ranking Logic

Priority order (highest to lowest):

1. **Exact IATA match** — "JFK" → JFK, no further ranking needed
2. **Exact metro code match** — "LON" → metro group
3. **Exact alias match** — "Bali" → DPS via alias
4. **Exact city match + country bonus** — "Manama" city field match
5. **Fuzzy match on name/city** — typo tolerance applies
6. **commercial_rank ascending** — large hubs (rank=1) before regional airports
7. **popularity_score descending** — tie-breaker using passenger volume proxy

**Commercial rank definition:**
- Rank 1: Hubs (>20M annual pax equivalent) — JFK, LHR, DXB, SIN, HND
- Rank 2: Major (5M–20M pax)
- Rank 3: Regional (1M–5M pax)
- Rank 4: Small commercial (<1M pax)
- Excluded: heliports, seaplane bases, military, private

---

### 8. Data Pipeline Specification

#### 8.1 Sources

| Source | Data | Format |
|---|---|---|
| OurAirports | Base airport records, IATA/ICAO, coordinates, type | CSV |
| Wikidata SPARQL | CJK/Arabic/Cyrillic names, population, passenger data | JSON API |
| Manual alias file | Brussels→BRU, Bali→DPS, tourism names | JSON |
| Metro groups file | LON, NYC, PAR, TYO groupings | JSON |
| Regions file | Hawaii, Ontario, Florida US state mappings | JSON |

#### 8.2 Cleaning Rules

```python
EXCLUDE_TYPES = [
    "heliport", "seaplane_base", "balloonport",
    "closed", "small_airport"  # small_airport kept only if has scheduled service flag
]

INCLUDE_ONLY_IF = {
    "small_airport": lambda r: r["scheduled_service"] == "yes"
}

# Must have valid IATA code (3 uppercase letters)
VALID_IATA = re.compile(r'^[A-Z]{3}$')

# Deduplicate by IATA — keep highest completeness record
# Normalise country codes to ISO 3166-1 alpha-2
# Strip HTML entities from names
# Normalise Unicode to NFC form
```

#### 8.3 Enrichment Steps

```
Step 1: Load OurAirports airports.csv → filter → 5,000–8,000 commercial airports
Step 2: Load manual aliases JSON → attach aliases to each IATA code
Step 3: Query Wikidata for CJK/Arabic/Cyrillic airport names (top 500 airports by traffic)
Step 4: Load metro_groups.json → validate all IATA codes exist
Step 5: Load regions.json → validate all IATA codes exist
Step 6: Compute popularity_score from passenger rank (hardcoded top 200, default=50)
Step 7: Push to Typesense collection
Step 8: Push to Postgres
```

---

### 9. Evaluation Harness

#### 9.1 Test Cases (must all pass)

```typescript
const EVAL_CASES = [
  // Region searches
  { query: "Hawaii",   expectType: "airport_list", expectContains: ["HNL","OGG","KOA","LIH"] },
  { query: "Ontario",  expectType: "airport_list", expectContains: ["YYZ","YOW","YHM"] },

  // Tourism aliases
  { query: "Bali",     expectType: "airport",  expectIATA: "DPS", expectNotContains: ["BPN"] },
  { query: "Goa",      expectType: "airport",  expectIATA: "GOI" },

  // Fuzzy traps
  { query: "Florida",  expectType: "airport_list", expectCountry: "US", expectNotContains: ["CJC"] },

  // City-to-airport
  { query: "Manama",   expectType: "airport",  expectIATA: "BAH" },
  { query: "Brussels", expectType: "airport",  expectIATA: "BRU" },
  { query: "Bengaluru",expectType: "airport",  expectIATA: "BLR" },

  // IATA both directions
  { query: "TUL",      expectType: "airport",  expectIATA: "TUL" },
  { query: "Tulsa",    expectType: "airport",  expectIATA: "TUL" },
  { query: "CTA",      expectType: "airport",  expectIATA: "CTA" },
  { query: "Catania",  expectType: "airport",  expectIATA: "CTA" },

  // Typo tolerance
  { query: "Londn",    expectType: "metro",    expectMetro: "LON" },
  { query: "Sydeny",   expectType: "airport",  expectIATA: "SYD" },
  { query: "Tokio",    expectType: "airport_list", expectContains: ["HND","NRT"] },

  // Metro codes
  { query: "LON",      expectType: "metro",    expectMetro: "LON", expectContains: ["LHR","LGW","STN"] },
  { query: "NYC",      expectType: "metro",    expectMetro: "NYC", expectContains: ["JFK","EWR","LGA"] },

  // Disambiguation
  { query: "London",   expectType: "disambiguation", expectOptionCount: 3 },

  // CJK
  { query: "東京",     expectType: "airport_list", expectContains: ["HND","NRT"] },
  { query: "北京",     expectType: "airport_list", expectContains: ["PEK"] },
  { query: "서울",     expectType: "airport_list", expectContains: ["ICN","GMP"] },
  { query: "دبي",      expectType: "airport",  expectIATA: "DXB" },

  // Accent / endonym
  { query: "Sao Paulo",     expectType: "airport_list", expectContains: ["GRU","CGH"] },
  { query: "São Paulo",     expectType: "airport_list", expectContains: ["GRU","CGH"] },
  { query: "Roma",          expectType: "airport",  expectIATA: "FCO" },
  { query: "München",       expectType: "airport",  expectIATA: "MUC" },
  { query: "Munich",        expectType: "airport",  expectIATA: "MUC" },
];
```

#### 9.2 Metrics to Track

| Metric | Target |
|---|---|
| Eval harness pass rate | 100% |
| p50 latency | < 30ms |
| p99 latency | < 100ms |
| Top-1 precision on IATA queries | 100% |
| Top-3 recall on city queries | > 95% |
| CJK test case pass rate | 100% |

---

### 10. Frontend Component Specification

#### 10.1 Search Box Behaviour
- Debounce: 200ms after last keystroke
- Minimum query length: 2 characters
- Show loading spinner during fetch
- Keyboard navigation: ↑↓ to move, Enter to select, Escape to close
- Clear button (×) when query is non-empty

#### 10.2 Result Rendering

**Airport result:**
```
[Flag] JFK · John F. Kennedy International
        New York, United States
```

**Metro result:**
```
[Flag] London Airports (LON)
        LHR · LGW · STN · LCY · LTN
```

**Disambiguation result:**
```
Did you mean?
  → London, United Kingdom (Heathrow, Gatwick +3)
  → London, Ontario, Canada
  → London, Kentucky, United States
```

#### 10.3 Empty States
- No results: "No airports found for '[query]' — try a city name or IATA code"
- Error: "Search unavailable. Please try again."
- Too short: (no dropdown shown, no message)
---

*End of PRD*
*Fly Fairly Pte. Ltd. — Airport Search Engine v1.0*