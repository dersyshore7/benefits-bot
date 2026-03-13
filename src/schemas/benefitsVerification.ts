import { z } from "zod";

export const FieldVerificationSchema = z.object({
  field_path: z.string(),
  extracted_value: z.string().nullable(),
  verification_status: z.enum(["verified", "unsupported", "unclear", "not_found"]),
  corrected_value: z.string().nullable(),
  evidence_quote: z.string().nullable(),
  page_number: z.number().int().nullable(),
  notes: z.string()
});

export const BenefitsVerificationSchema = z.object({
  overall_status: z.enum(["verified", "review_required"]),
  document_type_verification: z.object({
    original_document_type: z.enum(["benefits_pdf", "not_benefits_pdf", "unclear"]),
    verification_status: z.enum(["verified", "unsupported", "unclear"]),
    notes: z.string()
  }),
  field_verifications: z.array(FieldVerificationSchema),
  final_notes: z.array(z.string())
});

export type BenefitsVerification = z.infer<typeof BenefitsVerificationSchema>;
