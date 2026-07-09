require("dotenv").config();
const fs = require("fs");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const PROMPT = `You are the AI assistant for OrganAIz, a smart memory-organizing application.

The uploaded file may be:
- an image or screenshot
- a PDF document
- a voice recording
- another supported file

Your job is to understand the content of the uploaded file and generate useful metadata so the user can easily search, organize, and recall it later.

Respond with ONLY a valid JSON object in this exact format:

{
  "title": "A concise descriptive title (maximum 8 words)",
  "summary": "A clear 1-2 sentence summary of the important information in the file",
  "tags": ["tag1", "tag2", "tag3"],
  "collection": "A short category name (1-2 words)",
  "deadline": "Return a date in YYYY-MM-DD format if the file contains a specific due date, event date, meeting date, appointment, exam date, or submission deadline. Otherwise return null."
}

Guidelines:

Title:
- Make it descriptive and specific.
- Never use generic titles like "Image", "Screenshot", "PDF", "Audio", or "Document".

Summary:
- Capture the most important information.
- If it's a voice recording, summarize what was said.
- If it's a PDF, summarize the document.
- If it's an image, describe the important visual information.

Tags:
- Return 3-5 highly relevant keywords.
- Prefer nouns over adjectives.
- Keep tags short (1-2 words each).

Collection:
Choose the single best collection that groups similar memories together.

Examples include:
- College
- Assignments
- Receipts
- Finance
- Travel
- Recipes
- Shopping
- Meetings
- Internship
- Design
- Research
- Health
- Personal
- Work
- Events

If none fit well, create a concise collection name.

Deadlines:
Extract dates only when they represent an actionable event such as:
- assignment due dates
- exams
- interviews
- appointments
- meetings
- registrations
- bill due dates
- reminders

Convert dates into YYYY-MM-DD whenever possible.

If no explicit actionable date exists, return null.

Important:
- Do not invent information.
- Do not guess unreadable text.
- Return ONLY valid JSON.
- Do not wrap the response in markdown.`;

function imageToBase64(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return fileBuffer.toString("base64");
}

function getMimeType(filePath) {
  const ext = filePath.split(".").pop().toLowerCase();

  switch (ext) {
    case "png":
      return "image/png";

    case "jpg":
    case "jpeg":
      return "image/jpeg";

    case "webp":
      return "image/webp";

    case "pdf":
      return "application/pdf";

    case "mp3":
      return "audio/mpeg";

    case "wav":
      return "audio/wav";

    case "m4a":
      return "audio/mp4";

    case "ogg":
      return "audio/ogg";

    default:
      throw new Error("Unsupported file type");
  }
}

async function analyzeFile(filePath, retries = 2) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const imageBase64 = imageToBase64(filePath);
  const mimeType = getMimeType(filePath);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await model.generateContent([
        { inlineData: { data: imageBase64, mimeType: mimeType } },
        PROMPT
      ]);

      let rawText = result.response.text();
      rawText = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

      return JSON.parse(rawText);

    } catch (error) {
      console.log(`Gemini attempt ${attempt + 1} failed:`, error.message);
      if (attempt === retries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

module.exports = { analyzeFile };  