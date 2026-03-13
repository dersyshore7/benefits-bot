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
          "Separate individual and family deductible fields when both appear. Do not mix them.",
          "Separate individual and family out-of-pocket remaining fields when both appear. Do not mix them.",
          "For office-visit rows, use payer notes or other labels to decide whether the value belongs to specialist or generic office visit.",
          "If a row says Professional (Physician) Visit - Office and payer notes or adjacent text says SPECIALIST, map its copay or coinsurance to specialist_visit fields.",
          "If a row says Office Visit but does not explicitly say specialist, use office_visit fields.",
          "If the PDF uses generic medical labels such as Co-Payment, Deductible, Deductible Remaining, Co-Insurance, Coinsurance, Out-of-Pocket Remaining, Out of Pocket, or Stop Loss, place them into the generic medical fields.",
          "Coverage tables may use labels like Co-Insurance - Health Benefit Plan Coverage, Co-Payment - Health Benefit Plan Coverage, Deductible - Health Benefit Plan Coverage, Deductible Remaining, or No Network.",
          "If a table shows Co-Insurance or Coinsurance with a percent value such as 0 Percent, 20 Percent, or 40 Percent, extract that into either a visit-specific coinsurance field if the row is tied to a visit type, or generic_medical_coinsurance if the row is generic.",
          "If a table shows Co-Payment with a dollar value, extract that into either a visit-specific copay field if the row is tied to a visit type, or generic_medical_copay if the row is generic.",
          "If a table shows Deductible with separate individual and family rows, place the values into deductible_total_individual and deductible_total_family.",
          "If a table shows Deductible Remaining with separate individual and family rows, place the values into deductible_remaining_individual and deductible_remaining_family.",
          "If a table only gives one generic deductible value, use generic_medical_deductible.",
          "If a table only gives one generic deductible remaining value, use generic_medical_deductible_remaining.",
          "If a table shows Out-of-Pocket Remaining or Stop Loss with separate individual and family rows, place the values into oop_remaining_individual and oop_remaining_family.",
          "If a table only gives one generic out-of-pocket remaining value, use generic_medical_oop_remaining.",
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
              "- Use specialist_visit_copay or specialist_visit_coinsurance only if the PDF explicitly ties the benefit to a specialist visit.",
              "- Use office_visit_copay or office_visit_coinsurance only if the PDF explicitly ties the benefit to an office visit that is not specifically marked specialist.",
              "- If the PDF shows Professional (Physician) Visit - Office plus payer notes SPECIALIST, treat that as specialist visit.",
              "- If the PDF only gives a generic co-payment, put it in generic_medical_copay.",
              "- If the PDF only gives a generic deductible, put it in generic_medical_deductible.",
              "- If the PDF only gives a generic deductible remaining, put it in generic_medical_deductible_remaining.",
              "- If the PDF only gives a generic coinsurance or co-insurance, put it in generic_medical_coinsurance.",
              "- If the PDF only gives a generic out-of-pocket remaining or stop loss value, put it in generic_medical_oop_remaining.",
              "- Preserve meaningful wording in the value when possible, such as 0 USD Remaining or 500 USD Calendar Year.",
              "- When individual and family values both appear, keep them separate and do not merge them.",
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
