require("dotenv").config();
const fs = require("fs");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const PROMPT = `You are analyzing a screenshot for a memory-organizing app called OrganAIz.

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

async function run() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const imageBase64 = imageToBase64("uploads/wfyi9o8jqwa11.jpg");

    const result = await model.generateContent([
      {
        inlineData: {
          data: imageBase64,
          mimeType: "image/jpeg"
        }
      },
      PROMPT
    ]);

    const rawText = result.response.text();
    console.log("Raw Gemini reply:", rawText);

    const parsed = JSON.parse(rawText);
    console.log("Parsed object:", parsed);
    console.log("Title:", parsed.title);
    console.log("Tags:", parsed.tags);

  } catch (error) {
    console.error("Something went wrong:", error.message);
  }
}

run();

// used this to test the Gemini API if it were respoding to image from uploads 
