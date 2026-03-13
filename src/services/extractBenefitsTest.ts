import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import OpenAI from "openai";
import { extractBenefitsFromPdf } from "./extractBenefits";

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

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from .env");
  }

  const latestPdfPath = getLatestPdfFilePath();
  const client = new OpenAI({ apiKey });

  console.log(`Using PDF: ${latestPdfPath}`);

  const result = await extractBenefitsFromPdf(client, latestPdfPath);
  const parsed = result.extraction;

  console.log("");
  console.log("Extraction successful.");
  console.log(`Saved result to: ${result.savedPath}`);
  console.log("");
  console.log("Quick summary:");
  console.log(`document_type: ${parsed.document_type}`);
  console.log(`payer_name: ${parsed.payer_name ?? "null"}`);
  console.log(`plan_name: ${parsed.plan_name ?? "null"}`);
  console.log(`specialist copay: ${parsed.medical.specialist_visit_copay.value_text ?? "null"}`);
  console.log(`office visit copay: ${parsed.medical.office_visit_copay.value_text ?? "null"}`);
  console.log(`generic medical copay: ${parsed.medical.generic_medical_copay.value_text ?? "null"}`);
  console.log(`generic deductible: ${parsed.medical.generic_medical_deductible.value_text ?? "null"}`);
  console.log(`generic deductible remaining: ${parsed.medical.generic_medical_deductible_remaining.value_text ?? "null"}`);
  console.log(`generic coinsurance: ${parsed.medical.generic_medical_coinsurance.value_text ?? "null"}`);
  console.log(`vision routine exam: ${parsed.vision.routine_exam_copay.value_text ?? "null"}`);

  if (parsed.document_warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const warning of parsed.document_warnings) {
      console.log(`- ${warning}`);
    }
  }
}

main().catch((error) => {
  console.error("Benefits extraction test failed:");
  console.error(error);
  process.exit(1);
});
