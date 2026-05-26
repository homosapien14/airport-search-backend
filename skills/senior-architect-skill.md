---
name: senior-architect
description: Apply senior engineering judgment to system design problems. Use this skill when making architecture decisions, designing data models, choosing search approaches, planning data pipelines, writing approach memos, or evaluating build-vs-buy tradeoffs. Produces decisions that are defensible, sharp, and graded by judgment not polish.
---

This skill guides senior-level architectural thinking for backend and search systems. The goal is not to produce the most complete system — it is to produce the most defensible one. Every cut matters more than every addition.

The user provides a problem: a system to design, a technical decision to make, or an approach to justify.

## Architectural Thinking

Before writing any code, answer these four questions in order:

- **What is the one thing that must work perfectly?** Everything else can be faked, mocked, or deferred. For airport search: relevance. Not latency. Not the UI. Relevance.
- **What are the top 3 failure modes?** Name them before they happen. For search: bad source data, wrong field weights, CJK not tokenised. Write the tests for these before the feature.
- **What can be faked without anyone noticing?** Rate limiting, caching, auth, analytics — all fakeable for a demo. Don't build what isn't graded.
- **What is irreversible?** Data model decisions and search schema design are hard to change. Everything else is soft. Spend your time budget on hard things.

**CRITICAL**: The approach memo is graded as heavily as the code. A sharp 1-page memo with clear tradeoffs signals more seniority than a sprawling codebase with no explanation.

## Data Pipeline Principles

For search systems, the pipeline IS the product. A perfect search engine on bad data returns bad results.

- Log row counts at every filter step: "70,000 raw → 7,243 commercial airports after filtering"
- Never modify raw source files — derive everything into clean output files
- Validate all external identifiers (IATA codes, country codes) with regex before downstream use
- Manual alias files beat scraped aliases for high-value entries — accuracy over automation for the top 200
- When in doubt, exclude. A missing airport is recoverable. A wrong result erodes trust.
- Make every pipeline script idempotent — safe to re-run without side effects

## Search Architecture Principles

Separate these three concerns into distinct modules — they change independently:

- **Data** (airports, aliases, metro groups) — changes when data is updated
- **Search config** (field weights, typo tolerance, filters) — changes when relevance is tuned
- **Ranking logic** (what wins when scores tie) — changes when product priorities shift

Never mix them. When a result is wrong, you should be able to open exactly one file to fix it.

Use query pre-classification before hitting the search engine. A pure function that routes IATA codes, metro codes, region names, and freetext before any fuzzy matching keeps the search engine doing what it's good at and keeps special cases explicit and testable.

## Build vs Buy Decision Framework

Apply this in order:

1. Can a hosted service solve this in under 30 minutes of setup? Is it free or cheap for a demo? → Use it.
2. Is there a library that handles the hard parts (CJK tokenisation, typo tolerance)? → Use it. Build only what the library doesn't cover.
3. Is the component a pure function with no external dependencies? → Build it. It's testable and you own it.
4. Does it require infrastructure you don't have time to configure? → Mock it. Label the mock clearly.

For this project specifically: Typesense self-hosted beats Algolia (paid, hides engineering), Elasticsearch (too heavy to tune in 5 hours), Fuse.js (no CJK, no real typo tolerance), and raw Postgres FTS (no typo tolerance, poor multilingual).

## Ranking is a Product Decision

Ranking order is not a technical default — document it explicitly as product logic:

```
1. Exact IATA match      → always wins, no discussion
2. Exact alias match     → "Bali" must beat fuzzy "Balikpapan"
3. Exact city match      → "Manama" city field, not airport name
4. commercial_rank asc   → hubs before regional airports
5. popularity_score desc → tiebreaker
```

When a result is ranked wrong, this list is where you look first. If it's not in this list, it's not a ranking decision — it's a data or aliasing problem.

## Eval Harness as the Real Spec

The eval test cases are the real spec. Not the PRD. Not comments in the code.

- Write the eval harness before writing the search logic — it forces you to be precise about what "correct" means
- Run it after every change
- Fix root causes, never the tests
- A search system with a passing eval harness ships. One without doesn't.

Track these metrics for any search system in production:

| Metric | Why it matters |
|---|---|
| Top-1 precision on exact queries | Any regression is a P0 |
| Zero-result rate | Rising ZRR = data gap or alias miss |
| p99 latency | Alert if > 100ms |
| Click position distribution | Users clicking #3 = ranking is wrong |
| Session abandonment after search | Searched but didn't select = bad result |

## Pure Functions First

Every decision in the search pipeline that can be a pure function, should be. Pure functions are testable without mocking, readable without context, and debuggable with a console.log.

`classifyQuery()`, `rankResults()`, `shouldDisambiguate()` — all pure. No database calls, no HTTP, no side effects. Test coverage on these should be 100%.

## Approach Memo Standards

The memo signals seniority more than the code does. Write it like a senior engineer briefing a peer, not a candidate defending their choices.

Cover in one page: what you chose and why, what you cut and why, where the LLM was wrong and how you caught it, what you'd do differently with more time, and one thing you'd push back on the brief about. The "push back" point is the most important — it shows you read the problem, not just the instructions.

NEVER use a memo to list features you built. Use it to explain the decisions behind the features.