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

        let selectedMarker = null;
        function clearHighlight() {
            if (selectedMarker) {
                selectedMarker.setZIndexOffset(0);
                const el = selectedMarker.getElement();
                if (el) { const wrap = el.querySelector(".custom-bin-marker-wrapper"); if (wrap) wrap.classList.remove("marker-selected"); }
            }
            selectedMarker = null;
        }
        function highlightMarker(marker) {
            clearHighlight();
            marker.setZIndexOffset(1000);
            const el = marker.getElement();
            if (el) { const wrap = el.querySelector(".custom-bin-marker-wrapper"); if (wrap) wrap.classList.add("marker-selected"); }
            selectedMarker = marker;
            const targetZoom = Math.min(map.getMaxZoom(), Math.max(map.getZoom(), fitZoom + 2));
            map.flyTo(marker.getLatLng(), targetZoom, { duration: 0.8 });
        }

        const searchInput = document.getElementById("searchInput");
        const searchBtn = document.getElementById("searchBtn");
        const searchStatus = document.getElementById("searchStatus");
        const searchStatusText = document.querySelector("#searchStatus .search-status-text");
        const searchSuggestions = document.getElementById("searchSuggestions");
        const searchResults = document.getElementById("searchResults");

        function getTypeColor(type) {
            if (type === "ขยะเปียก") return "green";
            if (type === "ขยะรีไซเคิล") return "yellow";
            if (type === "ขยะอันตราย") return "red";
            return "blue";
        }

        function showSearchStatus(message) {
            if (searchStatusText) searchStatusText.textContent = message || "";
            searchStatus.classList.remove("search-status-enter");
            searchStatus.style.display = "flex";
            void searchStatus.offsetWidth;
            searchStatus.classList.add("search-status-enter");
        }

        function hideSearchResults() {
            if (searchResults) searchResults.style.display = "none";
        }

        function renderSearchResults(query) {
            if (!query || !searchResults) { hideSearchResults(); return; }
            const q = query.toLowerCase();
            const matches = allMarkers.filter((item) => {
                const d = item.data;
                return (
                    (d.title && d.title.toLowerCase().includes(q)) ||
                    (d.location && d.location.toLowerCase().includes(q)) ||
                    (d.type && d.type.toLowerCase().includes(q)) ||
                    (d.number && String(d.number).includes(q))
                );
            });
            if (matches.length === 0) {
                searchResults.innerHTML = '<div class="search-no-result">ไม่พบถังขยะที่ค้นหา</div>';
                searchResults.style.display = "block";
                return;
            }
            searchResults.innerHTML = matches.map((item) => {
                const d = item.data;
                const c = getTypeColor(d.type);
                return `<div class="search-result-item" data-marker-id="${d.id}">
                    <span class="search-result-dot ${c}"></span>
                    <div class="search-result-info">
                        <span class="search-result-name">${d.title || "ถังขยะ"}</span>
                        <span class="search-result-detail">${d.location || "-"} | #${d.number || "?"}</span>
                    </div>
                    <span class="search-result-type ${c}">${d.type || "-"}</span>
                </div>`;
            }).join("");
            searchResults.style.display = "block";
            searchResults.querySelectorAll(".search-result-item").forEach((el) => {
                el.addEventListener("click", () => {
                    const markerId = el.dataset.markerId;
                    const found = allMarkers.find((m) => String(m.data.id) === String(markerId));
                    if (found) {
                        highlightMarker(found.marker);
                        bindMarkerEvents(found.marker, found.data);
                        found.marker.fire("click");
                        showSearchStatus("พบถังขยะ #" + (found.data.number || "") + " (" + (found.data.location || "") + ")");
                    }
                    hideSearchResults();
                    searchInput.blur();
                });
            });
        }

        if (searchInput) {
            searchInput.addEventListener("input", () => {
                const q = searchInput.value.trim();
                searchStatus.style.display = "none";
                if (q.length >= 1) {
                    renderSearchResults(q);
                } else {
                    hideSearchResults();
                }
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
                }, 200);
            });
            searchInput.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    const q = searchInput.value.trim();
                    if (q) renderSearchResults(q);
                }
            });
        }

        document.addEventListener("click", (e) => {
            if (!e.target.closest(".search-box") && !e.target.closest(".search-results-dropdown")) {
                hideSearchResults();
            }
        });

        if (searchBtn) searchBtn.addEventListener("click", () => {
            const q = (searchInput.value || "").trim();
            if (q) renderSearchResults(q);
        });

        if (searchSuggestions) {
            searchSuggestions.querySelectorAll(".suggest-chip").forEach((chip) => {
                chip.addEventListener("click", () => {
                    searchInput.value = chip.dataset.query || "";
                    searchSuggestions.classList.remove("show");
                    renderSearchResults(searchInput.value.trim());
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
