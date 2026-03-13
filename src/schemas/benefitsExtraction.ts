import { z } from "zod";

export const EvidenceFieldSchema = z.object({
  value_text: z.string().nullable(),
  evidence_quote: z.string().nullable(),
  page_number: z.number().int().nullable(),
  status: z.enum(["found", "not_found", "unclear"])
});

export const BenefitsExtractionSchema = z.object({
  document_type: z.enum(["benefits_pdf", "not_benefits_pdf", "unclear"]),
  payer_name: z.string().nullable(),
  company_name: z.string().nullable(),
  plan_name: z.string().nullable(),
  state: z.string().nullable(),

  notes_found: z.array(z.string()),
  document_warnings: z.array(z.string()),

  special_flags: z.object({
    qmb_or_cost_share_protected: z.boolean(),
    dual_plan_detected: z.boolean(),
    not_accepted_plan_detected: z.boolean()
  }),

  medical: z.object({
    specialist_visit_copay: EvidenceFieldSchema,
    office_visit_copay: EvidenceFieldSchema,

    oop_remaining_individual: EvidenceFieldSchema,
    oop_remaining_family: EvidenceFieldSchema,

    deductible_remaining_individual: EvidenceFieldSchema,
    deductible_remaining_family: EvidenceFieldSchema,

    coinsurance: EvidenceFieldSchema,

    generic_medical_copay: EvidenceFieldSchema,
    generic_medical_deductible: EvidenceFieldSchema,
    generic_medical_deductible_remaining: EvidenceFieldSchema,
    generic_medical_coinsurance: EvidenceFieldSchema,
    generic_medical_oop_remaining: EvidenceFieldSchema
  }),

  vision: z.object({
    routine_exam_copay: EvidenceFieldSchema,
    refraction: EvidenceFieldSchema,
    materials: EvidenceFieldSchema,
    contact_lens_fitting: EvidenceFieldSchema,
    frame_allowance: EvidenceFieldSchema,
    lens_allowance: EvidenceFieldSchema
  })
});

export type BenefitsExtraction = z.infer<typeof BenefitsExtractionSchema>;
