document.addEventListener("submit", function (e) {
    console.log("FORM SUBMITTED!");
    e.preventDefault();
});

document.addEventListener("click", function (e) {
    console.log("Clicked:", e.target);
});
const memoryGrid = document.getElementById("memoryGrid");
console.log(memoryGrid);
const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const dropZone = document.getElementById("dropZone");
uploadBtn.addEventListener("click", function () {

    fileInput.click();

});

let memories = [];

function renderMemories() {

    console.log("Rendering memories...");

    memoryGrid.innerHTML = "";

    memories.forEach(memory => {
        console.log(memory);
        const card = document.createElement("div");

        card.className = "memory-card";

        card.innerHTML = `

<img src="${memory.image}">

<div class="memory-content">

<span class="tag">

${memory.tag}

</span>

<h3>${memory.title}</h3>

<p>

${memory.summary}

</p>

<div class="memory-footer">

<span>

📂 ${memory.collection}

</span>

<span>

📅 ${memory.time}

</span>

</div>

</div>

`;

        memoryGrid.appendChild(card);
        console.log(memoryGrid.innerHTML);

    });

}

renderMemories();
console.log("Memory card created successfully.");
async function uploadFile(file) {

    const formData = new FormData();

    formData.append("image", file);

    try {

        const response = await fetch("http://localhost:5000/upload", {

            method: "POST",

            body: formData

        });

        console.log("Status:", response.status);
        console.log("OK:", response.ok);

        const data = await response.json();

        console.log(data);

        const newMemory = {

            title: "Processing...",

            image: `http://localhost:5000/uploads/${data.filename}`,

            tag: "Pending",

            collection: "Inbox",

            summary: "Waiting for AI analysis...",

            time: "Just now",

            pinned: false

        };

        memories.unshift(newMemory);
        console.log(memories);
console.log("Length:", memories.length);
        console.log("Memories array:", memories);
        console.log("Number of memories:", memories.length);

        renderMemories();

        alert("Upload Successful!");

    }

    catch (error) {

        console.error("========== FULL ERROR ==========");
        console.error(error);
        console.error(error.name);
        console.error(error.message);
        console.error(error.stack);

        alert("Upload Failed");

    }

}

fileInput.addEventListener("change", function () {

    const files = fileInput.files;

    if (files.length === 0) return;

    for (const file of files) {

        uploadFile(file);

    }

});

dropZone.addEventListener("dragover", function (event) {

    event.preventDefault();

});
dropZone.addEventListener("drop", function (event) {

    event.preventDefault();

    const file = event.dataTransfer.files[0];

    if (!file) return;

    uploadFile(file);

});