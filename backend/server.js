const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { analyzeImage } = require("./gemini");
const { saveMemory, getAllMemories, updateMemory } = require("./supabase");

const storage = multer.diskStorage({

    destination: function (req, file, cb) {
        cb(null, "uploads/");
    },

    filename: function (req, file, cb) {
        cb(null, Date.now() + "-" + file.originalname);
    }

});

const upload = multer({ storage: storage });

const app = express();
app.use(cors());
app.use("/uploads", express.static("uploads"));

app.use((req, res, next) => {
    console.log("CORS middleware reached");
    next();
});

const PORT = 5000;

app.get("/", (req, res) => {

    console.log("Request received!");

    res.send("Hello from Recall Backend!");

});

app.post("/upload", upload.single("image"), async (req, res) => {
    console.log("========== NEW IMAGE ==========");
    console.log(req.file);

    try {
        const placeholderMemory = await saveMemory({
            filename: req.file.filename,
            title: "Processing...",
            summary: "AI analysis in progress",
            tags: [],
            collection: "Inbox"
        });

        res.json({
            success: true,
            memory: placeholderMemory
        });

        const filePath = "uploads/" + req.file.filename;
        analyzeImage(filePath)
            .then(async (analysis) => {
                await updateMemory(placeholderMemory.id, {
                    title: analysis.title,
                    summary: analysis.summary,
                    tags: analysis.tags,
                    collection: analysis.collection
                });
                console.log(`Memory ${placeholderMemory.id} updated with AI analysis`);
            })
            .catch((error) => {
                console.error(`Gemini analysis failed for memory ${placeholderMemory.id}:`, error.message);
            });

    } catch (error) {
        console.error("Upload processing failed:", error.message);
        res.status(500).json({
            success: false,
            error: "Failed to process image"
        });
    }
});

app.get("/memories", async (req, res) => {
    try {
        const memories = await getAllMemories();
        res.json({ success: true, memories });
    } catch (error) {
        console.error("Failed to fetch memories:", error.message);
        res.status(500).json({ success: false, error: "Failed to fetch memories" });
    }
});

app.listen (PORT, () =>{
    console.log (`server is running on http://localhost:${PORT}`)
})