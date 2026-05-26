
## PART 2: CODING AGENT RULES

---

## MANDATORY: Read Before Writing Any Code

These rules govern how Claude (or any coding agent) should generate code for this project.
Violating these rules produces a failing review. There are no exceptions.

---

### RULE 0 — PROJECT CONTEXT

You are building the Fly Fairly Airport Search Engine.
Stack: Node.js + TypeScript (backend), React + Vite + TypeScript (frontend), Python (data pipeline),
Typesense (search), PostgreSQL (source of truth), Docker Compose (local dev).

The company uses: React, Node.js, Go, Next.js, Terraform.
Match their aesthetic: clean, typed, no magic, no unnecessary abstraction.

---

### RULE 1 — TYPESCRIPT EVERYWHERE (backend + frontend)

```typescript
// CORRECT
interface SearchResult {
  type: "airport" | "metro" | "disambiguation";
  iata?: string;
  city: string;
}

// WRONG — never use 'any' or untyped objects
const result: any = await search(q);
const result = await search(q); // without typing the return
```

- `strict: true` in all tsconfig.json files — no exceptions
- No `any` — use `unknown` and narrow, or define the interface
- All API response shapes must have explicit interfaces
- All function parameters and return types must be explicitly typed
- Use `zod` for runtime validation of external data (Typesense responses, OurAirports CSV rows)

---

### RULE 2 — FILE + FOLDER STRUCTURE

```
fly-fairly-search/
├── packages/
│   ├── api/                          # Node.js Hono API
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── search.ts         # GET /api/search
│   │   │   │   ├── airport.ts        # GET /api/airport/:iata
│   │   │   │   └── health.ts         # GET /health
│   │   │   ├── services/
│   │   │   │   ├── typesense.ts      # Typesense client + query builder
│   │   │   │   ├── classifier.ts     # Query pre-classification
│   │   │   │   ├── disambiguator.ts  # Disambiguation logic
│   │   │   │   └── ranker.ts         # Post-search ranking
│   │   │   ├── types/
│   │   │   │   ├── airport.ts        # AirportDocument, SearchResult etc.
│   │   │   │   └── api.ts            # Request/response shapes
│   │   │   ├── lib/
│   │   │   │   └── typesense-client.ts
│   │   │   └── index.ts              # App entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── web/                          # React + Vite frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── AirportSearch/
│   │   │   │   │   ├── AirportSearch.tsx
│   │   │   │   │   ├── SearchInput.tsx
│   │   │   │   │   ├── ResultsList.tsx
│   │   │   │   │   ├── AirportItem.tsx
│   │   │   │   │   ├── MetroItem.tsx
│   │   │   │   │   └── DisambiguationItem.tsx
│   │   │   │   └── ui/               # Generic UI primitives
│   │   │   ├── hooks/
│   │   │   │   ├── useAirportSearch.ts
│   │   │   │   └── useDebounce.ts
│   │   │   ├── types/
│   │   │   │   └── search.ts
│   │   │   └── main.tsx
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── pipeline/                     # Python data pipeline
│       ├── src/
│       │   ├── fetch.py              # Download OurAirports CSV
│       │   ├── clean.py              # Filter, normalise, deduplicate
│       │   ├── enrich.py             # Add aliases, CJK, metro groups
│       │   ├── seed_typesense.py     # Push to Typesense
│       │   └── seed_postgres.py      # Push to Postgres
│       ├── data/
│       │   ├── aliases.json          # Manual alias overrides
│       │   ├── metro_groups.json     # Metro group definitions
│       │   └── regions.json          # Region → IATA mappings
│       └── requirements.txt
│
├── eval/
│   ├── cases.ts                      # All 30 eval test cases
│   └── run.ts                        # Eval runner, prints pass/fail table
│
├── docker-compose.yml
└── README.md
```

---

### RULE 3 — NO MAGIC STRINGS

```typescript
// CORRECT
const AIRPORT_TYPES = {
  LARGE: "large_airport",
  MEDIUM: "medium_airport",
} as const;

type AirportType = typeof AIRPORT_TYPES[keyof typeof AIRPORT_TYPES];

// WRONG
if (airport.type === "large_airport") { ... }  // magic string
```

All configuration values, type literals, field names referenced in queries → named constants.

---

### RULE 4 — ERROR HANDLING IS NOT OPTIONAL

Every async function must handle errors explicitly:

```typescript
// CORRECT
async function searchAirports(query: string): Promise<SearchResponse> {
  try {
    const results = await typesenseClient.search(query);
    return formatResults(results);
  } catch (error) {
    if (error instanceof TypesenseError) {
      logger.error("Typesense search failed", { query, error: error.message });
      throw new SearchServiceError("Search unavailable", { cause: error });
    }
    throw error;
  }
}

// WRONG
async function searchAirports(query: string) {
  const results = await typesenseClient.search(query);  // unhandled rejection
  return results;
}
```

- Never swallow errors silently
- Log errors with context (query, timestamp, error type)
- Return typed error responses to the client — never leak stack traces

---

### RULE 5 — QUERY CLASSIFIER IS PURE FUNCTION

The classifier must be a pure, synchronous function with 100% test coverage:

```typescript
type QueryClass =
  | { type: "IATA_CODE"; code: string }
  | { type: "ICAO_CODE"; code: string }
  | { type: "METRO_CODE"; code: string; metro: MetroGroup }
  | { type: "REGION"; region: Region }
  | { type: "FREETEXT"; query: string };

function classifyQuery(input: string, metros: MetroGroup[], regions: Region[]): QueryClass {
  const trimmed = input.trim();

  // Exact 3-letter uppercase → try IATA first
  if (/^[A-Z]{3}$/.test(trimmed)) {
    const metro = metros.find(m => m.metro_code === trimmed);
    if (metro) return { type: "METRO_CODE", code: trimmed, metro };
    return { type: "IATA_CODE", code: trimmed };
  }

  // Exact 4-letter uppercase → ICAO
  if (/^[A-Z]{4}$/.test(trimmed)) {
    return { type: "ICAO_CODE", code: trimmed };
  }

  // Region match (case-insensitive)
  const region = regions.find(r =>
    r.region_name.toLowerCase() === trimmed.toLowerCase() ||
    r.aliases.some(a => a.toLowerCase() === trimmed.toLowerCase())
  );
  if (region) return { type: "REGION", region };

  return { type: "FREETEXT", query: trimmed };
}
```

---

### RULE 6 — TYPESENSE QUERY BUILDER IS ISOLATED

Never inline Typesense search parameters in route handlers.
All search config goes through a dedicated query builder:

```typescript
// services/typesense.ts
export function buildSearchParams(query: string, options?: SearchOptions): TypesenseSearchParams {
  return {
    q: query,
    query_by: SEARCH_FIELDS.join(","),
    query_by_weights: SEARCH_WEIGHTS.join(","),
    num_typos: 2,
    typo_tokens_threshold: 1,
    prefix: true,
    sort_by: SORT_ORDER,
    filter_by: `airport_type:[${COMMERCIAL_TYPES.join(",")}]`,
    per_page: options?.limit ?? 8,
  };
}
```

---

### RULE 7 — PYTHON PIPELINE RULES

```python
# CORRECT — explicit types, structured logging
from dataclasses import dataclass
from typing import Optional
import logging

logger = logging.getLogger(__name__)

@dataclass
class AirportRecord:
    iata_code: str
    name: str
    city: str
    country_code: str
    airport_type: str
    latitude: Optional[float]
    longitude: Optional[float]

def clean_airport(row: dict) -> Optional[AirportRecord]:
    """Returns None if airport should be excluded."""
    if not VALID_IATA.match(row.get("iata_code", "")):
        logger.debug("Skipping airport with invalid IATA: %s", row.get("name"))
        return None
    ...

# WRONG
def clean(r):
    if r["iata_code"]:  # no type hints, no logging, no None handling
        return r
```

- All pipeline scripts must be idempotent (safe to re-run)
- Log counts at each stage: "Loaded 70,000 rows → 7,243 after filtering"
- Store raw downloaded files; never modify raw data, only produce derived files
- All JSON data files must have JSON Schema validation

---

### RULE 8 — TESTS THAT EARN THEIR KEEP

Write tests for:
- `classifier.ts` — 100% coverage, all edge cases
- `disambiguator.ts` — all disambiguation scenarios
- `ranker.ts` — ranking order is deterministic and correct
- Eval harness — all 30 eval cases must pass (this is the integration test)

Do NOT write tests for:
- Boilerplate wiring (Express/Hono setup)
- Typesense client configuration
- React component render snapshots (unless behaviour is being tested)

```typescript
// CORRECT — testing real behaviour
describe("classifyQuery", () => {
  it("classifies LON as METRO_CODE not IATA_CODE", () => {
    const result = classifyQuery("LON", METRO_GROUPS, REGIONS);
    expect(result.type).toBe("METRO_CODE");
  });

  it("classifies Florida as REGION for US states", () => {
    const result = classifyQuery("Florida", METRO_GROUPS, REGIONS);
    expect(result.type).toBe("REGION");
    expect((result as RegionQuery).region.country_code).toBe("US");
  });

  it("returns FREETEXT for CJK input", () => {
    const result = classifyQuery("東京", METRO_GROUPS, REGIONS);
    expect(result.type).toBe("FREETEXT");
  });
});
```

---

### RULE 9 — REACT COMPONENT RULES

```tsx
// CORRECT
interface AirportItemProps {
  result: AirportResult;
  isSelected: boolean;
  onSelect: (iata: string) => void;
}

const AirportItem: React.FC<AirportItemProps> = ({ result, isSelected, onSelect }) => {
  return (
    <li
      role="option"
      aria-selected={isSelected}
      onClick={() => onSelect(result.iata)}
    >
      <span className="iata">{result.iata}</span>
      <span className="name">{result.name}</span>
      <span className="city">{result.city}, {result.country}</span>
    </li>
  );
};

// WRONG
const AirportItem = ({ result, isSelected, onSelect }: any) => { ... }
```

- Every component has typed props interface
- No prop drilling more than 2 levels — use context or pass callbacks
- useAirportSearch hook encapsulates all fetch/debounce/state logic
- No business logic in render functions
- Accessibility: `role="combobox"` on input, `role="listbox"` on results, `aria-selected` on items

---

### RULE 10 — ENVIRONMENT CONFIGURATION

```typescript
// lib/config.ts
import { z } from "zod";

const EnvSchema = z.object({
  TYPESENSE_HOST: z.string().default("localhost"),
  TYPESENSE_PORT: z.coerce.number().default(8108),
  TYPESENSE_API_KEY: z.string(),
  DATABASE_URL: z.string(),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export const config = EnvSchema.parse(process.env);
```

All environment variables must:
- Be declared in `.env.example` with descriptions
- Be validated at startup with Zod
- Never be accessed directly with `process.env.X` anywhere except `lib/config.ts`

---

### RULE 11 — DOCKER COMPOSE MUST WORK FIRST TRY

```yaml
# docker-compose.yml
services:
  typesense:
    image: typesense/typesense:0.25.2
    ports: ["8108:8108"]
    volumes: ["typesense-data:/data"]
    command: --data-dir /data --api-key=${TYPESENSE_API_KEY} --enable-cors
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8108/health"]
      interval: 5s
      timeout: 3s
      retries: 10

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: flyairports
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s

  api:
    build: ./packages/api
    ports: ["3000:3000"]
    depends_on:
      typesense: { condition: service_healthy }
      postgres:  { condition: service_healthy }
    env_file: .env

volumes:
  typesense-data:
```

The README must have a single `docker compose up` command that starts everything.
The data pipeline must be runnable with one command: `cd packages/pipeline && python run_pipeline.py`

---

### RULE 12 — WHAT TO MOCK vs WHAT TO BUILD REAL

| Component | Build Real | Why |
|---|---|---|
| Typesense search | ✅ Real | Core of the assignment |
| Query classifier | ✅ Real | Testable pure logic |
| Data pipeline | ✅ Real | Graded on data quality |
| Eval harness | ✅ Real | Proves search quality |
| Postgres schema | ✅ Real | Shows data modelling |
| React UI | ✅ Real (thin) | Shows craft |
| Rate limiting | 🟡 Fake/simple | In-memory, not Redis |
| Auth | ❌ Skip | Out of scope |
| Caching layer | 🟡 Optional | Only if time allows |
| Analytics | ❌ Skip | Out of scope |

---

### RULE 13 — LOGGING FORMAT

Use structured JSON logging in production, human-readable in development:

```typescript
// lib/logger.ts
import pino from "pino";

export const logger = pino({
  level: config.NODE_ENV === "production" ? "info" : "debug",
  transport: config.NODE_ENV !== "production"
    ? { target: "pino-pretty" }
    : undefined,
});

// In route handlers
logger.info({ query, took_ms, result_count }, "search completed");
logger.error({ query, error: err.message }, "search failed");
```

---

### RULE 14 — COMMIT DISCIPLINE

Every commit message follows Conventional Commits:

```
feat(pipeline): add CJK alias enrichment from Wikidata
fix(search): Florida no longer matches La Florida Chile
feat(api): add disambiguation result type for same-name cities
test(eval): all 30 eval cases now passing
docs(readme): add one-command setup instructions
```

---

### RULE 15 — APPROACH MEMO CHECKLIST

The 1-page memo must cover (grade weight = code weight):

- [ ] Data sources used and why
- [ ] What was cleaned/excluded from OurAirports and why
- [ ] Why Typesense over Elasticsearch/Algolia/Fuse.js
- [ ] LLM tools used (Claude, Cursor, Copilot) and how
- [ ] Prompt iteration log — what didn't work, what did
- [ ] Where LLM was wrong and how you caught it
- [ ] Build vs buy vs fake decisions with justification
- [ ] Production evaluation metrics you'd track
- [ ] What you'd do differently with more time
- [ ] One thing you'd push back on the brief about

---
