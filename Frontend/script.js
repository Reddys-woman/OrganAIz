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
let idFilter = null;

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
        idFilter = null;
        showPage(link.dataset.page);
    });
});

sourceLinks.forEach(link => {
    link.addEventListener("click", function () {
        collectionFilter = null;
        idFilter = null;
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

// Common raster image formats (note: browsers can only visually preview a subset
// of these via <img> - see PREVIEWABLE_IMAGE_EXT below. Formats like PSD/RAW/INDD
// are still recognized, tagged, and stored as "images", just shown with a file icon
// instead of a live thumbnail since no browser can decode them natively.
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|tiff?|bmp|heic|heif|psd|raw|cr2|nef|arw|dng|rw2|orf|jp2|j2k|indd|svg)$/i;
const PREVIEWABLE_IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|svg)$/i;

const AUDIO_EXT = /\.(mp3|wav|m4a|ogg|oga|flac|aac|opus|wma|aiff?)$/i;

const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?|txt|csv|rtf|odt|ods|odp)$/i;

function classifyType(memory) {
    const filename = (memory && memory.filename) || "";
    if (IMAGE_EXT.test(filename)) return "image";
    if (AUDIO_EXT.test(filename)) return "audio";
    if (DOC_EXT.test(filename)) return "document";
    return "other";
}

function isPreviewableImage(memory) {
    const filename = (memory && memory.filename) || "";
    return PREVIEWABLE_IMAGE_EXT.test(filename);
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

    const fileUrl = `${API_BASE}/uploads/${memory.filename || ""}`;
    const type = classifyType(memory);

    // Real, browser-decodable images get a clickable thumbnail + lightbox preview.
    // Everything else (audio, documents, and image formats no browser can render
    // natively -- PSD/RAW/TIFF/INDD) gets a representative icon instead of a
    // broken <img>.
    let mediaHtml;
    if (type === "image" && isPreviewableImage(memory)) {
        mediaHtml = `<img src="${fileUrl}" class="preview-img" data-fullsrc="${fileUrl}" alt="${memory.title || "Memory image"}">`;
    } else {
        const iconClass = type === "audio" ? "fa-solid fa-music"
            : type === "document" ? "fa-solid fa-file-lines"
            : "fa-solid fa-image"; // unsupported-preview image formats (psd/raw/tiff/indd...)
        mediaHtml = `<div class="file-icon-placeholder"><i class="${iconClass}"></i></div>`;
    }

    card.innerHTML = `
        <div class="memory-image-wrap">
            ${mediaHtml}
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
   SMART SEARCH
   Matches a query against everything we know about a memory:
   title, AI summary (which describes the actual on-screen
   content), tags, collection name, and the original filename
   -- so you can search in plain language, not just filenames.
========================================================= */
function cleanFilename(filename) {
    return (filename || "")
        .replace(/^\d+-/, "")       // strip the "1720000000000-" timestamp prefix multer adds
        .replace(/[_-]+/g, " ")     // underscores/dashes -> spaces
        .replace(/\.[a-z0-9]+$/i, ""); // drop the file extension
}

function memoryMatchesQuery(memory, query) {
    if (!query) return true;
    const haystack = [
        memory.title,
        memory.summary,
        memory.collection,
        cleanFilename(memory.filename),
        ...(memory.tags || [])
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    // Every word in the query must appear somewhere in the haystack --
    // lets "hackathon deadline" match a memory that mentions both words
    // anywhere across title/summary/tags, not just as one exact phrase.
    return query
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every(word => haystack.includes(word));
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

    if (!memoriesLoaded) {
        emptyMessage.textContent = "Loading your memories...";
        emptyMessage.classList.add("visible", "loading");
    } else {
        emptyMessage.textContent = "Well... It feels light. Upload some files!";
        emptyMessage.classList.remove("loading");
        emptyMessage.classList.toggle("visible", memories.length === 0);
    }

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

    renderAIRecommendations();
}

/* =========================================================
   MEMORIES PAGE (all memories, filterable by search / collection)
========================================================= */
function renderMemoriesPage() {
    const query = searchInput.value.trim().toLowerCase();
    let filtered = memories.filter(Boolean);
    if (idFilter) {
        filtered = filtered.filter(m => idFilter.includes(m.id));
    } else if (collectionFilter) {
        filtered = filtered.filter(m => m.collection === collectionFilter);
    }
    filtered = filtered.filter(m => memoryMatchesQuery(m, query));

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
function renderTypeFilteredPage(type, grid, emptyMsgEl, emptyText) {
    const query = searchInput.value.trim();
    const filtered = memories
        .filter(Boolean)
        .filter(m => classifyType(m) === type)
        .filter(m => memoryMatchesQuery(m, query));

    grid.innerHTML = "";
    filtered.forEach(memory => {
        const card = createMemoryCard(memory, "normal");
        if (card) grid.appendChild(card);
    });

    if (!memoriesLoaded) {
        emptyMsgEl.textContent = "Loading...";
        emptyMsgEl.classList.add("visible", "loading");
    } else {
        emptyMsgEl.textContent = emptyText;
        emptyMsgEl.classList.remove("loading");
        emptyMsgEl.classList.toggle("visible", filtered.length === 0);
    }
}

function renderImagesPage() {
    renderTypeFilteredPage("image", imagesGrid, imagesEmptyMessage, "No images yet.");
}

function renderAudioPage() {
    renderTypeFilteredPage("audio", audioGrid, audioEmptyMessage, "No audio files yet.");
}

function renderdocPage() {
    renderTypeFilteredPage("document", docGrid, docEmptyMessage, "No Documents yet.");
}

/* =========================================================
   TRASH PAGE
========================================================= */
let trashLoaded = false; // true once we've attempted the first fetch (success OR failure)

async function loadTrash() {
    renderTrashPage(); // show the loading state immediately, don't wait on the network
    try {
        const response = await fetch(`${API_BASE}/trash`);
        const data = await response.json();
        trashedMemories = data.memories || [];
    } catch (error) {
        console.error("Failed to load trash:", error);
        trashedMemories = [];
    } finally {
        trashLoaded = true;
        renderTrashPage();
    }
}

function renderTrashPage() {
    const query = searchInput.value.trim();
    const filtered = trashedMemories.filter(Boolean).filter(m => memoryMatchesQuery(m, query));

    trashGrid.innerHTML = "";
    filtered.forEach(memory => {
        const card = createMemoryCard(memory, "trash");
        if (card) trashGrid.appendChild(card);
    });

    // Only claim "Trash is empty" when there truly is nothing in trash --
    // if a search query is just filtering the view, or we're still waiting
    // on the first fetch, say so instead.
    if (!trashLoaded) {
        trashEmptyMessage.textContent = "Loading trash...";
        trashEmptyMessage.classList.add("visible", "loading");
    } else if (trashedMemories.filter(Boolean).length === 0) {
        trashEmptyMessage.textContent = "Trash is empty.";
        trashEmptyMessage.classList.remove("loading");
        trashEmptyMessage.classList.add("visible");
    } else if (filtered.length === 0) {
        trashEmptyMessage.textContent = "No trashed items match your search.";
        trashEmptyMessage.classList.remove("loading");
        trashEmptyMessage.classList.add("visible");
    } else {
        trashEmptyMessage.classList.remove("visible", "loading");
    }
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
    else if (currentPage === "document") renderdocPage();
}

/* =========================================================
   TRASH / RESTORE / DELETE ACTIONS (event delegation)
========================================================= */
document.addEventListener("click", async function (e) {
    const trashBtn = e.target.closest(".trash-icon-btn");
    const restoreBtn = e.target.closest(".restore-btn");
    const deleteBtn = e.target.closest(".delete-btn");
    const pageLinkBtn = e.target.closest("[data-page-link]");
    const reviewDupBtn = e.target.closest(".review-duplicate-btn");
    const viewDeadlineBtn = e.target.closest(".view-deadline-btn");
    const createCollectionBtn = e.target.closest(".create-collection-btn");


    if (reviewDupBtn) {
        idFilter = reviewDupBtn.dataset.ids.split(",").map(id => parseInt(id));
        collectionFilter = null;
        showPage("memories");
    }

    if (viewDeadlineBtn) {
        idFilter = [parseInt(viewDeadlineBtn.dataset.id)];
        collectionFilter = null;
        showPage("memories");
    }

    const viewCollectionSuggestionBtn = e.target.closest(".view-collection-suggestion-btn");
    if (viewCollectionSuggestionBtn) {
        idFilter = viewCollectionSuggestionBtn.dataset.ids.split(",").map(id => parseInt(id));
        collectionFilter = null;
        showPage("memories");
    }

    if (createCollectionBtn) {
        const ids = createCollectionBtn.dataset.ids.split(",");
        const tag = createCollectionBtn.dataset.tag;

        try {
            await Promise.all(ids.map(id =>
                fetch(`${API_BASE}/memories/${id}/collection`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ collection: tag })
                })
            ));
            await loadMemories();
            collectionFilter = tag;
            showPage("memories");
        } catch (error) {
            console.error("Failed to create collection:", error);
            alert("Couldn't create the collection. Is the backend running?");
        }
    }

     if (pageLinkBtn) {
        e.preventDefault();
        idFilter = null;
        showPage(pageLinkBtn.dataset.pageLink);
    }

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

let isRenderingAI = false;

async function renderAIRecommendations() {
    if (isRenderingAI) return;
    isRenderingAI = true;
    const aiGrid = document.getElementById("aiGrid");
    try {
        const [dupResponse, deadlineResponse, collectionResponse] = await Promise.all([
            fetch(`${API_BASE}/memories/duplicates`),
            fetch(`${API_BASE}/memories/deadlines`),
            fetch(`${API_BASE}/memories/collection-suggestions`)
        ]);
        const dupData = await dupResponse.json();
        const deadlineData = await deadlineResponse.json();
        const collectionData = await collectionResponse.json();
        aiGrid.innerHTML = "";

        dupData.duplicateGroups.forEach(group => {
            const card = document.createElement("div");
            card.className = "ai-card blue";
            card.innerHTML = `
                <div class="ai-icon">📄</div>
                <h3>Possible Duplicates</h3>
                <p>"${group[0].title}" and "${group[1].title}" look similar. Review them?</p>
                <button class="review-duplicate-btn" data-ids="${group[0].id},${group[1].id}">Review</button>
            `;
            aiGrid.appendChild(card);
        });

        deadlineData.memories.forEach(memory => {
            const daysUntil = Math.ceil((new Date(memory.deadline) - new Date()) / (1000 * 60 * 60 * 24));
            const dayText = daysUntil === 0 ? "today" : daysUntil === 1 ? "tomorrow" : `in ${daysUntil} days`;

            const card = document.createElement("div");
            card.className = "ai-card red";
            card.innerHTML = `
                <div class="ai-icon">⏰</div>
                <h3>Deadline ${dayText}</h3>
                <p>"${memory.title}" has a deadline on ${memory.deadline}.</p>
                <button class="view-deadline-btn" data-id="${memory.id}">View</button>
            `;
            aiGrid.appendChild(card);
        });

        collectionData.suggestions.forEach(suggestion => {
            const card = document.createElement("div");
            card.className = "ai-card yellow";
            card.innerHTML = `
                <div class="ai-icon">📂</div>
                <h3>Organize Memories</h3>
                <p>You have ${suggestion.count} screenshots related to "${suggestion.tag}". Create a collection?</p>
                <button class="create-collection-btn" data-ids="${suggestion.memoryIds.join(",")}" data-tag="${suggestion.tag}">Create Collection</button>
                <button class="view-collection-suggestion-btn" data-ids="${suggestion.memoryIds.join(",")}">Just Review</button>
            `;
            aiGrid.appendChild(card);
        });

        const emptyMsg = aiGrid.parentElement.querySelector(".empty-message");
        if (emptyMsg) {
            emptyMsg.classList.toggle("visible", aiGrid.children.length === 0);
        }

    } catch (error) {
        console.error("Failed to load AI recommendations:", error);
    } finally {
        isRenderingAI = false;
    }
}

/* =========================================================
   UPLOAD (unchanged behaviour, now refreshes every relevant page)
========================================================= */
uploadBtn.addEventListener("click", function () {
    fileInput.click();
});

let memoriesLoaded = false; // true once we've attempted the first fetch (success OR failure)

async function loadMemories() {
    refreshCurrentPage(); // show the loading state immediately, don't wait on the network
    try {
        const response = await fetch(`${API_BASE}/memories`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error || "Server returned an error");
        memories = (data.memories || []).filter(Boolean);
    } catch (error) {
        console.error("Failed to load memories:", error);
        // Fall through and still re-render below -- previously a failed/slow
        // first fetch left the dashboard blank until you navigated away and
        // back, since the render call lived inside this try block.
    } finally {
        memoriesLoaded = true;
        refreshCurrentPage();
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
   IMAGE LIGHTBOX
========================================================= */
const imageLightbox = document.getElementById("imageLightbox");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxClose = document.getElementById("lightboxClose");

function openLightbox(src) {
    lightboxImg.src = src;
    imageLightbox.classList.add("visible");
}

function closeLightbox() {
    imageLightbox.classList.remove("visible");
    lightboxImg.src = "";
}

document.addEventListener("click", function (e) {
    const previewImg = e.target.closest(".preview-img");
    if (previewImg) {
        openLightbox(previewImg.dataset.fullsrc);
    }
});

lightboxClose.addEventListener("click", closeLightbox);
imageLightbox.addEventListener("click", function (e) {
    if (e.target === imageLightbox) closeLightbox(); // click on the dark backdrop, not the image
});
document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeLightbox();
});

/* =========================================================
   INIT
========================================================= */
loadMemories();