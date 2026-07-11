require("dotenv").config();
const fs = require("fs");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const officeParser = require("officeparser");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function buildPrompt(existingCollections = []) {
  const existingList = existingCollections.length > 0
    ? existingCollections.map(c => `- ${c}`).join("\n")
    : "(none yet - this is the user's first memory)";

  return `You are the AI assistant for OrganAIz, a smart memory-organizing application.

The uploaded file may be:
- an image or screenshot
- a PDF document
- a voice recording
- a Word document, Excel spreadsheet, or PowerPoint presentation
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
- If it's a Word document, summarize the key points of the text.
- If it's an Excel spreadsheet, describe what the data/sheet is about (not every row).
- If it's a PowerPoint presentation, summarize what the deck covers.

Tags:
- Return 3-5 highly relevant keywords.
- Prefer nouns over adjectives.
- Keep tags short (1-2 words each).

Collection:
This user already has the following collections:
${existingList}

Rules, in order:
1. If one of the existing collections above is a good fit for this memory, you MUST reuse it
   exactly as written (same spelling, case, and singular/plural form). Do not create a new
   collection that means the same thing as one that already exists (e.g. if "Assignments"
   already exists, never create "Assignment", "Assignment Work", or "College Assignments" -
   reuse "Assignments").
2. Only create a brand-new collection name if none of the existing ones reasonably fit.
3. When creating a new collection, keep it short (1-2 words) and general enough to hold
   future similar memories - prefer broad categories like College, Assignments, Receipts,
   Finance, Travel, Recipes, Shopping, Meetings, Internship, Design, Research, Health,
   Personal, Work, Events over narrow one-off names.

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
}

function imageToBase64(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return fileBuffer.toString("base64");
}

// Word/Excel/PowerPoint (and their older/legacy or OpenDocument equivalents)
// aren't a format Gemini can read directly like an image or PDF - we have to
// pull the text out ourselves first and send that instead.
const OFFICE_EXT = /\.(docx?|xlsx?|pptx?|odt|ods|odp)$/i;
const PLAIN_TEXT_EXT = /\.(txt|csv|rtf)$/i;

async function extractTextFromFile(filePath) {
  if (PLAIN_TEXT_EXT.test(filePath)) {
    return fs.readFileSync(filePath, "utf8");
  }
  // officeParser handles .doc/.docx/.xls/.xlsx/.ppt/.pptx/.odt/.ods/.odp
  return await officeParser.parseOfficeAsync(filePath);
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

const stringSimilarity = require("string-similarity");

// Safety net on top of the prompt instructions: even when told to reuse
// existing collections, the model can still drift slightly (e.g. "Assignment"
// vs "Assignments"). If the returned name is a close match to one that
// already exists, snap it to the existing one instead of letting a
// near-duplicate collection get created.
function normalizeCollection(collectionName, existingCollections) {
  if (!collectionName || existingCollections.length === 0) return collectionName;

  const exactMatch = existingCollections.find(
    c => c.toLowerCase() === collectionName.toLowerCase()
  );
  if (exactMatch) return exactMatch;

  const { bestMatch } = stringSimilarity.findBestMatch(collectionName.toLowerCase(), existingCollections.map(c => c.toLowerCase()));
  if (bestMatch.rating >= 0.6) {
    return existingCollections[existingCollections.map(c => c.toLowerCase()).indexOf(bestMatch.target)];
  }

  return collectionName;
}

async function analyzeFile(filePath, existingCollections = [], retries = 2) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = buildPrompt(existingCollections);

  let requestContent;

  if (OFFICE_EXT.test(filePath) || PLAIN_TEXT_EXT.test(filePath)) {
    // Word/Excel/PowerPoint/txt/csv: extract the text ourselves, then send
    // it to Gemini as plain text instead of inline media.
    let extractedText;
    try {
      extractedText = await extractTextFromFile(filePath);
    } catch (error) {
      throw new Error(`Could not read this document to analyze it: ${error.message}`);
    }

    // Gemini doesn't need (and shouldn't be sent) an entire huge spreadsheet
    // or deck just to produce a title/summary/tags - cap it generously.
    const trimmedText = (extractedText || "").slice(0, 20000);
    requestContent = [
      `${prompt}\n\nHere is the extracted text content of the uploaded file:\n"""\n${trimmedText}\n"""`
    ];
  } else {
    const imageBase64 = imageToBase64(filePath);
    const mimeType = getMimeType(filePath);
    requestContent = [
      { inlineData: { data: imageBase64, mimeType: mimeType } },
      prompt
    ];
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await model.generateContent(requestContent);

      let rawText = result.response.text();
      rawText = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

      const analysis = JSON.parse(rawText);
      analysis.collection = normalizeCollection(analysis.collection, existingCollections);
      return analysis;

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