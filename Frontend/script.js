console.log("SCRIPT STARTED", new Date().toLocaleTimeString());

const API_BASE = "http://localhost:5000";

async function fetchWithAuth(url, options = {}) {
    const {
        data: { session },
    } = await sbClient.auth.getSession();
    
    if (!session) {
        throw new Error("Not authenticated");
    }

    const headers = {
        ...options.headers,
        "Authorization": `Bearer ${session.access_token}`
    };

    return fetch(url, { ...options, headers });
}

/* =========================================================
   ELEMENT REFERENCES
========================================================= */
const uploadBtn = document.getElementById("uploadBtn");
const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const searchInput = document.getElementById("searchInput");
console.log(searchInput);
searchInput.addEventListener("input", () => {
    refreshCurrentPage();
});
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

const savedTheme = localStorage.getItem("organaiz-theme") || "light";
applyTheme(savedTheme);

themeToggle.addEventListener("click", function () {
    const isDark = document.body.classList.contains("dark");
    const nextTheme = isDark ? "light" : "dark";
    localStorage.setItem("organaiz-theme", nextTheme);
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

// Counts consecutive calendar days (up to and including today or yesterday)
// that have at least one memory saved. Matches the usual "streak" convention:
// - uploading today keeps/extends the streak
// - not having uploaded yet today doesn't break it (the day isn't over)
// - skipping a full day resets it to 0
function calculateStreak(memoriesList) {
    const daySet = new Set(
        memoriesList
            .filter(m => m && m.created_at)
            .map(m => new Date(m.created_at).toDateString())
    );

    if (daySet.size === 0) return 0;

    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    // If nothing was saved today, start counting from yesterday instead -
    // today just hasn't happened yet, it shouldn't zero out the streak.
    if (!daySet.has(cursor.toDateString())) {
        cursor.setDate(cursor.getDate() - 1);
    }

    let streak = 0;
    while (daySet.has(cursor.toDateString())) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
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

// Only true PDFs can be embedded and rendered natively by the browser.
// Other document types (docx, xlsx, pptx, etc.) have no native in-browser
// renderer, so they still get an icon + an "Open file" link instead.
const PDF_EXT = /\.pdf$/i;
function isPreviewablePdf(memory) {
    const filename = (memory && memory.filename) || "";
    return PDF_EXT.test(filename);
}

// Builds the <option> list for a collection <select>: every collection that
// already has memories, plus any empty custom ones, plus an entry to create
// a brand new one on the fly. Shared by memory cards and the Collections page.
function buildCollectionOptions(currentValue) {
    const fromMemories = memories.map(m => m.collection || "Uncategorized");
    const names = [...new Set([...fromMemories, ...getCustomCollections()])].sort();

    const optionsHtml = names
        .map(name => `<option value="${name}" ${name === currentValue ? "selected" : ""}>${name}</option>`)
        .join("");

    return optionsHtml + `<option value="__new__">+ New collection...</option>`;
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
    // PDFs get a clickable tile that opens an inline PDF viewer in the lightbox.
    // Audio gets a real, playable <audio> control right on the card.
    // Everything else (docs with no native browser renderer, and image formats
    // no browser can render natively -- PSD/RAW/TIFF/INDD) gets a representative
    // icon plus a plain "Open file" link instead.
    let mediaHtml;
    if (type === "image" && isPreviewableImage(memory)) {
        mediaHtml = `<img src="${fileUrl}" class="preview-img" data-fullsrc="${fileUrl}" alt="${memory.title || "Memory image"}">`;
    } else if (type === "document" && isPreviewablePdf(memory)) {
        mediaHtml = `<div class="file-icon-placeholder preview-pdf" data-fullsrc="${fileUrl}" title="Click to preview PDF">
                        <i class="fa-regular fa-file-pdf"></i>
                        <span class="preview-hint"><i class="fa-solid fa-magnifying-glass"></i> Click to preview</span>
                     </div>`;
    } else if (type === "audio") {
        mediaHtml = `<div class="audio-preview">
                        <i class="fa-solid fa-waveform-lines"></i>
                        <audio controls preload="none" src="${fileUrl}"></audio>
                     </div>`;
    } else {
        const iconClass = type === "document" ? "fa-solid fa-file-lines"
            : "fa-solid fa-image"; // unsupported-preview image formats (psd/raw/tiff/indd...)
        mediaHtml = `<div class="file-icon-placeholder">
                        <i class="${iconClass}"></i>
                        <a class="preview-hint open-file-link" href="${fileUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open file</a>
                     </div>`;
    }

    const collectionFieldHtml = mode === "normal"
        ? `<select class="collection-select" data-id="${memory.id}" onclick="event.stopPropagation()">
             ${buildCollectionOptions(memory.collection)}
           </select>`
        : `<span><i class="fa-solid fa-folder"></i> ${memory.collection || "General"}</span>`;

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
                ${collectionFieldHtml}
                <span><i class="fa-regular fa-calendar"></i> ${memory.created_at ? formatTime(memory.created_at) : "just now"}</span>
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

function getFileExtension(filename) {
    const match = /\.([a-z0-9]+)$/i.exec(filename || "");
    return match ? match[1].toLowerCase() : "";
}

// Friendly, searchable words for a date: "2026-07-11", "july", "11", "2026",
// "friday", plus "today"/"yesterday"/"this week" so "find what I saved
// yesterday" or "show me stuff from July" actually works.
function getDateTokens(isoString) {
    if (!isoString) return [];
    const date = new Date(isoString);
    if (isNaN(date)) return [];

    const now = new Date();
    const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / (1000 * 60 * 60 * 24));

    const tokens = [
        date.toISOString().split("T")[0],                       // 2026-07-11
        date.toLocaleDateString(),                               // 7/11/2026
        date.toLocaleDateString(undefined, { month: "long" }),   // july
        date.toLocaleDateString(undefined, { month: "short" }),  // jul
        date.toLocaleDateString(undefined, { weekday: "long" }), // friday
        String(date.getDate()),                                 // 11
        String(date.getFullYear())                               // 2026
    ];

    if (daysAgo === 0) tokens.push("today");
    else if (daysAgo === 1) tokens.push("yesterday");
    else if (daysAgo >= 0 && daysAgo <= 7) tokens.push("this week", "last week");
    else if (daysAgo > 7 && daysAgo <= 14) tokens.push("last week");
    else if (daysAgo > 14 && daysAgo <= 31) tokens.push("this month");

    return tokens;
}

// Friendly type words so "audio", "voice", "pdf", "image", "screenshot",
// "doc", "mp3", "png", etc. all match the right memories.
function getTypeTokens(memory) {
    const type = classifyType(memory);
    const ext = getFileExtension(memory.filename);
    const tokens = [type, ext];
    if (type === "audio") tokens.push("voice", "recording", "sound");
    if (type === "image") tokens.push("photo", "picture", "screenshot");
    if (type === "document") tokens.push("doc", "file");
    return tokens;
}

function memoryMatchesQuery(memory, query) {
    if (!query) return true;
    const haystack = [
        memory.title,
        memory.summary,
        memory.collection,
        cleanFilename(memory.filename),
        ...(memory.tags || []),
        ...getTypeTokens(memory),
        ...getDateTokens(memory.created_at)
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
    const query = searchInput.value.trim().toLowerCase();

    const recent = memories
        .filter(Boolean)
        .filter(m => memoryMatchesQuery(m, query))
        .slice(0, 4);

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

    const streakDays = calculateStreak(validMemories);
    document.getElementById("statStreak").textContent = `${streakDays} day${streakDays === 1 ? "" : "s"}`;

    // File type counts, shared with the Images/Audio/PDF pages
    document.getElementById("countImages").textContent = validMemories.filter(m => classifyType(m) === "image").length;
    document.getElementById("countVoice").textContent = validMemories.filter(m => classifyType(m) === "audio").length;
    document.getElementById("countdoc").textContent = validMemories.filter(m => classifyType(m) === "document").length;

    updateStorageUsage();

    renderAIRecommendations();
}

/* =========================================================
   STORAGE USED
   Sums the real file_size (in bytes) captured at upload time
   across active AND trashed memories - trashed files still take
   up real disk space until they're permanently deleted. Memories
   uploaded before file_size existed just count as 0 bytes.
========================================================= */
const STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 MB";
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 1 : 2)} GB`;
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
    const kb = bytes / 1024;
    return `${Math.max(kb, 0.1).toFixed(1)} KB`;
}

function updateStorageUsage() {
    const fill = document.getElementById("storageProgressFill");
    const text = document.getElementById("storageUsedText");
    if (!fill || !text) return;

    const totalBytes = [...memories, ...trashedMemories]
        .filter(Boolean)
        .reduce((sum, m) => sum + (Number(m.file_size) || 0), 0);

    const percent = Math.min(100, (totalBytes / STORAGE_LIMIT_BYTES) * 100);
    fill.style.width = `${percent}%`;
    fill.classList.toggle("storage-warning", percent >= 80);
    text.textContent = `${formatBytes(totalBytes)} / 10 GB`;
}

/* =========================================================
   MEMORIES PAGE (all memories, filterable by search / collection)
========================================================= */
function renderMemoriesPage() {
    console.log("Search:", searchInput.value);
    console.log("Total memories:", memories.length);

    const query = searchInput.value.trim().toLowerCase();
    let filtered = memories.filter(Boolean);
    if (idFilter) {
        filtered = filtered.filter(m => idFilter.includes(m.id));
    } else if (collectionFilter) {
        filtered = filtered.filter(m => m.collection === collectionFilter);
    }
    filtered = filtered.filter(m => memoryMatchesQuery(m, query));
    console.log("Filtered:", filtered);

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

// Collections are normally just derived from whatever's in memories'
// `collection` field - there's no separate "collections" table on the
// backend. So a brand-new collection a user creates before uploading
// anything into it has nowhere to live except here, client-side, until
// it has its first memory (at which point it'll show up from `memories`
// directly like any other collection).
const CUSTOM_COLLECTIONS_KEY = "organaiz-custom-collections";

function getCustomCollections() {
    try {
        return JSON.parse(localStorage.getItem(CUSTOM_COLLECTIONS_KEY)) || [];
    } catch {
        return [];
    }
}

function saveCustomCollections(list) {
    localStorage.setItem(CUSTOM_COLLECTIONS_KEY, JSON.stringify(list));
}

function renderCollectionsPage() {
    const counts = {};
    memories.forEach(m => {
        const key = m.collection || "Uncategorized";
        counts[key] = (counts[key] || 0) + 1;
    });

    // Merge in any empty custom collections that don't have memories yet.
    const customCollections = getCustomCollections();
    customCollections.forEach(name => {
        if (!(name in counts)) counts[name] = 0;
    });

    const collectionNames = Object.keys(counts).sort();

    collectionsGrid.innerHTML = "";
    collectionNames.forEach(name => {
        const card = document.createElement("div");
        card.className = "collection-card";
        const iconClass = collectionIcons[name] || "fa-folder";
        card.innerHTML = `
            <button class="collection-delete-btn" data-name="${name}" title="Delete collection">
                <i class="fa-solid fa-trash"></i>
            </button>
            <i class="fa-solid ${iconClass}"></i>
            <h3>${name}</h3>
            <p>${counts[name]} ${counts[name] === 1 ? "memory" : "memories"}</p>
        `;
        card.addEventListener("click", function (e) {
            if (e.target.closest(".collection-delete-btn")) return;
            collectionFilter = name;
            showPage("memories");
        });
        collectionsGrid.appendChild(card);
    });

    collectionsEmptyMessage.classList.toggle("visible", collectionNames.length === 0);
}

// Shared by the "New Collection" button and the "+ New collection..." option
// inside every card's dropdown. Returns the trimmed name on success, or null
// if the user cancelled or the name already exists.
function addCustomCollection(promptMessage) {
    const name = prompt(promptMessage || "Name your new collection:");
    if (!name || !name.trim()) return null;
    const trimmed = name.trim();

    const existingNames = new Set([
        ...memories.map(m => (m.collection || "Uncategorized").toLowerCase()),
        ...getCustomCollections().map(c => c.toLowerCase())
    ]);
    if (existingNames.has(trimmed.toLowerCase())) {
        alert(`A collection called "${trimmed}" already exists.`);
        return null;
    }

    const customCollections = getCustomCollections();
    customCollections.push(trimmed);
    saveCustomCollections(customCollections);
    return trimmed;
}

const newCollectionBtn = document.getElementById("newCollectionBtn");
if (newCollectionBtn) {
    newCollectionBtn.addEventListener("click", function () {
        if (addCustomCollection()) renderCollectionsPage();
    });
}

// Lets a memory actually be moved into any collection (including a brand
// new empty one) right from its card - otherwise a manually-created
// collection would have no way to ever receive a file.
document.addEventListener("change", async function (e) {
    const select = e.target.closest(".collection-select");
    if (!select) return;

    const id = select.dataset.id;
    const previousValue = select.dataset.previousValue || "";
    let newValue = select.value;

    if (newValue === "__new__") {
        const created = addCustomCollection("Name the new collection to move this memory into:");
        if (!created) {
            select.value = previousValue;
            return;
        }
        newValue = created;
    }

    select.disabled = true;
    try {
        const res = await fetchWithAuth(`${API_BASE}/memories/${id}/collection`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ collection: newValue })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Server rejected the request");

        const memory = memories.find(m => m && m.id == id);
        if (memory) memory.collection = newValue;

        refreshCurrentPage();
    } catch (error) {
        console.error("Failed to move memory to collection:", error);
        alert("Couldn't move that memory. Is the backend running?");
        select.value = previousValue;
    } finally {
        select.disabled = false;
    }
});

// Track the previously-selected value on every select so a failed/cancelled
// change can revert to it instead of leaving the dropdown on the new option.
document.addEventListener("focusin", function (e) {
    const select = e.target.closest(".collection-select");
    if (select) select.dataset.previousValue = select.value;
});

// Deleting a collection never deletes the memories inside it - it just
// ungroups them back into "Uncategorized", since the collection itself
// (especially an AI-created one the user doesn't want) is just a label.
document.addEventListener("click", async function (e) {
    const deleteBtn = e.target.closest(".collection-delete-btn");
    if (!deleteBtn) return;

    const name = deleteBtn.dataset.name;
    const affected = memories.filter(m => (m.collection || "Uncategorized") === name);

    const confirmMsg = affected.length > 0
        ? `Delete the "${name}" collection? Its ${affected.length} ${affected.length === 1 ? "memory" : "memories"} will move to Uncategorized - nothing gets deleted.`
        : `Delete the empty "${name}" collection?`;
    if (!confirm(confirmMsg)) return;

    deleteBtn.disabled = true;

    try {
        await Promise.all(affected.map(m =>
            fetchWithAuth(`${API_BASE}/memories/${m.id}/collection`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ collection: "Uncategorized" })
            }).then(() => { m.collection = "Uncategorized"; })
        ));

        const customCollections = getCustomCollections().filter(c => c !== name);
        saveCustomCollections(customCollections);

        refreshCurrentPage();
    } catch (error) {
        console.error("Failed to delete collection:", error);
        alert("Couldn't delete that collection. Is the backend running?");
        deleteBtn.disabled = false;
    }
});

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
        const response = await fetchWithAuth(`${API_BASE}/trash`);
        const data = await response.json();
        trashedMemories = data.memories || [];
    } catch (error) {
        console.error("Failed to load trash:", error);
        trashedMemories = [];
    } finally {
        trashLoaded = true;
        renderTrashPage();
        updateStorageUsage();
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
                fetchWithAuth(`${API_BASE}/memories/${id}/collection`, {
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
            const res = await fetchWithAuth(`${API_BASE}/memories/${id}/trash`, { method: "PATCH" });
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
            const res = await fetchWithAuth(`${API_BASE}/memories/${id}/restore`, { method: "PATCH" });
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
            const res = await fetchWithAuth(`${API_BASE}/memories/${id}`, { method: "DELETE" });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || "Server rejected the request");
            trashedMemories = trashedMemories.filter(m => m && m.id != id);
            renderTrashPage();
            updateStorageUsage();
        } catch (error) {
            console.error("Failed to permanently delete memory:", error);
            alert("Couldn't permanently delete that memory. Is the backend running?");
        }
    }
});

/* =========================================================
   TRASH BULK ACTIONS: Restore All / Empty Trash
========================================================= */
const restoreAllBtn = document.getElementById("restoreAllBtn");
const emptyTrashBtn = document.getElementById("emptyTrashBtn");

if (restoreAllBtn) {
    restoreAllBtn.addEventListener("click", async function () {
        const items = trashedMemories.filter(Boolean);
        if (items.length === 0) return;
        if (!confirm(`Restore all ${items.length} item${items.length === 1 ? "" : "s"} from trash?`)) return;

        restoreAllBtn.disabled = true;
        try {
            const results = await Promise.all(items.map(m =>
                fetchWithAuth(`${API_BASE}/memories/${m.id}/restore`, { method: "PATCH" })
                    .then(res => res.json())
            ));
            results.forEach(data => { if (data.success && data.memory) memories.unshift(data.memory); });
            trashedMemories = [];
            renderTrashPage();
            refreshCurrentPage();
            updateStorageUsage();
        } catch (error) {
            console.error("Failed to restore all:", error);
            alert("Couldn't restore everything. Is the backend running?");
        } finally {
            restoreAllBtn.disabled = false;
        }
    });
}

if (emptyTrashBtn) {
    emptyTrashBtn.addEventListener("click", async function () {
        const items = trashedMemories.filter(Boolean);
        if (items.length === 0) return;
        if (!confirm(`Permanently delete all ${items.length} item${items.length === 1 ? "" : "s"} in trash? This cannot be undone.`)) return;

        emptyTrashBtn.disabled = true;
        try {
            await Promise.all(items.map(m =>
                fetchWithAuth(`${API_BASE}/memories/${m.id}`, { method: "DELETE" })
            ));
            trashedMemories = [];
            renderTrashPage();
            updateStorageUsage();
        } catch (error) {
            console.error("Failed to empty trash:", error);
            alert("Couldn't empty the trash. Is the backend running?");
        } finally {
            emptyTrashBtn.disabled = false;
        }
    });
}

let isRenderingAI = false;

async function renderAIRecommendations() {
    if (isRenderingAI) return;
    isRenderingAI = true;
    const aiGrid = document.getElementById("aiGrid");
    try {
        // allSettled + per-response success checks: if one of these three
        // endpoints errors out, the other two should still render instead of
        // the whole section silently going blank.
        const [dupResult, deadlineResult, collectionResult] = await Promise.allSettled([
            fetchWithAuth(`${API_BASE}/memories/duplicates`).then(r => r.json()),
            fetchWithAuth(`${API_BASE}/memories/deadlines`).then(r => r.json()),
            fetchWithAuth(`${API_BASE}/memories/collection-suggestions`).then(r => r.json())
        ]);

        const dupData = dupResult.status === "fulfilled" ? dupResult.value : null;
        const deadlineData = deadlineResult.status === "fulfilled" ? deadlineResult.value : null;
        const collectionData = collectionResult.status === "fulfilled" ? collectionResult.value : null;

        if (dupResult.status === "rejected") console.error("Duplicates fetch failed:", dupResult.reason);
        if (deadlineResult.status === "rejected") console.error("Deadlines fetch failed:", deadlineResult.reason);
        if (collectionResult.status === "rejected") console.error("Collection suggestions fetch failed:", collectionResult.reason);

        aiGrid.innerHTML = "";

        const duplicateGroups = (dupData && dupData.success && dupData.duplicateGroups) || [];
        const deadlineMemories = (deadlineData && deadlineData.success && deadlineData.memories) || [];
        const collectionSuggestions = (collectionData && collectionData.success && collectionData.suggestions) || [];

        duplicateGroups.forEach(group => {
            const card = document.createElement("div");
            card.className = "ai-card blue";
            card.innerHTML = `
                <div class="ai-card-top">
                    <div class="ai-icon"><i class="fa-solid fa-clone"></i></div>
                    <span class="ai-badge">Duplicate</span>
                </div>
                <h3>Possible Duplicates</h3>
                <p>"${group[0].title}" and "${group[1].title}" look similar. Review them?</p>
                <div class="ai-card-actions">
                    <button class="review-duplicate-btn" data-ids="${group[0].id},${group[1].id}">Review</button>
                </div>
            `;
            aiGrid.appendChild(card);
        });

        deadlineMemories.forEach(memory => {
            const daysUntil = Math.ceil((new Date(memory.deadline) - new Date()) / (1000 * 60 * 60 * 24));
            const dayText = daysUntil === 0 ? "today" : daysUntil === 1 ? "tomorrow" : `in ${daysUntil} days`;

            const card = document.createElement("div");
            card.className = "ai-card red";
            card.innerHTML = `
                <div class="ai-card-top">
                    <div class="ai-icon"><i class="fa-solid fa-clock"></i></div>
                    <span class="ai-badge">Deadline</span>
                </div>
                <h3>Deadline ${dayText}</h3>
                <p>"${memory.title}" has a deadline on ${memory.deadline}.</p>
                <div class="ai-card-actions">
                    <button class="view-deadline-btn" data-id="${memory.id}">View</button>
                </div>
            `;
            aiGrid.appendChild(card);
        });

        collectionSuggestions.forEach(suggestion => {
            const card = document.createElement("div");
            card.className = "ai-card yellow";
            card.innerHTML = `
                <div class="ai-card-top">
                    <div class="ai-icon"><i class="fa-solid fa-folder-plus"></i></div>
                    <span class="ai-badge">Suggestion</span>
                </div>
                <h3>Organize Memories</h3>
                <p>You have ${suggestion.count} screenshots related to "${suggestion.tag}". Create a collection?</p>
                <div class="ai-card-actions">
                    <button class="create-collection-btn" data-ids="${suggestion.memoryIds.join(",")}" data-tag="${suggestion.tag}">Create Collection</button>
                    <button class="view-collection-suggestion-btn" data-ids="${suggestion.memoryIds.join(",")}">Just Review</button>
                </div>
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
        const response = await fetchWithAuth(`${API_BASE}/memories`);
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
    const {
        data: { user },
    } = await sbClient.auth.getUser();

    if (!user) {
        alert("Please log in first.");
        return;
    }
    const formData = new FormData();

    formData.append("image", file);
    formData.append("user_id", user.id);
    
    try {
        const response = await fetchWithAuth(`${API_BASE}/upload`, {
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
const lightboxPdf = document.getElementById("lightboxPdf");
const lightboxClose = document.getElementById("lightboxClose");

function openLightbox(src, kind) {
    if (kind === "pdf") {
        lightboxPdf.src = src;
        lightboxPdf.style.display = "block";
        lightboxImg.style.display = "none";
    } else {
        lightboxImg.src = src;
        lightboxImg.style.display = "block";
        lightboxPdf.style.display = "none";
    }
    imageLightbox.classList.add("visible");
}

function closeLightbox() {
    imageLightbox.classList.remove("visible");
    lightboxImg.src = "";
    lightboxPdf.src = ""; // stop the PDF viewer from staying loaded in the background
}

document.addEventListener("click", function (e) {
    const previewImg = e.target.closest(".preview-img");
    if (previewImg) {
        openLightbox(previewImg.dataset.fullsrc, "image");
        return;
    }
    const previewPdf = e.target.closest(".preview-pdf");
    if (previewPdf) {
        openLightbox(previewPdf.dataset.fullsrc, "pdf");
    }
});

lightboxClose.addEventListener("click", closeLightbox);
imageLightbox.addEventListener("click", function (e) {
    if (e.target === imageLightbox) closeLightbox(); // click on the dark backdrop, not the image
});
document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeLightbox();
});

searchInput.addEventListener("input", () => {
    switch (currentPage) {
        case "dashboard":
            renderDashboard();
            break;
        case "memories":
            renderMemoriesPage();
            break;
        case "collections":
            renderCollectionsPage();
            break;
        case "images":
            renderImagesPage();
            break;
        case "audio":
            renderAudioPage();
            break;
        case "document":
            renderdocPage();
            break;
        case "trash":
            renderTrashPage();
            break;
    }
});

/* =========================================================
   INIT
========================================================= */
loadMemories();

/* =========================================================
   PROFILE MODAL
   Lets the user change their display name and avatar.
   Both are stored in Supabase Auth's user_metadata, so no
   backend changes or storage buckets are needed.
========================================================= */
const profileBtn = document.getElementById("profileBtn");
const profileOverlay = document.getElementById("profileOverlay");
const profileModalClose = document.getElementById("profileModalClose");
const profileModalCancel = document.getElementById("profileModalCancel");
const profileModalSave = document.getElementById("profileModalSave");
const profileModalLogout = document.getElementById("profileModalLogout");
const profileModalStatus = document.getElementById("profileModalStatus");
const profileNameInput = document.getElementById("profileNameInput");
const profileEmailInput = document.getElementById("profileEmailInput");
const profileAvatarInput = document.getElementById("profileAvatarInput");
const profileAvatarEditBtn = document.getElementById("profileAvatarEditBtn");
const profileModalAvatarPreview = document.getElementById("profileModalAvatarPreview");
const profileAvatarImg = document.getElementById("profileAvatarImg"); // topbar avatar
const welcomeHeading = document.getElementById("welcomeHeading");

const DEFAULT_AVATAR = "images/profile.jpg";
let pendingAvatarDataUrl = null; // holds a newly picked photo until Save is clicked

function displayNameFromUser(user) {
    if (!user) return "";
    return user.user_metadata?.full_name || (user.email ? user.email.split("@")[0] : "");
}

function avatarUrlFromUser(user) {
    return user?.user_metadata?.avatar_url || DEFAULT_AVATAR;
}

// Paint the topbar avatar + "Welcome, Name!" heading from whatever's already
// in the current session, so it's correct on every page load without
// needing to open the modal first.
async function applyProfileToPage() {
    const { data: { user } } = await sbClient.auth.getUser();
    if (!user) return;
    const name = displayNameFromUser(user);
    const avatarUrl = avatarUrlFromUser(user);
    if (profileAvatarImg) profileAvatarImg.src = avatarUrl;
    if (welcomeHeading) welcomeHeading.textContent = `Welcome, ${name}! 👋`;
}

function setProfileStatus(message, isError) {
    profileModalStatus.textContent = message || "";
    profileModalStatus.classList.toggle("error", !!isError);
}

async function openProfileModal() {
    setProfileStatus("");
    pendingAvatarDataUrl = null;
    profileModalSave.disabled = false;
    profileModalCancel.disabled = false;

    const { data: { user } } = await sbClient.auth.getUser();
    if (!user) {
        alert("Please log in first.");
        return;
    }

    profileNameInput.value = displayNameFromUser(user);
    profileEmailInput.value = user.email || "";
    profileModalAvatarPreview.src = avatarUrlFromUser(user);

    profileOverlay.classList.add("visible");
}

function closeProfileModal() {
    profileOverlay.classList.remove("visible");
    pendingAvatarDataUrl = null;
}

// Resize + compress the chosen photo client-side so it stays small enough
// to store directly in Supabase's user_metadata (no storage bucket needed).
function fileToResizedDataUrl(file, maxSize) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read that file"));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error("That doesn't look like a valid image"));
            img.onload = () => {
                let { width, height } = img;
                if (width > height) {
                    if (width > maxSize) { height *= maxSize / width; width = maxSize; }
                } else {
                    if (height > maxSize) { width *= maxSize / height; height = maxSize; }
                }
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                canvas.getContext("2d").drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL("image/jpeg", 0.85));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

profileBtn.addEventListener("click", openProfileModal);
profileModalClose.addEventListener("click", closeProfileModal);
profileModalCancel.addEventListener("click", closeProfileModal);
profileOverlay.addEventListener("click", function (e) {
    if (e.target === profileOverlay) closeProfileModal(); // click on backdrop only
});
document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && profileOverlay.classList.contains("visible")) closeProfileModal();
});

profileAvatarEditBtn.addEventListener("click", () => profileAvatarInput.click());

profileAvatarInput.addEventListener("change", async function () {
    const file = profileAvatarInput.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        setProfileStatus("Please choose an image file.", true);
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        setProfileStatus("That image is too large (max 5MB).", true);
        return;
    }

    try {
        const dataUrl = await fileToResizedDataUrl(file, 200);
        pendingAvatarDataUrl = dataUrl;
        profileModalAvatarPreview.src = dataUrl; // instant preview
        setProfileStatus("");
    } catch (err) {
        setProfileStatus(err.message, true);
    }
});

profileModalSave.addEventListener("click", async function () {
    const newName = profileNameInput.value.trim();
    if (!newName) {
        setProfileStatus("Display name can't be empty.", true);
        return;
    }

    profileModalSave.disabled = true;
    profileModalCancel.disabled = true;
    setProfileStatus("Saving...");

    const metadataUpdate = { full_name: newName };
    if (pendingAvatarDataUrl) metadataUpdate.avatar_url = pendingAvatarDataUrl;

    try {
        const { error } = await sbClient.auth.updateUser({ data: metadataUpdate });
        if (error) throw error;

        await applyProfileToPage();
        setProfileStatus("Saved!");
        setTimeout(closeProfileModal, 600);
    } catch (err) {
        console.error("Failed to update profile:", err);
        setProfileStatus(err.message || "Failed to save changes.", true);
    } finally {
        profileModalSave.disabled = false;
        profileModalCancel.disabled = false;
    }
});

profileModalLogout.addEventListener("click", async function () {
    await sbClient.auth.signOut();
    window.location.href = "login.html";
});

applyProfileToPage();