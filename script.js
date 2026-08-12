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
        const { data: profile } = await supabaseClient
            .from('profiles').select('full_name').eq('id', user.id).single();
        const userName = profile?.full_name || 'User';
        document.body.classList.add("is-authed");
        authButtonsDiv.innerHTML = `
            <span class="user-display-name">${userName}</span>
            <button class="btn-login" id="btnLogout">Log out</button>
        `;
        document.getElementById("btnLogout").addEventListener("click", async () => {
            await supabaseClient.auth.signOut();
            window.location.reload();
        });
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
        map.setZoom(fitZoom + 0.5);
        map.setMinZoom(fitZoom - 1);
        map.setMaxBounds(bounds);
        setTimeout(() => { map.invalidateSize(); map.fitBounds(bounds); map.setZoom(fitZoom + 0.5); }, 200);

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

        let highlightedMarker = null;
        function clearHighlight() {
            if (highlightedMarker && highlightedMarker._aiShadow) {
                map.removeLayer(highlightedMarker._aiShadow);
                highlightedMarker._aiShadow = null;
            }
            if (highlightedMarker) {
                highlightedMarker.setZIndexOffset(0);
                const el = highlightedMarker.getElement();
                if (el) { const wrap = el.querySelector(".custom-bin-marker-wrapper"); if (wrap) wrap.classList.remove("ai-selected"); }
            }
            highlightedMarker = null;
        }
        function highlightMarker(marker) {
            clearHighlight();
            const shadow = L.circleMarker(marker.getLatLng(), {
                radius: 30, color: "#e65100", weight: 3, fillColor: "#e65100", fillOpacity: 0.2, className: "ai-highlight-ring"
            }).addTo(map);
            shadow._isShadow = true;
            marker._aiShadow = shadow;
            marker.setZIndexOffset(1000);
            marker.bringToFront();
            const el = marker.getElement();
            if (el) { const wrap = el.querySelector(".custom-bin-marker-wrapper"); if (wrap) wrap.classList.add("ai-selected"); }
            highlightedMarker = marker;
            map.panTo(marker.getLatLng(), { animate: true, duration: 0.8 });
        }

        const aiInput = document.getElementById("aiSearchInput");
        const aiBtn = document.getElementById("aiSearchBtn");
        const aiResult = document.getElementById("aiResult");
        const aiResultText = document.querySelector("#aiResult .ai-result-text");
        const aiSuggestions = document.getElementById("aiSuggestions");

        const KEYWORD_RULES = [
            { kws: ["โรงอาหาร", "cafeteria"], place: "โรงอาหาร", hint: "cafeteria" },
            { kws: ["สนามฟุตบอล", "football"], place: "สนามฟุตบอล", hint: "football field" },
            { kws: ["สนามบาส", "basketball"], place: "สนามบาส", hint: "basketball court" }
        ];

        function showAiResult(message) {
            if (aiResultText) aiResultText.textContent = message || "";
            aiResult.classList.remove("ai-result-enter");
            aiResult.style.display = "flex";
            void aiResult.offsetWidth;
            aiResult.classList.add("ai-result-enter");
        }

        function runAiSearch() {
            const query = (aiInput.value || "").trim().toLowerCase();
            if (!query) return;
            aiBtn.classList.add("loading");
            aiResult.style.display = "none";
            if (aiSuggestions) aiSuggestions.classList.remove("show");
            setTimeout(() => {
                aiBtn.classList.remove("loading");
                let targetMarker = null;
                let matchedRule = null;
                allMarkers.forEach((item) => {
                    if (targetMarker) return;
                    KEYWORD_RULES.forEach((rule) => {
                        if (targetMarker) return;
                        if (rule.kws.some((k) => query.includes(k))) { targetMarker = item.marker; matchedRule = rule; }
                    });
                });
                if (!targetMarker || !matchedRule) {
                    clearHighlight();
                    showAiResult("ยังไม่พบถังขยะใกล้จุดนั้นบนแผนที่ ลองค้นหาจุดอื่น หรือเพิ่มถังขยะใหม่ได้เลยครับ");
                    return;
                }
                highlightMarker(targetMarker);
                const matchedData = allMarkers.find((it) => it.marker === targetMarker)?.data || {};
                const num = matchedData.number || "";
                const loc = matchedData.location || "";
                const locBits = [];
                if (num) locBits.push("🗑️ ถัง #" + num);
                if (loc) locBits.push("📍 ตำแหน่ง (" + loc + ")");
                const msg = locBits.length ? `พบถังขยะใกล้${matchedRule.place}\n${locBits.join("\n")}` : `พบถังขยะใกล้${matchedRule.place}`;
                showAiResult(msg.trim());
                bindMarkerEvents(targetMarker, matchedData);
                targetMarker.fire("click");
            }, 900);
        }

        if (aiBtn) aiBtn.addEventListener("click", runAiSearch);
        if (aiInput) aiInput.addEventListener("keypress", (e) => { if (e.key === "Enter") runAiSearch(); });

        if (aiSuggestions) {
            aiInput.addEventListener("focus", () => aiSuggestions.classList.add("show"));
            aiInput.addEventListener("blur", () => setTimeout(() => aiSuggestions.classList.remove("show"), 150));
            aiSuggestions.querySelectorAll(".ai-suggest-chip").forEach((chip) => {
                chip.addEventListener("click", () => {
                    aiInput.value = chip.dataset.query || "";
                    aiSuggestions.classList.remove("show");
                    runAiSearch();
                });
            });
        }

        const zoomInBtn = document.getElementById("zoomInBtn");
        const zoomOutBtn = document.getElementById("zoomOutBtn");
        const locateBtn = document.getElementById("locateBtn");
        if (zoomInBtn) zoomInBtn.addEventListener("click", () => map.zoomIn());
        if (zoomOutBtn) zoomOutBtn.addEventListener("click", () => map.zoomOut());
        if (locateBtn) locateBtn.addEventListener("click", () => { clearHighlight(); map.flyToBounds(bounds, { duration: 0.8 }); });

        function checkEmptyComments() {
            const commentsDiv = document.getElementById("binComments");
            if (commentsDiv.children.length === 0) {
                commentsDiv.innerHTML = `<div class="empty-comment-placeholder">ยังไม่มีความคิดเห็น</div>`;
            }
        }

        function bindMarkerEvents(marker, data) {
            marker.on("click", (e) => {
                L.DomEvent.stopPropagation(e);
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
                document.getElementById("binComments").innerHTML = "";
                checkEmptyComments();
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
                        const reader = new FileReader();
                        reader.onload = (e) => { previewImg.src = e.target.result; previewContainer.style.display = "block"; };
                        reader.readAsDataURL(file);
                    }
                });
            }
            if (removeImgBtn) {
                removeImgBtn.addEventListener("click", () => { imageInput.value = ""; previewContainer.style.display = "none"; });
            }
            if (submitBtn && reportInput) {
                submitBtn.addEventListener("click", async () => {
                    const { data: { user } } = await supabaseClient.auth.getUser();
                    if (!user) { alert("กรุณาเข้าสู่ระบบก่อนโพสต์ความคิดเห็น"); window.location.href = 'login.html'; return; }
                    const text = reportInput.value.trim();
                    const imageFile = imageInput.files[0];
                    if (text === "" && !imageFile) return;
                    const { data: profile } = await supabaseClient.from('profiles').select('full_name').eq('id', user.id).single();
                    const displayUserName = profile?.full_name || 'User';
                    let uploadedImageUrl = null;
                    if (imageFile) {
                        const fileExt = imageFile.name.split('.').pop();
                        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
                        const { data: uploadData, error: uploadError } = await supabaseClient.storage.from('bin-images').upload(fileName, imageFile);
                        if (uploadError) { alert("เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ: " + uploadError.message); return; }
                        const { data: publicUrlData } = supabaseClient.storage.from('bin-images').getPublicUrl(fileName);
                        uploadedImageUrl = publicUrlData.publicUrl;
                    }
                    const commentsDiv = document.getElementById("binComments");
                    const placeholder = commentsDiv.querySelector(".empty-comment-placeholder");
                    if (placeholder) commentsDiv.innerHTML = "";
                    const newComment = document.createElement("div");
                    newComment.className = "comment-card";
                    let imageHtml = uploadedImageUrl ? `<img src="${uploadedImageUrl}" class="comment-image" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;margin-bottom:8px;cursor:pointer;">` : "";
                    newComment.innerHTML = `
                        <div style="width:30px;height:30px;background:#cbd5e0;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;color:white;">
                                <path fill-rule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clip-rule="evenodd" />
                            </svg>
                        </div>
                        <div class="comment-main">
                            <div class="comment-user-info"><span class="username">${displayUserName}</span><span class="comment-time">เมื่อสักครู่</span></div>
                            ${imageHtml}
                            <span class="comment-text">${text}</span>
                        </div>`;
                    commentsDiv.appendChild(newComment);
                    reportInput.value = "";
                    imageInput.value = "";
                    previewContainer.style.display = "none";
                    commentsDiv.scrollTop = commentsDiv.scrollHeight;
                });
                reportInput.addEventListener("keypress", (e) => { if (e.key === "Enter") submitBtn.click(); });
            }
        }
    };
}
