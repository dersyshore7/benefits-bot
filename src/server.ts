import express from "express";
import dotenv from "dotenv";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;

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
            max-width: 720px;
            margin: 40px auto;
            padding: 0 16px;
            line-height: 1.5;
          }
          .card {
            border: 1px solid #ddd;
            border-radius: 10px;
            padding: 24px;
          }
          h1 {
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
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Benefits PDF Upload</h1>
          <p>Upload a patient benefits PDF to begin analysis.</p>

          <form action="/upload" method="POST" enctype="multipart/form-data">
            <label for="benefitsPdf"><strong>Select PDF</strong></label>
            <input
              id="benefitsPdf"
              name="benefitsPdf"
              type="file"
              accept=".pdf,application/pdf"
              required
            />
            <button type="submit">Upload PDF</button>
          </form>

          <p class="note">Current step: local upload only. OpenAI analysis comes next.</p>
        </div>
      </body>
    </html>
  `);
});

app.post("/upload", upload.single("benefitsPdf"), (req, res) => {
  if (!req.file) {
    res.status(400).send(`
      <h1>Upload failed</h1>
      <p>No file was received.</p>
      <p><a href="/">Try again</a></p>
    `);
    return;
  }

  const safeOriginalName = escapeHtml(req.file.originalname);
  const safeStoredName = escapeHtml(req.file.filename);

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Upload Successful</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 720px;
            margin: 40px auto;
            padding: 0 16px;
            line-height: 1.5;
          }
          .card {
            border: 1px solid #ddd;
            border-radius: 10px;
            padding: 24px;
          }
          code {
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Upload successful</h1>
          <p><strong>Original file:</strong> ${safeOriginalName}</p>
          <p><strong>Saved as:</strong> <code>${safeStoredName}</code></p>
          <p><strong>Size:</strong> ${req.file.size.toLocaleString()} bytes</p>
          <p>The PDF is now saved in your local <code>uploads</code> folder.</p>
          <p><a href="/">Upload another PDF</a></p>
        </div>
      </body>
    </html>
  `);
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(400).send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Upload Error</title>
      </head>
      <body style="font-family: Arial, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px;">
        <h1>Upload error</h1>
        <p>${escapeHtml(error.message)}</p>
        <p><a href="/">Go back</a></p>
      </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
