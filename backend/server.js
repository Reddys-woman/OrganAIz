const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { analyzeImage } = require("./gemini");
const { saveMemory, getAllMemories, updateMemory, trashMemory, restoreMemory, getTrashedMemories, permanentlyDeleteMemory, searchMemories, findDuplicates, getUpcomingDeadlines, getCollectionSuggestions } = require("./supabase");
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

const { createClient } = require("@supabase/supabase-js");

const sbAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY // this is the SECRET/admin key
);

async function authMiddleware(req, res, next) {
    if (req.method === "OPTIONS") {
    return next();
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid token" });
}

  const token = authHeader.substring(7);

  try {
    const { data, error } = await sbAdmin.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ error: "Invalid token" });
    }
    req.user = data.user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token verification failed" });
  }
}

app.use(cors({
    origin: [
        "http://localhost:5500",
        "http://127.0.0.1:5500"
    ],
    credentials: true
}));

app.use(express.json());

// Make uploaded images publicly accessible
app.use("/uploads", express.static("uploads"));

// Everything below this requires login
app.use(authMiddleware);

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
            user_id: req.user.id,
            filename: req.file.filename,
            title: "Processing...",
            summary: "AI analysis in progress",
            tags: [],
            collection: "Inbox",
            deadline: null
        });

        res.json({
            success: true,
            memory: placeholderMemory
        });

        const filePath = "uploads/" + req.file.filename;
        analyzeImage(filePath)
            .then(async (analysis) => {
                await updateMemory(
                    placeholderMemory.id,
                    {
                        title: analysis.title,
                        summary: analysis.summary,
                        tags: analysis.tags,
                        collection: analysis.collection,
                        deadline: analysis.deadline
                    },
                    req.user.id
                );
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
        const memories = await getAllMemories(req.user.id);
        res.json({ success: true, memories });
    } catch (error) {
        console.error("Failed to fetch memories:", error.message);
        res.status(500).json({ success: false, error: "Failed to fetch memories" });
    }
});

app.patch("/memories/:id/trash", async (req, res) => {
    try {
        const updatedMemory = await trashMemory(req.params.id, req.user.id);
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
        const trashedMemories = await getTrashedMemories(req.user.id);
        res.json({ success: true, memories: trashedMemories });
    } catch (error) {
        console.error("Failed to fetch trash:", error.message);
        res.status(500).json({ success: false, error: "Failed to fetch trash" });
    }
});

app.patch("/memories/:id/restore", async (req, res) => {
    try {
        const restoredMemory = await restoreMemory(req.params.id, req.user.id);
        res.json({ success: true, memory: restoredMemory });
    } catch (error) {
        console.error("Failed to restore memory:", error.message);
        res.status(500).json({ success: false, error: "Failed to restore memory" });
    }
});

app.delete("/memories/:id", async (req, res) => {
    try {
        await permanentlyDeleteMemory(req.params.id, req.user.id);
        res.json({ success: true, message: "Memory permanently deleted" });
    } catch (error) {
        console.error("Failed to permanently delete memory:", error.message);
        res.status(500).json({ success: false, error: "Failed to permanently delete memory" });
    }
});

app.get("/search", async (req, res) => {
    try {
        const query = req.query.q;
        const memories = await searchMemories(query, req.user.id);
        res.json({
            success: true,
            memories
        });
    } catch (error) {
        console.error("Search failed:", error.message);
        res.status(500).json({
            success: false,
            error: "Search failed"
        });
    }
});

app.get("/memories/duplicates", async (req, res) => {
    try {
        const duplicates = await findDuplicates(req.user.id);
        res.json({ success: true, duplicateGroups: duplicates });
    } catch (error) {
        console.error("Failed to find duplicates:", error.message);
        res.status(500).json({ success: false, error: "Failed to find duplicates" });
    }
});

app.get("/memories/deadlines", async (req, res) => {
    try {
        const upcoming = await getUpcomingDeadlines(req.user.id);
        res.json({ success: true, memories: upcoming });
    } catch (error) {
        console.error("Failed to fetch deadlines:", error.message);
        res.status(500).json({ success: false, error: "Failed to fetch deadlines" });
    }
});

app.get("/memories/collection-suggestions", async (req, res) => {
    try {
        const suggestions = await getCollectionSuggestions(req.user.id);
        res.json({ success: true, suggestions });
    } catch (error) {
        console.error("Failed to get collection suggestions:", error.message);
        res.status(500).json({ success: false, error: "Failed to get collection suggestions" });
    }
});

app.patch("/memories/:id/collection", async (req, res) => {
    try {
        const { collection } = req.body;
        const updated = await updateMemory(req.params.id, { collection }, req.user.id);
        res.json({ success: true, memory: updated });
    } catch (error) {
        console.error("Failed to update collection:", error.message);
        res.status(500).json({ success: false, error: "Failed to update collection" });
    }
});

app.listen(PORT, () => {
    console.log(`server is running on http://localhost:${PORT}`);
});