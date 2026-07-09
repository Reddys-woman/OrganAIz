const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { analyzeImage } = require("./gemini");
const { saveMemory, getAllMemories, updateMemory, trashMemory, restoreMemory, getTrashedMemories, permanentlyDeleteMemory } = require("./supabase");

// Make sure the uploads folder actually exists before multer tries to write into it.
// Without this, multer throws ENOENT and (since nothing catches it) Express sends
// back its default HTML error page instead of JSON — which is why the frontend
// was seeing "Server sent back something that wasn't JSON".
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    console.log("Created missing uploads/ directory at", UPLOAD_DIR);
}

const storage = multer.diskStorage({

    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR);
    },

    filename: function (req, file, cb) {
        cb(null, Date.now() + "-" + file.originalname);
    }

});

const upload = multer({ storage: storage });

const app = express();
app.use(cors());
app.use("/uploads", express.static(UPLOAD_DIR));

app.use((req, res, next) => {
    console.log("CORS middleware reached");
    next();
});

const PORT = 5000;

app.get("/", (req, res) => {

    console.log("Request received!");

    res.send("Hello from OrganAIz Backend!");

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

        const filePath = path.join(UPLOAD_DIR, req.file.filename);
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

app.patch("/memories/:id/trash", async (req, res) => {
    try {
        const updatedMemory = await trashMemory(req.params.id);

        res.json({
            success: true,
            memory: updatedMemory
        });

    } catch (error) {
        console.error("Failed to move memory to trash:", error.message);

        res.status(500).json({
            success: false,
            error: "Failed to move memory to trash"
        });
    }
});

app.get("/trash", async (req, res) => {
    try {
        const trashedMemories = await getTrashedMemories();
        res.json({ success: true, memories: trashedMemories });
    } catch (error) {
        console.error("Failed to fetch trash:", error.message);
        res.status(500).json({ success: false, error: "Failed to fetch trash" });
    }
});

app.patch("/memories/:id/restore", async (req, res) => {
    try {
        const restoredMemory = await restoreMemory(req.params.id);
        res.json({ success: true, memory: restoredMemory });
    } catch (error) {
        console.error("Failed to restore memory:", error.message);
        res.status(500).json({ success: false, error: "Failed to restore memory" });
    }
});

app.delete("/memories/:id", async (req, res) => {
    try {
        await permanentlyDeleteMemory(req.params.id);
        res.json({ success: true, message: "Memory permanently deleted" });
    } catch (error) {
        console.error("Failed to permanently delete memory:", error.message);
        res.status(500).json({ success: false, error: "Failed to permanently delete memory" });
    }
});
    
// ===========================
// GLOBAL ERROR HANDLER
// ===========================
// Must be defined AFTER all routes. Catches anything that throws/fails
// (including multer errors) and guarantees the response is always JSON,
// never Express's default HTML error page.
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    if (res.headersSent) {
        return next(err);
    }
    res.status(500).json({
        success: false,
        error: err.message || "Something went wrong on the server"
    });
});

app.listen (PORT, () =>{
    console.log (`server is running on http://localhost:${PORT}`)
})