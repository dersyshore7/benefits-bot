import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { BenefitsExtraction } from "../schemas/benefitsExtraction";
import {
  BenefitsVerificationSchema,
  type BenefitsVerification
} from "../schemas/benefitsVerification";

function ensureResultsDir(): string {
  const resultsDir = path.join(process.cwd(), "results");

  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  return resultsDir;
}

function saveVerificationResult(
  result: BenefitsVerification,
  sourcePdfPath: string
): string {
  const resultsDir = ensureResultsDir();
  const timestamp = Date.now();
  const sourceBaseName = path.basename(sourcePdfPath, path.extname(sourcePdfPath));
  const outputPath = path.join(
    resultsDir,
    `${timestamp}-${sourceBaseName}-verification.json`
  );

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");

  return outputPath;
}

function buildFieldCandidates(extraction: BenefitsExtraction) {
  return [
    { field_path: "payer_name", extracted_value: extraction.payer_name },
    { field_path: "company_name", extracted_value: extraction.company_name },
    { field_path: "plan_name", extracted_value: extraction.plan_name },
    { field_path: "state", extracted_value: extraction.state },
    {
      field_path: "medical.specialist_visit_copay",
      extracted_value: extraction.medical.specialist_visit_copay.value_text
    },
    {
      field_path: "medical.office_visit_copay",
      extracted_value: extraction.medical.office_visit_copay.value_text
    },
    {
      field_path: "medical.oop_remaining_individual",
      extracted_value: extraction.medical.oop_remaining_individual.value_text
    },
    {
      field_path: "medical.oop_remaining_family",
      extracted_value: extraction.medical.oop_remaining_family.value_text
    },
    {
      field_path: "medical.deductible_remaining_individual",
      extracted_value: extraction.medical.deductible_remaining_individual.value_text
    },
    {
      field_path: "medical.deductible_remaining_family",
      extracted_value: extraction.medical.deductible_remaining_family.value_text
    },
    {
      field_path: "medical.coinsurance",
      extracted_value: extraction.medical.coinsurance.value_text
    },
    {
      field_path: "vision.routine_exam_copay",
      extracted_value: extraction.vision.routine_exam_copay.value_text
    },
    {
      field_path: "vision.refraction",
      extracted_value: extraction.vision.refraction.value_text
    },
    {
      field_path: "vision.materials",
      extracted_value: extraction.vision.materials.value_text
    },
    {
      field_path: "vision.contact_lens_fitting",
      extracted_value: extraction.vision.contact_lens_fitting.value_text
    },
    {
      field_path: "vision.frame_allowance",
      extracted_value: extraction.vision.frame_allowance.value_text
    },
    {
      field_path: "vision.lens_allowance",
      extracted_value: extraction.vision.lens_allowance.value_text
    }
  ];
}

export async function verifyBenefitsExtraction(
  client: OpenAI,
  pdfPath: string,
  extraction: BenefitsExtraction
): Promise<{ verification: BenefitsVerification; savedPath: string }> {
  const uploadedFile = await client.files.create({
    file: fs.createReadStream(pdfPath),
    purpose: "user_data"
  });

  const fieldCandidates = buildFieldCandidates(extraction);

  const response = await client.responses.parse({
    model: "gpt-4o-mini",
    input: [
      {
        role: "system",
        content: [
          "You are verifying an earlier insurance-benefits extraction for an optometry clinic.",
          "Use only the attached PDF as the source of truth.",
          "Do not trust the earlier extraction unless the PDF supports it.",
          "If an extracted value is supported by the PDF, mark it verified.",
          "If an extracted value is not supported by the PDF, mark it unsupported.",
          "If the PDF is ambiguous, mark it unclear.",
          "If no value is present in the PDF for that field, mark it not_found.",
          "Provide a short exact evidence quote when possible.",
          "Set overall_status to review_required if any important extracted value is unsupported or unclear."
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
              "Here is the earlier extraction result to verify.",
              "",
              JSON.stringify(
                {
                  document_type: extraction.document_type,
                  payer_name: extraction.payer_name,
                  company_name: extraction.company_name,
                  plan_name: extraction.plan_name,
                  state: extraction.state,
                  notes_found: extraction.notes_found,
                  document_warnings: extraction.document_warnings
                },
                null,
                2
              ),
              "",
              "Verify the following field candidates:",
              JSON.stringify(fieldCandidates, null, 2),
              "",
              "Return results in the required schema."
            ].join("\n")
          }
        ]
      }
    ],
    text: {
      format: zodTextFormat(BenefitsVerificationSchema, "benefits_verification")
    }
  });

  const parsed = response.output_parsed;

  if (!parsed) {
    throw new Error("No parsed verification output was returned.");
  }

  const savedPath = saveVerificationResult(parsed, pdfPath);

  return {
    verification: parsed,
    savedPath
  };
}
