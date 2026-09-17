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
    setupNavSidebar();
    const heroCTA = document.getElementById("heroCTA");
    if (heroCTA) heroCTA.addEventListener("click", () => document.getElementById("mapSection")?.scrollIntoView({behavior:"smooth"}));
    // Top bar ใสบน Hero, ขาวเมื่อเลื่อนพ้น Hero
    const header = document.getElementById("mainHeader");
    const hero = document.getElementById("hero");
    if (header && hero) {
        const onScroll = () => {
            const threshold = hero.offsetHeight - header.offsetHeight - 20;
            if (window.scrollY > threshold) header.classList.remove("is-transparent");
            else header.classList.add("is-transparent");
        };
        window.addEventListener("scroll", onScroll, {passive:true});
        onScroll();
    }
});

function setupNavSidebar() {
    const btn = document.getElementById("navToggleBtn");
    const sidebar = document.getElementById("navSidebar");
    const backdrop = document.getElementById("navBackdrop");
    if (!btn || !sidebar || !backdrop) return;
    function open() {
        sidebar.classList.add("open");
        sidebar.setAttribute("aria-hidden","false");
        backdrop.style.display = "block";
        btn.setAttribute("aria-expanded","true");
    }
    function close() {
        sidebar.classList.remove("open");
        sidebar.setAttribute("aria-hidden","true");
        backdrop.style.display = "none";
        btn.setAttribute("aria-expanded","false");
    }
    const closeBtn = document.getElementById("navCloseBtn");
    if (closeBtn) closeBtn.addEventListener("click", close);
    btn.addEventListener("click", () => sidebar.classList.contains("open") ? close() : open());
    backdrop.addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    sidebar.querySelectorAll(".nav-toggle").forEach(tog => {
        tog.addEventListener("click", () => {
            const grp = tog.closest(".nav-group");
            const expanded = tog.getAttribute("aria-expanded") === "true";
            tog.setAttribute("aria-expanded", String(!expanded));
            grp.classList.toggle("open", !expanded);
        });
    });
    sidebar.querySelectorAll(".nav-item[data-nav]").forEach(a => {
        a.addEventListener("click", (e) => {
            e.preventDefault();
            const nav = a.dataset.nav;
            sidebar.querySelectorAll(".nav-item").forEach(x => x.classList.remove("active"));
            a.classList.add("active");
            close();
            if (nav === "home") window.scrollTo({top:0, behavior:"smooth"});
            else if (nav === "map") document.getElementById("mapSection")?.scrollIntoView({behavior:"smooth"});
            else if (nav === "binTypes") { const p=document.getElementById("binTypesPage"); if(p) p.style.display="flex"; }
            else if (nav === "ai") openAiChat();
            else if (nav === "statistics") { openModal("statsModal"); loadStats(); }
            else if (nav === "comments") { openModal("commentsModal"); loadAllComments(); }
            else if (nav === "report-problem") { openModal("reportModal"); populateReportBins(); }
            else if (nav === "settings") openModal("settingsModal");
        });
    });
    // generic modal close
    document.querySelectorAll("[data-close]").forEach(btn => btn.addEventListener("click", () => closeModal(btn.dataset.close)));
    document.querySelectorAll(".modal-backdrop").forEach(m => m.addEventListener("click", e => { if (e.target===m) closeModal(m.id); }));
    function openModal(id){ const m=document.getElementById(id); if(m) m.style.display="flex"; }
    function closeModal(id){ const m=document.getElementById(id); if(m) m.style.display="none"; }
    window.openModal = openModal; window.closeModal = closeModal;
    async function loadStats(){
        const body=document.getElementById("statsBody");
        body.innerHTML="กำลังโหลด...";
        const bins=await loadBinsFromSupabase();
        const counts={};
        bins.forEach(b=>counts[b.type]=(counts[b.type]||0)+1);
        body.innerHTML=`<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div style="background:var(--map-tint); padding:16px; border-radius:12px; text-align:center;"><div style="font-size:1.8rem; font-weight:800; color:var(--dark-green);">${bins.length}</div><div style="font-size:0.8rem; color:var(--text-muted);">ถังทั้งหมด</div></div>
            ${Object.entries(counts).map(([k,v])=>`<div style="background:white; border:1px solid rgba(0,0,0,0.06); padding:14px; border-radius:12px; text-align:center;"><div style="font-size:1.4rem; font-weight:700;">${v}</div><div style="font-size:0.78rem; color:var(--text-muted);">${k}</div></div>`).join("")}
        </div>`;
        const badge=document.getElementById("navMapBadge");
        if(badge) badge.textContent=bins.length;
    }
    async function loadAllComments(){
        const body=document.getElementById("commentsModalBody");
        body.innerHTML="กำลังโหลด...";
        const { data, error } = await supabaseClient.from('comments').select('*').order('created_at',{ascending:false}).limit(50);
        if(error||!data||data.length===0){ body.innerHTML='<p style="text-align:center; color:var(--text-muted);">ยังไม่มีความคิดเห็น</p>'; return; }
        body.innerHTML=data.map(c=>`<div style="background:var(--bg-light); padding:10px 12px; border-radius:10px; margin-bottom:8px;">
            <div style="font-size:0.8rem; font-weight:600;">${c.user_name||'User'} <span style="font-weight:400; color:var(--text-muted); font-size:0.7rem;">${new Date(c.created_at).toLocaleString('th-TH')}</span></div>
            <div style="font-size:0.85rem; margin-top:4px;">${c.text||''}</div>
            ${c.image_url?`<img src="${c.image_url}" style="width:100%; max-height:180px; object-fit:cover; border-radius:8px; margin-top:6px;">`:''}
        </div>`).join("");
    }
    function populateReportBins(){
        const sel=document.getElementById("reportBinSelect");
        if(sel.options.length>1) return;
        loadBinsFromSupabase().then(bins=>{
            bins.forEach(b=>{
                const o=document.createElement("option");
                o.value=b.id; o.textContent=`#${b.number} ${b.location} (${b.type})`;
                sel.appendChild(o);
            });
        });
    }
    document.getElementById("reportForm")?.addEventListener("submit", async (e)=>{
        e.preventDefault();
        const binId=document.getElementById("reportBinSelect").value;
        const text=document.getElementById("reportText").value.trim();
        const status=document.getElementById("reportStatus");
        if(!binId||!text) return;
        const { data:{user} } = await supabaseClient.auth.getUser();
        if(!user){ status.textContent="กรุณาเข้าสู่ระบบก่อน"; status.style.display="block"; status.style.background="rgba(244,67,54,0.1)"; status.style.color="#C62828"; return; }
        let name=user.email;
        try{ const {data:prof}=await supabaseClient.from('profiles').select('full_name').eq('id',user.id).single(); if(prof?.full_name) name=prof.full_name; }catch{}
        const { error } = await supabaseClient.from('comments').insert({bin_id: binId, user_name: name, text: "[REPORT] "+text});
        if(error){ status.textContent="ผิดพลาด: "+error.message; status.style.background="rgba(244,67,54,0.1)"; status.style.color="#C62828"; } else { status.textContent="ส่งรายงานสำเร็จ!"; status.style.background="rgba(76,175,80,0.12)"; status.style.color="#2E7D32"; e.target.reset(); }
        status.style.display="block";
        setTimeout(()=>status.style.display="none", 2000);
    });
    // AI Chat Page (Gemini style)
    function openAiChat(){
        const page=document.getElementById("aiChatPage");
        const userEl=document.getElementById("aiChatUser");
        const name=document.getElementById("navProfileName")?.textContent||"Guest";
        if(userEl) userEl.textContent="คุณ "+name;
        if(page) page.style.display="flex";
        document.getElementById("aiChatInput")?.focus();
    }
    document.getElementById("aiChatClose")?.addEventListener("click", ()=> document.getElementById("aiChatPage").style.display="none");
    document.getElementById("aiChatPage")?.addEventListener("click", e=>{ if(e.target.id==="aiChatPage") e.currentTarget.style.display="none"; });
    document.getElementById("aiChatInput")?.addEventListener("keypress", e=>{ if(e.key==="Enter") doAiChat(); });
    // + ปุ่มแนบรูป
    let aiAttachedImage = null;
    document.getElementById("aiChatPlus")?.addEventListener("click", ()=> document.getElementById("aiChatFile")?.click());
    document.getElementById("aiChatFile")?.addEventListener("change", e=>{
        const f=e.target.files[0];
        if(!f || !f.type.startsWith("image/")) return;
        const rd=new FileReader();
        rd.onload=ev=>{
            aiAttachedImage = ev.target.result;
            const prev=document.getElementById("aiAttachPreview");
            prev.innerHTML=`<img src="${aiAttachedImage}"><span style="font-size:0.75rem; color:var(--text-muted);">แนบรูปแล้ว • คลิก + เพื่อเปลี่ยน</span><button onclick="aiAttachedImage=null; document.getElementById('aiAttachPreview').style.display='none'; document.getElementById('aiAttachPreview').innerHTML='';" style="margin-left:auto; border:none; background:transparent; color:#D32F2F; cursor:pointer;">✕</button>`;
            prev.style.display="flex";
            prev.style.alignItems="center";
        };
        rd.readAsDataURL(f);
    });
    async function doAiChat(){
        const input=document.getElementById("aiChatInput");
        const hist=document.getElementById("aiChatHistory");
        const q=input.value.trim();
        if(!q && !aiAttachedImage) return;
        let userHtml = q ? `<div class="ai-msg user">${q}</div>` : "";
        if(aiAttachedImage) userHtml += `<div class="ai-msg user" style="padding:6px;"><img src="${aiAttachedImage}" style="max-width:160px; border-radius:10px; display:block;"></div>`;
        hist.innerHTML+=userHtml;
        input.value="";
        document.querySelector(".ai-chat-center")?.classList.add("has-messages");
        hist.scrollTop=hist.scrollHeight;
        // typing animation
        const typingId = "typing-" + Date.now();
        hist.innerHTML+=`<div id="${typingId}" class="ai-msg bot ai-typing"><span></span><span></span><span></span></div>`;
        hist.scrollTop=hist.scrollHeight;
        // Try Gemini API, fallback to local bin search
        const bins=await loadBinsFromSupabase();
        let reply="";
        const apiKey = ""; // ใส่ GEMINI_API_KEY ที่นี่ถ้าต้องการเรียกจริง, ตอนนี้ใช้ local fallback เขียว-ขาว
        if(apiKey){
            try{
                const resp=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,{
                    method:"POST", headers:{"Content-Type":"application/json"},
                    body: JSON.stringify({contents:[{parts:[{text:`คุณคือ AI BINMAP โรงเรียนเบญจมราชานุสรณ์ มีถังขยะ ${bins.length} ใบ ข้อมูล: ${bins.slice(0,15).map(b=>`#${b.number} ${b.type} ที่ ${b.location}`).join(", ")} คำถาม: ${q}` }]}]})
                });
                const data=await resp.json();
                reply=data.candidates?.[0]?.content?.parts?.[0]?.text || "";
            }catch(e){ reply=""; }
        }
        if(!reply){
            const norm=s=>String(s||"").toLowerCase();
            const scored=bins.map(b=>{
                let score=0;
                if(norm(b.type).includes(norm(q))||norm(q).includes(norm(b.type))) score+=10;
                if(norm(b.location).includes(norm(q))) score+=6;
                if(String(b.number).includes(q)) score+=8;
                return {b, score};
            }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,3);
            if(aiAttachedImage){
                reply=`ได้รับรูปแล้ว! ถ้าเป็นรูปถังขยะ ลองบอกประเภทหรือสถานที่เพิ่ม เช่น “ถังนี้อยู่ใกล้โรงอาหารไหม”`;
            } else if(scored.length>0){
                reply=`พบ ${scored.length} ถังที่ตรงกับ “${q}”:<br>`+scored.map(x=>`• ถัง #${x.b.number} ${x.b.type} ที่ ${x.b.location}`).join("<br>");
                reply+=`<br><br><button onclick="document.getElementById('aiChatPage').style.display='none'; document.getElementById('searchInput').value='${scored[0].b.type}'; document.getElementById('mapSection').scrollIntoView({behavior:'smooth'}); setTimeout(()=>document.getElementById('searchInput').dispatchEvent(new Event('input')),300);" style="margin-top:8px; padding:6px 14px; border-radius:999px; border:none; background:var(--primary-green); color:white; font-weight:600; cursor:pointer;">ดูบนแผนที่</button>`;
            } else {
                reply=`สวัสดีครับ ผม AI BINMAP พร้อมช่วยหาถังขยะ ลองถามเช่น “หาถังรีไซเคิลใกล้โรงอาหาร” หรือ “ถังขยะเปียกอยู่ตรงไหน”`;
            }
        }
        setTimeout(()=>{
            const typingEl=document.getElementById(typingId);
            if(typingEl) typingEl.remove();
            hist.innerHTML+=`<div class="ai-msg bot">${reply}</div>`;
            hist.scrollTop=hist.scrollHeight;
            aiAttachedImage=null;
            document.getElementById("aiAttachPreview").style.display="none";
            document.getElementById("aiAttachPreview").innerHTML="";
            document.getElementById("aiChatFile").value="";
        }, 600);
    }
    window.doAiChat = doAiChat;
    document.getElementById("binTypesClose")?.addEventListener("click", ()=> document.getElementById("binTypesPage").style.display="none");
    document.getElementById("binTypesPage")?.addEventListener("click", e=>{ if(e.target.id==="binTypesPage") e.currentTarget.style.display="none"; });
    // Top logo -> Home
    const topLogo = document.getElementById("topLogoHome");
    if (topLogo) {
        topLogo.addEventListener("click", () => window.scrollTo({top:0, behavior:"smooth"}));
        topLogo.addEventListener("keydown", (e) => { if (e.key==="Enter"||e.key===" ") { e.preventDefault(); window.scrollTo({top:0, behavior:"smooth"}); }});
    }
    // Left profile footer
    setupNavProfile();
}

const LS_NAV_PROFILE = "bs_binmap_nav_profile_v1";
function setupNavProfile() {
    const avatarEl = document.getElementById("navProfileAvatar");
    const nameEl = document.getElementById("navProfileName");
    const emailEl = document.getElementById("navProfileEmail");
    const editBtn = document.getElementById("navEditProfileBtn");
    const form = document.getElementById("navProfileEditForm");
    const nickInput = document.getElementById("navEditNickname");
    const bdayInput = document.getElementById("navEditBirthday");
    const sidInput = document.getElementById("navEditStudentId");
    const avatarPreview = document.getElementById("navEditAvatarPreview");
    const avatarInput = document.getElementById("navEditAvatarInput");
    const avatarWrap = document.getElementById("navEditAvatarWrap");
    const cancelBtn = document.getElementById("navEditCancel");
    const statusEl = document.getElementById("navEditStatus");
    if (!avatarEl || !form) return;

    let pendingFile = null;
    function loadLocal() {
        try { return JSON.parse(localStorage.getItem(LS_NAV_PROFILE) || "null"); } catch { return null; }
    }
    function saveLocal(data) { localStorage.setItem(LS_NAV_PROFILE, JSON.stringify(data)); }

    async function refresh() {
        const local = loadLocal();
        const { data: { user } } = await supabaseClient.auth.getUser();
        let displayName = local?.nickname || "Guest";
        let email = user?.email || local?.email || "-";
        let avatar = local?.avatarDataUrl || null;
        let birthday = local?.birthday || "";
        let sid = local?.studentId || "";
        // try supabase profile for avatar/name + new fields
        if (user) {
            const { data: prof } = await supabaseClient.from('profiles').select('full_name,avatar_url,nickname,birthday,student_id').eq('id', user.id).single();
            if (prof) {
                if (prof.nickname && !local?.nickname) displayName = prof.nickname;
                else if (prof.full_name && !local?.nickname) displayName = prof.full_name;
                if (prof.avatar_url && !avatar) avatar = prof.avatar_url;
                if (prof.birthday) birthday = prof.birthday;
                if (prof.student_id) sid = prof.student_id;
            }
            email = user.email;
        }
        if (avatar) { avatarEl.src = avatar; avatarPreview.src = avatar; } else { avatarEl.src = "assets/logo.jpg"; avatarPreview.src = "assets/logo.jpg"; }
        nameEl.textContent = displayName;
        emailEl.textContent = email;
        nickInput.value = local?.nickname || "";
        // prefer supabase value if exists
        if (birthday) bdayInput.value = birthday;
        if (sid) sidInput.value = sid;
    }
    refresh();
    supabaseClient.auth.onAuthStateChange(() => refresh());

    editBtn.addEventListener("click", () => {
        form.style.display = form.style.display === "none" ? "flex" : "none";
        form.scrollIntoView({behavior:"smooth", block:"nearest"});
    });
    cancelBtn.addEventListener("click", () => { form.style.display="none"; pendingFile=null; });
    avatarWrap.addEventListener("click", () => avatarInput.click());
    avatarInput.addEventListener("change", () => {
        const f = avatarInput.files[0];
        if (!f) return;
        if (!f.type.startsWith("image/")) return alert("กรุณาเลือกไฟล์รูปภาพ");
        pendingFile = f;
        const rd = new FileReader();
        rd.onload = e => avatarPreview.src = e.target.result;
        rd.readAsDataURL(f);
    });
    sidInput.addEventListener("input", () => {
        sidInput.value = sidInput.value.replace(/\D/g,"").slice(0,5);
    });
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const nickname = nickInput.value.trim();
        const birthday = bdayInput.value;
        const studentId = sidInput.value.trim();
        if (studentId && !/^\d{5}$/.test(studentId)) { statusEl.textContent="รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก"; statusEl.style.display="block"; statusEl.style.background="rgba(244,67,54,0.1)"; statusEl.style.color="#C62828"; return; }
        statusEl.style.display="none";
        let avatarDataUrl = null;
        if (pendingFile) {
            const rd = new FileReader();
            avatarDataUrl = await new Promise(res => { rd.onload = ev => res(ev.target.result); rd.readAsDataURL(pendingFile); });
            // try upload to supabase if logged in
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (user) {
                const ext = (pendingFile.name.split('.').pop()||'jpg').toLowerCase();
                const fileName = `avatars/${user.id}.${ext}`;
                const { error: upErr } = await supabaseClient.storage.from('bin-images').upload(fileName, pendingFile, {upsert:true});
                if (!upErr) {
                    const { data: urlData } = supabaseClient.storage.from('bin-images').getPublicUrl(fileName);
                    avatarDataUrl = urlData.publicUrl + "?t=" + Date.now();
                    // also upsert profiles avatar_url
                    await supabaseClient.from('profiles').upsert({id:user.id, avatar_url: avatarDataUrl}, {onConflict:'id'});
                }
            }
        } else {
            const local = loadLocal();
            avatarDataUrl = local?.avatarDataUrl || null;
        }
        const toSave = { nickname, birthday, studentId, avatarDataUrl, email: (await supabaseClient.auth.getUser()).data.user?.email || "" };
        saveLocal(toSave);
        // try save to Supabase (all-in-one)
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (user) {
                const payload = { id: user.id, nickname: nickname || null, birthday: birthday || null, student_id: studentId || null };
                if (avatarDataUrl && avatarDataUrl.startsWith("http")) payload.avatar_url = avatarDataUrl;
                const { error } = await supabaseClient.from('profiles').upsert(payload, {onConflict:'id'});
                if (error) {
                    console.warn("profiles upsert (need SQL):", error.message);
                    statusEl.textContent="บันทึก Local สำเร็จ (Supabase ยังไม่มีคอลัมน์ nickname/birthday/student_id — รัน SQL ใน dashboard ก่อน)";
                    statusEl.style.display="block";
                    statusEl.style.background="rgba(255,152,0,0.12)";
                    statusEl.style.color="#E65100";
                } else {
                    statusEl.textContent="บันทึกสำเร็จ (Supabase)!";
                    statusEl.style.display="block";
                    statusEl.style.background="rgba(76,175,80,0.12)";
                    statusEl.style.color="#2E7D32";
                }
            } else {
                statusEl.textContent="บันทึกสำเร็จ! (Local — ล็อกอินเพื่อซิงค์ Supabase)";
                statusEl.style.display="block";
                statusEl.style.background="rgba(76,175,80,0.12)";
                statusEl.style.color="#2E7D32";
            }
        } catch(e){
            statusEl.textContent="บันทึก Local สำเร็จ";
            statusEl.style.display="block";
        }
        pendingFile=null;
        setTimeout(()=>{ form.style.display="none"; statusEl.style.display="none"; refresh(); }, 1600);
    });
    // Theme (moved to Settings)
    function applyTheme(theme){
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("bs_binmap_theme", theme);
        document.querySelectorAll(".theme-btn[data-theme]").forEach(b=>b.classList.toggle("active", b.dataset.theme===theme));
    }
    document.querySelectorAll(".theme-btn[data-theme]").forEach(b => b.addEventListener("click", () => applyTheme(b.dataset.theme)));
    const savedTheme = localStorage.getItem("bs_binmap_theme") || "light";
    applyTheme(savedTheme);
    // Language TH/EN
    const i18nDict = {
        th: { home:"Home", map:"Map", ai:"AI Search", stats:"Statistics", comments:"Comments", report:"Report a Problem", settings:"Settings", theme:"ธีม", language:"ภาษา", editProfile:"✏️ แก้ไขโปรไฟล์", searchPlaceholder:"ค้นหาประเภทของถังขยะ...", heroSubtitle:"โรงเรียนเบญจมราชานุสรณ์" },
        en: { home:"Home", map:"Map", ai:"AI Search", stats:"Statistics", comments:"Comments", report:"Report a Problem", settings:"Settings", theme:"Theme", language:"Language", editProfile:"✏️ Edit Profile", searchPlaceholder:"Search bin type...", heroSubtitle:"Benjamarachanusorn School" }
    };
    function applyLang(lang){
        localStorage.setItem("bs_binmap_lang", lang);
        document.documentElement.setAttribute("lang", lang);
        document.querySelectorAll(".theme-btn[data-lang]").forEach(b=>b.classList.toggle("active", b.dataset.lang===lang));
        const d=i18nDict[lang]||i18nDict.th;
        const setText=(sel, txt)=>{ const el=document.querySelector(sel); if(el) el.textContent=txt; };
        // nav
        const navMap={home:d.home, map:d.map, ai:d.ai, statistics:d.stats, comments:d.comments, "report-problem":d.report, settings:d.settings};
        document.querySelectorAll(".nav-item[data-nav]").forEach(a=>{ const k=a.dataset.nav; if(navMap[k]) a.childNodes.forEach(n=>{ if(n.nodeType===3 && n.textContent.trim()) n.textContent=" "+navMap[k]; }); });
        document.querySelectorAll("[data-i18n='theme']").forEach(el=>el.textContent=d.theme);
        document.querySelectorAll("[data-i18n='language']").forEach(el=>el.textContent=d.language);
        document.querySelectorAll("[data-i18n='editProfile']").forEach(el=>el.textContent=d.editProfile);
        const searchInput=document.getElementById("searchInput"); if(searchInput) searchInput.placeholder=d.searchPlaceholder;
        const heroSub=document.querySelector(".hero-subtitle"); if(heroSub) heroSub.textContent=d.heroSubtitle;
    }
    document.querySelectorAll(".theme-btn[data-lang]").forEach(b=> b.addEventListener("click", ()=> applyLang(b.dataset.lang)));
    const savedLang = localStorage.getItem("bs_binmap_lang") || "th";
    applyLang(savedLang);
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
    const imageUrl = "assets/NEWMAP_transparent.png";
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
        // --- LOCK MARKER TO IMAGE: imageOverlay + markers ใช้ระบบพิกัดเดียวกัน (CRS.Simple) ---
        // ตำแหน่ง marker = lat_frac * h , lng_frac * w  => ล็อกตามสัดส่วนรูป ไม่ใช่พิกัดจอ
        // ดังนั้นแก้ UX/UI / resize / sidebar เปิด-ปิด ก็ไม่หลุด
        const overlay = L.imageOverlay(imageUrl, bounds, { interactive: false }).addTo(map);
        map.fitBounds(bounds);
        const fitZoom = map.getBoundsZoom(bounds);
        map.setZoom(fitZoom);
        map.setMinZoom(fitZoom - 1);
        map.setMaxBounds(bounds);
        // สร้าง pane แยกให้ marker อยู่บน overlay ชั้นเดียวกัน ล็อกตาม transform ของ map
        map.createPane("binPane");
        map.getPane("binPane").style.zIndex = 400;
        setTimeout(() => { map.invalidateSize(); map.fitBounds(bounds); }, 200);
        // กันหลุดตอนแก้ layout / เปิด sidebar / resize หน้าจอ
        let resizeTimer = null;
        window.addEventListener("resize", () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => { map.invalidateSize(); /* ไม่ fitBounds ซ้ำเพื่อคงตำแหน่งผู้ใช้ */ }, 150);
        });
        // เผื่อมีการซูม/แพนแล้วอยากกลับกรอบรูป กด locate จะ fitBounds ให้เอง (มีแล้วใน MapActions_RESET_VIEW)

        await migrateLocalStorageToSupabase();
        const allBins = await loadBinsFromSupabase();
        allBins.forEach((bin) => {
            const lat = h * bin.lat_frac;
            const lng = w * bin.lng_frac;
            const marker = L.marker([lat, lng], { icon: createCustomIcon(bin.type), pane: "binPane" }).addTo(map);
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
                const typeEl = document.getElementById("binType");
                typeEl.textContent = data.type;
                typeEl.className = "info-text value-pill " + (data.type === "ขยะเปียก" ? "green" : data.type === "ขยะรีไซเคิล" ? "yellow" : data.type === "ขยะอันตราย" ? "red" : "blue");
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
