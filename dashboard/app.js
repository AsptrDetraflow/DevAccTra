// ============================================================
// DevAccTra Dashboard — Self-contained App
// Semua function ada di file ini (tidak butuh auth.js)
// ============================================================
(function () {
    "use strict";

    const PUBLIC_KEY_B64 = "kN08rrwZddPxF2KjSIgZ0bH6veMmE94ExuEE3FbGs6s=";
    const SESSION_KEY = "coretax_dashboard_session_v3";
    const MID_CACHE_KEY = "devacctra_machine_id_v3";
    const WA_NUMBER = "6287888370395";
    const WA_MSG = encodeURIComponent("Halo, saya mau beli License PRO DevAccTra");
    const WA_URL = "https://wa.me/" + WA_NUMBER + "?text=" + WA_MSG;
    const DIST = "https://asptrdetraflow.github.io/DevAccTra/dist";

    const PRODUCTS = [
        { id: "coretax-toolkit", name: "Coretax PDF Downloader", type: "Chrome Extension", accent: "dev",
          desc: "Download PDF Faktur Pajak Keluaran, Masukan, dan Bukti Potong dari Coretax secara massal.",
          trial: "CoretaxPDFDownloader-Trial.zip", pro: "CoretaxPDFDownloader-Pro.zip", available: true },
        { id: "rekap-faktur", name: "Rekap Faktur", type: "Software Desktop", accent: "tra",
          desc: "Rekap faktur pajak dari PDF ke Excel siap pelaporan SPT secara otomatis.",
          trial: null, pro: null, available: false },
        { id: "rekap-bupot-bppu", name: "Rekap Bupot BPPU", type: "Software Desktop", accent: "acc",
          desc: "Rekap Bukti Potong BPPU dari folder PDF ke Excel otomatis dengan deteksi duplikat.",
          trial: null, pro: null, available: false },
        { id: "rekap-bank-bca", name: "Rekap Bank BCA", type: "Software Desktop", accent: "sage",
          desc: "Ekstrak mutasi bank BCA dari PDF atau CSV ke Excel siap rekonsiliasi.",
          trial: null, pro: null, available: false },
    ];

    const ICONS = {
        "coretax-toolkit": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM8 13h8v2H8v-2zm0 4h8v2H8v-2z"/>',
        "rekap-faktur": '<path d="M4 2h16v20H4V2zm2 2v16h12V4H6zm2 3h8v2H8V7zm0 4h8v2H8v-2zm0 4h5v2H8v-2z"/>',
        "rekap-bupot-bppu": '<path d="M3 2h18v20H3V2zm2 2v16h14V4H5zm2 2h10v2H7V6zm0 4h10v2H7v-2zm0 4h6v2H7v-2z"/>',
        "rekap-bank-bca": '<path d="M12 2L2 7v2h20V7L12 2zM4 11v8H2v2h20v-2h-2v-8h-2v8h-4v-8h-2v8H8v-8H4z"/>',
    };

    const $ = (s, r) => (r || document).querySelector(s);
    const show = el => el && el.classList.remove("hidden");
    const hide = el => el && el.classList.add("hidden");

    // ============================================================
    // MACHINE ID — definisi di sini biar gak butuh file lain
    // ============================================================
    async function getMachineId() {
        // 1. URL param
        try {
            const params = new URLSearchParams(location.search);
            const urlMid = params.get("mid");
            if (urlMid && urlMid.length >= 20) {
                try { localStorage.setItem(MID_CACHE_KEY, urlMid); } catch (e) {}
                history.replaceState(null, "", location.pathname);
                return urlMid;
            }
        } catch (e) {}

        // 2. Cached
        try {
            const cached = localStorage.getItem(MID_CACHE_KEY);
            if (cached && cached.length >= 20) return cached;
        } catch (e) {}

        // 3. Cek crypto.subtle
        if (!window.crypto || !window.crypto.subtle || !window.crypto.subtle.digest) {
            throw new Error("Browser tidak support crypto.subtle. Pakai Chrome/Edge/Firefox terbaru.");
        }

        // 4. Generate dari fingerprint
        const parts = [
            navigator.platform || "",
            navigator.hardwareConcurrency || 0,
            navigator.deviceMemory || 0,
            navigator.language || "",
            (navigator.userAgentData && navigator.userAgentData.platform) || "",
            Intl.DateTimeFormat().resolvedOptions().timeZone || "",
            new Date().getTimezoneOffset(),
            navigator.userAgent || "",
        ];
        const fp = parts.join("|");
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fp));
        const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");

        try { localStorage.setItem(MID_CACHE_KEY, hex); } catch (e) {}
        console.log("[MID] Generated:", hex.substring(0, 16) + "...");
        return hex;
    }

    // ============================================================
    // LICENSE VERIFY
    // ============================================================
    function b64ToBytes(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }
    function b64urlToBytes(str) {
        str = str.replace(/-/g, "+").replace(/_/g, "/");
        while (str.length % 4) str += "=";
        const bin = atob(str);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }
    async function verifyLicense(licenseKey) {
        const parts = String(licenseKey || "").trim().split(".");
        if (parts.length !== 2) throw new Error("Format License Key tidak valid");
        const [payloadB64, sigB64] = parts;
        const pk = await crypto.subtle.importKey("raw", b64ToBytes(PUBLIC_KEY_B64), { name: "Ed25519" }, false, ["verify"]);
        const sig = b64urlToBytes(sigB64);
        const data = new TextEncoder().encode(payloadB64);
        const ok = await crypto.subtle.verify({ name: "Ed25519" }, pk, sig, data);
        if (!ok) throw new Error("License tidak sah");
        const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
        const today = new Date().toISOString().slice(0, 10);
        if (payload.e < today) throw new Error("License sudah kadaluarsa");
        return payload;
    }

    // ============================================================
    // SESSION
    // ============================================================
    function saveSession(data) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(Object.assign({}, data, { savedAt: Date.now() }))); } catch (e) {} }
    function getSession() { try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
    function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }
    function updateSession(patch) { const s = getSession() || {}; saveSession(Object.assign({}, s, patch)); }

    // ============================================================
    // HELPERS
    // ============================================================
    function daysRemaining(exp) {
        if (!exp) return 0;
        const e = new Date(exp + "T23:59:59").getTime();
        return Math.max(0, Math.ceil((e - Date.now()) / 86400000));
    }
    function fmtDate(iso) {
        if (!iso) return "-";
        const d = new Date(iso);
        if (isNaN(d)) return iso;
        return d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
    }
    function shortMid(m) {
        if (!m) return "-";
        return m.length > 20 ? m.substring(0, 10) + "..." + m.substring(m.length - 6) : m;
    }
    function isProTier(t) {
        t = (t || "").toLowerCase();
        return t === "pro" || t === "basic" || t === "enterprise" || t === "lifetime" || t === "subscription";
    }
    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c];
        });
    }

    // ============================================================
    // VIEWS
    // ============================================================
    function showLogin() {
        show($("#loginView"));
        hide($("#dashboardView"));
        hide($("#navLogout"));
    }
    function showDashboard() {
        hide($("#loginView"));
        show($("#dashboardView"));
        show($("#navLogout"));
        renderDashboard();
    }

    // ============================================================
    // MID MODAL
    // ============================================================
    let _generatedMid = null;

    async function generateMid() {
        const box = $("#midModalContent");
        box.innerHTML = '<div style="text-align:center;padding:24px 0;color:#69756D;font-size:.85rem"><span class="spinner-dot"></span> Mendeteksi Machine ID...</div>';

        try {
            const mid = await getMachineId();
            _generatedMid = mid;
            box.innerHTML =
                '<div class="mid-detail-box">' +
                    '<code id="midDetail">' + mid + '</code>' +
                    '<button type="button" class="btn-copy-mid" id="copyMidDetail">Copy</button>' +
                '</div>' +
                '<div class="alert alert-info" style="margin:14px 0 0"><i>&#8505;</i><div>Simpan ID ini. License yang dibeli akan terikat ke Machine ID ini.</div></div>';

            const cb = $("#copyMidDetail");
            cb.addEventListener("click", function () {
                navigator.clipboard.writeText(mid).then(function () {
                    const orig = cb.textContent;
                    cb.textContent = "OK!";
                    cb.classList.add("ok");
                    setTimeout(function () { cb.textContent = orig; cb.classList.remove("ok"); }, 1500);
                }).catch(function () {
                    alert("Copy manual: " + mid);
                });
            });
        } catch (e) {
            box.innerHTML =
                '<div class="alert alert-error" style="margin:0"><i>&#10007;</i><div><b>Gagal generate MID.</b><br>' + escapeHtml(e.message || "Browser tidak mendukung") + '<br><br><b>Solusi:</b><br>1. Buka di Chrome/Edge terbaru<br>2. Copy manual dari extension popup<br>3. Cek HTTPS aktif (bukan HTTP)</div></div>';
        }
    }

    function openMidModal() {
        $("#midModal").classList.add("show");
        generateMid();
    }
    function closeMidModal() {
        $("#midModal").classList.remove("show");
    }

    // ============================================================
    // AUTO-LOAD MID (silent)
    // ============================================================
    async function autoLoadMid() {
        const midInput = $("#midInput");
        const midHint = $("#midHint");
        if (!midInput) return;
        try {
            const mid = await getMachineId();
            if (!midInput.value) {
                midInput.value = mid;
                if (midHint) {
                    midHint.innerHTML = "Machine ID sudah terisi otomatis. Bisa diedit manual.";
                    midHint.style.color = "#32A852";
                }
            }
        } catch (e) {
            console.log("[MID] Auto-load skip:", e.message);
            if (midHint) {
                midHint.innerHTML = 'Klik <b>Generate</b> untuk deteksi Machine ID otomatis, atau copy manual dari extension.';
            }
        }
    }

    // ============================================================
    // LOGIN
    // ============================================================
    function handleLogin(e) {
        e.preventDefault();
        const email = $("#emailInput").value.trim();
        const mid = ($("#midInput").value || "").trim();
        const err = $("#loginError");
        hide(err);

        if (!email) { err.textContent = "Email wajib diisi."; show(err); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = "Format email tidak valid."; show(err); return; }
        if (!mid || mid.length < 20) { err.textContent = "Machine ID kosong. Klik Generate atau copy dari extension."; show(err); return; }

        saveSession({ email: email, machineId: mid });
        showDashboard();
    }

    function doLogout() {
        if (!confirm("Logout dari dashboard? License yang sudah dimasukkan akan dihapus.")) return;
        clearSession();
        $("#emailInput").value = "";
        showLogin();
    }

    // ============================================================
    // RENDER LICENSE STATUS
    // ============================================================
    function renderLicenseStatus(session) {
        const box = $("#licenseStatusContent");
        const payBtn = $("#buyProBtn");
        const pasteBtn = $("#pasteLicenseBtn");
        const removeBtn = $("#removeLicenseBtn");

        if (!session.licenseKey) {
            box.innerHTML = '<div class="alert alert-warn" style="margin:0"><i>&#9888;</i><div><b>Belum ada License PRO.</b><br>Anda hanya bisa download versi <b>Trial</b>. Untuk versi PRO, masukkan License Key dari Admin atau hubungi kami.</div></div>';
            show(pasteBtn); show(payBtn); hide(removeBtn);
            return;
        }
        const p = session.payload || {};
        const tier = (p.t || "").toLowerCase();
        const isPro = isProTier(tier);
        const exp = p.e || "-";
        const days = daysRemaining(exp);

        box.innerHTML =
            '<div class="info-row"><span class="label">Tier</span><span class="value"><span class="badge badge-' + (tier || "pro") + '">' + (tier || "pro") + '</span></span></div>' +
            '<div class="info-row"><span class="label">Produk</span><span class="value">' + escapeHtml(p.tool || "coretax-toolkit") + '</span></div>' +
            '<div class="info-row"><span class="label">Berlaku sampai</span><span class="value">' + fmtDate(exp) + ' <small style="color:#69756D">(' + days + ' hari)</small></span></div>' +
            (isPro
                ? '<div class="alert alert-success" style="margin:12px 0 0"><i>&#10003;</i><div><b>Akses PRO aktif.</b> Semua produk bisa di-download versi PRO.</div></div>'
                : '<div class="alert alert-info" style="margin:12px 0 0"><i>&#8505;</i><div>License tier <b>' + tier + '</b> tidak membuka akses PRO. Masukkan License PRO dari Admin.</div></div>');
        show(removeBtn);
        if (isPro) hide(pasteBtn); else show(pasteBtn);
        show(payBtn);
    }

    // ============================================================
    // RENDER PRODUCTS
    // ============================================================
    function renderProducts(session) {
        const grid = $("#productsGrid");
        const hasPro = session.payload && isProTier(session.payload.t);

        grid.innerHTML = PRODUCTS.map(function (p) {
            const icon = ICONS[p.id] || "";
            const isAvail = p.available;
            const trialBtn = isAvail
                ? '<a class="product-btn product-btn-trial" href="' + DIST + "/" + p.trial + '" download><svg viewBox="0 0 24 24"><path d="M12 15l-5-5h3V4h4v6h3l-5 5zM5 19h14v2H5z"/></svg> Download Trial</a>'
                : '<button class="product-btn product-btn-trial" disabled><svg viewBox="0 0 24 24"><path d="M12 15l-5-5h3V4h4v6h3l-5 5zM5 19h14v2H5z"/></svg> Trial</button>';
            const proBtn = !isAvail
                ? '<button class="product-btn product-btn-pro" disabled><svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5 3.8 9.4 9 11 5.2-1.6 9-6 9-11V5l-9-4z"/></svg> Coming Soon</button>'
                : (hasPro
                    ? '<a class="product-btn product-btn-pro" href="' + DIST + "/" + p.pro + '" download><svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5 3.8 9.4 9 11 5.2-1.6 9-6 9-11V5l-9-4z"/></svg> Download PRO</a>'
                    : '<button class="product-btn product-btn-pro" disabled type="button" data-open-license="1"><svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5 3.8 9.4 9 11 5.2-1.6 9-6 9-11V5l-9-4z"/></svg> Butuh License</button>');
            return '<div class="product-card">' +
                (!isAvail ? '<span class="product-badge">Coming Soon</span>' : "") +
                '<div class="product-head">' +
                    '<div class="product-ico ' + p.accent + '"><svg viewBox="0 0 24 24">' + icon + '</svg></div>' +
                    '<div class="product-head-text">' +
                        '<div class="product-name">' + escapeHtml(p.name) + '</div>' +
                        '<div class="product-type">' + escapeHtml(p.type) + '</div>' +
                    '</div>' +
                '</div>' +
                '<p class="product-desc">' + escapeHtml(p.desc) + '</p>' +
                '<div class="product-actions">' + trialBtn + proBtn + '</div>' +
            '</div>';
        }).join("");

        grid.querySelectorAll('[data-open-license]').forEach(function (btn) {
            btn.addEventListener("click", openLicenseModal);
        });
    }

    function renderDashboard() {
        const s = getSession();
        if (!s || !s.email || !s.machineId) { showLogin(); return; }
        $("#heroEmail").textContent = s.email;
        $("#heroMid").textContent = shortMid(s.machineId);
        renderLicenseStatus(s);
        renderProducts(s);

        const cb = $("#copyMidHero");
        cb.onclick = function () {
            navigator.clipboard.writeText(s.machineId).then(function () {
                const orig = cb.textContent;
                cb.textContent = "OK!";
                cb.classList.add("ok");
                setTimeout(function () { cb.textContent = orig; cb.classList.remove("ok"); }, 1500);
            });
        };
    }

    // ============================================================
    // LICENSE MODAL
    // ============================================================
    function openLicenseModal() {
        $("#licenseTextarea").value = "";
        hide($("#modalError"));
        $("#licenseModal").classList.add("show");
        setTimeout(function () { $("#licenseTextarea").focus(); }, 100);
    }
    function closeLicenseModal() { $("#licenseModal").classList.remove("show"); }

    async function handleLicenseConfirm() {
        const key = $("#licenseTextarea").value.trim();
        const err = $("#modalError");
        const btn = $("#modalConfirm");
        hide(err);
        if (!key) { err.textContent = "License Key kosong."; show(err); return; }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-dot" style="border-top-color:#fff;border-color:rgba(255,255,255,.3)"></span> Verifikasi...';

        try {
            const payload = await verifyLicense(key);
            const session = getSession();
            if (payload.m && payload.m !== "*" && payload.m !== session.machineId) {
                throw new Error("License ini untuk Machine ID lain. Machine ID Anda: " + shortMid(session.machineId));
            }
            updateSession({ licenseKey: key, payload: payload });
            closeLicenseModal();
            renderDashboard();
        } catch (e) {
            err.textContent = "Gagal: " + e.message;
            show(err);
        } finally {
            btn.disabled = false;
            btn.textContent = "Verifikasi & Simpan";
        }
    }

    // ============================================================
    // INIT — semua event listener
    // ============================================================
    function init() {
        // Login form
        const form = $("#loginForm");
        if (form) form.addEventListener("submit", handleLogin);

        // Logout
        const navLogout = $("#navLogout");
        if (navLogout) navLogout.addEventListener("click", doLogout);

        // MID modal
        const genBtn = $("#generateMidBtn");
        if (genBtn) genBtn.addEventListener("click", openMidModal);
        const midClose = $("#midModalClose");
        if (midClose) midClose.addEventListener("click", closeMidModal);
        const midBg = $("#midModal");
        if (midBg) midBg.addEventListener("click", function (e) { if (e.target === midBg) closeMidModal(); });
        const midUse = $("#midModalUse");
        if (midUse) midUse.addEventListener("click", function () {
            if (_generatedMid) {
                $("#midInput").value = _generatedMid;
                const hint = $("#midHint");
                if (hint) { hint.innerHTML = "Machine ID sudah diisi otomatis. Siap login."; hint.style.color = "#32A852"; }
            }
            closeMidModal();
        });

        // License modal
        const pasteBtn = $("#pasteLicenseBtn");
        if (pasteBtn) pasteBtn.addEventListener("click", openLicenseModal);
        const mCancel = $("#modalCancel");
        if (mCancel) mCancel.addEventListener("click", closeLicenseModal);
        const licBg = $("#licenseModal");
        if (licBg) licBg.addEventListener("click", function (e) { if (e.target === licBg) closeLicenseModal(); });
        const mConfirm = $("#modalConfirm");
        if (mConfirm) mConfirm.addEventListener("click", handleLicenseConfirm);

        // Remove license
        const removeBtn = $("#removeLicenseBtn");
        if (removeBtn) removeBtn.addEventListener("click", function () {
            if (!confirm("Hapus License dari dashboard? Anda bisa masukkan lagi kapan saja.")) return;
            const s = getSession() || {};
            delete s.licenseKey;
            delete s.payload;
            saveSession(s);
            renderDashboard();
        });

        // Buy PRO
        const buyBtn = $("#buyProBtn");
        if (buyBtn) buyBtn.addEventListener("click", function () { window.open(WA_URL, "_blank", "noopener"); });

        // Start
        const s = getSession();
        if (s && s.email && s.machineId) {
            showDashboard();
        } else {
            showLogin();
            autoLoadMid(); // hanya auto-load kalau belum login
        }

        console.log("[App] Init complete. getMachineId typeof:", typeof getMachineId);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();