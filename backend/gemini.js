require("dotenv").config();
const fs = require("fs");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const PROMPT = `You are analyzing a screenshot for a memory-organizing app called Recall.

Look at the image and respond with ONLY a valid JSON object in this exact format, with no extra text, no explanations, and no markdown formatting:

{
  "title": "A short, specific title (max 8 words)",
  "summary": "A 1-2 sentence summary of what this screenshot contains",
  "tags": ["tag1", "tag2", "tag3"],
  "collection": "A short 1-2 word category name that best fits this content (e.g. Hackathon, Study, Shopping, Design, Travel, Recipes, Finance, etc.)"
}

Rules:
- title must be specific to the content, not generic like "Screenshot" or "Image"
- tags should be 2-4 relevant single or two-word keywords
- collection should be a concise, sensible category based on the actual content — invent one if none of the examples fit
- Return ONLY the JSON object, nothing else`;

function imageToBase64(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return fileBuffer.toString("base64");
}

function getMimeType(filePath) {
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function analyzeImage(filePath) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const imageBase64 = imageToBase64(filePath);
  const mimeType = getMimeType(filePath);

  const result = await model.generateContent([
    {
      inlineData: {
        data: imageBase64,
        mimeType: mimeType
      }
    },
    PROMPT
  ]);

  let rawText = result.response.text();
  // Remove markdown code fences if Gemini added them despite instructions
  rawText = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  const parsed = JSON.parse(rawText);

  return parsed;
}

module.exports = { analyzeImage };  