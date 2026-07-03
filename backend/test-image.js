require("dotenv").config();
const fs = require("fs");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function imageToBase64(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return fileBuffer.toString("base64");
}

async function run() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const imageBase64 = imageToBase64("uploads/wfyi9o8jqwa11.jpg");

    const result = await model.generateContent([
      {
        inlineData: {
          data: imageBase64,
          mimeType: "image/jpeg"
        }
      },
      "Describe what is in this screenshot in one or two sentences."
    ]);

    console.log("Gemini's description:", result.response.text());
  } catch (error) {
    console.error("Something went wrong:", error.message);
  }
}

run();

// used this to test the Gemini API if it were respoding to image from uploads 