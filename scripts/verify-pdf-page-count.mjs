/**
 * Node verification of PDF page parser (same algorithm as lib/pdfPageCount.ts).
 * Usage: node scripts/verify-pdf-page-count.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parsePdfPageCountFromBinaryString(text) {
  if (typeof text !== "string") {
    throw new Error(`PDF parser expected binary string, got ${typeof text}`);
  }

  try {
    const rootRegex = /\/Root\s*(\d+)\s*0\s*R/i;
    const rootMatch = rootRegex.exec(text);
    if (rootMatch) {
      const rootObjNum = rootMatch[1];
      const rootObjRegex = new RegExp(
        `${rootObjNum}\\s+0\\s+obj\\s*[<<]?[\\s\\S]*?endobj`,
        "i"
      );
      const rootObjMatch = rootObjRegex.exec(text);
      if (rootObjMatch) {
        const rootObjText = rootObjMatch[0];
        const pagesRefRegex = /\/Pages\s*(\d+)\s*0\s*R/i;
        const pagesRefMatch = pagesRefRegex.exec(rootObjText);
        if (pagesRefMatch) {
          const pagesObjNum = pagesRefMatch[1];
          const pagesObjRegex = new RegExp(
            `${pagesObjNum}\\s+0\\s+obj\\s*[<<]?[\\s\\S]*?endobj`,
            "i"
          );
          const pagesObjMatch = pagesObjRegex.exec(text);
          if (pagesObjMatch) {
            const countMatch = /\/Count\s*(\d+)/i.exec(pagesObjMatch[0]);
            if (countMatch) return parseInt(countMatch[1], 10);
          }
        }
      }
    }
  } catch (_) {}

  const pagesPattern1 = /\/Type\s*\/Pages[\s\S]*?\/Count\s*(\d+)/g;
  const pagesPattern2 = /\/Count\s*(\d+)[\s\S]*?\/Type\s*\/Pages/g;
  let match = pagesPattern1.exec(text);
  if (match?.[1]) return parseInt(match[1], 10);
  match = pagesPattern2.exec(text);
  if (match?.[1]) return parseInt(match[1], 10);

  const countPattern = /\/Count\s*(\d+)/g;
  let maxPages = 0;
  let countMatch;
  while ((countMatch = countPattern.exec(text)) !== null) {
    const val = parseInt(countMatch[1], 10);
    if (val > maxPages) maxPages = val;
  }
  if (maxPages > 0) return maxPages;

  const matches = text.match(/\/Type\s*\/Page\b/g);
  if (matches?.length) return matches.length;
  return 1;
}

// Reproduce the original bug
try {
  parsePdfPageCountFromBinaryString(undefined);
  console.log("BUG_REPRO: unexpected success");
} catch (e) {
  console.log("BUG_REPRO:", e.message);
}

const fixtures = [
  ["one-page.pdf", 1],
  ["three-page.pdf", 3],
  ["five-page.pdf", 5],
];

let failed = 0;
for (const [name, expected] of fixtures) {
  const buf = readFileSync(
    resolve(__dirname, "../.temp/pdf-fixtures", name)
  );
  const text = buf.toString("latin1");
  const pages = parsePdfPageCountFromBinaryString(text);
  const ok = pages === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: got=${pages} expected=${expected}`);
  if (!ok) failed++;
}

process.exit(failed ? 1 : 0);
