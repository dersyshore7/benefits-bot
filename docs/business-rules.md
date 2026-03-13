# Business Rules - Benefits PDF Automation for Optometry Clinic

## Purpose
This document defines the current approved assumptions and rule behavior for the Benefits PDF Automation project.  
These rules should be reviewed by the insurance team before and during development.

---

## Core system principle
AI extracts benefit facts from PDFs.  
Program code applies deterministic business rules.  
Slack displays the final result.

The AI should not decide the final patient responsibility on its own.

---

## Confirmed assumptions

### 1. Override priority
The following are top-priority overrides:

#### Not accepted plan override
If:
- company is United Healthcare
- and plan name is Bronze Value HMO

Then:
- final result = `Bronze Value HMO Plan - Not accepted`
- stop further financial checks for that responsibility type

#### QMB / cost-share protection override
If any of the following appear anywhere in the results:
- QMB
- Qualified Medicare Beneficiary
- Member is cost-share protected
- do not balance bill patient

Then:
- final result = `[Payer Name] - $0 (QMB)`
- stop further financial checks for that responsibility type

---

### 2. Out-of-pocket met logic
If either:
- individual out-of-pocket maximum remaining = $0
- or family out-of-pocket maximum remaining = $0

Then:
- patient responsibility = `$0 (out of pocket met)`

Notes:
- Out-of-pocket maximum may also appear as `Stop Loss`
- If either individual or family is met, there is no patient responsibility

---

### 3. Deductible met logic
If either:
- individual deductible remaining = $0
- or family deductible remaining = $0

Then:
- deductible remaining should be treated as `$0 remaining deductible`

This does not automatically end the workflow unless another rule says it does.

---

### 4. Medical visit-type priority for optometry
For medical responsibility in an optometry clinic:

1. Specialist visit
2. Regular office visit, only if specialist is not listed

Possible label variations may include:
- specialist visit
- office visit specialist
- office visit
- regular office visit
- outpatient office visit

---

### 5. Medical and vision must be shown separately
If a PDF contains both medical and vision benefit sections, the program must show them separately.

The final output should contain:
- Medical Responsibility
- Vision Responsibility

The program should not merge them into one combined financial message.

---

### 6. Vision handling is payer/state specific
Vision benefits should not be assumed for every payer/state combination.

Instead, the program should use a payer/state inclusion list.

Known confirmed example:
- Blue Cross & Blue Shield in Kansas

This list still needs final confirmation from Caleb.

---

### 7. Vision details should be shown when applicable
For payer/state combinations that require vision handling, the app should extract and display these items when present:

- routine vision exam
- refraction
- materials
- contact lens fitting
- frame allowance
- lens allowance

These should be shown separately from medical responsibility.

---

### 8. Dual plan note
If the plan name contains `DUAL`, append this note to the final result:

`This is a dual plan, please ensure Medicaid is added to the chart and active`

Unless the plan is marked not accepted.

---

### 9. Missing or conflicting data should not be guessed
If the document does not clearly support the needed result, the program should not invent an answer.

Instead, it should return a review-needed result such as:

`Review Required: Could not confidently determine responsibility from document.`

---

## Medical rules engine - intended order

### Override A
If plan is United Healthcare + Bronze Value HMO:
- output not accepted result
- stop

### Override B
If QMB / cost-share protected language is found:
- output $0 QMB result
- stop

### Rule 1
If out-of-pocket max remaining is $0:
- output `$0 (out of pocket met)`
- stop

### Rule 2
If specialist visit copay exists and is greater than $0:
- output specialist copay
- stop financial checks
- still allow non-financial note modifiers, such as dual-plan note

### Rule 3
If specialist visit is not found, check regular office visit as fallback

### Rule 4
If visit copay did not decide the result, evaluate:
- deductible remaining
- coinsurance

Possible outputs include:
- `$0 responsibility`
- `$X remaining deductible, Y% coinsurance`
- `$0 remaining deductible, Y% coinsurance`
- `$X remaining deductible, $0 responsibility`

---

## Vision rules engine - intended behavior
When payer/state is eligible for vision handling, extract and display vision items separately, such as:
- routine vision exam copay
- refraction
- materials
- contact lens fitting
- frame allowance
- lens allowance

These should appear under a separate Vision Responsibility section.

---

## Open item still needed
Need final payer/state list from Caleb for when vision benefits must be included.

Known starting example:
- Blue Cross & Blue Shield in Kansas
