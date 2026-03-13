import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from .env");
  }

  const client = new OpenAI({ apiKey });

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: "Reply with exactly this text: OpenAI connection successful."
  });

  console.log(response.output_text);
}

main().catch((error) => {
  console.error("OpenAI test failed:");
  console.error(error);
  process.exit(1);
});
