console.log("SCRIPT STARTED", new Date().toLocaleTimeString());

const memoryGrid = document.getElementById("memoryGrid");
const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const emptyMessage = document.getElementById("emptyMessage");
const dropZone = document.getElementById("dropZone");

uploadBtn.addEventListener("click", function () {
    fileInput.click();
});

let memories = [];
let pollingInterval = null;

function formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString() + " • " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderMemories() {
    memoryGrid.innerHTML = "";
    memories.forEach(memory => {
        const card = document.createElement("div");
        card.className = "memory-card";
        const tagText = memory.tags && memory.tags.length > 0 ? memory.tags[0] : memory.collection;
        card.innerHTML = `
<img src="http://localhost:5000/uploads/${memory.filename}">
<div class="memory-content">
<span class="tag">${tagText}</span>
<h3>${memory.title}</h3>
<p>${memory.summary}</p>
<div class="memory-footer">
    <span>📂 ${memory.collection}</span>
    <span>📅 ${formatTime(memory.created_at)}</span>
</div>

<button class="trash-btn" data-id="${memory.id}">
    🗑️ Move to Trash
</button>
</div>
`;
        memoryGrid.appendChild(card);
        const trashButton = card.querySelector(".trash-btn");

        trashButton.addEventListener("click", () => {
            moveToTrash(memory.id);
        });
    });
}

async function moveToTrash(id) {
    try {
        const response = await fetch(
            `http://localhost:5000/memories/${id}/trash`,
            {
                method: "PATCH"
            }
        );

        if (!response.ok) {
            throw new Error("Failed to move to trash");
        }

        await loadMemories();

    } catch (error) {
        console.error(error);
        alert("Failed to move memory to trash.");
    }
}

async function loadMemories() {
    try {
        const response = await fetch("http://localhost:5000/memories");
        const data = await response.json();
        memories = data.memories;
        renderMemories();
    } catch (error) {
        console.error("Failed to load memories:", error);
    }
}

function startPolling() {
    if (pollingInterval) return;
    pollingInterval = setInterval(async () => {
        await loadMemories();
        const stillProcessing = memories.some(m => m.title === "Processing...");
        if (!stillProcessing) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }, 3000);
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append("image", file);
    try {
        const response = await fetch("http://localhost:5000/upload", {
            method: "POST",
            body: formData
        });
        const data = await response.json();
        console.log(data);
        memories.unshift(data.memory);
        renderMemories();
        startPolling();
    } catch (error) {
        console.error("Upload failed:", error);
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

loadMemories();
