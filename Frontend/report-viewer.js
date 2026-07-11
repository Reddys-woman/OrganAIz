/* ===========================================================
   REPORT VIEWER
   Renders the OrganAIz report PDF as a stack of crisp canvases
   inside a custom-styled, smoothly scrollable card - deliberately
   not a raw <embed>/<iframe> PDF viewer with browser toolbar chrome.
=========================================================== */
(function () {
    const REPORT_URL = "assets/OrganAIz-Competitive-Landscape-Report.pdf";

    if (typeof pdfjsLib === "undefined") return;
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    const scrollEl = document.getElementById("reportScroll");
    const loadingEl = document.getElementById("reportLoading");
    if (!scrollEl) return;

    let rendered = false;

    async function renderReport() {
        if (rendered) return;
        rendered = true;

        try {
            const pdf = await pdfjsLib.getDocument(REPORT_URL).promise;
            const targetWidth = Math.min(scrollEl.clientWidth || 780, 900) * (window.devicePixelRatio > 1 ? 2 : 1.4);

            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const baseViewport = page.getViewport({ scale: 1 });
                const scale = targetWidth / baseViewport.width;
                const viewport = page.getViewport({ scale });

                const canvas = document.createElement("canvas");
                canvas.className = "report-page-canvas";
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                const context = canvas.getContext("2d");
                await page.render({ canvasContext: context, viewport }).promise;

                scrollEl.appendChild(canvas);
            }

            if (loadingEl) loadingEl.remove();

        } catch (error) {
            console.error("Failed to render report:", error);
            if (loadingEl) {
                loadingEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Couldn't load the report preview - use "Open the full report" below.`;
            }
        }
    }

    // Only load the (fairly heavy) PDF once it's actually about to scroll into view.
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                renderReport();
                observer.disconnect();
            }
        });
    }, { rootMargin: "400px" });

    observer.observe(scrollEl);
})();
