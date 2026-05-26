## BUILD ORDER

---

### 1: Data Pipeline
1. Download `airports.csv` from OurAirports
2. Write `clean.py` — filter to commercial, validate IATA codes
3. Write `aliases.json` — 50+ critical aliases (Brussels, Manama, Bali, etc.)
4. Write `metro_groups.json` — LON, NYC, PAR, TYO, BOM, etc.
5. Write `regions.json` — US states + key regions (Bali, Goa, etc.)
6. Write `seed_typesense.py` — push to Typesense
7. **Checkpoint**: `GET /api/search?q=JFK` returns a result

### 2: Core Search API
1. Set up Hono API with TypeScript
2. Implement `classifier.ts` with full test suite
3. Implement `typesense.ts` query builder
4. Implement `disambiguator.ts`
5. Wire up `GET /api/search` endpoint
6. **Checkpoint**: All IATA + city queries working

### 3: Eval Harness + Edge Cases
1. Write `eval/cases.ts` with all 30 test cases
2. Run eval — fix failures
3. Handle CJK input (verify Typesense tokenisation)
4. Handle Florida/La Florida trap
5. Handle metro codes (LON, NYC)
6. **Checkpoint**: Eval harness passing > 90%

### 4: React UI + Polish
1. Build `AirportSearch` component
2. Build `useAirportSearch` hook with debounce
3. Render airport / metro / disambiguation results
4. Keyboard navigation
5. **Checkpoint**: Working UI demo

### 5 (buffer): Memo + Recording
1. Write approach memo (30 min)
2. Record Loom demo — show each failure case passing
3. Final eval run, screenshot results