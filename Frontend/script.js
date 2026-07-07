console.log("SCRIPT STARTED", new Date().toLocaleTimeString());

const API_BASE = "http://localhost:5000";

/* =========================================================
   ELEMENT REFERENCES
========================================================= */
const uploadBtn = document.getElementById("uploadBtn");
const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const searchInput = document.getElementById("searchInput");
const themeToggle = document.getElementById("themeToggle");

const memoryGrid = document.getElementById("memoryGrid");           // Dashboard: recent
const emptyMessage = document.getElementById("emptyMessage");

const allMemoriesGrid = document.getElementById("allMemoriesGrid"); // Memories page
const memoriesEmptyMessage = document.getElementById("memoriesEmptyMessage");

const collectionsGrid = document.getElementById("collectionsGrid"); // Collections page
const collectionsEmptyMessage = document.getElementById("collectionsEmptyMessage");

const trashGrid = document.getElementById("trashGrid");             // Trash page
const trashEmptyMessage = document.getElementById("trashEmptyMessage");

const imagesGrid = document.getElementById("imagesGrid");           // Images page
const imagesEmptyMessage = document.getElementById("imagesEmptyMessage");

const audioGrid = document.getElementById("audioGrid");             // Audio page
const audioEmptyMessage = document.getElementById("audioEmptyMessage");

const docGrid = document.getElementById("docGrid");                 // Document page
const docEmptyMessage = document.getElementById("docEmptyMessage");

const navLinks = document.querySelectorAll(".menu a[data-page]");
const sourceLinks = document.querySelectorAll(".source[data-page]"); // Images/Audio/PDF sidebar rows
const pages = document.querySelectorAll(".page");

/* =========================================================
   STATE
========================================================= */
let memories = [];        // active (non-trashed) memories
let trashedMemories = []; // trashed memories
let pollingInterval = null;
let currentPage = "dashboard";
let collectionFilter = null; // set when jumping from Collections -> Memories

/* =========================================================
   PAGE ROUTER
   Sidebar + topbar never move; only the .page sections toggle.
========================================================= */
function showPage(pageName) {
    currentPage = pageName;

    pages.forEach(page => {
        page.style.display = page.dataset.page === pageName ? "" : "none";
    });

    navLinks.forEach(link => {
        link.classList.toggle("active", link.dataset.page === pageName);
    });
    sourceLinks.forEach(link => {
        link.classList.toggle("active", link.dataset.page === pageName);
    });

    searchInput.value = "";

    if (pageName === "memories") {
        renderMemoriesPage();
    } else if (pageName === "collections") {
        renderCollectionsPage();
    } else if (pageName === "trash") {
        loadTrash();
    } else if (pageName === "images") {
        renderImagesPage();
    } else if (pageName === "audio") {
        renderAudioPage();
    } else if (pageName === "document") {
        renderdocPage();
    } else if (pageName === "dashboard") {
        renderDashboard();
    }
}

navLinks.forEach(link => {
    link.addEventListener("click", function (e) {
        e.preventDefault();
        collectionFilter = null;
        showPage(link.dataset.page);
    });
});

sourceLinks.forEach(link => {
    link.addEventListener("click", function () {
        collectionFilter = null;
        showPage(link.dataset.page);
    });
});

// "View All" link on the dashboard jumps to the Memories page
document.querySelectorAll("[data-page-link]").forEach(link => {
    link.addEventListener("click", function (e) {
        e.preventDefault();
        showPage(link.dataset.pageLink);
    });
});

/* =========================================================
   DARK MODE TOGGLE
========================================================= */
function applyTheme(theme) {
    const icon = themeToggle.querySelector("i");
    if (theme === "dark") {
        document.body.classList.add("dark");
        icon.classList.remove("fa-moon");
        icon.classList.add("fa-sun");
    } else {
        document.body.classList.remove("dark");
        icon.classList.remove("fa-sun");
        icon.classList.add("fa-moon");
    }
}

const savedTheme = localStorage.getItem("recall-theme") || "light";
applyTheme(savedTheme);

themeToggle.addEventListener("click", function () {
    const isDark = document.body.classList.contains("dark");
    const nextTheme = isDark ? "light" : "dark";
    localStorage.setItem("recall-theme", nextTheme);
    applyTheme(nextTheme);
});

/* =========================================================
   HELPERS
========================================================= */
function formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString() + " • " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isToday(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    return date.toDateString() === now.toDateString();
}

function classifyType(memory) {
    const filename = (memory && memory.filename) || "";
    if (/\.(png|jpe?g|gif|webp)$/i.test(filename)) return "image";
    if (/\.(mp3|wav|m4a|ogg)$/i.test(filename)) return "audio";
    if (/\.doc$/i.test(filename)) return "doc";
    return "other";
}

function createMemoryCard(memory, mode) {
    // Defensive: a failed upload/restore can leave a null/undefined entry in
    // an array before this ever gets called - never render a card for it.
    if (!memory) return null;

    // mode: "normal" (dashboard/memories) or "trash"
    const card = document.createElement("div");
    card.className = "memory-card";

    const tagText = memory.tags && memory.tags.length > 0 ? memory.tags[0] : (memory.collection || "General");

    const trashIconHtml = mode === "normal"
        ? `<button class="trash-icon-btn" data-id="${memory.id}" title="Move to Trash">
             <i class="fa-solid fa-trash"></i>
           </button>`
        : "";

    const trashActionsHtml = mode === "trash"
        ? `<div class="memory-actions">
             <button class="restore-btn" data-id="${memory.id}"><i class="fa-solid fa-rotate-left"></i> Restore</button>
             <button class="delete-btn" data-id="${memory.id}"><i class="fa-solid fa-trash-can"></i> Delete Forever</button>
           </div>`
        : "";

    card.innerHTML = `
        <div class="memory-image-wrap">
            <img src="${API_BASE}/uploads/${memory.filename || ""}">
            ${trashIconHtml}
        </div>
        <div class="memory-content">
            <span class="tag">${tagText}</span>
            <h3>${memory.title || "Untitled"}</h3>
            <p>${memory.summary || ""}</p>
            <div class="memory-footer">
                <span>📂 ${memory.collection || "General"}</span>
                <span>📅 ${memory.created_at ? formatTime(memory.created_at) : "just now"}</span>
            </div>
            ${trashActionsHtml}
        </div>
    `;
    return card;
}

/* =========================================================
   DASHBOARD (recent memories, stats)
========================================================= */
function renderDashboard() {
    const recent = memories.filter(Boolean).slice(0, 4);

    memoryGrid.innerHTML = "";
    recent.forEach(memory => {
        const card = createMemoryCard(memory, "normal");
        if (card) memoryGrid.appendChild(card);
    });
    emptyMessage.classList.toggle("visible", memories.length === 0);

    // Stats
    const validMemories = memories.filter(Boolean);
    document.getElementById("statTotal").textContent = validMemories.length;
    document.getElementById("statToday").textContent = validMemories.filter(m => m.created_at && isToday(m.created_at)).length;

    const uniqueCollections = new Set(validMemories.map(m => m.collection).filter(Boolean));
    document.getElementById("statCollections").textContent = uniqueCollections.size;

    // File type counts, shared with the Images/Audio/PDF pages
    document.getElementById("countImages").textContent = validMemories.filter(m => classifyType(m) === "image").length;
    document.getElementById("countVoice").textContent = validMemories.filter(m => classifyType(m) === "audio").length;
    document.getElementById("countdoc").textContent = validMemories.filter(m => classifyType(m) === "document").length;
}

/* =========================================================
   MEMORIES PAGE (all memories, filterable by search / collection)
========================================================= */
function renderMemoriesPage() {
    const query = searchInput.value.trim().toLowerCase();

    let filtered = memories.filter(Boolean);
    if (collectionFilter) {
        filtered = filtered.filter(m => m.collection === collectionFilter);
    }
    if (query) {
        filtered = filtered.filter(m =>
            (m.title || "").toLowerCase().includes(query) ||
            (m.summary || "").toLowerCase().includes(query) ||
            (m.collection || "").toLowerCase().includes(query) ||
            (m.tags || []).some(t => t.toLowerCase().includes(query))
        );
    }

    allMemoriesGrid.innerHTML = "";
    filtered.forEach(memory => {
        const card = createMemoryCard(memory, "normal");
        if (card) allMemoriesGrid.appendChild(card);
    });
    memoriesEmptyMessage.classList.toggle("visible", filtered.length === 0);
}

/* =========================================================
   COLLECTIONS PAGE
========================================================= */
const collectionIcons = {
    "Inbox": "fa-inbox",
    "Study": "fa-book",
    "Shopping": "fa-cart-shopping",
    "Design": "fa-palette",
    "Travel": "fa-plane",
    "Hackathon": "fa-code"
};

function renderCollectionsPage() {
    const counts = {};
    memories.forEach(m => {
        const key = m.collection || "Uncategorized";
        counts[key] = (counts[key] || 0) + 1;
    });

    const collectionNames = Object.keys(counts).sort();

    collectionsGrid.innerHTML = "";
    collectionNames.forEach(name => {
        const card = document.createElement("div");
        card.className = "collection-card";
        const iconClass = collectionIcons[name] || "fa-folder";
        card.innerHTML = `
            <i class="fa-solid ${iconClass}"></i>
            <h3>${name}</h3>
            <p>${counts[name]} ${counts[name] === 1 ? "memory" : "memories"}</p>
        `;
        card.addEventListener("click", function () {
            collectionFilter = name;
            showPage("memories");
        });
        collectionsGrid.appendChild(card);
    });

    collectionsEmptyMessage.classList.toggle("visible", collectionNames.length === 0);
}

/* =========================================================
   IMAGES / AUDIO / PDF PAGES
   Same idea as Memories, just pre-filtered by file type.
========================================================= */
function renderTypeFilteredPage(type, grid, emptyMsgEl) {
    const filtered = memories.filter(Boolean).filter(m => classifyType(m) === type);
    grid.innerHTML = "";
    filtered.forEach(memory => {
        const card = createMemoryCard(memory, "normal");
        if (card) grid.appendChild(card);
    });
    emptyMsgEl.classList.toggle("visible", filtered.length === 0);
}

function renderImagesPage() {
    renderTypeFilteredPage("image", imagesGrid, imagesEmptyMessage);
}

function renderAudioPage() {
    renderTypeFilteredPage("audio", audioGrid, audioEmptyMessage);
}

function renderdocPage() {
    renderTypeFilteredPage("doc", docGrid, docEmptyMessage);
}

/* =========================================================
   TRASH PAGE
========================================================= */
async function loadTrash() {
    try {
        const response = await fetch(`${API_BASE}/trash`);
        const data = await response.json();
        trashedMemories = data.memories || [];
    } catch (error) {
        console.error("Failed to load trash:", error);
        trashedMemories = [];
    }
    renderTrashPage();
}

function renderTrashPage() {
    trashGrid.innerHTML = "";
    trashedMemories.filter(Boolean).forEach(memory => {
        const card = createMemoryCard(memory, "trash");
        if (card) trashGrid.appendChild(card);
    });
    trashEmptyMessage.classList.toggle("visible", trashedMemories.filter(Boolean).length === 0);
}

/* =========================================================
   Re-render whichever page is currently on screen (call this
   after any state change: upload, trash, restore, delete, load).
========================================================= */
function refreshCurrentPage() {
    document.getElementById("statTotal") && renderDashboard(); // stats/counts live on the dashboard but are cheap to update always
    if (currentPage === "memories") renderMemoriesPage();
    else if (currentPage === "collections") renderCollectionsPage();
    else if (currentPage === "images") renderImagesPage();
    else if (currentPage === "audio") renderAudioPage();
    else if (currentPage === "doc") renderdocPage();
}

/* =========================================================
   TRASH / RESTORE / DELETE ACTIONS (event delegation)
========================================================= */
document.addEventListener("click", async function (e) {
    const trashBtn = e.target.closest(".trash-icon-btn");
    const restoreBtn = e.target.closest(".restore-btn");
    const deleteBtn = e.target.closest(".delete-btn");

    if (trashBtn) {
        const id = trashBtn.dataset.id;
        try {
            const res = await fetch(`${API_BASE}/memories/${id}/trash`, { method: "PATCH" });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || "Server rejected the request");
            memories = memories.filter(m => m && m.id != id);
            refreshCurrentPage();
        } catch (error) {
            console.error("Failed to move memory to trash:", error);
            alert("Couldn't move that memory to trash. Is the backend running?");
        }
    }

    if (restoreBtn) {
        const id = restoreBtn.dataset.id;
        try {
            const res = await fetch(`${API_BASE}/memories/${id}/restore`, { method: "PATCH" });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || "Server rejected the request");
            trashedMemories = trashedMemories.filter(m => m && m.id != id);
            if (data.memory) memories.unshift(data.memory);
            renderTrashPage();
            refreshCurrentPage();
        } catch (error) {
            console.error("Failed to restore memory:", error);
            alert("Couldn't restore that memory. Is the backend running?");
        }
    }

    if (deleteBtn) {
        const id = deleteBtn.dataset.id;
        const confirmed = confirm("Permanently delete this memory? This cannot be undone.");
        if (!confirmed) return;
        try {
            const res = await fetch(`${API_BASE}/memories/${id}`, { method: "DELETE" });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || "Server rejected the request");
            trashedMemories = trashedMemories.filter(m => m && m.id != id);
            renderTrashPage();
        } catch (error) {
            console.error("Failed to permanently delete memory:", error);
            alert("Couldn't permanently delete that memory. Is the backend running?");
        }
    }
});

/* =========================================================
   SEARCH (filters whichever memory list is on screen)
========================================================= */
searchInput.addEventListener("input", function () {
    if (currentPage === "memories") {
        renderMemoriesPage();
    } else if (currentPage === "dashboard") {
        // Simple client-side filter of the recent grid too
        const query = searchInput.value.trim().toLowerCase();
        const validMemories = memories.filter(Boolean);
        const filtered = query
            ? validMemories.filter(m =>
                (m.title || "").toLowerCase().includes(query) ||
                (m.summary || "").toLowerCase().includes(query))
            : validMemories.slice(0, 4);

        memoryGrid.innerHTML = "";
        filtered.forEach(memory => {
            const card = createMemoryCard(memory, "normal");
            if (card) memoryGrid.appendChild(card);
        });
        emptyMessage.classList.toggle("visible", filtered.length === 0);
    }
});

/* =========================================================
   UPLOAD (unchanged behaviour, now refreshes every relevant page)
========================================================= */
uploadBtn.addEventListener("click", function () {
    fileInput.click();
});

async function loadMemories() {
    try {
        const response = await fetch(`${API_BASE}/memories`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error || "Server returned an error");
        memories = (data.memories || []).filter(Boolean);
        refreshCurrentPage();
    } catch (error) {
        console.error("Failed to load memories:", error);
    }
}

function startPolling() {
    if (pollingInterval) return;
    pollingInterval = setInterval(async () => {
        await loadMemories();
        const stillProcessing = memories.some(m => m && m.title === "Processing...");
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
        const response = await fetch(`${API_BASE}/upload`, {
            method: "POST",
            body: formData
        });

        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            throw new Error(`Server sent back something that wasn't JSON (status ${response.status}). Is the backend running on port 5000?`);
        }

        if (!response.ok || !data.success || !data.memory) {
            throw new Error(data.error || `Upload was rejected (status ${response.status})`);
        }

        memories.unshift(data.memory);
        refreshCurrentPage();
        startPolling();
    } catch (error) {
        console.error("Upload failed:", error);
        alert("Upload failed: " + error.message);
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
    dropZone.classList.add("drag-over");
});
dropZone.addEventListener("dragleave", function () {
    dropZone.classList.remove("drag-over");
});
dropZone.addEventListener("drop", function (event) {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
    const file = event.dataTransfer.files[0];
    if (!file) return;
    uploadFile(file);
});

/* =========================================================
   INIT
========================================================= */
loadMemories();