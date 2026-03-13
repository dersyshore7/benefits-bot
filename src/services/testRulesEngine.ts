import fs from "node:fs";
import path from "node:path";
import { BenefitsExtractionSchema } from "../schemas/benefitsExtraction";
import { BenefitsVerificationSchema } from "../schemas/benefitsVerification";
import { buildRulesEngineResult } from "./rulesEngine";

function getLatestFile(resultsDir: string, suffix: string): string {
  const files = fs
    .readdirSync(resultsDir)
    .filter((fileName) => fileName.endsWith(suffix))
    .map((fileName) => {
      const fullPath = path.join(resultsDir, fileName);
      const stats = fs.statSync(fullPath);

      return {
        fullPath,
        modifiedTimeMs: stats.mtimeMs
      };
    })
    .sort((a, b) => b.modifiedTimeMs - a.modifiedTimeMs);

  if (files.length === 0) {
    throw new Error(`No files ending with ${suffix} were found in results.`);
  }

  return files[0].fullPath;
}

function main() {
  const resultsDir = path.join(process.cwd(), "results");

  const extractionPath = getLatestFile(resultsDir, "-extraction.json");
  const verificationPath = getLatestFile(resultsDir, "-verification.json");

  const extraction = BenefitsExtractionSchema.parse(
    JSON.parse(fs.readFileSync(extractionPath, "utf-8"))
  );

  const verification = BenefitsVerificationSchema.parse(
    JSON.parse(fs.readFileSync(verificationPath, "utf-8"))
  );

  const result = buildRulesEngineResult(extraction, verification);

  console.log("Rules engine result:");
  console.log(JSON.stringify(result, null, 2));
}

main();
