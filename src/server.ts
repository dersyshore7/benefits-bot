import express from "express";
import dotenv from "dotenv";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { extractBenefitsFromPdf } from "./services/extractBenefits";
import { verifyBenefitsExtraction } from "./services/verifyBenefits";
import { buildRulesEngineResult } from "./services/rulesEngine";

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is missing from .env");
}

const client = new OpenAI({ apiKey });
const uploadsDir = path.join(process.cwd(), "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function sanitizeBaseName(fileName: string): string {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);

  return baseName
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadsDir);
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase() || ".pdf";
    const safeBaseName = sanitizeBaseName(file.originalname) || "uploaded-file";
    const finalName = `${Date.now()}-${safeBaseName}${extension}`;

    callback(null, finalName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const isPdf =
      file.mimetype === "application/pdf" || extension === ".pdf";

    if (!isPdf) {
      callback(new Error("Only PDF files are allowed."));
      return;
    }

    callback(null, true);
  }
});

app.get("/", (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Benefits Bot Upload</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 900px;
            margin: 40px auto;
            padding: 0 16px;
            line-height: 1.5;
          }
          .card {
            border: 1px solid #ddd;
            border-radius: 10px;
            padding: 24px;
            margin-bottom: 20px;
          }
          h1, h2, h3 {
            margin-top: 0;
          }
          button {
            margin-top: 12px;
            padding: 10px 16px;
            cursor: pointer;
          }
          input[type="file"] {
            margin-top: 12px;
            display: block;
          }
          .note {
            color: #555;
            font-size: 14px;
            margin-top: 8px;
          }
          code {
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 4px;
          }
          ul {
            margin-top: 8px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Benefits PDF Upload</h1>
          <p>Upload a patient benefits PDF to extract, verify, and calculate the final responsibility result.</p>

          <form action="/upload" method="POST" enctype="multipart/form-data">
            <label for="benefitsPdf"><strong>Select PDF</strong></label>
            <input
              id="benefitsPdf"
              name="benefitsPdf"
              type="file"
              accept=".pdf,application/pdf"
              required
            />
            <button type="submit">Upload and Analyze PDF</button>
          </form>

          <p class="note">This step runs extraction, verification, and the rules engine, then saves JSON results locally.</p>
        </div>
      </body>
    </html>
  `);
});

app.post("/upload", upload.single("benefitsPdf"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).send(`
        <h1>Upload failed</h1>
        <p>No file was received.</p>
        <p><a href="/">Try again</a></p>
      `);
      return;
    }

    const pdfPath = req.file.path;
    const extractionResult = await extractBenefitsFromPdf(client, pdfPath);
    const verificationResult = await verifyBenefitsExtraction(
      client,
      pdfPath,
      extractionResult.extraction
    );
    const rulesResult = buildRulesEngineResult(
      extractionResult.extraction,
      verificationResult.verification
    );

    const safeOriginalName = escapeHtml(req.file.originalname);
    const safeSavedName = escapeHtml(req.file.filename);
    const safeExtractionPath = escapeHtml(extractionResult.savedPath);
    const safeVerificationPath = escapeHtml(verificationResult.savedPath);

    const warningsHtml = extractionResult.extraction.document_warnings.length
      ? `<ul>${extractionResult.extraction.document_warnings
          .map((warning) => `<li>${escapeHtml(warning)}</li>`)
          .join("")}</ul>`
      : "<p>None</p>";

    const finalNotesHtml = rulesResult.notes.length
      ? `<ul>${rulesResult.notes
          .map((note) => `<li>${escapeHtml(note)}</li>`)
          .join("")}</ul>`
      : "<p>None</p>";

    const reasoningHtml = rulesResult.reasoning_path.length
      ? `<ul>${rulesResult.reasoning_path
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("")}</ul>`
      : "<p>None</p>";

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Analysis Complete</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 900px;
              margin: 40px auto;
              padding: 0 16px;
              line-height: 1.5;
            }
            .card {
              border: 1px solid #ddd;
              border-radius: 10px;
              padding: 24px;
              margin-bottom: 20px;
            }
            code {
              background: #f4f4f4;
              padding: 2px 6px;
              border-radius: 4px;
            }
            h1, h2, h3 {
              margin-top: 0;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Analysis complete</h1>
            <p><strong>Original file:</strong> ${safeOriginalName}</p>
            <p><strong>Saved file:</strong> <code>${safeSavedName}</code></p>
          </div>

          <div class="card">
            <h2>Final Responsibility Result</h2>
            <p><strong>Status:</strong> ${escapeHtml(rulesResult.status)}</p>
            <p><strong>Medical Responsibility:</strong> ${escapeHtml(rulesResult.medical_responsibility ?? "Review Required")}</p>
            <p><strong>Vision Responsibility:</strong> ${escapeHtml(rulesResult.vision_responsibility ?? "None")}</p>

            <h3>Notes</h3>
            ${finalNotesHtml}

            <h3>Reasoning Path</h3>
            ${reasoningHtml}
          </div>

          <div class="card">
            <h2>Extraction Summary</h2>
            <p><strong>Document type:</strong> ${escapeHtml(extractionResult.extraction.document_type)}</p>
            <p><strong>Payer name:</strong> ${escapeHtml(extractionResult.extraction.payer_name ?? "Not found")}</p>
            <p><strong>Plan name:</strong> ${escapeHtml(extractionResult.extraction.plan_name ?? "Not found")}</p>

            <h3>Warnings</h3>
            ${warningsHtml}
          </div>

          <div class="card">
            <h2>Verification Summary</h2>
            <p><strong>Overall status:</strong> ${escapeHtml(verificationResult.verification.overall_status)}</p>
            <p><strong>Document type verification:</strong> ${escapeHtml(verificationResult.verification.document_type_verification.verification_status)}</p>
          </div>

          <div class="card">
            <h2>Saved result files</h2>
            <p><strong>Extraction JSON:</strong> <code>${safeExtractionPath}</code></p>
            <p><strong>Verification JSON:</strong> <code>${safeVerificationPath}</code></p>
          </div>

          <p><a href="/">Analyze another PDF</a></p>
        </body>
      </html>
    `);
  } catch (error) {
    next(error);
  }
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(400).send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Analysis Error</title>
      </head>
      <body style="font-family: Arial, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px;">
        <h1>Analysis error</h1>
        <p>${escapeHtml(error.message)}</p>
        <p><a href="/">Go back</a></p>
      </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
