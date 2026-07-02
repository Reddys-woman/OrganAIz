const express = require("express");
const multer = require("multer");

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
const PORT = 5000;

app.get("/", (req, res) => {

    console.log("Request received!");

    res.send("Hello from Recall Backend!");

});

app.post("/upload", upload.single("image"), (req, res) => {

    console.log("========== NEW IMAGE ==========");
    console.log(req.file);

    res.json({
    success: true,
    filename: req.file.filename});

});

app.listen (PORT, () =>{
    console.log (`server is running on http://localhost:${PORT}`)
})