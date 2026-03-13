# Build Roadmap - Benefits PDF Automation for Optometry Clinic

## Purpose
This document is the phased implementation roadmap for building the program step-by-step.

---

## Build principle
We are building this in stages.

AI extracts facts.  
Code applies business rules.  
Slack displays the final answer.

---

## Tools available
- OpenAI API
- Slack
- Codex
- Mac Terminal
- GitHub

---

## Planned stack
- Node.js
- TypeScript
- Express
- OpenAI SDK
- Slack integration
- Local file storage for MVP
- GitHub for version control

---

## Phase 0 - Documentation and repo setup
Goal:
- Create local repo
- Save approved rules and plan into project files
- Keep docs under version control before coding starts

Deliverables:
- README.md
- docs/business-rules.md
- docs/build-roadmap.md

---

## Phase 1 - Local project setup
Goal:
- Initialize Node project
- Install dependencies
- Create .env file
- Test OpenAI connection
- Test Slack connection

---

## Phase 2 - Local PDF upload
Goal:
- Create a simple local upload page
- Accept PDF upload
- Save uploaded PDF temporarily

---

## Phase 3 - Extraction layer
Goal:
- Send PDF to OpenAI
- Extract structured insurance fields
- Save raw extraction result locally

Fields will include:
- payer name
- plan name
- out-of-pocket remaining
- specialist visit
- office visit fallback
- deductible remaining
- coinsurance
- notes
- dual-plan indicators
- vision fields when applicable

---

## Phase 4 - Verification layer
Goal:
- Check extracted fields against source evidence
- Mark fields as verified / unsupported / conflicting / not found
- Prevent unsupported answers from reaching final output

---

## Phase 5 - Rules engine
Goal:
- Build deterministic code for:
  - overrides
  - medical responsibility
  - vision responsibility
  - dual-plan notes
  - review-required output

---

## Phase 6 - Slack output
Goal:
- Format final results for Slack
- Show Medical Responsibility separately
- Show Vision Responsibility separately
- Show Review Required when needed

---

## Phase 7 - Audit logging
Goal:
- Save:
  - raw extraction
  - verification output
  - rules-engine output
  - final Slack message payload

---

## Phase 8 - Hardening
Goal:
- Improve error handling
- Add clearer review flags
- Add more sample PDFs
- Add configuration for payer/state vision rules

---

## Current build sequence we will follow together
1. Step 0 - repo and docs
2. Step 1 - initialize Node project
3. Step 2 - set up environment variables
4. Step 3 - test OpenAI
5. Step 4 - test Slack
6. Step 5 - create upload route and page
7. Step 6 - send PDF to OpenAI
8. Step 7 - build verification logic
9. Step 8 - build rules engine
10. Step 9 - format Slack message
11. Step 10 - save audit files
12. Step 11 - refine and expand
