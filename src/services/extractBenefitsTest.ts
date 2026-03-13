import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  BenefitsExtractionSchema,
  type BenefitsExtraction
} from "../schemas/benefitsExtraction";

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
        fileName,
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

function saveResultToFile(result: BenefitsExtraction, sourcePdfPath: string): string {
  const resultsDir = path.join(process.cwd(), "results");

  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const timestamp = Date.now();
  const sourceBaseName = path.basename(sourcePdfPath, path.extname(sourcePdfPath));
  const outputPath = path.join(
    resultsDir,
    `${timestamp}-${sourceBaseName}-extraction.json`
  );

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");

  return outputPath;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from .env");
  }

  const latestPdfPath = getLatestPdfFilePath();
  const client = new OpenAI({ apiKey });

  console.log(`Using PDF: ${latestPdfPath}`);

  const uploadedFile = await client.files.create({
    file: fs.createReadStream(latestPdfPath),
    purpose: "user_data"
  });

  const response = await client.responses.parse({
    model: "gpt-4o-mini",
    input: [
      {
        role: "system",
        content:
          [
            "You extract insurance and vision benefit facts from PDFs for an optometry clinic.",
            "Do not guess.",
            "If a field is missing, use status not_found.",
            "If a field is ambiguous, use status unclear.",
            "Use short exact evidence quotes from the PDF when possible.",
            "If this document does not appear to be an insurance benefits PDF, set document_type to not_benefits_pdf and explain why in document_warnings.",
            "For medical visit types, prefer specialist visit if present. Use office visit only as a fallback.",
            "If vision benefits are present, extract them separately."
          ].join(" ")
      },
      {
        role: "user",
        content: [
          {
            type: "input_file",
            file_id: uploadedFile.id
          },
          {
            type: "input_text",
            text:
              "Extract the medical and vision benefit details from this PDF into the provided schema. If the document is not actually a benefits PDF, return not_benefits_pdf and mark fields accordingly."
          }
        ]
      }
    ],
    text: {
      format: zodTextFormat(BenefitsExtractionSchema, "benefits_extraction")
    }
  });

  const parsed = response.output_parsed;

  if (!parsed) {
    throw new Error("No parsed structured output was returned.");
  }

  const outputPath = saveResultToFile(parsed, latestPdfPath);

  console.log("");
  console.log("Extraction successful.");
  console.log(`Saved result to: ${outputPath}`);
  console.log("");
  console.log("Quick summary:");
  console.log(`document_type: ${parsed.document_type}`);
  console.log(`payer_name: ${parsed.payer_name ?? "null"}`);
  console.log(`plan_name: ${parsed.plan_name ?? "null"}`);
  console.log(`medical specialist copay: ${parsed.medical.specialist_visit_copay.value_text ?? "null"}`);
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
