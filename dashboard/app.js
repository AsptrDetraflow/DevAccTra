// ============================================================
// DevAccTra Dashboard — Backend-Driven
// Semua data customer di server. localStorage = cache session only.
// ============================================================
(function () {
    "use strict";

    const PUBLIC_KEY_B64 = "kN08rrwZddPxF2KjSIgZ0bH6veMmE94ExuEE3FbGs6s=";
    const SESSION_KEY   = "devacctra_session_v2";
    const MID_CACHE_KEY = "devacctra_machine_id_v3";
    const WA_NUMBER     = "6287888370395";
    const WA_MSG        = encodeURIComponent("Halo, saya mau beli License PRO DevAccTra");
    const WA_URL        = "https://wa.me/" + WA_NUMBER + "?text=" + WA_MSG;
    const DIST          = "https://asptrdetraflow.github.io/DevAccTra/dist";
    const API_URL       = "https://devacctra-api.up.railway.app";
    const DEFAULT_MAX_DEVICES = 2;

    const RX_USERNAME = /^[a-zA-Z0-9_]{3,20}$/;
    const RX_EMAIL    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const RX_MID      = /^[a-f0-9]{64}$/;

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
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
    const show = el => el && el.classList.remove("hidden");
    const hide = el => el && el.classList.add("hidden");

    // ============================================================
    // STATE — customer data from backend
    // ============================================================
    let CURRENT_CUSTOMER = null; // { id, username, email, machine_ids[], license_key, ... }
    let CURRENT_PAYLOAD  = null; // parsed license payload (local)

    // ============================================================
    // SESSION (hanya simpan username sebagai pointer)
    // ============================================================
    function getSession() {
        try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
        catch (e) { return null; }
    }
    function saveSession(s) {
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {}
    }
    function clearSession() {
        try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    }

    // ============================================================
    // API HELPER
    // ============================================================
    async function apiCall(path, body, method) {
        const res = await fetch(API_URL + path, {
            method: method || "POST",
            headers: { "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined,
        });
        let data;
        try { data = await res.json(); } catch (e) { data = {}; }
        if (!res.ok) {
            const msg = data.detail || data.message || ("HTTP " + res.status);
            const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
            err.status = res.status;
            err.data = data;
            throw err;
        }
        return data;
    }

    // ============================================================
    // MACHINE ID
    // ============================================================
    async function getMachineId() {
        try {
            const params = new URLSearchParams(location.search);
            const urlMid = params.get("mid");
            if (urlMid && urlMid.length >= 20) {
                try { localStorage.setItem(MID_CACHE_KEY, urlMid); } catch (e) {}
                history.replaceState(null, "", location.pathname);
                return urlMid;
            }
        } catch (e) {}
        try {
            const cached = localStorage.getItem(MID_CACHE_KEY);
            if (cached && cached.length >= 20) return cached;
        } catch (e) {}
        if (!window.crypto || !window.crypto.subtle || !window.crypto.subtle.digest) {
            throw new Error("Browser tidak support crypto.subtle. Pakai Chrome/Edge/Firefox terbaru.");
        }
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
    async function verifyLicense(key) {
        const parts = String(key || "").trim().split(".");
        if (parts.length !== 2) throw new Error("Format License Key tidak valid");
        const pk = await crypto.subtle.importKey("raw", b64ToBytes(PUBLIC_KEY_B64), { name: "Ed25519" }, false, ["verify"]);
        const ok = await crypto.subtle.verify(
            { name: "Ed25519" },
            pk,
            b64urlToBytes(parts[1]),
            new TextEncoder().encode(parts[0])
        );
        if (!ok) throw new Error("License tidak sah");
        const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
        const today = new Date().toISOString().slice(0, 10);
        if (payload.e < today) throw new Error("License sudah kadaluarsa");
        return payload;
    }

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
    function showAuth() {
        show($("#authView"));
        hide($("#dashboardView"));
        hide($("#navLogout"));
        switchTab("login");
    }
    function showDashboard() {
        hide($("#authView"));
        show($("#dashboardView"));
        show($("#navLogout"));
        renderDashboard();
    }
    function switchTab(tab) {
        $$(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
        $$(".view-panel").forEach(p => p.classList.remove("active"));
        const panel = $("#panel" + tab.charAt(0).toUpperCase() + tab.slice(1));
        if (panel) panel.classList.add("active");
        hide($("#loginError"));
        hide($("#registerError"));
    }

    // ============================================================
    // MID MODAL
    // ============================================================
    let _generatedMid = null;
    let _midTarget = null;

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
                '<div class="alert alert-info" style="margin:14px 0 0"><i>&#8505;</i><div>Simpan ID ini. Akan dipakai untuk login.</div></div>';
            const cb = $("#copyMidDetail");
            cb.addEventListener("click", function () {
                navigator.clipboard.writeText(mid).then(function () {
                    cb.textContent = "OK!";
                    cb.classList.add("ok");
                    setTimeout(function () { cb.textContent = "Copy"; cb.classList.remove("ok"); }, 1500);
                }).catch(function () { alert("Copy manual: " + mid); });
            });
        } catch (e) {
            box.innerHTML = '<div class="alert alert-error" style="margin:0"><i>&#10007;</i><div><b>Gagal generate MID.</b><br>' + escapeHtml(e.message) + '</div></div>';
        }
    }
    function openMidModal(targetId) {
        _midTarget = targetId;
        $("#midModal").classList.add("show");
        generateMid();
    }
    function closeMidModal() { $("#midModal").classList.remove("show"); }

    // ============================================================
    // SYNC MODAL (backend-driven)
    // ============================================================
    let _syncResolver = null;

    function openSyncModal(customer, newMid) {
        return new Promise(function (resolve, reject) {
            _syncResolver = { customer: customer, newMid: newMid, resolve: resolve, reject: reject };
            $("#syncOldMid").value = "";
            hide($("#syncError"));
            const maxEl = $("#syncMax");
            if (maxEl) maxEl.textContent = maxDev;
            const info = $("#syncInfo");
            const mids = customer.machine_ids || [];
            info.innerHTML =
                '<b>Akun ditemukan: ' + escapeHtml(customer.username) + '</b><br>' +
                'Terdaftar dengan <b>' + mids.length + '</b> Machine ID.<br>' +
                'MID device ini: <code style="font-family:Consolas;font-size:.7rem">' + shortMid(newMid) + '</code>';
            show(info);
            $("#syncModal").classList.add("show");
            setTimeout(() => $("#syncOldMid").focus(), 100);
        });
    }
    function closeSyncModal(cancel) {
        $("#syncModal").classList.remove("show");
        if (_syncResolver && cancel) {
            _syncResolver.reject(new Error("Dibatalkan"));
            _syncResolver = null;
        }
    }

    async function handleSyncConfirm() {
        if (!_syncResolver) return;
        const err = $("#syncError");
        const btn = $("#syncConfirm");
        const oldMid = $("#syncOldMid").value.trim();
        hide(err);
        if (!oldMid) { err.textContent = "Machine ID lama wajib diisi."; show(err); return; }

        const { customer, newMid, resolve, reject } = _syncResolver;

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-dot" style="border-top-color:#fff;border-color:rgba(255,255,255,.3)"></span> Memproses...';

        try {
            const data = await apiCall("/api/customer/sync", {
                identifier: customer.username,
                old_machine_id: oldMid,
                new_machine_id: newMid,
            });
            closeSyncModal(false);
            _syncResolver = null;
            resolve(data);
        } catch (e) {
            err.textContent = e.message;
            show(err);
        } finally {
            btn.disabled = false;
            btn.textContent = "Sinkronkan";
        }
    }

    // ============================================================
    // REGISTER (backend)
    // ============================================================
    async function handleRegister(e) {
        e.preventDefault();
        const username = $("#regUsername").value.trim();
        const email = $("#regEmail").value.trim();
        const mid = ($("#regMid").value || "").trim();
        const err = $("#registerError");
        hide(err);
        ["#errUsername", "#errEmail", "#errMid"].forEach(s => hide($(s)));
        $$("#registerForm input").forEach(i => i.classList.remove("error"));

        let hasErr = false;
        if (!RX_USERNAME.test(username)) { showError("#errUsername", "Username: 3-20 karakter (a-z, A-Z, 0-9, _)"); hasErr = true; }
        if (!RX_EMAIL.test(email)) { showError("#errEmail", "Format email tidak valid"); hasErr = true; }
        if (!RX_MID.test(mid)) { showError("#errMid", "Machine ID harus 64 karakter hex"); hasErr = true; }
        if (hasErr) { err.textContent = "Periksa kembali data."; show(err); return; }

        const btn = $("#registerBtn");
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-dot" style="border-top-color:#fff;border-color:rgba(255,255,255,.3)"></span> Memproses...';

        try {
            const data = await apiCall("/api/customer/register", {
                username: username,
                email: email,
                machine_id: mid,
            });

            if (data.needs_sync) {
                // Buka modal sync
                try {
                    const syncResult = await openSyncModal(data.customer, mid);
                    CURRENT_CUSTOMER = syncResult.customer;
                    saveSession({ username: CURRENT_CUSTOMER.username, loggedInAt: Date.now() });
                    await loadLicensePayload();
                    showDashboard();
                } catch (e) {
                    // User cancel
                }
                return;
            }

            // Created atau login
            CURRENT_CUSTOMER = data.customer;
            saveSession({ username: CURRENT_CUSTOMER.username, loggedInAt: Date.now() });
            await loadLicensePayload();
            showDashboard();

            // Auto-download JSON kalau baru register
            if (data.action === "created") {
                downloadBackup(CURRENT_CUSTOMER);
            }
        } catch (e) {
            err.textContent = "Gagal: " + e.message;
            show(err);
        } finally {
            btn.disabled = false;
            btn.textContent = "Daftar & Login";
        }
    }

    function showError(sel, msg) {
        const el = $(sel);
        if (el) { el.textContent = msg; el.classList.add("show"); }
    }

    // ============================================================
    // LOGIN (backend)
    // ============================================================
    async function handleLogin(e) {
        e.preventDefault();
        const identifier = $("#loginIdentifier").value.trim();
        const mid = ($("#loginMid").value || "").trim();
        const err = $("#loginError");
        hide(err);

        if (!identifier) { err.textContent = "Username/email wajib diisi."; show(err); return; }
        if (!mid) { err.textContent = "Machine ID wajib diisi."; show(err); return; }

        const btn = $("#loginBtn");
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-dot" style="border-top-color:#fff;border-color:rgba(255,255,255,.3)"></span> Memproses...';

        try {
            const data = await apiCall("/api/customer/login", {
                identifier: identifier,
                machine_id: mid,
            });

            if (data.needs_sync) {
                try {
                    const syncResult = await openSyncModal(data.customer, mid);
                    CURRENT_CUSTOMER = syncResult.customer;
                    saveSession({ username: CURRENT_CUSTOMER.username, loggedInAt: Date.now() });
                    await loadLicensePayload();
                    showDashboard();
                } catch (e) {
                    // User cancel
                }
                return;
            }

            CURRENT_CUSTOMER = data.customer;
            saveSession({ username: CURRENT_CUSTOMER.username, loggedInAt: Date.now() });
            await loadLicensePayload();
            showDashboard();
        } catch (e) {
            err.textContent = e.message;
            show(err);
        } finally {
            btn.disabled = false;
            btn.textContent = "Masuk";
        }
    }

    function doLogout() {
        if (!confirm("Logout dari dashboard?")) return;
        clearSession();
        CURRENT_CUSTOMER = null;
        CURRENT_PAYLOAD = null;
        showAuth();
    }

    // ============================================================
    // LOAD LICENSE PAYLOAD (verify local from customer.license_key)
    // ============================================================
    async function loadLicensePayload() {
        CURRENT_PAYLOAD = null;
        if (CURRENT_CUSTOMER && CURRENT_CUSTOMER.license_key) {
            try {
                CURRENT_PAYLOAD = await verifyLicense(CURRENT_CUSTOMER.license_key);
            } catch (e) {
                console.warn("[License] Verify failed:", e.message);
            }
        }
    }

    // ============================================================
    // REFRESH FROM BACKEND
    // ============================================================
    async function refreshCustomer() {
        const s = getSession();
        if (!s || !s.username) return false;
        try {
            const data = await apiCall("/api/customer/me?identifier=" + encodeURIComponent(s.username), null, "GET");
            CURRENT_CUSTOMER = data.customer;
            await loadLicensePayload();
            return true;
        } catch (e) {
            console.warn("[Refresh] Failed:", e.message);
            if (e.status === 404) {
                clearSession();
            }
            return false;
        }
    }

    // ============================================================
    // BACKUP JSON
    // ============================================================
    function downloadBackup(customer) {
        if (!customer) return;
        const data = {
            app: "DevAccTra",
            version: "2.0",
            type: "account_backup",
            exportedAt: new Date().toISOString(),
            account: {
                username: customer.username,
                email: customer.email,
                machine_ids: customer.machine_ids || [],
                created_at: customer.created_at,
                license_key: customer.license_key || null,
            },
            note: "Simpan file ini. Import di dashboard baru untuk restore akun.",
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "devacctra-" + customer.username + "-backup.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ============================================================
    // IMPORT JSON
    // ============================================================
    function handleImportJson() {
        const fileInput = $("#importJsonFile");
        fileInput.value = "";
        fileInput.click();
    }

    async function handleImportFile(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const json = JSON.parse(text);
            if (!json.account || !json.account.username) {
                throw new Error("File JSON tidak valid");
            }
            const acc = json.account;
            // Auto-fill register form
            switchTab("register");
            $("#regUsername").value = acc.username || "";
            $("#regEmail").value = acc.email || "";
            // Set MID: kalau ada MID di JSON yang cocok dengan browser saat ini, pakai itu
            // Kalau tidak, biar auto-load
            const curMid = $("#regMid").value;
            if (!curMid) {
                try { $("#regMid").value = await getMachineId(); } catch (err) {}
            }
            // Kalau JSON ada license_key, kita simpan dulu di variabel temporary
            if (acc.license_key) {
                window.__importedLicenseKey = acc.license_key;
            }
            // Info ke user
            const err = $("#registerError");
            err.className = "alert alert-info";
            err.textContent = "Data dari backup terisi. Klik 'Daftar & Login' untuk melanjutkan.";
            err.classList.remove("hidden");
        } catch (err) {
            const errBox = $("#registerError");
            errBox.className = "alert alert-error";
            errBox.textContent = "Gagal membaca JSON: " + err.message;
            errBox.classList.remove("hidden");
        }
    }

    // ============================================================
    // DEVICE LIST (dari backend)
    // ============================================================
    function renderDeviceList() {
        const box = $("#deviceList");
        const maxEl = $("#deviceMax");
        if (!box || !CURRENT_CUSTOMER) return;

        const maxDev = parseInt(CURRENT_CUSTOMER.max_devices) || DEFAULT_MAX_DEVICES;
        if (maxEl) maxEl.textContent = maxDev;

        const mids = CURRENT_CUSTOMER.machine_ids || [];
        let curMid = "";
        try { curMid = localStorage.getItem(MID_CACHE_KEY) || ""; } catch (e) {}

        if (!mids.length) {
            box.innerHTML = '<div class="hint" style="color:#69756D">Belum ada device terdaftar.</div>';
            return;
        }

        box.innerHTML = mids.map(function (m, i) {
            const isCurrent = m === curMid;
            const isOldest = i === 0 && mids.length >= maxDev;
            return '<div style="display:flex;gap:10px;align-items:center;padding:10px 12px;border:1px solid ' + (isCurrent ? '#32A852' : 'rgba(23,34,29,.08)') + ';border-radius:10px;margin-bottom:8px;background:' + (isCurrent ? 'rgba(50,168,82,.05)' : '#fff') + '">' +
                '<div style="flex:1;min-width:0">' +
                    '<div style="font-family:Consolas,monospace;font-size:.72rem;word-break:break-all;color:#17221D">' + m + '</div>' +
                    '<div style="font-size:.68rem;color:#69756D;margin-top:2px">' +
                        (isCurrent ? '<b style="color:#32A852">Device ini</b>' : 'Device lain') +
                        (isOldest ? ' &middot; <span style="color:#D97706">Paling lama</span>' : '') +
                    '</div>' +
                '</div>' +
            '</div>';
        }).join("") +
        '<div style="font-size:.72rem;color:#69756D;margin-top:8px">' + mids.length + ' / ' + maxDev + ' device aktif</div>';
    }

    // ============================================================
    // LICENSE STATUS
    // ============================================================
    function renderLicenseStatus() {
        const box = $("#licenseStatusContent");
        const payBtn = $("#buyProBtn");
        const pasteBtn = $("#pasteLicenseBtn");
        const removeBtn = $("#removeLicenseBtn");
        if (!box || !CURRENT_CUSTOMER) return;

        const hasLicense = CURRENT_CUSTOMER.license_key && CURRENT_PAYLOAD;

        if (!hasLicense) {
            box.innerHTML = '<div class="alert alert-warn" style="margin:0"><i>&#9888;</i><div><b>Belum ada License PRO.</b><br>Anda hanya bisa download versi <b>Trial</b>. Untuk versi PRO (berlaku semua produk), masukkan License Key dari Admin atau hubungi kami.</div></div>';
            show(pasteBtn); show(payBtn); hide(removeBtn);
            return;
        }

        const p = CURRENT_PAYLOAD;
        const tier = (p.t || "").toLowerCase();
        const isPro = isProTier(tier);
        const exp = p.e || "-";
        const days = daysRemaining(exp);

        box.innerHTML =
            '<div class="info-row"><span class="label">Tier</span><span class="value"><span class="badge badge-' + (tier || "pro") + '">' + (tier || "pro") + '</span></span></div>' +
            '<div class="info-row"><span class="label">Berlaku sampai</span><span class="value">' + fmtDate(exp) + ' <small style="color:#69756D">(' + days + ' hari)</small></span></div>' +
            (isPro
                ? '<div class="alert alert-success" style="margin:12px 0 0"><i>&#10003;</i><div><b>Akses PRO aktif.</b> Semua produk bisa di-download versi PRO.</div></div>'
                : '<div class="alert alert-info" style="margin:12px 0 0"><i>&#8505;</i><div>License tier <b>' + tier + '</b> tidak membuka akses PRO.</div></div>');
        show(removeBtn);
        if (isPro) hide(pasteBtn); else show(pasteBtn);
        show(payBtn);
    }

    // ============================================================
    // PRODUCTS
    // ============================================================
    function renderProducts() {
        const grid = $("#productsGrid");
        if (!grid || !CURRENT_CUSTOMER) return;
        const hasPro = CURRENT_PAYLOAD && isProTier(CURRENT_PAYLOAD.t);

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
                    : '<button class="product-btn product-btn-pro" data-open-license="1" type="button"><svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5 3.8 9.4 9 11 5.2-1.6 9-6 9-11V5l-9-4z"/></svg> Butuh License</button>');
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
        if (!CURRENT_CUSTOMER) { showAuth(); return; }

        $("#heroUsername").textContent = CURRENT_CUSTOMER.username;
        $("#heroEmail").textContent = CURRENT_CUSTOMER.email;

        const mids = CURRENT_CUSTOMER.machine_ids || [];
        let curMid = mids[0] || "-";
        try {
            const cached = localStorage.getItem(MID_CACHE_KEY);
            if (cached && mids.includes(cached)) curMid = cached;
        } catch (e) {}
        $("#heroMid").textContent = shortMid(curMid);

        renderProducts();
        renderLicenseStatus();
        renderDeviceList();

        const cb = $("#copyMidHero");
        cb.onclick = function () {
            navigator.clipboard.writeText(curMid).then(function () {
                cb.textContent = "OK!";
                cb.classList.add("ok");
                setTimeout(function () { cb.textContent = "Copy"; cb.classList.remove("ok"); }, 1500);
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
        setTimeout(() => $("#licenseTextarea").focus(), 100);
    }
    function closeLicenseModal() { $("#licenseModal").classList.remove("show"); }

    async function handleLicenseConfirm() {
        const key = $("#licenseTextarea").value.trim();
        const err = $("#modalError");
        const btn = $("#modalConfirm");
        hide(err);
        if (!key) { err.textContent = "License Key kosong."; show(err); return; }
        if (!CURRENT_CUSTOMER) { err.textContent = "Session hilang. Login ulang."; show(err); return; }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-dot" style="border-top-color:#fff;border-color:rgba(255,255,255,.3)"></span> Verifikasi...';

        try {
            // 1. Verify local (Ed25519)
            const payload = await verifyLicense(key);

            // 2. Cek MID match
            const allowedMids = Array.isArray(payload.m) ? payload.m : [payload.m];
            const myMids = CURRENT_CUSTOMER.machine_ids || [];
            const isWildcard = allowedMids.includes("*");
            const hasMatch = isWildcard || myMids.some(m => allowedMids.includes(m));

            if (!hasMatch) {
                throw new Error("License ini tidak cocok dengan MID device ini. Hubungi admin untuk rebind, atau masuk ke device yang MID-nya terdaftar.");
            }

            // 3. Save ke backend
            await apiCall("/api/customer/set-license", {
                identifier: CURRENT_CUSTOMER.username,
                license_key: key,
            });

            // 4. Update local state
            CURRENT_CUSTOMER.license_key = key;
            CURRENT_PAYLOAD = payload;

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
    // REMOVE LICENSE
    // ============================================================
    async function handleRemoveLicense() {
        if (!CURRENT_CUSTOMER) return;
        if (!confirm("Hapus License dari akun?")) return;
        try {
            await apiCall("/api/customer/set-license", {
                identifier: CURRENT_CUSTOMER.username,
                license_key: "",
            });
            CURRENT_CUSTOMER.license_key = null;
            CURRENT_PAYLOAD = null;
            renderDashboard();
        } catch (e) {
            alert("Gagal hapus: " + e.message);
        }
    }

    // ============================================================
    // AUTO-LOAD MID
    // ============================================================
    async function autoLoadMid(inputId, hintId) {
        const input = $("#" + inputId);
        const hint = $("#" + hintId);
        if (!input) return;
        try {
            const mid = await getMachineId();
            if (!input.value) {
                input.value = mid;
                if (hint) { hint.innerHTML = "Machine ID terisi otomatis. Bisa diedit manual."; hint.style.color = "#32A852"; }
            }
        } catch (e) { console.log("[MID]", e.message); }
    }

    // ============================================================
    // INIT
    // ============================================================
    function init() {
        // Tabs
        $$(".tab-btn").forEach(function (btn) {
            btn.addEventListener("click", function () { switchTab(btn.dataset.tab); });
        });

        // Forms
        const rForm = $("#registerForm");
        if (rForm) rForm.addEventListener("submit", handleRegister);
        const lForm = $("#loginForm");
        if (lForm) lForm.addEventListener("submit", handleLogin);

        // MID buttons
        $$("[data-mid-target]").forEach(function (btn) {
            btn.addEventListener("click", function () { openMidModal(btn.dataset.midTarget); });
        });
        const midClose = $("#midModalClose");
        if (midClose) midClose.addEventListener("click", closeMidModal);
        const midBg = $("#midModal");
        if (midBg) midBg.addEventListener("click", function (e) { if (e.target === midBg) closeMidModal(); });
        const midUse = $("#midModalUse");
        if (midUse) midUse.addEventListener("click", function () {
            if (_generatedMid && _midTarget) {
                const target = $("#" + _midTarget);
                if (target) target.value = _generatedMid;
                const hint = target && target.parentElement.parentElement.querySelector(".hint");
                if (hint) { hint.innerHTML = "Machine ID terisi."; hint.style.color = "#32A852"; }
            }
            closeMidModal();
        });

        // Sync modal
        const syncCancel = $("#syncCancel");
        if (syncCancel) syncCancel.addEventListener("click", function () { closeSyncModal(true); });
        const syncBg = $("#syncModal");
        if (syncBg) syncBg.addEventListener("click", function (e) { if (e.target === syncBg) closeSyncModal(true); });
        const syncConfirm = $("#syncConfirm");
        if (syncConfirm) syncConfirm.addEventListener("click", handleSyncConfirm);

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
        if (removeBtn) removeBtn.addEventListener("click", handleRemoveLicense);

        // Buy PRO
        const buyBtn = $("#buyProBtn");
        if (buyBtn) buyBtn.addEventListener("click", function () { window.open(WA_URL, "_blank", "noopener"); });

        // Download JSON
        const dlBtn = $("#downloadJsonBtn");
        if (dlBtn) dlBtn.addEventListener("click", function () {
            if (CURRENT_CUSTOMER) downloadBackup(CURRENT_CUSTOMER);
        });

        // Import JSON
        const importBtn = $("#importJsonBtn");
        if (importBtn) importBtn.addEventListener("click", handleImportJson);
        const importFile = $("#importJsonFile");
        if (importFile) importFile.addEventListener("change", handleImportFile);

        // Logout
        const navLogout = $("#navLogout");
        if (navLogout) navLogout.addEventListener("click", doLogout);
        const logout2 = $("#logoutBtn2");
        if (logout2) logout2.addEventListener("click", doLogout);

        // Start
        (async function boot() {
            const s = getSession();
            if (s && s.username) {
                const ok = await refreshCustomer();
                if (ok) { showDashboard(); return; }
            }
            showAuth();
            autoLoadMid("loginMid", "loginMidHint");
            autoLoadMid("regMid", "regMidHint");
        })();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();