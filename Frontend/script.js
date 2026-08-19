console.log("SCRIPT STARTED", new Date().toLocaleTimeString());

const API_BASE = "http://localhost:5000";

/* =========================================================
   TOAST NOTIFICATIONS
   A small, classy replacement for alert() - non-blocking,
   auto-dismisses, stacks in the top-right corner.
========================================================= */
const toastStack = document.getElementById("toastStack");
const TOAST_ICONS = {
    success: "fa-solid fa-check",
    error: "fa-solid fa-triangle-exclamation",
    info: "fa-solid fa-circle-info"
};

function showToast(message, type = "info", duration = 7000) {
    if (!toastStack) { console.log(`[${type}] ${message}`); return; }
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon"><i class="${TOAST_ICONS[type] || TOAST_ICONS.info}"></i></span>
        <span class="toast-msg">${message}</span>
        <button type="button" class="toast-close" aria-label="Dismiss"><i class="fa-solid fa-xmark"></i></button>
    `;
    const remove = () => {
        toast.classList.add("toast-leaving");
        setTimeout(() => toast.remove(), 220);
    };
    toast.querySelector(".toast-close").addEventListener("click", remove);
    const timer = setTimeout(remove, duration);
    toast.addEventListener("mouseenter", () => clearTimeout(timer));
    toastStack.appendChild(toast);
}

/* =========================================================
   APP MODAL
   A single reusable modal that replaces both confirm() and
   prompt() with something that matches the rest of the UI.
   - showConfirm(message, opts) -> Promise<boolean>
   - showFormModal(opts)        -> Promise<Record<string,string>|null>
========================================================= */
const appModalBackdrop = document.getElementById("appModalBackdrop");
const appModalEl = appModalBackdrop ? appModalBackdrop.querySelector(".app-modal") : null;
const appModalTitle = document.getElementById("appModalTitle");
const appModalMessage = document.getElementById("appModalMessage");
const appModalFields = document.getElementById("appModalFields");
const appModalCancel = document.getElementById("appModalCancel");
const appModalConfirm = document.getElementById("appModalConfirm");
const appModalClose = document.getElementById("appModalClose");

let appModalResolver = null;

function closeAppModal(result) {
    if (!appModalBackdrop) return;
    appModalBackdrop.classList.remove("visible");
    if (appModalResolver) {
        appModalResolver(result);
        appModalResolver = null;
    }
}

if (appModalCancel) appModalCancel.addEventListener("click", () => closeAppModal(null));
if (appModalClose) appModalClose.addEventListener("click", () => closeAppModal(null));
if (appModalBackdrop) {
    appModalBackdrop.addEventListener("click", (e) => {
        if (e.target === appModalBackdrop) closeAppModal(null);
    });
}
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && appModalBackdrop && appModalBackdrop.classList.contains("visible")) {
        closeAppModal(null);
    }
});

// Renders one field's markup based on its type. "tags" is just a text input
// with a hint, since a full tag-chip editor is overkill here.
function renderModalField(field) {
    const id = `appModalField-${field.name}`;
    const label = `<label for="${id}">${field.label}</label>`;
    if (field.type === "textarea") {
        return `<div class="app-modal-field">
                    ${label}
                    <textarea id="${id}" name="${field.name}" rows="${field.rows || 4}" placeholder="${field.placeholder || ""}">${field.value || ""}</textarea>
                </div>`;
    }
    const hint = field.type === "tags" ? `<div class="tag-input-hint">Separate tags with commas</div>` : "";
    return `<div class="app-modal-field">
                ${label}
                <input type="text" id="${id}" name="${field.name}" value="${(field.value || "").replace(/"/g, "&quot;")}" placeholder="${field.placeholder || ""}">
                ${hint}
            </div>`;
}

// Plain confirm dialog. Resolves true/false, just like window.confirm().
function showConfirm(message, opts = {}) {
    if (!appModalBackdrop) return Promise.resolve(window.confirm(message));

    appModalTitle.textContent = opts.title || "Are you sure?";
    appModalMessage.textContent = message;
    appModalMessage.style.display = "block";
    appModalFields.innerHTML = "";
    appModalFields.style.display = "none";
    appModalConfirm.textContent = opts.confirmLabel || "Confirm";
    appModalConfirm.classList.toggle("danger", !!opts.danger);
    appModalCancel.textContent = opts.cancelLabel || "Cancel";

    appModalConfirm.onclick = () => closeAppModal(true);

    return new Promise((resolve) => {
        appModalResolver = (result) => resolve(!!result);
        appModalBackdrop.classList.add("visible");
    });
}

// Form dialog with one or more fields. Resolves with an object of
// { fieldName: value } on confirm, or null on cancel.
function showFormModal(opts = {}) {
    if (!appModalBackdrop) return Promise.resolve(null);

    appModalTitle.textContent = opts.title || "";
    if (opts.message) {
        appModalMessage.textContent = opts.message;
        appModalMessage.style.display = "block";
    } else {
        appModalMessage.style.display = "none";
    }

    const fields = opts.fields || [];
    appModalFields.innerHTML = fields.map(renderModalField).join("");
    appModalFields.style.display = "flex";
    appModalConfirm.textContent = opts.confirmLabel || "Save";
    appModalConfirm.classList.toggle("danger", !!opts.danger);
    appModalCancel.textContent = opts.cancelLabel || "Cancel";

    const firstInput = appModalFields.querySelector("input, textarea");

    appModalConfirm.onclick = () => {
        const values = {};
        let valid = true;
        fields.forEach(field => {
            const el = document.getElementById(`appModalField-${field.name}`);
            const value = el ? el.value : "";
            if (field.required && !value.trim()) valid = false;
            values[field.name] = field.type === "tags"
                ? value.split(",").map(t => t.trim()).filter(Boolean)
                : value;
        });
        if (!valid) {
            showToast("Please fill in the required field.", "error");
            return;
        }
        closeAppModal(values);
    };

    return new Promise((resolve) => {
        appModalResolver = (result) => resolve(result);
        appModalBackdrop.classList.add("visible");
        setTimeout(() => firstInput && firstInput.focus(), 50);
    });
}

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
   MEMORY DETAILS MODAL
   Opens a clean panel with title, description, tags,
   collection selector, and small edit (pen) buttons.
========================================================= */
const memoryDetailsBackdrop = document.getElementById("memoryDetailsBackdrop");
const memoryDetailsClose = document.getElementById("memoryDetailsClose");
let currentDetailsMemoryId = null;

function closeMemoryDetails() {
    if (!memoryDetailsBackdrop) return;
    memoryDetailsBackdrop.classList.remove("visible");
    currentDetailsMemoryId = null;
    document.body.style.overflow = "";
}

function openMemoryDetails(id) {
    // Look in active memories first, then trash
    let memory = memories.find(m => m && String(m.id) === String(id));
    let fromTrash = false;
    if (!memory) {
        memory = trashedMemories.find(m => m && String(m.id) === String(id));
        fromTrash = !!memory;
    }
    if (!memory || !memoryDetailsBackdrop) return;

    currentDetailsMemoryId = String(id);
    memoryDetailsBackdrop.dataset.fromTrash = fromTrash ? "1" : "0";

    const titleEl = document.getElementById("memoryDetailsTitle");
    const tagEl = document.getElementById("memoryDetailsTag");
    const summaryEl = document.getElementById("memoryDetailsSummary");
    const tagsTextEl = document.getElementById("memoryDetailsTagsText");
    const dateEl = document.getElementById("memoryDetailsDate");
    const collectionSelect = document.getElementById("memoryDetailsCollection");

    if (titleEl) titleEl.textContent = memory.title || "Untitled";
    if (tagEl) {
        const tagText = memory.tags && memory.tags.length > 0 ? memory.tags[0] : (memory.collection || "General");
        tagEl.textContent = tagText;
    }
    if (summaryEl) {
        summaryEl.textContent = memory.summary || "No description yet.";
    }
    if (tagsTextEl) {
        tagsTextEl.textContent = (memory.tags && memory.tags.length)
            ? memory.tags.join(", ")
            : "No tags";
    }
    if (dateEl) {
        const span = dateEl.querySelector("span");
        if (span) span.textContent = memory.created_at ? formatTime(memory.created_at) : "just now";
    }
    if (collectionSelect) {
        collectionSelect.innerHTML = buildCollectionOptions(memory.collection);
        collectionSelect.dataset.id = memory.id;
        collectionSelect.dataset.previousValue = memory.collection || "";
        collectionSelect.disabled = fromTrash;
    }

    const downloadLink = document.getElementById("memoryDetailsDownload");
    if (downloadLink) {
        const fileUrl = `${API_BASE}/uploads/${memory.filename || ""}`;
        downloadLink.href = fileUrl;
        downloadLink.setAttribute("download", memory.filename || "download");
    }

    // Swap action buttons depending on whether this is a trash item
    const editBtn = document.getElementById("memoryDetailsEditAll");
    const deleteBtn = document.getElementById("memoryDetailsDelete");
    const restoreBtn = document.getElementById("memoryDetailsRestore");
    if (editBtn) editBtn.style.display = fromTrash ? "none" : "";
    if (deleteBtn) {
        deleteBtn.style.display = fromTrash ? "" : "";
        deleteBtn.innerHTML = fromTrash
            ? `<i class="fa-solid fa-trash-can"></i> Delete forever`
            : `<i class="fa-solid fa-trash"></i> Delete`;
    }
    if (restoreBtn) restoreBtn.style.display = fromTrash ? "" : "none";

    memoryDetailsBackdrop.classList.add("visible");
    document.body.style.overflow = "hidden";
}

if (memoryDetailsClose) memoryDetailsClose.addEventListener("click", closeMemoryDetails);
if (memoryDetailsBackdrop) {
    memoryDetailsBackdrop.addEventListener("click", (e) => {
        if (e.target === memoryDetailsBackdrop) closeMemoryDetails();
    });
}
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && memoryDetailsBackdrop && memoryDetailsBackdrop.classList.contains("visible")) {
        closeMemoryDetails();
    }
});

// Single "Edit" button opens one form for title, description, and tags
document.getElementById("memoryDetailsEditAll")?.addEventListener("click", async () => {
    if (!currentDetailsMemoryId) return;
    const memory = memories.find(m => m && String(m.id) === currentDetailsMemoryId);
    if (!memory) return;
    const editId = memory.id;
    // One window at a time: close info, open edit, then return to info after save
    closeMemoryDetails();
    const result = await showFormModal({
        title: "Edit memory",
        fields: [
            { name: "title", label: "Title", type: "text", value: memory.title || "", required: true },
            { name: "summary", label: "Description", type: "textarea", value: memory.summary || "", rows: 4 },
            { name: "tags", label: "Tags", type: "tags", value: (memory.tags || []).join(", ") }
        ],
        confirmLabel: "Save"
    });
    if (!result) {
        openMemoryDetails(editId);
        return;
    }
    try {
        const res = await fetchWithAuth(`${API_BASE}/memories/${memory.id}/details`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: result.title,
                summary: result.summary,
                tags: result.tags
            })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Server rejected the request");
        memory.title = data.memory.title;
        memory.summary = data.memory.summary;
        memory.tags = data.memory.tags;
        refreshCurrentPage();
        openMemoryDetails(editId);
        showToast("Memory updated.", "success", 2200);
    } catch (error) {
        console.error("Failed to update memory:", error);
        showToast("Couldn't update the memory.", "error");
        openMemoryDetails(editId);
    }
});

/* Collection select inside the details modal is handled by the
   global .collection-select change listener further below. */

document.getElementById("memoryDetailsDelete")?.addEventListener("click", async () => {
    if (!currentDetailsMemoryId) return;
    const id = currentDetailsMemoryId;
    const fromTrash = memoryDetailsBackdrop?.dataset.fromTrash === "1";

    // Close info window first so only the confirm dialog is on screen
    closeMemoryDetails();

    if (fromTrash) {
        const confirmed = await showConfirm("Permanently delete this memory? This cannot be undone.", { title: "Delete forever", confirmLabel: "Delete", danger: true });
        if (!confirmed) return;
        try {
            const res = await fetchWithAuth(`${API_BASE}/memories/${id}`, { method: "DELETE" });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || "Server rejected the request");
            trashedMemories = trashedMemories.filter(m => m && String(m.id) !== String(id));
            refreshCurrentPage();
            showToast("Permanently deleted.", "success", 2200);
        } catch (error) {
            console.error("Failed to permanently delete memory:", error);
            showToast("Couldn't permanently delete that memory.", "error");
        }
        return;
    }

    const confirmed = await showConfirm("Move this memory to Trash?", { title: "Move to Trash", confirmLabel: "Move to Trash", danger: true });
    if (!confirmed) {
        openMemoryDetails(id);
        return;
    }
    try {
        const res = await fetchWithAuth(`${API_BASE}/memories/${id}/trash`, { method: "PATCH" });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Server rejected the request");
        memories = memories.filter(m => m && String(m.id) !== String(id));
        refreshCurrentPage();
        showToast("Moved to Trash.", "success", 2200);
    } catch (error) {
        console.error("Failed to move memory to trash:", error);
        showToast("Moved to Trash failed - is the backend running?", "error");
        openMemoryDetails(id);
    }
});

document.getElementById("memoryDetailsRestore")?.addEventListener("click", async () => {
    if (!currentDetailsMemoryId) return;
    const id = currentDetailsMemoryId;
    try {
        const res = await fetchWithAuth(`${API_BASE}/memories/${id}/restore`, { method: "PATCH" });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Server rejected the request");
        const restored = trashedMemories.find(m => m && String(m.id) === String(id));
        trashedMemories = trashedMemories.filter(m => m && String(m.id) !== String(id));
        if (restored) memories.unshift(restored);
        closeMemoryDetails();
        refreshCurrentPage();
        showToast("Restored.", "success");
    } catch (error) {
        console.error("Failed to restore memory:", error);
        showToast("Couldn't restore that memory.", "error");
    }
});

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
   MOBILE SIDEBAR DRAWER
   On mobile there's no room for a permanent sidebar, so it becomes
   a slide-in drawer opened via the hamburger button in the topbar.
========================================================= */
const sidebarEl = document.querySelector(".sidebar");
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");

function openSidebar() {
    sidebarEl.classList.add("open");
    sidebarBackdrop.classList.add("visible");
    document.body.style.overflow = "hidden"; // prevent background scroll while drawer is open
}

function closeSidebar() {
    sidebarEl.classList.remove("open");
    sidebarBackdrop.classList.remove("visible");
    document.body.style.overflow = "";
}

if (mobileMenuBtn) mobileMenuBtn.addEventListener("click", openSidebar);
if (sidebarCloseBtn) sidebarCloseBtn.addEventListener("click", closeSidebar);
if (sidebarBackdrop) sidebarBackdrop.addEventListener("click", closeSidebar);

document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeSidebar();
});

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
        closeSidebar();
    });
});

sourceLinks.forEach(link => {
    link.addEventListener("click", function () {
        collectionFilter = null;
        idFilter = null;
        showPage(link.dataset.page);
        closeSidebar();
    });
});

// "Videos" has no page yet - just let people know it's on the way instead
// of silently doing nothing when tapped.
const videosComingSoon = document.getElementById("videosComingSoon");
if (videosComingSoon) {
    videosComingSoon.addEventListener("click", function () {
        showToast("Video support is coming soon!", "info");
    });
}

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

// docx/xlsx/xls can be rendered client-side with mammoth.js / SheetJS - see
// openOfficePreview(). Legacy .doc and .ppt/.pptx have no lightweight
// in-browser renderer, so those still fall back to "Open file".
const OFFICE_PREVIEW_EXT = /\.(docx|xlsx|xls)$/i;
function isPreviewableOfficeDoc(memory) {
    const filename = (memory && memory.filename) || "";
    return OFFICE_PREVIEW_EXT.test(filename);
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

/* =========================================================
   READ MORE / READ LESS
   Summaries are clamped to 2 lines by default so cards stay tidy.
   After a grid is (re)rendered we measure each summary and only
   reveal the "Read more" button on the ones that actually overflow.
========================================================= */
const expandedSummaryIds = new Set();

function measureSummaryOverflow(container) {
    if (!container) return;
    requestAnimationFrame(() => {
        container.querySelectorAll(".summary-wrap").forEach(wrap => {
            const p = wrap.querySelector(".memory-summary");
            if (!p) return;
            wrap.classList.toggle("has-overflow", p.scrollHeight > p.clientHeight + 1);
        });
    });
}

document.addEventListener("click", function (e) {
    // Title → properties modal; "Read more" (desktop) also opens it
    const detailsTarget = e.target.closest(".read-more-btn, .memory-title-link");
    if (!detailsTarget) return;
    e.preventDefault();
    e.stopPropagation();
    const id = detailsTarget.dataset.id;
    if (id) openMemoryDetails(id);
}, true); // capture phase: run before any ancestor's own click handler can act on this click

function createMemoryCard(memory, mode) {
    // Defensive: a failed upload/restore can leave a null/undefined entry in
    // an array before this ever gets called - never render a card for it.
    if (!memory) return null;

    // mode: "normal" (dashboard/memories) or "trash"
    const card = document.createElement("div");
    card.className = "memory-card";

    const tagText = memory.tags && memory.tags.length > 0 ? memory.tags[0] : (memory.collection || "General");

    // Icon-only restore / delete on the thumbnail — keeps mobile cards clean
    const trashActionsHtml = mode === "trash"
        ? `<div class="trash-card-actions">
             <button type="button" class="restore-btn" data-id="${memory.id}" title="Restore"><i class="fa-solid fa-rotate-left"></i></button>
             <button type="button" class="delete-btn" data-id="${memory.id}" title="Delete forever"><i class="fa-solid fa-trash-can"></i></button>
           </div>`
        : "";

    const fileUrl = `${API_BASE}/uploads/${memory.filename || ""}`;
    const type = classifyType(memory);

    // Card actions (edit / download / delete) live in the Details modal.

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
        mediaHtml = `<div class="file-icon-placeholder preview-pdf" data-fullsrc="${fileUrl}" title="Preview PDF">
                        <i class="fa-regular fa-file-pdf"></i>
                        <span class="preview-hint"><i class="fa-solid fa-magnifying-glass"></i> Preview</span>
                     </div>`;
    } else if (type === "audio") {
        // Opens the full audio player (seek / skip) — better for long recordings
        const safeTitle = (memory.title || "Audio").replace(/"/g, "&quot;");
        mediaHtml = `<div class="audio-preview audio-open-player" data-audio-src="${fileUrl}" data-audio-title="${safeTitle}">
                        <button type="button" class="audio-play-btn" aria-label="Open audio player">
                            <i class="fa-solid fa-play"></i>
                        </button>
                     </div>`;
    } else if (type === "document" && isPreviewableOfficeDoc(memory)) {
        const ext = getFileExtension(memory.filename);
        const isSheet = ext === "xlsx" || ext === "xls";
        mediaHtml = `<div class="file-icon-placeholder preview-office" data-fullsrc="${fileUrl}" data-ext="${ext}" title="Preview">
                        <i class="fa-solid ${isSheet ? "fa-file-excel" : "fa-file-word"}"></i>
                        <span class="preview-hint"><i class="fa-solid fa-magnifying-glass"></i> Preview</span>
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

    // Card chrome is intentionally minimal: media + title.
    // Tap media to preview; tap title to open properties (Details modal).
    // Trash: restore/delete icons sit on the thumbnail.
    if (mode === "trash") card.classList.add("is-trash");
    card.innerHTML = `
        <div class="memory-image-wrap">
            ${mediaHtml}
            ${trashActionsHtml}
        </div>
        <div class="memory-content">
            <h3 class="memory-title-link" data-id="${memory.id}">${memory.title || "Untitled"}</h3>
            <div class="summary-wrap${expandedSummaryIds.has(String(memory.id)) ? " expanded" : ""}" data-id="${memory.id}">
                <p class="memory-summary">${memory.summary || ""}</p>
                <button type="button" class="read-more-btn" data-id="${memory.id}">Read more</button>
            </div>
            <div class="memory-footer">
                ${collectionFieldHtml}
                <span><i class="fa-regular fa-calendar"></i> ${memory.created_at ? formatTime(memory.created_at) : "just now"}</span>
            </div>
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
    measureSummaryOverflow(memoryGrid);

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
    measureSummaryOverflow(allMemoriesGrid);
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
        const description = getCollectionDescriptions()[name];
        card.innerHTML = `
            <button class="collection-delete-btn" data-name="${name}" title="Delete collection">
                <i class="fa-solid fa-trash"></i>
            </button>
            <i class="fa-solid ${iconClass}"></i>
            <h3>${name}</h3>
            ${description ? `<p class="collection-desc">${description}</p>` : ""}
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
const COLLECTION_DESCRIPTIONS_KEY = "organaiz-collection-descriptions";

function getCollectionDescriptions() {
    try {
        return JSON.parse(localStorage.getItem(COLLECTION_DESCRIPTIONS_KEY)) || {};
    } catch {
        return {};
    }
}

function saveCollectionDescription(name, description) {
    const map = getCollectionDescriptions();
    map[name] = description;
    localStorage.setItem(COLLECTION_DESCRIPTIONS_KEY, JSON.stringify(map));
}

function deleteCollectionDescription(name) {
    const map = getCollectionDescriptions();
    delete map[name];
    localStorage.setItem(COLLECTION_DESCRIPTIONS_KEY, JSON.stringify(map));
}

async function addCustomCollection(promptMessage) {
    const result = await showFormModal({
        title: "New Collection",
        message: promptMessage || null,
        fields: [
            { name: "name", label: "Collection name", type: "text", placeholder: "e.g. Recipes", required: true },
            { name: "description", label: "Description (optional)", type: "textarea", placeholder: "What kind of memories go here?", rows: 3 }
        ],
        confirmLabel: "Create"
    });
    if (!result || !result.name || !result.name.trim()) return null;
    const trimmed = result.name.trim();

    const existingNames = new Set([
        ...memories.map(m => (m.collection || "Uncategorized").toLowerCase()),
        ...getCustomCollections().map(c => c.toLowerCase())
    ]);
    if (existingNames.has(trimmed.toLowerCase())) {
        showToast(`A collection called "${trimmed}" already exists.`, "error");
        return null;
    }

    const customCollections = getCustomCollections();
    customCollections.push(trimmed);
    saveCustomCollections(customCollections);

    if (result.description && result.description.trim()) {
        saveCollectionDescription(trimmed, result.description.trim());
    }
    return trimmed;
}

const newCollectionBtn = document.getElementById("newCollectionBtn");
if (newCollectionBtn) {
    newCollectionBtn.addEventListener("click", async function () {
        if (await addCustomCollection()) renderCollectionsPage();
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
        const created = await addCustomCollection("Name the new collection to move this memory into:");
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
        showToast("Couldn't move that memory. Is the backend running?", "error");
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
    const confirmed = await showConfirm(confirmMsg, { title: "Delete collection", confirmLabel: "Delete", danger: true });
    if (!confirmed) return;

    deleteBtn.disabled = true;

    try {
        await Promise.all(affected.map(m =>
            fetchWithAuth(`${API_BASE}/memories/${m.id}/collection`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ collection: "Uncategorized" })
            }).then(() => { m.collection = "Uncategorized"; })
        ));

        deleteCollectionDescription(name);
        const customCollections = getCustomCollections().filter(c => c !== name);
        saveCustomCollections(customCollections);

        refreshCurrentPage();
    } catch (error) {
        console.error("Failed to delete collection:", error);
        showToast("Couldn't delete that collection. Is the backend running?", "error");
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
    measureSummaryOverflow(grid);

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
    measureSummaryOverflow(trashGrid);

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
/* =========================================================
   PER-CARD "..." MENU
   One dropdown per card replaces the separate download/delete icons:
   edit title, edit summary, edit tags, download, delete.
========================================================= */
document.addEventListener("click", function (e) {
    const menuBtn = e.target.closest(".card-menu-btn");
    const openDropdown = document.querySelector(".card-menu.open");

    // Close any open menu first, unless we just clicked its own toggle button
    if (openDropdown && (!menuBtn || menuBtn.closest(".card-menu") !== openDropdown)) {
        openDropdown.classList.remove("open");
        openDropdown.closest(".memory-card")?.classList.remove("menu-open");
    }
    if (menuBtn) {
        const menu = menuBtn.closest(".card-menu");
        const card = menuBtn.closest(".memory-card");
        const willOpen = !menu.classList.contains("open");
        menu.classList.toggle("open");
        if (card) card.classList.toggle("menu-open", willOpen);
    }
});

document.addEventListener("click", async function (e) {
    const actionBtn = e.target.closest(".card-menu-item[data-action]");
    if (!actionBtn) return;

    const id = actionBtn.dataset.id;
    const memory = memories.find(m => m && m.id == id);
    if (!memory) return;
    const menuEl = actionBtn.closest(".card-menu");
    menuEl?.classList.remove("open");
    menuEl?.closest(".memory-card")?.classList.remove("menu-open");

    if (actionBtn.dataset.action === "edit-title") {
        const result = await showFormModal({
            title: "Edit title",
            fields: [{ name: "title", label: "Title", type: "text", value: memory.title || "", required: true }],
            confirmLabel: "Save"
        });
        if (!result) return;
        try {
            const res = await fetchWithAuth(`${API_BASE}/memories/${id}/details`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: result.title })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || "Server rejected the request");
            memory.title = data.memory.title;
            refreshCurrentPage();
            showToast("Title updated.", "success");
        } catch (error) {
            console.error("Failed to update title:", error);
            showToast("Couldn't update the title. Is the backend running?", "error");
        }
    }

    if (actionBtn.dataset.action === "edit-summary") {
        const result = await showFormModal({
            title: "Edit summary",
            fields: [{ name: "summary", label: "Summary", type: "textarea", value: memory.summary || "", rows: 5 }],
            confirmLabel: "Save"
        });
        if (!result) return;
        try {
            const res = await fetchWithAuth(`${API_BASE}/memories/${id}/details`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ summary: result.summary })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || "Server rejected the request");
            memory.summary = data.memory.summary;
            refreshCurrentPage();
            showToast("Summary updated.", "success");
        } catch (error) {
            console.error("Failed to update summary:", error);
            showToast("Couldn't update the summary. Is the backend running?", "error");
        }
    }

    if (actionBtn.dataset.action === "edit-tags") {
        const result = await showFormModal({
            title: "Edit tags",
            fields: [{ name: "tags", label: "Tags", type: "tags", value: (memory.tags || []).join(", ") }],
            confirmLabel: "Save"
        });
        if (!result) return;
        try {
            const res = await fetchWithAuth(`${API_BASE}/memories/${id}/details`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tags: result.tags })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || "Server rejected the request");
            memory.tags = data.memory.tags;
            refreshCurrentPage();
            showToast("Tags updated.", "success");
        } catch (error) {
            console.error("Failed to update tags:", error);
            showToast("Couldn't update the tags. Is the backend running?", "error");
        }
    }

    if (actionBtn.dataset.action === "delete") {
        const confirmed = await showConfirm("Move this memory to Trash?", { title: "Move to Trash", confirmLabel: "Move to Trash", danger: true });
        if (!confirmed) return;
        try {
            const res = await fetchWithAuth(`${API_BASE}/memories/${id}/trash`, { method: "PATCH" });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || "Server rejected the request");
            memories = memories.filter(m => m && m.id != id);
            refreshCurrentPage();
            showToast("Moved to Trash.", "success");
        } catch (error) {
            console.error("Failed to move memory to trash:", error);
            showToast("Moved to Trash failed - is the backend running?", "error");
        }
    }
});

// Close an open card menu on outside click or Escape
document.addEventListener("click", function (e) {
    if (e.target.closest(".card-menu")) return;
    document.querySelectorAll(".card-menu.open").forEach(el => {
        el.classList.remove("open");
        el.closest(".memory-card")?.classList.remove("menu-open");
    });
});
document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
        document.querySelectorAll(".card-menu.open").forEach(el => {
            el.classList.remove("open");
            el.closest(".memory-card")?.classList.remove("menu-open");
        });
    }
});

document.addEventListener("click", async function (e) {
    const trashBtn = e.target.closest(".trash-icon-btn");
    const restoreBtn = e.target.closest(".restore-btn");
    const deleteBtn = e.target.closest(".delete-btn");
    const pageLinkBtn = e.target.closest("[data-page-link]");
    const reviewDupBtn = e.target.closest(".review-duplicate-btn");
    const viewDeadlineBtn = e.target.closest(".view-deadline-btn");
    const createCollectionBtn = e.target.closest(".create-collection-btn");
    const markSeenBtn = e.target.closest(".mark-ai-seen-btn");

    if (markSeenBtn) {
        const key = markSeenBtn.dataset.seenKey;
        if (key) {
            markAIRecSeen(key);
            const card = markSeenBtn.closest(".ai-card");
            if (card) {
                card.style.transition = "opacity .25s ease, transform .25s ease";
                card.style.opacity = "0";
                card.style.transform = "scale(0.96)";
                setTimeout(() => {
                    card.remove();
                    const aiGrid = document.getElementById("aiGrid");
                    const emptyMsg = aiGrid && aiGrid.parentElement.querySelector(".empty-message");
                    if (emptyMsg) emptyMsg.classList.toggle("visible", aiGrid.children.length === 0);
                }, 260);
            }
            showToast("Marked as seen.", "success", 2200);
        }
        return;
    }

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
            showToast("Couldn't create the collection. Is the backend running?", "error");
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
            showToast("Moved to Trash failed - is the backend running?", "error");
        }
    }


    if (restoreBtn) {
        e.stopPropagation();
        const id = restoreBtn.dataset.id;
        try {
            const res = await fetchWithAuth(`${API_BASE}/memories/${id}/restore`, { method: "PATCH" });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || "Server rejected the request");
            trashedMemories = trashedMemories.filter(m => m && m.id != id);
            if (data.memory) memories.unshift(data.memory);
            renderTrashPage();
            refreshCurrentPage();
            showToast("Restored.", "success", 2200);
        } catch (error) {
            console.error("Failed to restore memory:", error);
            showToast("Couldn't restore that memory. Is the backend running?", "error");
        }
    }

    if (deleteBtn) {
        e.stopPropagation();
        const id = deleteBtn.dataset.id;
        const confirmed = await showConfirm("Permanently delete this memory? This cannot be undone.", { title: "Delete forever", confirmLabel: "Delete", danger: true });
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
            showToast("Couldn't permanently delete that memory. Is the backend running?", "error");
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
        if (!(await showConfirm(`Restore all ${items.length} item${items.length === 1 ? "" : "s"} from trash?`, { title: "Restore all", confirmLabel: "Restore" }))) return;

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
            showToast("Couldn't restore everything. Is the backend running?", "error");
        } finally {
            restoreAllBtn.disabled = false;
        }
    });
}

if (emptyTrashBtn) {
    emptyTrashBtn.addEventListener("click", async function () {
        const items = trashedMemories.filter(Boolean);
        if (items.length === 0) return;
        if (!(await showConfirm(`Permanently delete all ${items.length} item${items.length === 1 ? "" : "s"} in trash? This cannot be undone.`, { title: "Empty trash", confirmLabel: "Delete all", danger: true }))) return;

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
            showToast("Couldn't empty the trash. Is the backend running?", "error");
        } finally {
            emptyTrashBtn.disabled = false;
        }
    });
}

let isRenderingAI = false;

const AI_SEEN_KEY = "organaiz-ai-seen";

function getSeenAIRecs() {
    try {
        return new Set(JSON.parse(localStorage.getItem(AI_SEEN_KEY)) || []);
    } catch {
        return new Set();
    }
}

function markAIRecSeen(key) {
    const seen = getSeenAIRecs();
    seen.add(key);
    localStorage.setItem(AI_SEEN_KEY, JSON.stringify([...seen]));
}

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
        const seen = getSeenAIRecs();

        const duplicateGroups = (dupData && dupData.success && dupData.duplicateGroups) || [];
        const deadlineMemories = (deadlineData && deadlineData.success && deadlineData.memories) || [];
        const collectionSuggestions = (collectionData && collectionData.success && collectionData.suggestions) || [];

        duplicateGroups.forEach(group => {
            const key = `dup-${[group[0].id, group[1].id].sort().join("-")}`;
            if (seen.has(key)) return;
            const card = document.createElement("div");
            card.className = "ai-card blue";
            card.dataset.seenKey = key;
            card.innerHTML = `
                <div class="ai-card-top">
                    <div class="ai-icon"><i class="fa-solid fa-clone"></i></div>
                    <span class="ai-badge">Duplicate</span>
                </div>
                <h3>Possible Duplicates</h3>
                <p>"${group[0].title}" and "${group[1].title}" look similar. Review them?</p>
                <div class="ai-card-actions">
                    <button class="review-duplicate-btn" data-ids="${group[0].id},${group[1].id}">Review</button>
                    <button class="mark-ai-seen-btn" data-seen-key="${key}">Mark as seen</button>
                </div>
            `;
            aiGrid.appendChild(card);
        });

        deadlineMemories.forEach(memory => {
            const key = `deadline-${memory.id}`;
            if (seen.has(key)) return;
            const daysUntil = Math.ceil((new Date(memory.deadline) - new Date()) / (1000 * 60 * 60 * 24));
            const dayText = daysUntil === 0 ? "today" : daysUntil === 1 ? "tomorrow" : `in ${daysUntil} days`;

            const card = document.createElement("div");
            card.className = "ai-card red";
            card.dataset.seenKey = key;
            card.innerHTML = `
                <div class="ai-card-top">
                    <div class="ai-icon"><i class="fa-solid fa-clock"></i></div>
                    <span class="ai-badge">Deadline</span>
                </div>
                <h3>Deadline ${dayText}</h3>
                <p>"${memory.title}" has a deadline on ${memory.deadline}.</p>
                <div class="ai-card-actions">
                    <button class="view-deadline-btn" data-id="${memory.id}">View</button>
                    <button class="mark-ai-seen-btn" data-seen-key="${key}">Mark as seen</button>
                </div>
            `;
            aiGrid.appendChild(card);
        });

        collectionSuggestions.forEach(suggestion => {
            const key = `coll-${suggestion.tag}`;
            if (seen.has(key)) return;
            const card = document.createElement("div");
            card.className = "ai-card yellow";
            card.dataset.seenKey = key;
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
                    <button class="mark-ai-seen-btn" data-seen-key="${key}">Mark as seen</button>
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
        showToast("Please log in first.", "error");
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
        showToast("Upload failed: " + error.message, "error");
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
const lightboxOffice = document.getElementById("lightboxOffice");
const lightboxOfficeInner = document.getElementById("lightboxOfficeInner");
const lightboxClose = document.getElementById("lightboxClose");

function openLightbox(src, kind) {
    lightboxImg.style.display = "none";
    lightboxPdf.style.display = "none";
    lightboxOffice.style.display = "none";

    if (kind === "pdf") {
        lightboxPdf.src = src;
        lightboxPdf.style.display = "block";
    } else if (kind === "office") {
        lightboxOffice.style.display = "block";
    } else {
        lightboxImg.src = src;
        lightboxImg.style.display = "block";
    }
    imageLightbox.classList.add("visible");
}

function closeLightbox() {
    imageLightbox.classList.remove("visible");
    lightboxImg.src = "";
    lightboxPdf.src = ""; // stop the PDF viewer from staying loaded in the background
    lightboxOfficeInner.innerHTML = "";
}

// Renders a .docx (via mammoth.js) or .xlsx/.xls (via SheetJS) file straight
// in the browser, instead of forcing a download - fetches the raw file,
// hands the bytes to whichever library matches the extension.
async function openOfficePreview(url, ext) {
    openLightbox(null, "office");
    lightboxOfficeInner.innerHTML = `<div class="lightbox-office-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading preview...</div>`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();

        if (ext === "docx") {
            if (typeof mammoth === "undefined") throw new Error("Preview library didn't load");
            const result = await mammoth.convertToHtml({ arrayBuffer });
            lightboxOfficeInner.innerHTML = result.value || "<p>This document appears to be empty.</p>";
        } else {
            // xlsx / xls
            if (typeof XLSX === "undefined") throw new Error("Preview library didn't load");
            const workbook = XLSX.read(arrayBuffer, { type: "array" });
            let html = "";
            workbook.SheetNames.forEach(name => {
                html += `<div class="sheet-title">${name}</div>`;
                html += XLSX.utils.sheet_to_html(workbook.Sheets[name], { editable: false });
            });
            lightboxOfficeInner.innerHTML = html || "<p>This spreadsheet appears to be empty.</p>";
        }
    } catch (error) {
        console.error("Office preview failed:", error);
        lightboxOfficeInner.innerHTML = `<p>Couldn't preview this file (${error.message}). Try the download button instead.</p>`;
        showToast("Couldn't preview that file - try downloading it instead.", "error");
    }
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
        return;
    }
    const previewOffice = e.target.closest(".preview-office");
    if (previewOffice) {
        openOfficePreview(previewOffice.dataset.fullsrc, previewOffice.dataset.ext);
        return;
    }

    // Open full audio player (seek bar + skip) for long recordings
    const audioOpen = e.target.closest(".audio-open-player, .audio-play-btn");
    if (audioOpen) {
        e.preventDefault();
        e.stopPropagation();
        const wrap = audioOpen.closest(".audio-preview") || audioOpen;
        const src = wrap.dataset.audioSrc;
        const title = wrap.dataset.audioTitle || "Audio";
        if (src) openAudioPlayer(src, title);
    }
});

/* =========================================================
   FULL AUDIO PLAYER
   Seek bar, time display, ±10s skip — works for long files.
========================================================= */
const audioPlayerBackdrop = document.getElementById("audioPlayerBackdrop");
const audioPlayerEl = document.getElementById("audioPlayerElement");
const audioPlayerSeek = document.getElementById("audioPlayerSeek");
const audioPlayerCurrent = document.getElementById("audioPlayerCurrent");
const audioPlayerDuration = document.getElementById("audioPlayerDuration");
const audioPlayerPlayBtn = document.getElementById("audioPlayerPlay");
const audioPlayerPlayIcon = document.getElementById("audioPlayerPlayIcon");
const audioPlayerTitle = document.getElementById("audioPlayerTitle");
const audioPlayerClose = document.getElementById("audioPlayerClose");
let audioSeeking = false;

function formatAudioTime(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function updateAudioPlayIcon(playing) {
    if (!audioPlayerPlayIcon || !audioPlayerPlayBtn) return;
    audioPlayerPlayIcon.className = playing ? "fa-solid fa-pause" : "fa-solid fa-play";
    audioPlayerPlayBtn.classList.toggle("playing", playing);
}

function openAudioPlayer(src, title) {
    if (!audioPlayerBackdrop || !audioPlayerEl) return;
    if (audioPlayerTitle) audioPlayerTitle.textContent = title || "Audio";
    const sub = document.getElementById("audioPlayerSub");
    if (sub) sub.textContent = "Drag the bar to jump · ±10s to skip";

    const prev = audioPlayerEl.getAttribute("src");
    if (prev !== src) {
        audioPlayerEl.setAttribute("src", src);
        audioPlayerEl.load();
        if (audioPlayerSeek) audioPlayerSeek.value = 0;
        if (audioPlayerCurrent) audioPlayerCurrent.textContent = "0:00";
        if (audioPlayerDuration) audioPlayerDuration.textContent = "0:00";
    }

    audioPlayerBackdrop.classList.add("visible");
    document.body.style.overflow = "hidden";

    audioPlayerEl.play().then(() => updateAudioPlayIcon(true)).catch(() => {
        updateAudioPlayIcon(false);
        showToast("Couldn't start playback. Try again.", "error");
    });
}

function closeAudioPlayer() {
    if (!audioPlayerBackdrop) return;
    if (audioPlayerEl) {
        audioPlayerEl.pause();
        updateAudioPlayIcon(false);
    }
    audioPlayerBackdrop.classList.remove("visible");
    document.body.style.overflow = "";
}

if (audioPlayerClose) audioPlayerClose.addEventListener("click", closeAudioPlayer);
if (audioPlayerBackdrop) {
    audioPlayerBackdrop.addEventListener("click", (e) => {
        if (e.target === audioPlayerBackdrop) closeAudioPlayer();
    });
}

if (audioPlayerPlayBtn && audioPlayerEl) {
    audioPlayerPlayBtn.addEventListener("click", () => {
        if (audioPlayerEl.paused) {
            audioPlayerEl.play().then(() => updateAudioPlayIcon(true)).catch(() => showToast("Couldn't play this audio.", "error"));
        } else {
            audioPlayerEl.pause();
            updateAudioPlayIcon(false);
        }
    });
}

document.getElementById("audioPlayerBack10")?.addEventListener("click", () => {
    if (!audioPlayerEl) return;
    audioPlayerEl.currentTime = Math.max(0, audioPlayerEl.currentTime - 10);
});

document.getElementById("audioPlayerFwd10")?.addEventListener("click", () => {
    if (!audioPlayerEl) return;
    const max = audioPlayerEl.duration || 0;
    audioPlayerEl.currentTime = Math.min(max, audioPlayerEl.currentTime + 10);
});

if (audioPlayerEl) {
    audioPlayerEl.addEventListener("timeupdate", () => {
        if (audioSeeking) return;
        const cur = audioPlayerEl.currentTime || 0;
        const dur = audioPlayerEl.duration || 0;
        if (audioPlayerCurrent) audioPlayerCurrent.textContent = formatAudioTime(cur);
        if (audioPlayerDuration) audioPlayerDuration.textContent = formatAudioTime(dur);
        if (audioPlayerSeek && dur > 0) {
            audioPlayerSeek.value = (cur / dur) * 100;
        }
    });

    audioPlayerEl.addEventListener("loadedmetadata", () => {
        if (audioPlayerDuration) audioPlayerDuration.textContent = formatAudioTime(audioPlayerEl.duration || 0);
    });

    audioPlayerEl.addEventListener("ended", () => {
        updateAudioPlayIcon(false);
        if (audioPlayerSeek) audioPlayerSeek.value = 0;
        if (audioPlayerCurrent) audioPlayerCurrent.textContent = "0:00";
    });

    audioPlayerEl.addEventListener("play", () => updateAudioPlayIcon(true));
    audioPlayerEl.addEventListener("pause", () => updateAudioPlayIcon(false));
}

if (audioPlayerSeek && audioPlayerEl) {
    audioPlayerSeek.addEventListener("input", () => {
        audioSeeking = true;
        const dur = audioPlayerEl.duration || 0;
        const t = (parseFloat(audioPlayerSeek.value) / 100) * dur;
        if (audioPlayerCurrent) audioPlayerCurrent.textContent = formatAudioTime(t);
    });
    audioPlayerSeek.addEventListener("change", () => {
        const dur = audioPlayerEl.duration || 0;
        audioPlayerEl.currentTime = (parseFloat(audioPlayerSeek.value) / 100) * dur;
        audioSeeking = false;
    });
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && audioPlayerBackdrop?.classList.contains("visible")) {
        closeAudioPlayer();
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
        showToast("Please log in first.", "error");
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

/* =========================================================
   ONBOARDING TOUR
   A quick, 4-step spotlight walkthrough shown once per account
   on their very first visit - never again after that, and never
   shown mid-session if they've already seen it on this device.
========================================================= */
const ONBOARDING_STEPS = [
    {
        target: "#uploadBtn",
        title: "Add your first memory",
        text: "Upload anything - screenshots, PDFs, voice notes, docs - and OrganAIz automatically titles, summarizes, and tags it for you.",
        needsSidebar: true
    },
    {
        target: "#profileBtn",
        title: "Make it yours",
        text: "Click your avatar any time to change your display name or profile photo.",
        needsSidebar: false
    },
    {
        target: "#searchInput",
        title: "Search in plain language",
        text: "No need for exact keywords - just describe what you're looking for, like \"that recipe I saved last week.\"",
        needsSidebar: false
    },
    {
        target: ".sidebar .menu",
        title: "Everything, one click away",
        text: "Jump between Memories, Collections, and Trash from here - plus your Images, Audio, and Documents further down.",
        needsSidebar: true
    }
];

const onboardingBackdrop = document.getElementById("onboardingBackdrop");
const onboardingSpotlight = document.getElementById("onboardingSpotlight");
const onboardingTooltip = document.getElementById("onboardingTooltip");
const onboardingTooltipTitle = document.getElementById("onboardingTooltipTitle");
const onboardingTooltipText = document.getElementById("onboardingTooltipText");
const onboardingStepCount = document.getElementById("onboardingStepCount");
const onboardingNextBtn = document.getElementById("onboardingNextBtn");
const onboardingSkipBtn = document.getElementById("onboardingSkipBtn");

let onboardingIndex = 0;
let onboardingSeenKey = null;

function isMobileLayout() {
    return window.matchMedia("(max-width: 768px)").matches;
}

function getOnboardingSeenKey(userId) {
    return `organaiz-onboarding-seen-${userId || "anon"}`;
}

// Called once on every dashboard load - it's a no-op for anyone who has
// already completed or skipped the tour on this device.
async function maybeStartOnboardingTour() {
    if (!onboardingBackdrop) return;
    try {
        const { data: { user } } = await sbClient.auth.getUser();
        if (!user) return;
        const key = getOnboardingSeenKey(user.id);
        if (localStorage.getItem(key)) return;

        // Give the dashboard a moment to finish laying out real content
        // (cards, counts, etc.) before measuring anything's position.
        setTimeout(() => startOnboardingTour(key), 700);
    } catch (error) {
        console.error("Couldn't check onboarding status:", error);
    }
}

function startOnboardingTour(seenKey) {
    onboardingSeenKey = seenKey;
    onboardingIndex = 0;
    onboardingBackdrop.classList.add("visible");
    showOnboardingStep();
}

function showOnboardingStep() {
    const step = ONBOARDING_STEPS[onboardingIndex];
    if (!step) { endOnboardingTour(); return; }

    if (isMobileLayout()) {
        if (step.needsSidebar) openSidebar(); else closeSidebar();
    }

    // Let the sidebar drawer's slide animation finish before measuring
    setTimeout(() => positionOnboardingStep(step), isMobileLayout() ? 320 : 0);
}

function positionOnboardingStep(step) {
    const target = document.querySelector(step.target);
    if (!target) { onboardingIndex++; showOnboardingStep(); return; }

    const rect = target.getBoundingClientRect();
    const pad = 8;
    onboardingSpotlight.style.top = `${rect.top - pad}px`;
    onboardingSpotlight.style.left = `${rect.left - pad}px`;
    onboardingSpotlight.style.width = `${rect.width + pad * 2}px`;
    onboardingSpotlight.style.height = `${rect.height + pad * 2}px`;

    onboardingTooltipTitle.textContent = step.title;
    onboardingTooltipText.textContent = step.text;
    onboardingStepCount.textContent = `${onboardingIndex + 1} / ${ONBOARDING_STEPS.length}`;
    onboardingNextBtn.textContent = onboardingIndex === ONBOARDING_STEPS.length - 1 ? "Got it" : "Next";

    // Measure the tooltip's own size first, then decide which side of the
    // target it fits best on without spilling off the edge of the screen.
    onboardingTooltip.style.visibility = "hidden";
    onboardingTooltip.style.display = "block";
    const tw = onboardingTooltip.offsetWidth;
    const th = onboardingTooltip.offsetHeight;

    let top = rect.bottom + 18;
    if (top + th > window.innerHeight - 20) top = Math.max(20, rect.top - th - 18);

    let left = rect.left;
    if (left + tw > window.innerWidth - 20) left = window.innerWidth - tw - 20;
    if (left < 20) left = 20;

    onboardingTooltip.style.top = `${top}px`;
    onboardingTooltip.style.left = `${left}px`;
    onboardingTooltip.style.visibility = "visible";
}

function endOnboardingTour() {
    onboardingBackdrop.classList.remove("visible");
    onboardingTooltip.style.display = "none";
    if (isMobileLayout()) closeSidebar();
    if (onboardingSeenKey) localStorage.setItem(onboardingSeenKey, "1");
    onboardingSeenKey = null;
}

if (onboardingNextBtn) {
    onboardingNextBtn.addEventListener("click", () => {
        onboardingIndex++;
        showOnboardingStep();
    });
}
if (onboardingSkipBtn) {
    onboardingSkipBtn.addEventListener("click", endOnboardingTour);
}
window.addEventListener("resize", () => {
    if (onboardingBackdrop && onboardingBackdrop.classList.contains("visible")) {
        positionOnboardingStep(ONBOARDING_STEPS[onboardingIndex]);
    }
});

applyProfileToPage();
maybeStartOnboardingTour();