// ============================================================
// DevAccTra Dashboard â€” App v3.0
// Backend-driven. Source of truth: /api/customer/me
// ============================================================
(function () {
    "use strict";

    const PUBLIC_KEY_B64 = "kN08rrwZddPxF2KjSIgZ0bH6veMmE94ExuEE3FbGs6s=";
    const API_URL = "https://devacctra-api.up.railway.app";
    const SESSION_KEY = "devacctra_dashboard_session_v3";
    const MID_CACHE_KEY = "devacctra_dashboard_mid_v35";
    const WA_NUMBER = "6287888370395";
    const WA_MSG = encodeURIComponent("Halo, saya mau beli License PRO DevAccTra");
    const WA_URL = "https://wa.me/" + WA_NUMBER + "?text=" + WA_MSG;
    const DIST = "https://asptrdetraflow.github.io/DevAccTra/dist";
    const DEFAULT_MAX_DEVICES = 2;

    const RX_USERNAME = /^[a-zA-Z0-9_]{3,20}$/;
    const RX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const RX_MID = /^[a-f0-9]{64}$/;

    const PRODUCTS = [
        { id: "coretax-toolkit", name: "Coretax PDF Downloader", type: "Chrome Extension", accent: "dev",
          desc: "Download PDF Faktur Pajak Keluaran, Masukan, dan Bukti Potong dari Coretax.",
          trial: "CoretaxPDFDownloader-Trial.zip", pro: "CoretaxPDFDownloader-Pro.zip", available: true },
        { id: "rekap-faktur", name: "Rekap Faktur", type: "Software Desktop", accent: "tra",
          desc: "Rekap faktur pajak dari PDF ke Excel siap pelaporan SPT.",
          trial: "RekapinFaktur-Trial.zip", pro: "RekapinFaktur-Pro.zip", available: false },
        { id: "rekap-bupot-bppu", name: "Rekap Bupot BPPU", type: "Software Desktop", accent: "acc",
          desc: "Rekap Bukti Potong BPPU dari folder PDF ke Excel dengan deteksi duplikat.",
          trial: "RekapinBupotBPPU-Trial.zip", pro: "RekapinBupotBPPU-Pro.zip", available: false },
        { id: "rekap-bank-bca", name: "Rekap Bank BCA", type: "Software Desktop", accent: "sage",
          desc: "Ekstrak mutasi bank BCA dari PDF atau CSV ke Excel siap rekonsiliasi.",
          trial: "RekapinBankBCA-Trial.zip", pro: "RekapinBankBCA-Pro.zip", available: false },
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

    let CURRENT_CUSTOMER = null;
    let CURRENT_PAYLOAD = null;
    let _generatedMid = null;
    let _midTarget = null;
    let _syncResolver = null;

    // HELPERS
    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
    }
    function fmtDate(iso) {
        if (!iso) return "-";
        const d = new Date(iso);
        return isNaN(d) ? "-" : d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
    }
    function shortMid(m) {
        if (!m) return "-";
        return m.length > 20 ? m.substring(0, 10) + "..." + m.substring(m.length - 6) : m;
    }
    function daysRemaining(exp) {
        if (!exp) return 0;
        const e = new Date(exp + "T23:59:59").getTime();
        return Math.max(0, Math.ceil((e - Date.now()) / 86400000));
    }
    function isProTier(t) {
        t = (t || "").toLowerCase();
        return t === "pro" || t === "basic" || t === "enterprise" || t === "lifetime" || t === "subscription";
    }
    function toast(msg, type) {
        type = type || "success";
        let wrap = $("#toastWrap");
        if (!wrap) { wrap = document.createElement("div"); wrap.id = "toastWrap"; wrap.className = "toast-wrap"; document.body.appendChild(wrap); }
        const el = document.createElement("div");
        el.className = "toast " + type;
        el.innerHTML = '<i class="fa-solid ' + (type === "error" ? "fa-circle-xmark" : "fa-circle-check") + '"></i><span>' + escapeHtml(msg) + "</span>";
        wrap.appendChild(el);
        setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(() => el.remove(), 300); }, 3200);
    }
    async function copyText(t) {
        if (!t) return false;
        try { await navigator.clipboard.writeText(t); return true; } catch (e) { return false; }
    }

    // SESSION
    function getSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (e) { return null; } }
    function saveSession(s) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(Object.assign({}, s, { savedAt: Date.now() }))); } catch (e) {} }
    function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }

    // API
    async function apiCall(path, body, method) {
        method = method || "POST";
        const opts = { method: method, headers: { "Content-Type": "application/json" } };
        if (body !== null && body !== undefined) opts.body = JSON.stringify(body);
        let res;
        try { res = await fetch(API_URL + path, opts); }
        catch (e) { throw new Error("Network error: " + e.message); }
        let data;
        try { data = await res.json(); } catch (e) { data = {}; }
        if (!res.ok) {
            const d = data.detail || data.message || ("HTTP " + res.status);
            const err = new Error(typeof d === "string" ? d : JSON.stringify(d));
            err.status = res.status;
            throw err;
        }
        return data;
    }

    // MID
    // ============================================================
    // MID v3.1 — HARUS SAMA PERSIS dengan formula extension v3.1
    // Formula: platform + userAgentData.platform + uaData.architecture
    //        + uaData.bitness + hardwareConcurrency
    // Dibuang (biang MID berubah-ubah):
    //   userAgent, timeZone, timezoneOffset, language, deviceMemory
    // ============================================================
    let _hePromise = null;
    async function getHighEntropyCached() {
        if (_hePromise) return _hePromise;
        try {
            const stored = JSON.parse(localStorage.getItem("devacctra_he_v35") || "null");
            if (stored) return stored;
        } catch (e) {}
        _hePromise = (async () => {
            const uaData = navigator.userAgentData || {};
            const he = { model: uaData.model || "", platformVersion: "", architecture: uaData.architecture || "", bitness: uaData.bitness || "" };
            if (uaData.getHighEntropyValues) {
                try {
                    const h = await uaData.getHighEntropyValues(["model", "platformVersion", "architecture", "bitness"]);
                    he.model = h.model || he.model;
                    he.platformVersion = h.platformVersion || "";
                    he.architecture = h.architecture || he.architecture;
                    he.bitness = h.bitness || he.bitness;
                } catch (e) {}
            }
            try { localStorage.setItem("devacctra_he_v35", JSON.stringify(he)); } catch (e) {}
            return he;
        })();
        return _hePromise;
    }
    async function getMachineId(force) {
        if (!force) {
            try {
                const p = new URLSearchParams(location.search);
                const urlMid = p.get("mid");
                if (urlMid && urlMid.length >= 40) {
                    try { localStorage.setItem(MID_CACHE_KEY, urlMid); } catch (e) {}
                    history.replaceState(null, "", location.pathname);
                    return urlMid;
                }
            } catch (e) {}
            try { const c = localStorage.getItem(MID_CACHE_KEY); if (c && c.length >= 40) return c; } catch (e) {}
        }
        if (!window.crypto || !window.crypto.subtle || !window.crypto.subtle.digest) {
            throw new Error("Browser tidak support crypto.subtle.");
        }
        const uaData = navigator.userAgentData || {};
        const he = await getHighEntropyCached();
        const parts = [
            navigator.platform || "",
            uaData.platform || "",
            he.architecture,
            he.bitness,
            he.model,
            he.platformVersion,
            String(navigator.hardwareConcurrency || 0),
        ];
        const fp = parts.join("|");
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fp));
        const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
        try { localStorage.setItem(MID_CACHE_KEY, hex); } catch (e) {}
        console.log("[Dashboard MID v3.5] generated:", hex.substring(0, 16) + "...", "| model:", he.model || "-", "| platVer:", he.platformVersion || "-");
        return hex;
    }

    // LICENSE VERIFY
    function b64ToBytes(b) { const bin = atob(b); const a = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i); return a; }
    function b64urlToBytes(s) { s = s.replace(/-/g,"+").replace(/_/g,"/"); while (s.length%4) s+="="; const bin=atob(s); const a=new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i); return a; }
    async function verifyLicense(key) {
        const parts = String(key || "").trim().split(".");
        if (parts.length !== 2) throw new Error("Format license tidak valid");
        const pk = await crypto.subtle.importKey("raw", b64ToBytes(PUBLIC_KEY_B64), { name: "Ed25519" }, false, ["verify"]);
        const ok = await crypto.subtle.verify({ name: "Ed25519" }, pk, b64urlToBytes(parts[1]), new TextEncoder().encode(parts[0]));
        if (!ok) throw new Error("License tidak sah");
        const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
        const today = new Date().toISOString().slice(0, 10);
        if (payload.e < today) throw new Error("License kadaluarsa");
        return payload;
    }

    // VIEW
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
        $$(".auth-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
        $$(".auth-panel").forEach(p => p.classList.remove("active"));
        const p = $("#panel" + tab.charAt(0).toUpperCase() + tab.slice(1));
        if (p) p.classList.add("active");
        hide($("#loginError"));
        hide($("#registerError"));
    }

    // MID MODAL
    async function generateMid() {
        const box = $("#midModalContent");
        box.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--muted);font-size:.85rem"><span class="spinner-dot"></span> Mendeteksi...</div>';
        try {
            const mid = await getMachineId(true);
            _generatedMid = mid;
            box.innerHTML =
                '<div class="mid-detail-box"><code>' + mid + '</code><button type="button" class="btn-copy-mid" id="copyMidDetail">Copy</button></div>' +
                '<div class="alert alert-info" style="margin:14px 0 0"><i>&#8505;</i><div>Simpan ID ini untuk login.</div></div>';
            $("#copyMidDetail").addEventListener("click", async () => {
                const ok = await copyText(mid);
                if (ok) toast("Copied");
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

    // SYNC MODAL
    function openSyncModal(customer, newMid) {
        return new Promise((resolve, reject) => {
            _syncResolver = { customer, newMid, resolve, reject };
            $("#syncOldMid").value = "";
            hide($("#syncError"));
            const maxDev = parseInt(customer.max_devices) || DEFAULT_MAX_DEVICES;
            $("#syncInfo").innerHTML =
                "<b>Akun: " + escapeHtml(customer.username) + "</b><br>" +
                "Terdaftar <b>" + customer.machine_ids.length + "</b> dari " + maxDev + " MID.<br>" +
                "MID device ini: <code style='font-family:monospace;font-size:.7rem'>" + shortMid(newMid) + "</code>";
            show($("#syncInfo"));
            $("#syncModal").classList.add("show");
            setTimeout(() => $("#syncOldMid").focus(), 100);
        });
    }
    function closeSyncModal(cancel) {
        $("#syncModal").classList.remove("show");
        if (_syncResolver && cancel) { _syncResolver.reject(new Error("Dibatalkan")); _syncResolver = null; }
    }
    async function handleSyncConfirm() {
        if (!_syncResolver) return;
        const err = $("#syncError");
        const btn = $("#syncConfirm");
        const oldMid = $("#syncOldMid").value.trim();
        hide(err);
        if (!RX_MID.test(oldMid)) { err.textContent = "Format MID tidak valid (64 hex)"; show(err); return; }
        const res = _syncResolver;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-dot"></span> Memproses...';
        try {
            const data = await apiCall("/api/customer/sync", {
                identifier: res.customer.username,
                old_machine_id: oldMid,
                new_machine_id: res.newMid,
            });
            closeSyncModal(false);
            _syncResolver = null;
            res.resolve(data);
        } catch (e) {
            err.textContent = e.message;
            show(err);
        } finally {
            btn.disabled = false;
            btn.textContent = "Sinkronkan";
        }
    }

    // AUTH RESPONSE
    async function handleAuthResponse(data, mid) {
        if (data.needs_sync && data.customer) {
            try {
                const r = await openSyncModal(data.customer, mid);
                CURRENT_CUSTOMER = r.customer;
                await loadLicensePayload();
                saveSession({ username: CURRENT_CUSTOMER.username });
                showDashboard();
                if (r.dropped && r.dropped.length) toast(r.dropped.length + " device lama terhapus");
                if (r.license_resigned) setTimeout(() => toast("License diperbarui otomatis"), 800);
                return { success: true };
            } catch (e) { return { success: false, cancelled: true }; }
        }
        if (data.customer) {
            CURRENT_CUSTOMER = data.customer;
            await loadLicensePayload();
            saveSession({ username: CURRENT_CUSTOMER.username });
            showDashboard();
            return { success: true, action: data.action };
        }
        throw new Error("Response tidak valid");
    }

    // REGISTER
    async function handleRegister(e) {
        e.preventDefault();
        const username = $("#regUsername").value.trim();
        const email = $("#regEmail").value.trim();
        const mid = ($("#regMid").value || "").trim();
        const err = $("#registerError");
        hide(err);

        if (!RX_USERNAME.test(username)) { err.textContent = "Username: 3-20 karakter (a-z A-Z 0-9 _)"; show(err); return; }
        if (!RX_EMAIL.test(email)) { err.textContent = "Format email tidak valid"; show(err); return; }
        if (!RX_MID.test(mid)) { err.textContent = "Machine ID harus 64 karakter hex"; show(err); return; }

        const btn = $("#registerBtn");
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-dot" style="border-top-color:#fff;border-color:rgba(255,255,255,.3)"></span> Memproses...';
        try {
            const data = await apiCall("/api/customer/register", { username, email, machine_id: mid });
            const r = await handleAuthResponse(data, mid);
            if (r.success && r.action === "created") setTimeout(() => downloadBackup(CURRENT_CUSTOMER), 500);
        } catch (e) { err.textContent = e.message; show(err); }
        finally { btn.disabled = false; btn.textContent = "Daftar & Login"; }
    }

    // LOGIN
    async function handleLogin(e) {
        e.preventDefault();
        const identifier = $("#loginIdentifier").value.trim();
        const mid = ($("#loginMid").value || "").trim();
        const err = $("#loginError");
        hide(err);
        if (!identifier) { err.textContent = "Username/email wajib diisi"; show(err); return; }
        if (!RX_MID.test(mid)) { err.textContent = "Machine ID tidak valid"; show(err); return; }
        const btn = $("#loginBtn");
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-dot" style="border-top-color:#fff;border-color:rgba(255,255,255,.3)"></span> Memproses...';
        try {
            const data = await apiCall("/api/customer/login", { identifier, machine_id: mid });
            await handleAuthResponse(data, mid);
        } catch (e) { err.textContent = e.message; show(err); }
        finally { btn.disabled = false; btn.textContent = "Masuk"; }
    }

    function doLogout() {
        if (!confirm("Logout dari dashboard?")) return;
        clearSession();
        CURRENT_CUSTOMER = null;
        CURRENT_PAYLOAD = null;
        showAuth();
    }

    async function loadLicensePayload() {
        CURRENT_PAYLOAD = null;
        if (CURRENT_CUSTOMER && CURRENT_CUSTOMER.license_key) {
            try { CURRENT_PAYLOAD = await verifyLicense(CURRENT_CUSTOMER.license_key); }
            catch (e) { console.warn("[License]", e.message); }
        }
    }

    async function refreshCustomer() {
        const s = getSession();
        if (!s || !s.username) return false;
        try {
            const data = await apiCall("/api/customer/me?identifier=" + encodeURIComponent(s.username), null, "GET");
            CURRENT_CUSTOMER = data.customer;
            await loadLicensePayload();
            return true;
        } catch (e) {
            if (e.status === 404) clearSession();
            return false;
        }
    }

    // BACKUP
    function downloadBackup(customer) {
        if (!customer) return;
        const data = {
            app: "DevAccTra", version: "3.0", type: "account_backup",
            exportedAt: new Date().toISOString(),
            account: {
                username: customer.username,
                email: customer.email,
                machine_ids: customer.machine_ids || [],
                license_key: customer.license_key || null,
                created_at: customer.created_at,
            },
            note: "Simpan file ini. Import di dashboard baru untuk restore.",
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "devacctra-" + customer.username + "-backup.json";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function handleImportJson() { const fi = $("#importJsonFile"); fi.value = ""; fi.click(); }
    async function handleImportFile(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const errBox = $("#registerError");
        try {
            const text = await file.text();
            const json = JSON.parse(text);
            if (!json.account || !json.account.username) throw new Error("File JSON tidak valid");
            const acc = json.account;
            switchTab("register");
            $("#regUsername").value = acc.username || "";
            $("#regEmail").value = acc.email || "";
            try { $("#regMid").value = await getMachineId(true); } catch (er) {}
            errBox.className = "alert alert-info";
            errBox.textContent = "Data backup terisi. Klik 'Daftar & Login'.";
            show(errBox);
        } catch (err) {
            errBox.className = "alert alert-error";
            errBox.textContent = "Gagal baca JSON: " + err.message;
            show(errBox);
        }
    }

    // DEVICE LIST
    function renderDeviceList() {
        const box = $("#deviceList");
        const maxEl = $("#deviceMax");
        if (!box || !CURRENT_CUSTOMER) return;
        const maxDev = parseInt(CURRENT_CUSTOMER.max_devices) || DEFAULT_MAX_DEVICES;
        if (maxEl) maxEl.textContent = maxDev;
        const mids = CURRENT_CUSTOMER.machine_ids || [];
        let curMid = "";
        try { curMid = localStorage.getItem(MID_CACHE_KEY) || ""; } catch (e) {}
        const isMismatch = curMid && !mids.includes(curMid);

        let html = "";
        if (isMismatch) {
            html += '<div class="alert alert-warn" style="margin-bottom:12px"><i class="fa-solid fa-triangle-exclamation"></i><div><b>Device ini belum terdaftar.</b><br>MID: <code style="font-family:monospace;font-size:.72rem">' + shortMid(curMid) + '</code></div></div>';
        }
        if (!mids.length) {
            html += '<div style="color:var(--muted);font-size:.82rem">Belum ada device terdaftar.</div>';
        } else {
            html += mids.map((m, i) => {
                const isCur = m === curMid;
                const isOldest = i === 0 && mids.length >= maxDev;
                return '<div class="device-item' + (isCur ? ' current' : '') + '"><div class="device-mid">' + escapeHtml(m) + '<div class="device-tag">' + (isCur ? '<b>Device ini</b>' : 'Device lain') + (isOldest ? ' &middot; <span style="color:#D97706">Paling lama</span>' : '') + '</div></div></div>';
            }).join('');
            html += '<div style="font-size:.72rem;color:var(--muted);margin-top:8px;text-align:right">' + mids.length + " / " + maxDev + " device aktif</div>";
        }
        if (isMismatch) {
            html += '<button type="button" class="btn btn-primary" id="syncDeviceBtn" style="width:100%;margin-top:12px"><i class="fa-solid fa-arrows-rotate"></i> Sinkronkan Device Ini</button>';
        }
        box.innerHTML = html;
        const btn = $("#syncDeviceBtn");
        if (btn) btn.addEventListener("click", syncDeviceFromDashboard);
    }

    async function syncDeviceFromDashboard() {
        if (!CURRENT_CUSTOMER) return;
        let curMid = "";
        try { curMid = localStorage.getItem(MID_CACHE_KEY) || ""; } catch (e) {}
        if (!curMid) { toast("MID device tidak terdeteksi", "error"); return; }
        try {
            const r = await openSyncModal(CURRENT_CUSTOMER, curMid);
            CURRENT_CUSTOMER = r.customer;
            await loadLicensePayload();
            toast("Device disinkronkan");
            if (r.dropped && r.dropped.length) toast(r.dropped.length + " device lama terhapus");
            if (r.license_resigned) setTimeout(() => toast("License diperbarui"), 800);
            renderDashboard();
        } catch (e) {}
    }

    // LICENSE STATUS
    function renderLicenseStatus() {
        const box = $("#licenseStatusContent");
        const payBtn = $("#buyProBtn");
        const pasteBtn = $("#pasteLicenseBtn");
        const removeBtn = $("#removeLicenseBtn");
        if (!box || !CURRENT_CUSTOMER) return;
        const hasLicense = CURRENT_CUSTOMER.license_key && CURRENT_PAYLOAD;

        if (!hasLicense) {
            box.innerHTML = '<div class="alert alert-warn" style="margin:0"><i>&#9888;</i><div><b>Belum ada License PRO.</b><br>Download versi <b>Trial</b> gratis, atau masukkan License PRO dari Admin.</div></div>';
            show(pasteBtn); show(payBtn); hide(removeBtn);
            return;
        }
        const p = CURRENT_PAYLOAD;
        const tier = (p.t || "").toLowerCase();
        const isPro = isProTier(tier);
        const exp = p.e || "-";
        const days = daysRemaining(exp);

        let scope = "Universal (semua produk)";
        if (p.tools && Array.isArray(p.tools) && p.tools.length) {
            scope = p.tools.map(t => PRODUCTS.find(x => x.id === t)?.name || t).join(", ");
        } else if (p.tool) {
            scope = PRODUCTS.find(x => x.id === p.tool)?.name || p.tool;
        }

        box.innerHTML =
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:14px">' +
                '<div><div style="font-size:.7rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Tier</div><span class="badge" style="background:rgba(50,168,82,.14);color:var(--acc-green);display:inline-flex;padding:5px 12px;border-radius:999px;font-weight:800;font-size:.72rem">' + escapeHtml(tier.toUpperCase()) + '</span></div>' +
                '<div><div style="font-size:.7rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Expired</div><b style="color:var(--ink);font-size:.85rem">' + fmtDate(exp) + '</b> <small style="color:var(--muted)">(' + days + ' hari)</small></div>' +
                '<div style="grid-column:1/-1"><div style="font-size:.7rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Produk</div><b style="color:var(--ink);font-size:.85rem">' + escapeHtml(scope) + '</b></div>' +
            '</div>' +
            (isPro
                ? '<div class="alert alert-success" style="margin:0"><i>&#10003;</i><div><b>Akses PRO aktif.</b> Semua produk di scope dapat di-download PRO.</div></div>'
                : '<div class="alert alert-info" style="margin:0"><i>&#8505;</i><div>License tier <b>' + tier + '</b> tidak membuka akses PRO.</div></div>');
        // Copy license button
        var _lk = CURRENT_CUSTOMER.license_key || '';
        box.innerHTML += '<div style="margin-top:14px;padding:14px;background:#f3f4f6;border-radius:10px;border:1px solid #e5e7eb">' +
            '<div style="font-size:.7rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:6px">License Key</div>' +
            '<code style="display:block;font-family:Consolas,monospace;font-size:.66rem;word-break:break-all;color:#111827;margin-bottom:10px;background:#fff;padding:8px;border-radius:6px;border:1px solid #e5e7eb;max-height:80px;overflow-y:auto">' + escapeHtml(_lk) + '</code>' +
            '<button type="button" class="btn btn-primary" id="copyLicBtn" style="width:100%;justify-content:center"><i class="fa-solid fa-copy"></i> Copy License ke Extension</button>' +
            '<div style="font-size:.68rem;color:var(--muted);margin-top:8px;text-align:center">Paste di popup extension Trial atau Pro, lalu klik Activate.</div>' +
        '</div>';
        var _copyBtn = box.querySelector("#copyLicBtn");
        if (_copyBtn) _copyBtn.addEventListener("click", async () => {
            var ok = await copyText(_lk);
            if (ok) {
                _copyBtn.innerHTML = '&#10003; Tersalin! Paste di extension.';
                setTimeout(function() { _copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy License ke Extension'; }, 2500);
                toast('License ter-copy. Paste di popup extension.');
            } else {
                toast('Gagal copy. Copy manual dari kotak.', 'error');
            }
        });

        show(removeBtn);
        if (isPro) hide(pasteBtn); else show(pasteBtn);
        show(payBtn);
    }

    // PRODUCTS
    function isProductAllowed(pid) {
        if (!CURRENT_PAYLOAD) return false;
        if (!isProTier(CURRENT_PAYLOAD.t)) return false;
        if (CURRENT_PAYLOAD.tools && Array.isArray(CURRENT_PAYLOAD.tools) && CURRENT_PAYLOAD.tools.length) {
            return CURRENT_PAYLOAD.tools.includes(pid);
        }
        if (CURRENT_PAYLOAD.tool) return CURRENT_PAYLOAD.tool === pid;
        return true;
    }

    function renderProducts() {
        const grid = $("#productsGrid");
        if (!grid || !CURRENT_CUSTOMER) return;
        grid.innerHTML = PRODUCTS.map(p => {
            const icon = ICONS[p.id] || "";
            const isAvail = p.available;
            const allowed = isProductAllowed(p.id);
            const trialBtn = isAvail
                ? '<a class="product-btn product-btn-trial" href="' + DIST + "/" + p.trial + '" download><svg viewBox="0 0 24 24"><path d="M12 15l-5-5h3V4h4v6h3l-5 5zM5 19h14v2H5z"/></svg> Trial</a>'
                : '<button class="product-btn product-btn-trial" disabled><svg viewBox="0 0 24 24"><path d="M12 15l-5-5h3V4h4v6h3l-5 5zM5 19h14v2H5z"/></svg> Trial</button>';
            const proBtn = !isAvail
                ? '<button class="product-btn product-btn-pro" disabled><svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5 3.8 9.4 9 11 5.2-1.6 9-6 9-11V5l-9-4z"/></svg> Soon</button>'
                : (allowed
                    ? '<a class="product-btn product-btn-pro" href="' + DIST + "/" + p.pro + '" download><svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5 3.8 9.4 9 11 5.2-1.6 9-6 9-11V5l-9-4z"/></svg> PRO</a>'
                    : '<button class="product-btn product-btn-pro" data-open-lic="1"><svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5 3.8 9.4 9 11 5.2-1.6 9-6 9-11V5l-9-4z"/></svg> Butuh License</button>');
            return '<div class="product-card" data-accent="' + p.accent + '">' +
                (!isAvail ? '<span class="product-badge">Coming Soon</span>' : "") +
                '<div class="product-head"><div class="product-ico"><svg viewBox="0 0 24 24">' + icon + '</svg></div>' +
                    '<div class="product-head-text"><div class="product-name">' + escapeHtml(p.name) + '</div><div class="product-type">' + escapeHtml(p.type) + '</div></div></div>' +
                '<p class="product-desc">' + escapeHtml(p.desc) + '</p>' +
                '<div class="product-actions">' + trialBtn + proBtn + '</div></div>';
        }).join("");
        grid.querySelectorAll('[data-open-lic]').forEach(b => b.addEventListener("click", openLicenseModal));
    }

    function renderDashboard() {
        if (!CURRENT_CUSTOMER) { showAuth(); return; }
        $("#heroUsername").textContent = CURRENT_CUSTOMER.username;
        $("#heroEmail").textContent = CURRENT_CUSTOMER.email;
        let curMid = "";
        try { curMid = localStorage.getItem(MID_CACHE_KEY) || ""; } catch (e) {}
        $("#heroMid").textContent = shortMid(curMid || "-");
        renderProducts();
        renderLicenseStatus();
        renderDeviceList();
        const cb = $("#copyMidHero");
        if (cb) cb.onclick = async () => {
            const ok = await copyText(curMid);
            if (ok) {
                cb.textContent = "OK!";
                setTimeout(() => { cb.textContent = "Copy"; }, 1500);
            }
        };
    }

    // LICENSE MODAL
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
        if (!key) { err.textContent = "License kosong"; show(err); return; }
        if (!CURRENT_CUSTOMER) { err.textContent = "Session hilang"; show(err); return; }
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-dot"></span> Verifikasi...';
        try {
            const payload = await verifyLicense(key);
            const allowed = Array.isArray(payload.m) ? payload.m : [payload.m];
            if (!allowed.includes("*") && !CURRENT_CUSTOMER.machine_ids.some(m => allowed.includes(m))) {
                throw new Error("License tidak cocok dengan MID manapun di akun ini.");
            }
            await apiCall("/api/customer/set-license", { identifier: CURRENT_CUSTOMER.username, license_key: key });
            CURRENT_CUSTOMER.license_key = key;
            CURRENT_PAYLOAD = payload;
            closeLicenseModal();
            renderDashboard();
            toast("License tersimpan");
        } catch (e) { err.textContent = e.message; show(err); }
        finally { btn.disabled = false; btn.textContent = "Simpan"; }
    }

    async function handleRemoveLicense() {
        if (!CURRENT_CUSTOMER) return;
        if (!confirm("Hapus License dari akun?")) return;
        try {
            await apiCall("/api/customer/set-license", { identifier: CURRENT_CUSTOMER.username, license_key: "" });
            CURRENT_CUSTOMER.license_key = null;
            CURRENT_PAYLOAD = null;
            renderDashboard();
            toast("License dihapus");
        } catch (e) { toast(e.message, "error"); }
    }

    // AUTO-LOAD MID
    async function autoLoadMid(inputId, hintId) {
        const input = $("#" + inputId);
        const hint = $("#" + hintId);
        if (!input) return;
        try {
            const mid = await getMachineId(false);
            if (!input.value) {
                input.value = mid;
                if (hint) { hint.innerHTML = "MID terisi otomatis. Bisa diedit."; hint.style.color = "var(--acc-green)"; }
            }
        } catch (e) { console.warn(e); }
    }

    // INIT
    function init() {
        $$(".auth-tab").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
        const rForm = $("#registerForm"); if (rForm) rForm.addEventListener("submit", handleRegister);
        const lForm = $("#loginForm"); if (lForm) lForm.addEventListener("submit", handleLogin);

        $$("[data-mid-target]").forEach(b => b.addEventListener("click", () => openMidModal(b.dataset.midTarget)));
        $("#midModalClose").addEventListener("click", closeMidModal);
        $("#midModal").addEventListener("click", e => { if (e.target === $("#midModal")) closeMidModal(); });
        $("#midModalUse").addEventListener("click", () => {
            if (_generatedMid && _midTarget) {
                const t = $("#" + _midTarget);
                if (t) t.value = _generatedMid;
            }
            closeMidModal();
        });

        $("#syncCancel").addEventListener("click", () => closeSyncModal(true));
        $("#syncModal").addEventListener("click", e => { if (e.target === $("#syncModal")) closeSyncModal(true); });
        $("#syncConfirm").addEventListener("click", handleSyncConfirm);
        $("#syncOldMid").addEventListener("keydown", e => { if (e.key === "Enter") handleSyncConfirm(); });

        $("#pasteLicenseBtn").addEventListener("click", openLicenseModal);
        $("#modalCancel").addEventListener("click", closeLicenseModal);
        $("#licenseModal").addEventListener("click", e => { if (e.target === $("#licenseModal")) closeLicenseModal(); });
        $("#modalConfirm").addEventListener("click", handleLicenseConfirm);
        $("#removeLicenseBtn").addEventListener("click", handleRemoveLicense);
        $("#buyProBtn").addEventListener("click", () => window.open(WA_URL, "_blank", "noopener"));
        $("#downloadJsonBtn").addEventListener("click", () => { if (CURRENT_CUSTOMER) downloadBackup(CURRENT_CUSTOMER); });
        $("#importJsonBtn").addEventListener("click", handleImportJson);
        $("#importJsonFile").addEventListener("change", handleImportFile);
        $("#navLogout").addEventListener("click", doLogout);
        $("#logoutBtn2").addEventListener("click", doLogout);

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

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();