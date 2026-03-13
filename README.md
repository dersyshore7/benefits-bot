# Benefits PDF Automation - Optometry Clinic

## Purpose
This project uploads patient benefits PDFs, uses OpenAI to extract medical and vision benefit details, applies clinic-approved business rules, and sends the final result to Slack.

## Core workflow
1. Upload PDF
2. Extract benefit data with OpenAI
3. Verify extracted fields
4. Apply deterministic clinic rules
5. Post final result to Slack
6. Save audit output locally

## Project goals
- Reduce manual benefit review work
- Standardize patient responsibility output
- Avoid hallucinated insurance interpretations
- Support optometry-specific medical and vision workflows

## Stack
- OpenAI API
- Slack
- Node.js / TypeScript
- Mac Terminal
- GitHub

## Key design rule
AI extracts facts.  
Code applies business rules.  
Slack displays the result.

## Main outputs
- Medical Responsibility
- Vision Responsibility
- Review Required, when data is unclear

## Current phase
Step 0: Project setup and documentation

## Notes
This repo should contain the approved business rules before application code is built.
