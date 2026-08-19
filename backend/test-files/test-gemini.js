require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const key = process.env.GEMINI_API_KEY;
console.log("Key length:", key ? key.length : "no key found");
console.log("Starts with:", key ? key.substring(0, 6) : "N/A");
console.log("Ends with:", key ? key.substring(key.length - 4) : "N/A");

const genAI = new GoogleGenerativeAI(key);

async function run() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
    const result = await model.generateContent("Say hello in one short sentence.");
    console.log("Gemini replied:", result.response.text());
  } catch (error) {
    console.error("Something went wrong:", error.message);
  }
}

run();

// used this to test the Gemini API if it were respoding to text