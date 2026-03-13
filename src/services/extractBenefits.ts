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
          "Classify the document as benefits_pdf if it contains real benefit or cost-sharing information, even if the labels are generic.",
          "Only use not_benefits_pdf when the document truly does not contain benefit or cost-sharing information relevant to coverage.",
          "For medical visit types, prefer specialist visit if explicitly present.",
          "If specialist is not explicitly present, use office visit only if explicitly present.",
          "Do not force generic copay labels into specialist or office visit unless the PDF explicitly ties them together.",
          "If the PDF uses generic medical labels such as Co-Payment, Deductible, Deductible Remaining, Co-Insurance, Coinsurance, Out-of-Pocket Remaining, Out of Pocket, or Stop Loss, place them into the generic medical fields.",
          "Coverage tables may use labels like Co-Insurance - Health Benefit Plan Coverage, Co-Payment - Health Benefit Plan Coverage, Deductible - Health Benefit Plan Coverage, Deductible Remaining, or No Network.",
          "If a table shows Co-Insurance or Coinsurance with a percent value such as 0 Percent, 20 Percent, or 40 Percent, extract that into generic_medical_coinsurance.",
          "If a table shows Co-Payment with a dollar value such as 0 USD or 50 USD, extract that into generic_medical_copay.",
          "If a table shows Deductible with a value such as 0 USD Calendar Year, extract that into generic_medical_deductible.",
          "If a table shows Deductible Remaining with a value such as 0 USD Remaining, extract that into generic_medical_deductible_remaining.",
          "If a table shows Out-of-Pocket Remaining or Stop Loss with a value, extract that into generic_medical_oop_remaining.",
          "If vision benefits are present, extract them separately.",
          "If the PDF lacks visit-specific fields but has generic coverage values, still mark document_type as benefits_pdf and explain the limitation in document_warnings."
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
            text: [
              "Extract the medical and vision benefit details from this PDF into the provided schema.",
              "Important extraction rules:",
              "- Use specialist_visit_copay only if the PDF explicitly identifies specialist wording.",
              "- Use office_visit_copay only if the PDF explicitly identifies office visit wording.",
              "- If the PDF only gives a generic co-payment, put it in generic_medical_copay.",
              "- If the PDF only gives a generic deductible, put it in generic_medical_deductible.",
              "- If the PDF only gives a generic deductible remaining, put it in generic_medical_deductible_remaining.",
              "- If the PDF only gives a generic coinsurance or co-insurance, put it in generic_medical_coinsurance.",
              "- If the PDF only gives a generic out-of-pocket remaining or stop loss value, put it in generic_medical_oop_remaining.",
              "- If a coverage table includes Co-Insurance with a percent value, do not miss it.",
              "- Preserve meaningful wording in the value when possible, such as 0 USD Remaining or 0 USD Calendar Year.",
              "- If this is a benefits PDF but it lacks visit-specific detail, still return benefits_pdf and note that limitation.",
              "- Never guess which generic values belong to specialist or office visit unless the PDF explicitly says so."
            ].join("\n")
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
