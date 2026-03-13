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

function printField(label: string, fieldPath: string, items: Array<{ field_path: string; verification_status: string; extracted_value: string | null }>) {
  const item = items.find((entry) => entry.field_path === fieldPath);
  console.log(`${label}: ${item?.verification_status ?? "missing"} (${item?.extracted_value ?? "null"})`);
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
  console.log(`document_type_verification: ${parsed.document_type_verification.verification_status}`);
  console.log(`verified fields: ${verifiedCount}`);
  console.log(`unsupported/unclear fields: ${reviewCount}`);

  console.log("");
  console.log("Key field verification summary:");
  printField("specialist coinsurance", "medical.specialist_visit_coinsurance", parsed.field_verifications);
  printField("office visit coinsurance", "medical.office_visit_coinsurance", parsed.field_verifications);
  printField("deductible total individual", "medical.deductible_total_individual", parsed.field_verifications);
  printField("deductible total family", "medical.deductible_total_family", parsed.field_verifications);
  printField("deductible remaining individual", "medical.deductible_remaining_individual", parsed.field_verifications);
  printField("deductible remaining family", "medical.deductible_remaining_family", parsed.field_verifications);
  printField("oop remaining individual", "medical.oop_remaining_individual", parsed.field_verifications);
  printField("oop remaining family", "medical.oop_remaining_family", parsed.field_verifications);
  printField("generic coinsurance", "medical.generic_medical_coinsurance", parsed.field_verifications);

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
