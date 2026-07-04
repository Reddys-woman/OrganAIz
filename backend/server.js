const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { analyzeImage } = require("./gemini");

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
        const filePath = "uploads/" + req.file.filename;
        const analysis = await analyzeImage(filePath);

        res.json({
            success: true,
            filename: req.file.filename,
            ...analysis
        });
    } catch (error) {
        console.error("Gemini analysis failed:", error.message);
        res.status(500).json({
            success: false,
            error: "Failed to analyze image"
        });
    }
});

app.listen (PORT, () =>{
    console.log (`server is running on http://localhost:${PORT}`)
})