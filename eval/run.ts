import { EVAL_CASES, EvalCase } from "./cases";

const API_URL = "http://localhost:3000/api/search";

async function runEval() {
  let passed = 0;
  let failed = 0;
  const failures: { case: string; reason: string }[] = [];

  console.log("Starting Eval Harness...");
  
  for (const testCase of EVAL_CASES) {
    try {
      const res = await fetch(`${API_URL}?q=${encodeURIComponent(testCase.query)}`);
      if (!res.ok) {
        throw new Error(`API returned ${res.status}`);
      }
      const data = await res.json();
      
      const pass = evaluateCase(testCase, data.results);
      if (pass === true) {
        passed++;
        console.log(`✅ [${testCase.query}] Passed`);
      } else {
        failed++;
        console.log(`❌ [${testCase.query}] Failed: ${pass}`);
        failures.push({ case: testCase.query, reason: pass as string });
      }
      
    } catch (error: any) {
      failed++;
      console.log(`❌ [${testCase.query}] Error: ${error.message}`);
      failures.push({ case: testCase.query, reason: error.message });
    }
  }

  console.log("\n==============================");
  console.log(`Eval Complete: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    failures.forEach(f => console.log(`  - ${f.case}: ${f.reason}`));
  }
}

function evaluateCase(testCase: EvalCase, results: any[]): true | string {
  if (!results || results.length === 0) {
    return "No results returned";
  }

  const topResult = results[0];

  if (testCase.expectType === "airport") {
    if (topResult.type !== "airport") return `Expected type airport, got ${topResult.type}`;
    if (testCase.expectIATA && topResult.iata !== testCase.expectIATA) return `Expected IATA ${testCase.expectIATA}, got ${topResult.iata}`;
    if (testCase.expectNotContains) {
      const iatas = results.map(r => r.iata);
      for (const notIata of testCase.expectNotContains) {
        if (iatas.includes(notIata)) return `Result incorrectly contained ${notIata}`;
      }
    }
  } 
  else if (testCase.expectType === "metro") {
    if (topResult.type !== "metro") return `Expected type metro, got ${topResult.type}`;
    if (testCase.expectMetro && topResult.metro_code !== testCase.expectMetro) return `Expected Metro ${testCase.expectMetro}, got ${topResult.metro_code}`;
    if (testCase.expectContains) {
      const iatas = topResult.airports.map((a: any) => a.iata);
      for (const iata of testCase.expectContains) {
        if (!iatas.includes(iata)) return `Metro did not contain expected IATA ${iata}`;
      }
    }
  }
  else if (testCase.expectType === "disambiguation") {
    if (topResult.type !== "disambiguation") return `Expected type disambiguation, got ${topResult.type}`;
    if (testCase.expectOptionCount && topResult.options.length !== testCase.expectOptionCount) {
      return `Expected ${testCase.expectOptionCount} options, got ${topResult.options.length}`;
    }
  }
  else if (testCase.expectType === "airport_list") {
    const topIatas = results.map(r => r.iata);
    if (testCase.expectContains) {
      for (const iata of testCase.expectContains) {
        if (!topIatas.includes(iata)) return `List did not contain expected IATA ${iata}`;
      }
    }
    if (testCase.expectNotContains) {
      for (const iata of testCase.expectNotContains) {
        if (topIatas.includes(iata)) return `List incorrectly contained IATA ${iata}`;
      }
    }
    if (testCase.expectCountry) {
      for (const r of results) {
        if (r.type === "airport" && r.country_code !== testCase.expectCountry) {
          return `List contained airport from wrong country: ${r.iata} (${r.country_code})`;
        }
      }
    }
  }

  return true;
}

runEval().catch(console.error);
