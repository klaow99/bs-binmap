/**
 * BS BINMAP - Application Script
 */

const SUPABASE_URL = 'https://oxmbkykllivbwgfwqctb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_GQ7oPb-T9han1h1I8Bs6Fg_VQaFLaNd';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const LS_CUSTOM_BINS = "bs_binmap_custom_bins_v1";

async function loadBinsFromSupabase() {
    const { data, error } = await supabaseClient
        .from('bins')
        .select('*')
        .order('id', { ascending: true });
    if (error) { console.error('loadBins error:', error); return []; }
    return data || [];
}

async function migrateLocalStorageToSupabase() {
    const existing = await loadBinsFromSupabase();
    if (existing.length > 0) return;
    const records = [];
    try {
        const customRaw = localStorage.getItem(LS_CUSTOM_BINS);
        const customBins = customRaw ? JSON.parse(customRaw) : [];
        customBins.forEach((cb) => {
            records.push({
                number: cb.number, type: cb.type, location: cb.location,
                lat_frac: cb.latFrac, lng_frac: cb.lngFrac,
                image: cb.image || "assets/" + String(cb.number).padStart(2, "0") + ".jpg"
            });
        });
    } catch (e) {}
    if (records.length > 0) {
        const { error } = await supabaseClient.from('bins').insert(records);
        if (error) console.error('Migration error:', error);
        else console.log('Migration complete:', records.length, 'bins');
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    await checkUserAuth();
    initMap();
    setupImageViewer();
    setupLocationModal();
    setupSidebarDrag();
});

function setupLocationModal() {
    const modal = document.getElementById("locationModal");
    const allowBtn = document.getElementById("locationAllowBtn");
    const denyBtn = document.getElementById("locationDenyBtn");
    if (!modal) return;
    const locationAsked = localStorage.getItem("bs_binmap_location_asked");
    if (!locationAsked) modal.style.display = "flex";
    if (allowBtn) {
        allowBtn.addEventListener("click", () => {
            localStorage.setItem("bs_binmap_location_asked", "1");
            modal.style.display = "none";
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => console.log("Location access granted:", pos.coords),
                    (err) => console.log("Location access denied:", err.message)
                );
            }
        });
    }
    if (denyBtn) {
        denyBtn.addEventListener("click", () => {
            localStorage.setItem("bs_binmap_location_asked", "1");
            modal.style.display = "none";
        });
    }
}

function setupSidebarDrag() {
    const sidebar = document.getElementById("sidebar");
    const handle = document.getElementById("sidebarDragHandle");
    if (!sidebar || !handle) return;
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    handle.addEventListener("mousedown", (e) => {
        isDragging = true;
        sidebar.classList.add("dragging");
        const rect = sidebar.getBoundingClientRect();
        startX = e.clientX; startY = e.clientY;
        startLeft = rect.left; startTop = rect.top;
        e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        sidebar.style.position = "fixed";
        sidebar.style.left = Math.max(0, Math.min(startLeft + e.clientX - startX, window.innerWidth - sidebar.offsetWidth)) + "px";
        sidebar.style.top = Math.max(0, Math.min(startTop + e.clientY - startY, window.innerHeight - sidebar.offsetHeight)) + "px";
        sidebar.style.right = "auto";
        sidebar.style.bottom = "auto";
    });
    document.addEventListener("mouseup", () => {
        if (isDragging) { isDragging = false; sidebar.classList.remove("dragging"); }
    });
}

function setupImageViewer() {
    const viewerModal = document.getElementById("imageViewerModal");
    const fullImg = document.getElementById("fullImage");
    const closeBtn = document.querySelector(".close-viewer-btn");
    document.addEventListener("click", (e) => {
        if (e.target.classList.contains("comment-image") || e.target.id === "imagePreview") {
            fullImg.src = e.target.src;
            viewerModal.style.display = "flex";
            viewerModal.style.opacity = "1";
        }
    });
    const closeModal = () => { viewerModal.style.display = "none"; fullImg.src = ""; };
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    viewerModal.addEventListener("click", (e) => { if (e.target === viewerModal) closeModal(); });
}

async function checkUserAuth() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const authButtonsDiv = document.querySelector(".auth-buttons");
    if (user) {
        document.body.classList.add("is-authed");
        const cached = getCachedProfile();

        function renderHeader(name, avatarUrl) {
            const initials = (name || 'User').charAt(0).toUpperCase();
            let avatarHtml;
            if (avatarUrl) {
                avatarHtml = `<span class="profile-avatar-sm" style="background-image:url(${avatarUrl});background-size:cover;background-position:center;"></span>`;
            } else {
                avatarHtml = `<span class="profile-avatar-sm">${initials}</span>`;
            }
            authButtonsDiv.innerHTML = `
                <div class="profile-trigger" id="profileTrigger">
                    ${avatarHtml}
                    <span class="user-display-name">${name || 'User'}</span>
                </div>
            `;
            document.getElementById('profileTrigger').addEventListener('click', openProfileModal);
        }

        if (cached) {
            renderHeader(cached.name, cached.avatarUrl);
        }

        const { profile, avatarUrl } = await fetchProfileFromDB(user.id);
        const userName = profile?.full_name || cached?.name || 'User';
        const finalAvatar = avatarUrl || cached?.avatarUrl || null;

        cacheProfile(userName, finalAvatar);
        renderHeader(userName, finalAvatar);
    }
}

function initMap() {
    const imageUrl = "assets/BSMAP.jpg";
    const allMarkers = [];

    const map = L.map("map", {
        crs: L.CRS.Simple,
        minZoom: -2, maxZoom: 2,
        zoomControl: false, attributionControl: false
    });

    function createCustomIcon(type) {
        let color = "#1976D2";
        if (type === "ขยะเปียก") color = "#2E7D32";
        if (type === "ขยะรีไซเคิล") color = "#FBC02D";
        if (type === "ขยะอันตราย") color = "#D32F2F";
        return L.divIcon({
            className: "custom-bin-marker-inner",
            html: `<div class="custom-bin-marker-wrapper" style="width:22px;height:30px;position:relative;display:flex;justify-content:center;">
                <div style="width:22px;height:22px;background:${color};border:2.5px solid white;border-radius:50%;box-shadow:0 3px 10px rgba(0,0,0,0.2);position:relative;">
                    <div style="position:absolute;left:50%;bottom:-9px;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${color};"></div>
                </div></div>`,
            iconSize: [22, 42], iconAnchor: [11, 36]
        });
    }

    const img = new Image();
    img.src = imageUrl;

    img.onload = async function () {
        const w = this.naturalWidth;
        const h = this.naturalHeight;
        const bounds = [[0, 0], [h, w]];
        L.imageOverlay(imageUrl, bounds).addTo(map);
        map.fitBounds(bounds);
        const fitZoom = map.getBoundsZoom(bounds);
        map.setZoom(fitZoom);
        map.setMinZoom(fitZoom - 1);
        map.setMaxBounds(bounds);
        setTimeout(() => { map.invalidateSize(); map.fitBounds(bounds); }, 200);

        await migrateLocalStorageToSupabase();
        const allBins = await loadBinsFromSupabase();
        allBins.forEach((bin) => {
            const lat = h * bin.lat_frac;
            const lng = w * bin.lng_frac;
            const marker = L.marker([lat, lng], { icon: createCustomIcon(bin.type) }).addTo(map);
            const binData = {
                id: bin.id, title: "ถังขยะ #" + bin.number,
                type: bin.type, location: bin.location, update: "ข้อมูลจริง",
                image: bin.image || "assets/" + String(bin.number).padStart(2, "0") + ".jpg",
                number: bin.number
            };
            allMarkers.push({ marker, keywords: [bin.location, bin.type, bin.number], data: binData });
            bindMarkerEvents(marker, binData);
        });

        // ── Search helpers: normalize, synonyms, escape, debounce ──
        function escapeHtml(str) {
            return String(str == null ? "" : str)
                .replace(/&/g, "&amp;").replace(/</g, "&lt;")
                .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        }
        function normalizeText(s) {
            return String(s == null ? "" : s).toLowerCase().trim().replace(/\s+/g, " ");
        }
        function debounce(fn, ms) {
            let t; return function() { const a = arguments, ctx = this; clearTimeout(t); t = setTimeout(() => fn.apply(ctx, a), ms); };
        }

        const TYPE_DEFS = [
            { canonical: "ขยะเปียก", color: "green", synonyms: ["ขยะเปียก","เปียก","wet","organic"] },
            { canonical: "ขยะรีไซเคิล", color: "yellow", synonyms: ["ขยะรีไซเคิล","รีไซเคิล","recycle","recycling","รีไซเคิล"] },
            { canonical: "ขยะทั่วไป", color: "blue", synonyms: ["ขยะทั่วไป","ทั่วไป","general"] },
            { canonical: "ขยะอันตราย", color: "red", synonyms: ["ขยะอันตราย","อันตราย","hazardous"] }
        ];
        function getCanonicalType(normalized) {
            const n = normalizeText(normalized);
            for (const def of TYPE_DEFS) {
                for (const syn of def.synonyms) {
                    if (normalizeText(syn) === n) return def.canonical;
                }
            }
            return null;
        }
        function isTypeSynonymMatch(binType, queryNorm) {
            const q = normalizeText(queryNorm);
            const binDef = TYPE_DEFS.find(d => d.canonical === binType);
            if (!binDef) return false;
            for (const syn of binDef.synonyms) {
                const s = normalizeText(syn);
                if (s === q || s.includes(q) || q.includes(s)) return true;
            }
            if (normalizeText(binType).includes(q) || q.includes(normalizeText(binType))) return true;
            return false;
        }
        function computeRelevanceScore(binData, queryRaw) {
            const qNorm = normalizeText(queryRaw);
            if (!qNorm) return 0;
            const dType = binData.type || "";
            const dLocNorm = normalizeText(binData.location);
            const dTitleNorm = normalizeText(binData.title);
            const dTypeNorm = normalizeText(dType);
            const dNumStr = String(binData.number);
            const dNumPad = String(binData.number).padStart(2, "0");
            const qDigits = qNorm.replace(/\D/g, "");
            const qCanon = getCanonicalType(qNorm);
            let score = 0;
            // 1. Exact bin number match (highest)
            if (qDigits) {
                const qNumNorm = String(parseInt(qDigits, 10));
                const qPad = qDigits.padStart(2, "0");
                const isExactNum = (dNumStr === qDigits) || (dNumPad === qDigits) || (dNumStr === qNumNorm) || (dNumPad === qPad) || (dNumStr === qDigits.replace(/^0+/, "")) ;
                // also handle "ถัง 01" -> digits "01" should match bin 1 exactly; treat padded comparison
                const exactViaPad = (dNumPad === qDigits) || (dNumPad === qPad);
                const exactViaInt = qNumNorm && dNumStr === qNumNorm;
                if (exactViaPad || exactViaInt || isExactNum) {
                    // require query is mostly digits or "ถัง <num>"
                    const qWithoutDigits = qNorm.replace(/[0-9]/g, "").trim();
                    const isNumberQuery = qWithoutDigits === "" || qWithoutDigits === "ถัง" || qWithoutDigits === "ถังขยะ" || qWithoutDigits === "bin" || qWithoutDigits === "ถังขยะ #";
                    if (qWithoutDigits === "" || isNumberQuery || qDigits.length >= 1 && qNorm.length <= 8) {
                        // boost but ensure not false positive for "010" vs "10" handled above
                        if (exactViaPad || exactViaInt) score = Math.max(score, 100);
                    }
                }
            }
            // 2. Exact bin type match via canonical
            if (qCanon && qCanon === dType) score = Math.max(score, 90);
            // 3. Exact location match
            if (dLocNorm && dLocNorm === qNorm) score = Math.max(score, 80);
            // 4. Partial type match (synonym aware)
            if (isTypeSynonymMatch(dType, qNorm)) {
                // if already exact type (90) don't downgrade
                if (score < 60) score = Math.max(score, 60);
                // if q is substring of canonical type but not exact canonical, keep 60
            } else if (dTypeNorm.includes(qNorm) || qNorm.includes(dTypeNorm)) {
                score = Math.max(score, 60);
            }
            // 5. Partial location match
            if (dLocNorm && dLocNorm.includes(qNorm)) score = Math.max(score, 50);
            // 6. Title match
            if (dTitleNorm && dTitleNorm.includes(qNorm)) score = Math.max(score, 30);
            // 7. Number partial match (only if not already exact)
            if (qDigits && score < 100) {
                if (dNumStr.includes(qDigits) || dNumPad.includes(qDigits)) score = Math.max(score, 20);
            }
            return score;
        }

        // ── MapActions: safe, bounded highlight / pan / zoom ──
        const highlightedMarkers = new Set();
        function applyHighlightClass(marker, cls) {
            const el = marker.getElement();
            if (!el) return;
            const wrap = el.querySelector(".custom-bin-marker-wrapper");
            if (wrap) wrap.classList.add(cls);
        }
        function removeHighlightClass(marker, cls) {
            const el = marker.getElement();
            if (!el) return;
            const wrap = el.querySelector(".custom-bin-marker-wrapper");
            if (wrap) wrap.classList.remove(cls);
        }
        function MapActions_CLEAR_ALL() {
            highlightedMarkers.forEach(m => {
                m.setZIndexOffset(0);
                removeHighlightClass(m, "marker-selected");
                removeHighlightClass(m, "marker-multi");
            });
            highlightedMarkers.clear();
        }
        // legacy name kept for locateBtn compatibility
        function clearHighlight() { MapActions_CLEAR_ALL(); }
        function MapActions_HIGHLIGHT_BINS(markers) {
            MapActions_CLEAR_ALL();
            markers.forEach(m => {
                m.setZIndexOffset(1000);
                applyHighlightClass(m, "marker-multi");
                if (m.bringToFront) try { m.bringToFront(); } catch(e) {}
            });
            markers.forEach(m => highlightedMarkers.add(m));
        }
        function MapActions_HIGHLIGHT_SINGLE_BIN(marker) {
            MapActions_CLEAR_ALL();
            marker.setZIndexOffset(1000);
            applyHighlightClass(marker, "marker-selected");
            if (marker.bringToFront) try { marker.bringToFront(); } catch(e) {}
            highlightedMarkers.add(marker);
        }
        function MapActions_PAN_TO(marker) {
            const targetZoom = Math.min(map.getMaxZoom(), Math.max(map.getZoom(), fitZoom + 1.5));
            map.flyTo(marker.getLatLng(), targetZoom, { duration: 0.8 });
        }
        function MapActions_FIT_BOUNDS(markers) {
            if (!markers || markers.length === 0) return;
            if (markers.length === 1) { MapActions_PAN_TO(markers[0]); return; }
            const group = L.featureGroup(markers);
            const b = group.getBounds();
            if (b.isValid()) {
                map.flyToBounds(b, { padding: [40, 40], maxZoom: Math.min(map.getMaxZoom(), fitZoom + 1), duration: 0.8 });
            }
        }
        function MapActions_OPEN_BIN_DETAIL(marker, data) {
            marker.fire("click");
        }
        function MapActions_RESET_VIEW() {
            MapActions_CLEAR_ALL();
            map.flyToBounds(bounds, { duration: 0.8 });
        }
        // keep original highlightMarker for backward compat (single)
        function highlightMarker(marker) {
            MapActions_HIGHLIGHT_SINGLE_BIN(marker);
            MapActions_PAN_TO(marker);
        }

        const searchInput = document.getElementById("searchInput");
        const searchBtn = document.getElementById("searchBtn");
        const searchStatus = document.getElementById("searchStatus");
        const searchStatusText = document.querySelector("#searchStatus .search-status-text");
        const searchSuggestions = document.getElementById("searchSuggestions");
        const searchResults = document.getElementById("searchResults");

        function getTypeColor(type) {
            const def = TYPE_DEFS.find(d => d.canonical === type);
            if (def) return def.color;
            if (type === "ขยะเปียก") return "green";
            if (type === "ขยะรีไซเคิล") return "yellow";
            if (type === "ขยะอันตราย") return "red";
            return "blue";
        }

        function showSearchStatus(message) {
            if (searchStatusText) searchStatusText.textContent = message || "";
            if (!searchStatus) return;
            searchStatus.classList.remove("search-status-enter");
            searchStatus.style.display = "flex";
            void searchStatus.offsetWidth;
            searchStatus.classList.add("search-status-enter");
        }

        function hideSearchResults() {
            if (searchResults) searchResults.style.display = "none";
        }

        function renderSearchResults(query) {
            if (!query || !searchResults) { hideSearchResults(); MapActions_CLEAR_ALL(); if (searchStatus) searchStatus.style.display = "none"; return; }
            const qNorm = normalizeText(query);
            const scored = allMarkers.map(item => ({ item, score: computeRelevanceScore(item.data, query) }))
                .filter(x => x.score > 0)
                .sort((a, b) => b.score - a.score || String(a.item.data.number).localeCompare(String(b.item.data.number)));
            const matches = scored.map(x => x.item);
            if (matches.length === 0) {
                searchResults.innerHTML = '<div class="search-no-result">ไม่พบถังขยะที่ตรงกับคำค้นนี้</div>';
                searchResults.style.display = "block";
                MapActions_CLEAR_ALL();
                if (searchStatus) searchStatus.style.display = "none";
                return;
            }
            // highlight all matching bins (multi) and frame map (debounced caller handles fit)
            MapActions_HIGHLIGHT_BINS(matches.map(m => m.marker));
            // fit bounds without excessive zoom
            MapActions_FIT_BOUNDS(matches.map(m => m.marker));
            if (searchStatus) {
                const locSummary = matches.length === 1 ? (matches[0].data.location || "") : matches.length + " จุด";
                showSearchStatus("พบ " + matches.length + " ถังขยะ" + (matches.length === 1 ? " #" + escapeHtml(String(matches[0].data.number)) + " (" + escapeHtml(locSummary) + ")" : " (" + escapeHtml(locSummary) + ")"));
            }
            searchResults.innerHTML = matches.map((item) => {
                const d = item.data;
                const c = getTypeColor(d.type);
                return `<div class="search-result-item" data-marker-id="${escapeHtml(String(d.id))}">
                    <span class="search-result-dot ${escapeHtml(c)}"></span>
                    <div class="search-result-info">
                        <span class="search-result-name">${escapeHtml(d.title || "ถังขยะ")}</span>
                        <span class="search-result-detail">${escapeHtml(d.location || "-")} | #${escapeHtml(String(d.number || "?"))}</span>
                    </div>
                    <span class="search-result-type ${escapeHtml(c)}">${escapeHtml(d.type || "-")}</span>
                </div>`;
            }).join("");
            searchResults.style.display = "block";
            searchResults.querySelectorAll(".search-result-item").forEach((el) => {
                el.addEventListener("click", () => {
                    const markerId = el.dataset.markerId;
                    const found = allMarkers.find((m) => String(m.data.id) === String(markerId));
                    if (found) {
                        MapActions_HIGHLIGHT_SINGLE_BIN(found.marker);
                        MapActions_PAN_TO(found.marker);
                        MapActions_OPEN_BIN_DETAIL(found.marker, found.data);
                        showSearchStatus("พบถังขยะ #" + escapeHtml(String(found.data.number || "")) + " (" + escapeHtml(String(found.data.location || "")) + ")");
                    }
                    hideSearchResults();
                    if (searchInput) searchInput.blur();
                });
            });
        }

        const debouncedRender = debounce((q) => {
            if (q && q.length >= 1) renderSearchResults(q);
            else { hideSearchResults(); MapActions_CLEAR_ALL(); if (searchStatus) searchStatus.style.display = "none"; }
        }, 180);
        if (searchInput) {
            searchInput.addEventListener("input", () => {
                const q = searchInput.value.trim();
                if (searchStatus) searchStatus.style.display = "none";
                if (q.length >= 1) debouncedRender(q);
                else { hideSearchResults(); MapActions_CLEAR_ALL(); if (searchStatus) searchStatus.style.display = "none"; }
            });
            searchInput.addEventListener("focus", () => {
                const q = searchInput.value.trim();
                if (q.length >= 1) renderSearchResults(q);
                else if (searchSuggestions) searchSuggestions.classList.add("show");
            });
            searchInput.addEventListener("blur", () => {
                setTimeout(() => {
                    hideSearchResults();
                    if (searchSuggestions) searchSuggestions.classList.remove("show");
                }, 220);
            });
            searchInput.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    const q = searchInput.value.trim();
                    if (q) renderSearchResults(q);
                }
            });
        }

        document.addEventListener("click", (e) => {
            const insideBox = e.target.closest(".search-box");
            const insideResults = e.target.closest(".search-results-dropdown");
            const insideSuggestions = e.target.closest(".search-suggestions");
            if (!insideBox && !insideResults && !insideSuggestions) {
                hideSearchResults();
            }
        });

        if (searchBtn) searchBtn.addEventListener("click", () => {
            const q = (searchInput.value || "").trim();
            if (q) renderSearchResults(q);
            else { hideSearchResults(); MapActions_CLEAR_ALL(); if (searchStatus) searchStatus.style.display = "none"; }
        });

        if (searchSuggestions) {
            searchSuggestions.querySelectorAll(".suggest-chip").forEach((chip) => {
                chip.addEventListener("click", () => {
                    searchInput.value = chip.dataset.query || "";
                    searchSuggestions.classList.remove("show");
                    const q = searchInput.value.trim();
                    if (q) renderSearchResults(q);
                });
            });
        }

        const zoomInBtn = document.getElementById("zoomInBtn");
        const zoomOutBtn = document.getElementById("zoomOutBtn");
        const locateBtn = document.getElementById("locateBtn");
        if (zoomInBtn) zoomInBtn.addEventListener("click", () => map.zoomIn());
        if (zoomOutBtn) zoomOutBtn.addEventListener("click", () => map.zoomOut());
        if (locateBtn) locateBtn.addEventListener("click", () => { MapActions_RESET_VIEW(); if (searchStatus) searchStatus.style.display = "none"; hideSearchResults(); });

        function checkEmptyComments() {
            const commentsDiv = document.getElementById("binComments");
            if (commentsDiv.children.length === 0) {
                commentsDiv.innerHTML = `<div class="empty-comment-placeholder">ยังไม่มีความคิดเห็น</div>`;
            }
        }

        async function loadComments(binId) {
            const commentsDiv = document.getElementById("binComments");
            commentsDiv.innerHTML = "";

            const { data: comments, error } = await supabaseClient
                .from('comments')
                .select('*')
                .eq('bin_id', binId)
                .order('created_at', { ascending: true });

            if (error || !comments || comments.length === 0) {
                checkEmptyComments();
                return;
            }

            comments.forEach(c => {
                const commentEl = createCommentElement(c.user_name, c.text, c.image_url, c.created_at);
                commentsDiv.appendChild(commentEl);
            });
            commentsDiv.scrollTop = commentsDiv.scrollHeight;
        }

        function createCommentElement(userName, text, imageUrl, createdAt) {
            const card = document.createElement("div");
            card.className = "comment-card";
            let imageHtml = imageUrl ? `<img src="${imageUrl}" class="comment-image" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;margin-bottom:8px;cursor:pointer;">` : "";
            const timeStr = createdAt ? formatTimeAgo(new Date(createdAt)) : "เมื่อสักครู่";
            card.innerHTML = `
                <div style="width:30px;height:30px;background:#cbd5e0;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;color:white;">
                        <path fill-rule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clip-rule="evenodd" />
                    </svg>
                </div>
                <div class="comment-main">
                    <div class="comment-user-info"><span class="username">${userName}</span><span class="comment-time">${timeStr}</span></div>
                    ${imageHtml}
                    <span class="comment-text">${text}</span>
                </div>`;
            return card;
        }

        function formatTimeAgo(date) {
            const now = new Date();
            const diffMs = now - date;
            const diffSec = Math.floor(diffMs / 1000);
            const diffMin = Math.floor(diffSec / 60);
            const diffHr = Math.floor(diffMin / 60);
            const diffDay = Math.floor(diffHr / 24);
            if (diffSec < 60) return "เมื่อสักครู่";
            if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
            if (diffHr < 24) return `${diffHr} ชั่วโมงที่แล้ว`;
            if (diffDay < 7) return `${diffDay} วันที่แล้ว`;
            return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
        }

        let currentBinId = null;
        function bindMarkerEvents(marker, data) {
            marker.on("click", (e) => {
                L.DomEvent.stopPropagation(e);
                currentBinId = data.id;
                document.getElementById("sidebarPlaceholder").style.display = "none";
                document.getElementById("sidebarContent").classList.add("show");
                document.getElementById("binTitle").textContent = data.title || "ถังขยะ";
                document.getElementById("binType").textContent = data.type;
                document.getElementById("binLocation").textContent = data.location;
                document.getElementById("binUpdate").textContent = data.update;
                document.getElementById("binImage").src = data.image;
                const binImg = document.getElementById("binImage");
                const binPlaceholder = binImg.nextElementSibling;
                if (data.image) {
                    binImg.style.display = "block";
                    if (binPlaceholder) binPlaceholder.style.display = "none";
                } else {
                    binImg.style.display = "none";
                    if (binPlaceholder) binPlaceholder.style.display = "flex";
                }
                loadComments(data.id);
            });
        }

        document.querySelector(".close-sidebar-btn").addEventListener("click", () => {
            document.getElementById("sidebarContent").classList.remove("show");
            setTimeout(() => { document.getElementById("sidebarPlaceholder").style.display = "flex"; }, 400);
        });

        const feedbackBox = document.querySelector(".combined-feedback-box");
        if (feedbackBox) {
            const submitBtn = feedbackBox.querySelector(".submit-report-btn");
            const reportInput = feedbackBox.querySelector(".report-input");
            const uploadBtn = feedbackBox.querySelector("#uploadImageBtn");
            const imageInput = feedbackBox.querySelector("#imageInput");
            const previewContainer = feedbackBox.querySelector("#imagePreviewContainer");
            const previewImg = feedbackBox.querySelector("#imagePreview");
            const removeImgBtn = feedbackBox.querySelector("#removeImageBtn");

            if (uploadBtn && imageInput) {
                uploadBtn.addEventListener("click", async () => {
                    const { data: { user } } = await supabaseClient.auth.getUser();
                    if (!user) { alert("กรุณาเข้าสู่ระบบก่อนอัปโหลดรูปภาพ"); window.location.href = 'login.html'; return; }
                    imageInput.click();
                });
            }
            if (imageInput) {
                imageInput.addEventListener("change", () => {
                    const file = imageInput.files[0];
                    if (file) {
                        if (!file.type.startsWith("image/")) { alert("กรุณาเลือกไฟล์รูปภาพเท่านั้น"); imageInput.value = ""; return; }
                        if (file.size > 5 * 1024 * 1024) { alert("ไฟล์ใหญ่เกิน 5MB"); imageInput.value = ""; return; }
                        const reader = new FileReader();
                        reader.onload = (e) => { previewImg.src = e.target.result; previewContainer.style.display = "flex"; };
                        reader.readAsDataURL(file);
                    }
                });
            }
            if (removeImgBtn) {
                removeImgBtn.addEventListener("click", () => { imageInput.value = ""; previewContainer.style.display = "none"; previewImg.src = ""; });
            }
            if (submitBtn && reportInput) {
                let isSubmitting = false;
                const setSubmitting = (v) => {
                    isSubmitting = v;
                    submitBtn.disabled = v;
                    submitBtn.textContent = v ? "กำลังโพสต์..." : "โพสต์ความคิดเห็น";
                    submitBtn.style.opacity = v ? "0.7" : "1";
                    submitBtn.style.pointerEvents = v ? "none" : "auto";
                };
                submitBtn.addEventListener("click", async () => {
                    if (isSubmitting) return;
                    const text = reportInput.value.trim();
                    const imageFile = imageInput.files[0] || null;
                    // 1. validate
                    if (text === "" && !imageFile) return;
                    if (text.length > 500) { alert("ความคิดเห็นยาวเกิน 500 ตัวอักษร"); return; }
                    if (!currentBinId) { alert("กรุณาเลือกถังขยะก่อนโพสต์ความคิดเห็น"); return; }
                    // 2. get authenticated user
                    const { data: { user } } = await supabaseClient.auth.getUser();
                    if (!user) { alert("กรุณาเข้าสู่ระบบก่อนโพสต์ความคิดเห็น"); window.location.href = 'login.html'; return; }
                    setSubmitting(true);
                    let uploadedImageUrl = null;
                    try {
                        // 3. fetch display name (keep existing structure)
                        let displayUserName = 'User';
                        try {
                            const { data: profile } = await supabaseClient.from('profiles').select('full_name').eq('id', user.id).single();
                            displayUserName = profile?.full_name || user.email || 'User';
                        } catch (e) { displayUserName = user.email || 'User'; }
                        // 4. upload image if attached (existing bucket/flow)
                        if (imageFile) {
                            const fileExt = (imageFile.name.split('.').pop() || 'jpg').toLowerCase();
                            const fileName = `${user.id}/${Date.now()}.${fileExt}`;
                            const { error: uploadError } = await supabaseClient.storage.from('bin-images').upload(fileName, imageFile);
                            if (uploadError) throw new Error("อัปโหลดรูปภาพล้มเหลว: " + uploadError.message);
                            const { data: publicUrlData } = supabaseClient.storage.from('bin-images').getPublicUrl(fileName);
                            uploadedImageUrl = publicUrlData.publicUrl;
                        }
                        // 5. insert into comments table (only after upload succeeds)
                        const basePayload = {
                            bin_id: currentBinId,
                            user_name: displayUserName,
                            text: text,
                            image_url: uploadedImageUrl
                        };
                        // include user_id if schema has it (optional, ignore if column missing)
                        const payloadWithUser = { ...basePayload, user_id: user.id };
                        let insertResult = await supabaseClient.from('comments').insert(payloadWithUser).select();
                        if (insertResult.error) {
                            const msg = String(insertResult.error.message || "");
                            // fallback without user_id if column does not exist
                            if (msg.includes("user_id") || msg.includes("column") || insertResult.error.code === "PGRST204") {
                                insertResult = await supabaseClient.from('comments').insert(basePayload).select();
                            }
                        }
                        // fallback for alternative column names
                        if (insertResult.error) {
                            const msg = String(insertResult.error.message || "");
                            if (msg.includes("Could not find the table")) {
                                throw new Error("ตาราง comments ยังไม่มีใน Supabase — กรุณารัน SQL สร้างตารางก่อน (ดูรายงาน)");
                            }
                            throw new Error(insertResult.error.message);
                        }
                        // 6. only show UI after DB success
                        reportInput.value = "";
                        imageInput.value = "";
                        previewImg.src = "";
                        previewContainer.style.display = "none";
                        // reload from DB to keep ordering (created_at ASC) as loadComments does
                        await loadComments(currentBinId);
                    } catch (err) {
                        console.error("comment insert error:", err);
                        alert("เกิดข้อผิดพลาดในการบันทึกความคิดเห็น: " + (err.message || String(err)));
                    } finally {
                        setSubmitting(false);
                    }
                });
                reportInput.addEventListener("keypress", (e) => { if (e.key === "Enter" && !isSubmitting) submitBtn.click(); });
            }
        }
    };
}

/* ============================================================
   PROFILE MODAL SYSTEM
   ============================================================ */
let currentProfileData = null;
let pendingAvatarFile = null;
const LS_PROFILE_CACHE = "bs_binmap_profile_cache";

function cacheProfile(name, avatarUrl) {
    try {
        localStorage.setItem(LS_PROFILE_CACHE, JSON.stringify({ name, avatarUrl }));
    } catch (e) {}
}

function getCachedProfile() {
    try {
        const raw = localStorage.getItem(LS_PROFILE_CACHE);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function openProfileModal() {
    const modal = document.getElementById('profileModal');
    modal.style.display = 'flex';
    loadProfileData();
}

function closeProfileModal() {
    document.getElementById('profileModal').style.display = 'none';
}

function openProfileEditModal() {
    closeProfileModal();
    const editModal = document.getElementById('profileEditModal');
    editModal.style.display = 'flex';
    populateEditForm();
}

function closeProfileEditModal() {
    document.getElementById('profileEditModal').style.display = 'none';
    pendingAvatarFile = null;
    const editAvatar = document.getElementById('editProfileAvatar');
    editAvatar.style.backgroundImage = '';
    editAvatar.textContent = currentProfileData?.name?.charAt(0).toUpperCase() || 'U';
}

function renderAvatar(element, avatarUrl, fallbackText) {
    if (!element) return;
    if (avatarUrl) {
        element.style.backgroundImage = `url(${avatarUrl})`;
        element.style.backgroundSize = 'cover';
        element.style.backgroundPosition = 'center';
        element.textContent = '';
    } else {
        element.style.backgroundImage = '';
        element.textContent = fallbackText || 'U';
    }
}

function updateHeaderProfile(name, avatarUrl) {
    const trigger = document.querySelector('.profile-trigger');
    if (!trigger) return;
    const avatarSm = trigger.querySelector('.profile-avatar-sm');
    const nameEl = trigger.querySelector('.user-display-name');
    if (avatarSm) renderAvatar(avatarSm, avatarUrl, name?.charAt(0).toUpperCase() || 'U');
    if (nameEl && name) nameEl.textContent = name;
}

async function fetchProfileFromDB(userId) {
    let profile = null;
    let avatarUrl = null;

    const { data: p1, error: e1 } = await supabaseClient
        .from('profiles').select('full_name, avatar_url').eq('id', userId).single();
    if (!e1 && p1) {
        profile = p1;
        avatarUrl = p1.avatar_url || null;
    } else {
        const { data: p2 } = await supabaseClient
            .from('profiles').select('full_name').eq('id', userId).single();
        if (p2) profile = p2;
    }

    return { profile, avatarUrl };
}

async function loadProfileData() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const { profile, avatarUrl } = await fetchProfileFromDB(user.id);
    const name = profile?.full_name || 'User';

    cacheProfile(name, avatarUrl);
    currentProfileData = { user, name, avatarUrl };

    document.getElementById('modalProfileName').textContent = name;
    document.getElementById('modalProfileFullName').textContent = name;
    document.getElementById('modalProfileEmail').textContent = user.email;
    document.getElementById('modalProfileEmailValue').textContent = user.email;

    renderAvatar(document.getElementById('modalProfileAvatar'), avatarUrl, name.charAt(0).toUpperCase());

    const created = new Date(user.created_at);
    document.getElementById('modalProfileJoined').textContent = created.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

    updateHeaderProfile(name, avatarUrl);
}

function setupAvatarUpload(inputId, wrapId, previewId) {
    const input = document.getElementById(inputId);
    const wrap = document.getElementById(wrapId);

    wrap.addEventListener('click', () => input.click());

    input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;

        if (inputId === 'editAvatarInput') {
            pendingAvatarFile = file;
            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = document.getElementById(previewId);
                preview.style.backgroundImage = `url(${e.target.result})`;
                preview.style.backgroundSize = 'cover';
                preview.style.backgroundPosition = 'center';
                preview.textContent = '';
            };
            reader.readAsDataURL(file);
        } else {
            uploadAvatar(file);
        }
    });
}

async function uploadAvatar(file) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const fileExt = file.name.split('.').pop();
    const fileName = `avatars/${user.id}.${fileExt}`;

    const { error: uploadError } = await supabaseClient.storage
        .from('bin-images').upload(fileName, file, { upsert: true });

    if (uploadError) {
        alert('เกิดข้อผิดพลาดในการอัปโหลด: ' + uploadError.message);
        return;
    }

    const { data: urlData } = supabaseClient.storage
        .from('bin-images').getPublicUrl(fileName);

    const avatarUrl = urlData.publicUrl + '?t=' + Date.now();

    currentProfileData.avatarUrl = avatarUrl;
    const name = currentProfileData.name;

    cacheProfile(name, avatarUrl);
    renderAvatar(document.getElementById('modalProfileAvatar'), avatarUrl, name.charAt(0).toUpperCase());
    updateHeaderProfile(name, avatarUrl);

    supabaseClient
        .from('profiles')
        .upsert({ id: user.id, avatar_url: avatarUrl }, { onConflict: 'id' })
        .then(() => {})
        .catch(() => {});
}

async function populateEditForm() {
    if (!currentProfileData) await loadProfileData();
    if (!currentProfileData) return;

    document.getElementById('editName').value = currentProfileData.name || '';
    document.getElementById('editEmail').value = currentProfileData.user.email || '';

    renderAvatar(
        document.getElementById('editProfileAvatar'),
        currentProfileData.avatarUrl,
        currentProfileData.name?.charAt(0).toUpperCase() || 'U'
    );
}

function setupProfileModals() {
    const profileModal = document.getElementById('profileModal');
    const profileEditModal = document.getElementById('profileEditModal');

    document.getElementById('closeProfileModal').addEventListener('click', closeProfileModal);
    document.getElementById('closeProfileEditModal').addEventListener('click', closeProfileEditModal);
    document.getElementById('modalEditProfileBtn').addEventListener('click', openProfileEditModal);

    profileModal.addEventListener('click', (e) => { if (e.target === profileModal) closeProfileModal(); });
    profileEditModal.addEventListener('click', (e) => { if (e.target === profileEditModal) closeProfileEditModal(); });

    document.getElementById('modalLogoutBtn').addEventListener('click', async () => {
        localStorage.removeItem(LS_PROFILE_CACHE);
        await supabaseClient.auth.signOut();
        window.location.reload();
    });

    setupAvatarUpload('avatarInput', 'profileAvatarWrap', 'modalProfileAvatar');
    setupAvatarUpload('editAvatarInput', 'editAvatarWrap', 'editProfileAvatar');

    document.getElementById('editProfileForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newName = document.getElementById('editName').value.trim();
        const newPass = document.getElementById('newPassword').value;
        const confirmPass = document.getElementById('confirmPassword').value;
        const statusEl = document.getElementById('profileSaveStatus');
        const saveBtn = document.getElementById('saveProfileBtn');

        if (!newName) { alert('กรุณากรอกชื่อเต็ม'); return; }
        if (newPass && newPass !== confirmPass) {
            alert('รหัสผ่านไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง'); return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'กำลังบันทึก...';
        statusEl.style.display = 'none';

        const oldName = currentProfileData?.name;
        const oldAvatar = currentProfileData?.avatarUrl;

        cacheProfile(newName, oldAvatar);
        currentProfileData = { ...currentProfileData, name: newName };
        updateHeaderProfile(newName, oldAvatar);

        let errors = [];

        if (pendingAvatarFile) {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (user) {
                const fileExt = pendingAvatarFile.name.split('.').pop();
                const fileName = `avatars/${user.id}.${fileExt}`;
                const { error: uploadErr } = await supabaseClient.storage
                    .from('bin-images').upload(fileName, pendingAvatarFile, { upsert: true });
                if (uploadErr) {
                    errors.push('รูปโปรไฟล์: ' + uploadErr.message);
                } else {
                    const { data: urlData } = supabaseClient.storage
                        .from('bin-images').getPublicUrl(fileName);
                    const avatarUrl = urlData.publicUrl + '?t=' + Date.now();
                    currentProfileData.avatarUrl = avatarUrl;
                    cacheProfile(newName, avatarUrl);
                    updateHeaderProfile(newName, avatarUrl);
                    supabaseClient
                        .from('profiles')
                        .upsert({ id: user.id, avatar_url: avatarUrl }, { onConflict: 'id' })
                        .then(() => {}).catch(() => {});
                }
            }
        }

        supabaseClient
            .from('profiles')
            .upsert({ id: currentProfileData.user.id, full_name: newName }, { onConflict: 'id' })
            .then(({ error }) => { if (error) console.error('Name sync error:', error); })
            .catch(() => {});

        if (newPass) {
            const { error: passError } = await supabaseClient.auth.updateUser({ password: newPass });
            if (passError) errors.push('รหัสผ่าน: ' + passError.message);
        }

        saveBtn.disabled = false;
        saveBtn.textContent = 'บันทึกการแก้ไข';

        if (errors.length > 0) {
            statusEl.textContent = 'เกิดข้อผิดพลาด: ' + errors.join(', ');
            statusEl.style.display = 'block';
            statusEl.className = 'profile-save-status profile-save-error';
        } else {
            statusEl.textContent = 'บันทึกสำเร็จ!';
            statusEl.style.display = 'block';
            statusEl.className = 'profile-save-status profile-save-success';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
            pendingAvatarFile = null;
            setTimeout(() => {
                closeProfileEditModal();
                const name = currentProfileData?.name || newName;
                const url = currentProfileData?.avatarUrl;
                renderAvatar(document.getElementById('modalProfileAvatar'), url, name.charAt(0).toUpperCase());
                document.getElementById('modalProfileName').textContent = name;
                document.getElementById('modalProfileFullName').textContent = name;
            }, 1200);
        }
    });
}

document.addEventListener('DOMContentLoaded', setupProfileModals);
