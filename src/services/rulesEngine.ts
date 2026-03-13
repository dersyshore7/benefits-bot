import type { BenefitsExtraction } from "../schemas/benefitsExtraction";
import type { BenefitsVerification } from "../schemas/benefitsVerification";

export type RulesEngineResult = {
  status: "final" | "review_required" | "not_accepted";
  medical_responsibility: string | null;
  vision_responsibility: string | null;
  notes: string[];
  reasoning_path: string[];
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function includesAny(text: string, phrases: string[]): boolean {
  const normalized = normalizeText(text);
  return phrases.some((phrase) => normalized.includes(phrase.toLowerCase()));
}

function parseCurrency(value: string | null): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePercent(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(value: number): string {
  const fixed = value.toFixed(2);
  if (fixed.endsWith(".00")) return `$${Number(value.toFixed(0)).toLocaleString()}`;
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number): string {
  if (Number.isInteger(value)) return `${value}%`;
  return `${value.toFixed(2)}%`;
}

function getVerifiedValue(
  verification: BenefitsVerification,
  fieldPath: string
): string | null {
  const field = verification.field_verifications.find(
    (item) => item.field_path === fieldPath
  );

  if (!field || field.verification_status !== "verified") {
    return null;
  }

  return field.corrected_value ?? field.extracted_value ?? null;
}

function getFirstVerifiedValue(
  verification: BenefitsVerification,
  fieldPaths: string[]
): string | null {
  for (const fieldPath of fieldPaths) {
    const value = getVerifiedValue(verification, fieldPath);
    if (value !== null) return value;
  }
  return null;
}

function buildVisionSummary(
  verification: BenefitsVerification
): string | null {
  const parts: string[] = [];

  const routineExam = getVerifiedValue(verification, "vision.routine_exam_copay");
  const refraction = getVerifiedValue(verification, "vision.refraction");
  const materials = getVerifiedValue(verification, "vision.materials");
  const contactLensFitting = getVerifiedValue(verification, "vision.contact_lens_fitting");
  const frameAllowance = getVerifiedValue(verification, "vision.frame_allowance");
  const lensAllowance = getVerifiedValue(verification, "vision.lens_allowance");

  if (routineExam) parts.push(`Routine vision exam: ${routineExam}`);
  if (refraction) parts.push(`Refraction: ${refraction}`);
  if (materials) parts.push(`Materials: ${materials}`);
  if (contactLensFitting) parts.push(`Contact lens fitting: ${contactLensFitting}`);
  if (frameAllowance) parts.push(`Frame allowance: ${frameAllowance}`);
  if (lensAllowance) parts.push(`Lens allowance: ${lensAllowance}`);

  return parts.length ? parts.join(" | ") : null;
}

export function buildRulesEngineResult(
  extraction: BenefitsExtraction,
  verification: BenefitsVerification
): RulesEngineResult {
  const reasoningPath: string[] = [];
  const notes: string[] = [];

  const payerName =
    getFirstVerifiedValue(verification, ["payer_name", "company_name"]) ??
    extraction.payer_name ??
    extraction.company_name ??
    "Unknown Payer";

  const companyName =
    getVerifiedValue(verification, "company_name") ??
    extraction.company_name ??
    "";

  const planName =
    getVerifiedValue(verification, "plan_name") ??
    extraction.plan_name ??
    "";

  const allNotesText = [
    ...extraction.notes_found,
    ...extraction.document_warnings,
    ...verification.final_notes,
    planName
  ].join(" ");

  const isUnitedHealthcare =
    includesAny(`${payerName} ${companyName}`, ["united healthcare", "unitedhealthcare"]) ||
    includesAny(planName, ["united healthcare", "unitedhealthcare"]);

  const isBronzeValueHmo = includesAny(planName, ["bronze value hmo"]);

  if (isUnitedHealthcare && isBronzeValueHmo) {
    reasoningPath.push("Matched not accepted plan override.");
    return {
      status: "not_accepted",
      medical_responsibility: "Bronze Value HMO Plan - Not accepted",
      vision_responsibility: null,
      notes,
      reasoning_path: reasoningPath
    };
  }

  const hasQmbProtection = includesAny(allNotesText, [
    "qmb",
    "qualified medicare beneficiary",
    "member is cost-share protected",
    "do not balance bill patient"
  ]);

  if (hasQmbProtection) {
    reasoningPath.push("Matched QMB / cost-share protection override.");
    return {
      status: "final",
      medical_responsibility: `${payerName} - $0 (QMB)`,
      vision_responsibility: buildVisionSummary(verification),
      notes,
      reasoning_path: reasoningPath
    };
  }

  // Rule 1: OOP remaining — use split fields first, generic only if split fields unavailable
  const oopIndividualValue = parseCurrency(
    getVerifiedValue(verification, "medical.oop_remaining_individual")
  );
  const oopFamilyValue = parseCurrency(
    getVerifiedValue(verification, "medical.oop_remaining_family")
  );
  const oopGenericValue = parseCurrency(
    getVerifiedValue(verification, "medical.generic_medical_oop_remaining")
  );

  if (oopIndividualValue === 0 || oopFamilyValue === 0 || ((oopIndividualValue === null && oopFamilyValue === null) && oopGenericValue === 0)) {
    reasoningPath.push("Out-of-pocket remaining met at $0.");
    if (extraction.special_flags.dual_plan_detected || includesAny(planName, ["dual"])) {
      notes.push("This is a dual plan, please ensure Medicaid is added to the chart and active.");
    }

    return {
      status: "final",
      medical_responsibility: `${payerName} - $0 (out of pocket met)`,
      vision_responsibility: buildVisionSummary(verification),
      notes,
      reasoning_path: reasoningPath
    };
  }

  // Rule 2: Specialist first
  const specialistCopayValue = parseCurrency(
    getVerifiedValue(verification, "medical.specialist_visit_copay")
  );
  const specialistCoinsuranceValue = parsePercent(
    getVerifiedValue(verification, "medical.specialist_visit_coinsurance")
  );

  if (specialistCopayValue !== null && specialistCopayValue > 0) {
    reasoningPath.push("Used verified specialist visit copay.");
    if (extraction.special_flags.dual_plan_detected || includesAny(planName, ["dual"])) {
      notes.push("This is a dual plan, please ensure Medicaid is added to the chart and active.");
    }

    return {
      status: "final",
      medical_responsibility: `${payerName} - ${formatCurrency(specialistCopayValue)} Medical Copay`,
      vision_responsibility: buildVisionSummary(verification),
      notes,
      reasoning_path: reasoningPath
    };
  }

  // Rule 3: Office fallback only if specialist is absent
  const officeCopayValue = parseCurrency(
    getVerifiedValue(verification, "medical.office_visit_copay")
  );
  const officeCoinsuranceValue = parsePercent(
    getVerifiedValue(verification, "medical.office_visit_coinsurance")
  );

  const specialistExists =
    specialistCopayValue !== null || specialistCoinsuranceValue !== null;

  if (!specialistExists && officeCopayValue !== null && officeCopayValue > 0) {
    reasoningPath.push("Used verified office visit copay fallback.");
    if (extraction.special_flags.dual_plan_detected || includesAny(planName, ["dual"])) {
      notes.push("This is a dual plan, please ensure Medicaid is added to the chart and active.");
    }

    return {
      status: "final",
      medical_responsibility: `${payerName} - ${formatCurrency(officeCopayValue)} Medical Copay`,
      vision_responsibility: buildVisionSummary(verification),
      notes,
      reasoning_path: reasoningPath
    };
  }

  // Rule 4: Deductible + coinsurance
  const deductibleRemainingIndividual = parseCurrency(
    getVerifiedValue(verification, "medical.deductible_remaining_individual")
  );
  const deductibleRemainingFamily = parseCurrency(
    getVerifiedValue(verification, "medical.deductible_remaining_family")
  );
  const genericDeductibleRemaining = parseCurrency(
    getVerifiedValue(verification, "medical.generic_medical_deductible_remaining")
  );

  let effectiveDeductibleRemaining: number | null = null;

  if (deductibleRemainingIndividual === 0 || deductibleRemainingFamily === 0) {
    effectiveDeductibleRemaining = 0;
    reasoningPath.push("Either individual or family deductible remaining is $0.");
  } else if (deductibleRemainingIndividual !== null) {
    effectiveDeductibleRemaining = deductibleRemainingIndividual;
    reasoningPath.push("Used individual deductible remaining.");
  } else if (deductibleRemainingFamily !== null) {
    effectiveDeductibleRemaining = deductibleRemainingFamily;
    reasoningPath.push("Used family deductible remaining.");
  } else if (genericDeductibleRemaining !== null) {
    effectiveDeductibleRemaining = genericDeductibleRemaining;
    reasoningPath.push("Used generic deductible remaining fallback.");
  }

  let effectiveCoinsurance: number | null = null;

  if (specialistCoinsuranceValue !== null) {
    effectiveCoinsurance = specialistCoinsuranceValue;
    reasoningPath.push("Used specialist visit coinsurance.");
  } else if (!specialistExists && officeCoinsuranceValue !== null) {
    effectiveCoinsurance = officeCoinsuranceValue;
    reasoningPath.push("Used office visit coinsurance fallback.");
  } else {
    effectiveCoinsurance = parsePercent(
      getFirstVerifiedValue(verification, [
        "medical.coinsurance",
        "medical.generic_medical_coinsurance"
      ])
    );
    if (effectiveCoinsurance !== null) {
      reasoningPath.push("Used generic coinsurance fallback.");
    }
  }

  const genericCopayText = getVerifiedValue(verification, "medical.generic_medical_copay");
  if (genericCopayText) {
    notes.push("A generic medical copay was found, but it was not used as the final copay unless tied to the applicable visit type.");
  }

  if (effectiveDeductibleRemaining === null && effectiveCoinsurance === null) {
    notes.push("Review Required: Could not confidently determine responsibility from document.");
    if (extraction.special_flags.dual_plan_detected || includesAny(planName, ["dual"])) {
      notes.push("This is a dual plan, please ensure Medicaid is added to the chart and active.");
    }

    return {
      status: "review_required",
      medical_responsibility: null,
      vision_responsibility: buildVisionSummary(verification),
      notes,
      reasoning_path: reasoningPath
    };
  }

  if (effectiveDeductibleRemaining === 0 && effectiveCoinsurance === 0) {
    return {
      status: "final",
      medical_responsibility: `${payerName} - $0 responsibility`,
      vision_responsibility: buildVisionSummary(verification),
      notes,
      reasoning_path: reasoningPath
    };
  }

  if (effectiveDeductibleRemaining === 0 && effectiveCoinsurance !== null && effectiveCoinsurance > 0) {
    return {
      status: "final",
      medical_responsibility: `${payerName} - $0 remaining deductible, ${formatPercent(effectiveCoinsurance)} coinsurance`,
      vision_responsibility: buildVisionSummary(verification),
      notes,
      reasoning_path: reasoningPath
    };
  }

  if (effectiveDeductibleRemaining !== null && effectiveDeductibleRemaining > 0 && effectiveCoinsurance !== null && effectiveCoinsurance > 0) {
    return {
      status: "final",
      medical_responsibility: `${payerName} - ${formatCurrency(effectiveDeductibleRemaining)} remaining deductible, ${formatPercent(effectiveCoinsurance)} coinsurance`,
      vision_responsibility: buildVisionSummary(verification),
      notes,
      reasoning_path: reasoningPath
    };
  }

  if (effectiveDeductibleRemaining !== null && effectiveDeductibleRemaining > 0 && (effectiveCoinsurance === null || effectiveCoinsurance === 0)) {
    return {
      status: "final",
      medical_responsibility: `${payerName} - ${formatCurrency(effectiveDeductibleRemaining)} remaining deductible, $0 responsibility`,
      vision_responsibility: buildVisionSummary(verification),
      notes,
      reasoning_path: reasoningPath
    };
  }

  notes.push("Review Required: Could not confidently determine responsibility from document.");

  return {
    status: "review_required",
    medical_responsibility: null,
    vision_responsibility: buildVisionSummary(verification),
    notes,
    reasoning_path: reasoningPath
  };
}
