import dotenv from "dotenv";

dotenv.config();

async function main() {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new Error("SLACK_WEBHOOK_URL is missing from .env");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text: "Benefits bot Slack connection successful."
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Slack webhook request failed: ${response.status} ${errorText}`);
  }

  console.log("Slack webhook test successful.");
}

main().catch((error) => {
  console.error("Slack test failed:");
  console.error(error);
  process.exit(1);
});
