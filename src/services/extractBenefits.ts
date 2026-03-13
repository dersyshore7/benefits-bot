import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  BenefitsExtractionSchema,
  type BenefitsExtraction
} from "../schemas/benefitsExtraction";

function ensureResultsDir(): string {
  const resultsDir = path.join(process.cwd(), "results");

  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  return resultsDir;
}

function saveExtractionResult(result: BenefitsExtraction, sourcePdfPath: string): string {
  const resultsDir = ensureResultsDir();
  const timestamp = Date.now();
  const sourceBaseName = path.basename(sourcePdfPath, path.extname(sourcePdfPath));
  const outputPath = path.join(
    resultsDir,
    `${timestamp}-${sourceBaseName}-extraction.json`
  );

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");

  return outputPath;
}

export async function extractBenefitsFromPdf(
  client: OpenAI,
  pdfPath: string
): Promise<{ extraction: BenefitsExtraction; savedPath: string }> {
  const uploadedFile = await client.files.create({
    file: fs.createReadStream(pdfPath),
    purpose: "user_data"
  });

  const response = await client.responses.parse({
    model: "gpt-4o-mini",
    input: [
      {
        role: "system",
        content: [
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

  const savedPath = saveExtractionResult(parsed, pdfPath);

  return {
    extraction: parsed,
    savedPath
  };
}
