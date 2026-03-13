import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import OpenAI from "openai";
import { BenefitsExtractionSchema } from "../schemas/benefitsExtraction";
import { verifyBenefitsExtraction } from "./verifyBenefits";

dotenv.config();

function getLatestPdfFilePath(): string {
  const uploadsDir = path.join(process.cwd(), "uploads");

  if (!fs.existsSync(uploadsDir)) {
    throw new Error("The uploads folder does not exist.");
  }

  const pdfFiles = fs
    .readdirSync(uploadsDir)
    .filter((fileName) => fileName.toLowerCase().endsWith(".pdf"))
    .map((fileName) => {
      const fullPath = path.join(uploadsDir, fileName);
      const stats = fs.statSync(fullPath);

      return {
        fullPath,
        modifiedTimeMs: stats.mtimeMs
      };
    })
    .sort((a, b) => b.modifiedTimeMs - a.modifiedTimeMs);

  if (pdfFiles.length === 0) {
    throw new Error("No PDF files were found in the uploads folder.");
  }

  return pdfFiles[0].fullPath;
}

function getLatestExtractionFilePath(): string {
  const resultsDir = path.join(process.cwd(), "results");

  if (!fs.existsSync(resultsDir)) {
    throw new Error("The results folder does not exist.");
  }

  const extractionFiles = fs
    .readdirSync(resultsDir)
    .filter((fileName) => fileName.endsWith("-extraction.json"))
    .map((fileName) => {
      const fullPath = path.join(resultsDir, fileName);
      const stats = fs.statSync(fullPath);

      return {
        fullPath,
        modifiedTimeMs: stats.mtimeMs
      };
    })
    .sort((a, b) => b.modifiedTimeMs - a.modifiedTimeMs);

  if (extractionFiles.length === 0) {
    throw new Error("No extraction JSON files were found in the results folder.");
  }

  return extractionFiles[0].fullPath;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from .env");
  }

  const latestPdfPath = getLatestPdfFilePath();
  const latestExtractionPath = getLatestExtractionFilePath();
  const raw = fs.readFileSync(latestExtractionPath, "utf-8");
  const extraction = BenefitsExtractionSchema.parse(JSON.parse(raw));
  const client = new OpenAI({ apiKey });

  console.log(`Using PDF: ${latestPdfPath}`);
  console.log(`Using extraction file: ${latestExtractionPath}`);

  const result = await verifyBenefitsExtraction(client, latestPdfPath, extraction);
  const parsed = result.verification;

  const verifiedCount = parsed.field_verifications.filter(
    (item) => item.verification_status === "verified"
  ).length;

  const reviewCount = parsed.field_verifications.filter(
    (item) =>
      item.verification_status === "unsupported" ||
      item.verification_status === "unclear"
  ).length;

  console.log("");
  console.log("Verification successful.");
  console.log(`Saved result to: ${result.savedPath}`);
  console.log("");
  console.log(`overall_status: ${parsed.overall_status}`);
  console.log(
    `document_type_verification: ${parsed.document_type_verification.verification_status}`
  );
  console.log(`verified fields: ${verifiedCount}`);
  console.log(`unsupported/unclear fields: ${reviewCount}`);

  const genericCopay = parsed.field_verifications.find(
    (item) => item.field_path === "medical.generic_medical_copay"
  );
  const genericDeductible = parsed.field_verifications.find(
    (item) => item.field_path === "medical.generic_medical_deductible"
  );
  const genericDeductibleRemaining = parsed.field_verifications.find(
    (item) => item.field_path === "medical.generic_medical_deductible_remaining"
  );
  const genericCoinsurance = parsed.field_verifications.find(
    (item) => item.field_path === "medical.generic_medical_coinsurance"
  );

  console.log("");
  console.log("Generic field verification summary:");
  console.log(
    `generic copay: ${genericCopay?.verification_status ?? "missing"} (${genericCopay?.extracted_value ?? "null"})`
  );
  console.log(
    `generic deductible: ${genericDeductible?.verification_status ?? "missing"} (${genericDeductible?.extracted_value ?? "null"})`
  );
  console.log(
    `generic deductible remaining: ${genericDeductibleRemaining?.verification_status ?? "missing"} (${genericDeductibleRemaining?.extracted_value ?? "null"})`
  );
  console.log(
    `generic coinsurance: ${genericCoinsurance?.verification_status ?? "missing"} (${genericCoinsurance?.extracted_value ?? "null"})`
  );

  if (parsed.final_notes.length > 0) {
    console.log("");
    console.log("Final notes:");
    for (const note of parsed.final_notes) {
      console.log(`- ${note}`);
    }
  }
}

main().catch((error) => {
  console.error("Benefits verification test failed:");
  console.error(error);
  process.exit(1);
});
