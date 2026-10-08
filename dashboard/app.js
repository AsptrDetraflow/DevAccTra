// ============================================================
// DevAccTra Dashboard — App Logic (Backend-Driven)
// Clean auth flow: register/login/sync dengan state machine
// ============================================================
(function () {
    "use strict";

    // ============================================================
    // CONSTANTS
    // ============================================================
    const PUBLIC_KEY_B64 = "kN08rrwZddPxF2KjSIgZ0bH6veMmE94ExuEE3FbGs6s=";
    const SESSION_KEY = "devacctra_session_v3";
    const MID_CACHE_KEY = "devacctra_machine_id_v3";
    const API_URL = "https://devacctra-api.up.railway.app";
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
          desc: "Download PDF Faktur Pajak Keluaran, Masukan, dan Bukti Potong dari Coretax secara massal.",
          trial: "CoretaxPDFDownloader-Trial.zip", pro: "CoretaxPDFDownloader-Pro.zip", available: true },
        { id: "rekap-faktur", name: "Rekap Faktur", type: "Software Desktop", accent: "tra",
          desc: "Rekap faktur pajak dari PDF ke Excel siap pelaporan SPT secara otomatis.",
          trial: "RekapinFaktur-Trial.zip", pro: "RekapinFaktur-Pro.zip", available: false },
        { id: "rekap-bupot-bppu", name: "Rekap Bupot BPPU", type: "Software Desktop", accent: "acc",
          desc: "Rekap Bukti Potong BPPU dari folder PDF ke Excel otomatis dengan deteksi duplikat.",
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

    // ============================================================
    // HELPERS
    // ============================================================
    const $ = (s, r) => (r || document).querySelector(s);
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
    const show = el => el && el.classList.remove("hidden");
    const hide = el => el && el.classList.add("hidden");

    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
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
        if (!wrap) {
            wrap = document.createElement("div");
            wrap.id = "toastWrap";
            wrap.className = "toast-wrap";
            document.body.appendChild(wrap);
        }
        const el = document.createElement("div");
        el.className = "toast " + type;
        el.innerHTML = '<i class="fa-solid ' + (type === "error" ? "fa-circle-xmark" : "fa-circle-check") + '"></i><span>' + escapeHtml(msg) + "</span>";
        wrap.appendChild(el);
        setTimeout(function () {
            el.style.opacity = "0";
            el.style.transition = "opacity .3s";
            setTimeout(function () { el.remove(); }, 300);
        }, 3200);
    }
    async function copyText(text) {
        if (!text) return false;
        try { await navigator.clipboard.writeText(text); return true; }
        catch (e) { return false; }
    }

    // ============================================================
    // STATE
    // ============================================================
    let CURRENT_CUSTOMER = null;
    let CURRENT_PAYLOAD = null;

    // ============================================================
    // SESSION
    // ============================================================
    function getSession() {
        try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
        catch (e) { return null; }
    }
    function saveSession(obj) {
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(Object.assign({}, obj, { savedAt: Date.now() }))); }
        catch (e) {}
    }
    function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }

    // ============================================================
    // API CALL
    // ============================================================
    async function apiCall(path, body, method) {
        method = method || "POST";
        const opts = {
            method: method,
            headers: { "Content-Type": "application/json" }
        };
        if (body !== null && body !== undefined) opts.body = JSON.stringify(body);
        if (method === "GET" && body) opts.body = undefined;

        let res;
        try { res = await fetch(API_URL + path, opts); }
        catch (e) { throw new Error("Network error: " + e.message); }

        let data;
        try { data = await res.json(); } catch (e) { data = {}; }

        if (!res.ok) {
            const detail = data.detail || data.message || ("HTTP " + res.status);
            const err = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
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
        const hex = Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
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
            { name: "Ed25519" }, pk,
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
        $$(".tab-btn").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === tab); });
        $$(".view-panel").forEach(function (p) { p.classList.remove("active"); });
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
            cb.addEventListener("click", async function () {
                const ok = await copyText(mid);
                if (ok) { cb.textContent = "OK!"; setTimeout(function () { cb.textContent = "Copy"; }, 1500); }
            });
        } catch (e) {
            box.innerHTML = '<div class="alert alert-error" style="margin:0"><i>&#10007;</i><div><b>Gagal generate MID.</b><br>' + escapeHtml(e.message) + "</div></div>";
        }
    }
    function openMidModal(targetId) {
        _midTarget = targetId;
        $("#midModal").classList.add("show");
        generateMid();
    }
    function closeMidModal() { $("#midModal").classList.remove("show"); }

    // ============================================================
    // SYNC MODAL
    // ============================================================
    let _syncResolver = null;

    function openSyncModal(customer, newMid) {
        return new Promise(function (resolve, reject) {
            _syncResolver = { customer: customer, newMid: newMid, resolve: resolve, reject: reject };
            $("#syncOldMid").value = "";
            hide($("#syncError"));
            const info = $("#syncInfo");
            const mids = customer.machine_ids || [];
            const maxDev = parseInt(customer.max_devices) || DEFAULT_MAX_DEVICES;
            info.innerHTML =
                "<b>Akun ditemukan: " + escapeHtml(customer.username) + "</b><br>" +
                "Terdaftar dengan <b>" + mids.length + "</b> dari " + maxDev + " MID.<br>" +
                "MID device ini: <code style=\"font-family:Consolas;font-size:.7rem\">" + shortMid(newMid) + "</code>";
            show(info);
            $("#syncModal").classList.add("show");
            setTimeout(function () { $("#syncOldMid").focus(); }, 100);
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
        if (!RX_MID.test(oldMid)) { err.textContent = "Format MID tidak valid (64 hex)."; show(err); return; }

        const res = _syncResolver;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-dot" style="border-top-color:#fff"></span> Memproses...';

        try {
            const data = await apiCall("/api/customer/sync", {
                identifier: res.customer.username,
                old_machine_id: oldMid,
                new_machine_id: res.newMid
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

    // ============================================================
    // AUTH: common response handler
    // ============================================================
    async function handleAuthResponse(data, mid) {
        // Case 1: Butuh sync
        if (data.needs_sync && data.customer) {
            try {
                const syncResult = await openSyncModal(data.customer, mid);
                CURRENT_CUSTOMER = syncResult.customer;
                await loadLicensePayload();
                saveSession({ username: CURRENT_CUSTOMER.username });
                showDashboard();
                if (syncResult.dropped && syncResult.dropped.length) {
                    toast("Device lama terhapus otomatis (" + syncResult.dropped.length + ")", "success");
                }
                return { success: true, action: "sync" };
            } catch (e) {
                // User cancel — tetap di halaman auth
                return { success: false, cancelled: true };
            }
        }

        // Case 2: Login / Register sukses
        if (data.customer) {
            CURRENT_CUSTOMER = data.customer;
            await loadLicensePayload();
            saveSession({ username: CURRENT_CUSTOMER.username });
            showDashboard();
            return { success: true, action: data.action || "login" };
        }

        throw new Error("Response tidak valid dari server");
    }

    // ============================================================
    // REGISTER
    // ============================================================
    async function handleRegister(e) {
        e.preventDefault();
        const username = $("#regUsername").value.trim();
        const email = $("#regEmail").value.trim();
        const mid = ($("#regMid").value || "").trim();
        const err = $("#registerError");
        hide(err);
        ["#errUsername", "#errEmail", "#errMid"].forEach(function (s) { hide($(s)); });
        $$("#registerForm input").forEach(function (i) { i.classList.remove("error"); });

        let hasErr = false;
        if (!RX_USERNAME.test(username)) { $("#errUsername").textContent = "Username: 3-20 karakter (a-z, A-Z, 0-9, _)"; show($("#errUsername")); $("#regUsername").classList.add("error"); hasErr = true; }
        if (!RX_EMAIL.test(email)) { $("#errEmail").textContent = "Format email tidak valid"; show($("#errEmail")); $("#regEmail").classList.add("error"); hasErr = true; }
        if (!RX_MID.test(mid)) { $("#errMid").textContent = "Machine ID harus 64 karakter hex"; show($("#errMid")); $("#regMid").classList.add("error"); hasErr = true; }
        if (hasErr) { err.textContent = "Periksa kembali data."; show(err); return; }

        const btn = $("#registerBtn");
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-dot" style="border-top-color:#fff;border-color:rgba(255,255,255,.3)"></span> Memproses...';

        try {
            const data = await apiCall("/api/customer/register", {
                username: username,
                email: email,
                machine_id: mid
            });
            const result = await handleAuthResponse(data, mid);
            if (result.success && result.action === "created") {
                setTimeout(function () { downloadBackup(CURRENT_CUSTOMER); }, 500);
            }
        } catch (e) {
            err.textContent = e.message;
            show(err);
        } finally {
            btn.disabled = false;
            btn.textContent = "Daftar & Login";
        }
    }

    // ============================================================
    // LOGIN
    // ============================================================
    async function handleLogin(e) {
        e.preventDefault();
        const identifier = $("#loginIdentifier").value.trim();
        const mid = ($("#loginMid").value || "").trim();
        const err = $("#loginError");
        hide(err);

        if (!identifier) { err.textContent = "Username/email wajib diisi."; show(err); return; }
        if (!mid) { err.textContent = "Machine ID wajib diisi."; show(err); return; }
        if (!RX_MID.test(mid)) { err.textContent = "Format Machine ID tidak valid."; show(err); return; }

        const btn = $("#loginBtn");
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-dot" style="border-top-color:#fff;border-color:rgba(255,255,255,.3)"></span> Memproses...';

        try {
            const data = await apiCall("/api/customer/login", {
                identifier: identifier,
                machine_id: mid
            });
            await handleAuthResponse(data, mid);
        } catch (e) {
            err.textContent = e.message;
            show(err);
        } finally {
            btn.disabled = false;
            btn.textContent = "Masuk";
        }
    }

    // ============================================================
    // LOGOUT
    // ============================================================
    function doLogout() {
        if (!confirm("Logout dari dashboard?")) return;
        clearSession();
        CURRENT_CUSTOMER = null;
        CURRENT_PAYLOAD = null;
        showAuth();
    }

    // ============================================================
    // LOAD LICENSE PAYLOAD
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
    // REFRESH CUSTOMER
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
            if (e.status === 404) clearSession();
            return false;
        }
    }

    // ============================================================
    // DOWNLOAD BACKUP
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
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    // ============================================================
    // IMPORT JSON
    // ============================================================
    function handleImportJson() {
        const fi = $("#importJsonFile");
        fi.value = "";
        fi.click();
    }

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
            try { $("#regMid").value = await getMachineId(); } catch (err) {}
            errBox.className = "alert alert-info";
            errBox.textContent = "Data dari backup terisi. Klik 'Daftar & Login' untuk melanjutkan.";
            errBox.classList.remove("hidden");
        } catch (err) {
            errBox.className = "alert alert-error";
            errBox.textContent = "Gagal membaca JSON: " + err.message;
            errBox.classList.remove("hidden");
        }
    }

    // ============================================================
    // DEVICE LIST
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

        // Cek MID mismatch — device ini gak terdaftar
        const isMismatch = curMid && !mids.includes(curMid);

        let html = "";

        // Alert mismatch kalau ada
        if (isMismatch) {
            html += '<div class="alert alert-warn" style="margin-bottom:12px"><i class="fa-solid fa-triangle-exclamation"></i><div><b>Device ini belum terdaftar.</b><br>MID device ini <code style="font-family:Consolas;font-size:.72rem">' + shortMid(curMid) + '</code> tidak ada di daftar. Klik tombol <b>Ganti Device</b> untuk sinkronisasi.</div></div>';
        }

        if (!mids.length) {
            html += '<div class="hint" style="color:#69756D">Belum ada device terdaftar.</div>';
            box.innerHTML = html;
            return;
        }

        html += mids.map(function (m, i) {
            const isCurrent = m === curMid;
            const isOldest = i === 0 && mids.length >= maxDev;
            return '<div style="display:flex;gap:10px;align-items:center;padding:10px 12px;border:1px solid ' +
                (isCurrent ? "#32A852" : "rgba(23,34,29,.08)") + ';border-radius:10px;margin-bottom:8px;background:' +
                (isCurrent ? "rgba(50,168,82,.05)" : "#fff") + '">' +
                '<div style="flex:1;min-width:0">' +
                    '<div style="font-family:Consolas,monospace;font-size:.72rem;word-break:break-all;color:#17221D">' + escapeHtml(m) + "</div>" +
                    '<div style="font-size:.68rem;color:#69756D;margin-top:2px">' +
                        (isCurrent ? '<b style="color:#32A852">Device ini</b>' : "Device lain") +
                        (isOldest ? ' &middot; <span style="color:#D97706">Paling lama</span>' : "") +
                    "</div>" +
                "</div>" +
            "</div>";
        }).join("");
        html += '<div style="font-size:.72rem;color:#69756D;margin-top:8px">' + mids.length + " / " + maxDev + " device aktif</div>";

        if (isMismatch) {
            html += '<button type="button" class="btn btn-primary" id="syncDeviceBtn" style="width:100%;margin-top:12px;justify-content:center"><i class="fa-solid fa-arrows-rotate"></i> Ganti / Sinkron Device</button>';
        }

        box.innerHTML = html;

        const syncBtn = $("#syncDeviceBtn");
        if (syncBtn) syncBtn.addEventListener("click", openSyncFromDashboard);
    }

    async function openSyncFromDashboard() {
        if (!CURRENT_CUSTOMER) return;
        let curMid = "";
        try { curMid = localStorage.getItem(MID_CACHE_KEY) || ""; } catch (e) {}
        if (!curMid) { toast("MID device ini belum terdeteksi.", "error"); return; }

        try {
            const result = await openSyncModal(CURRENT_CUSTOMER, curMid);
            CURRENT_CUSTOMER = result.customer;
            await loadLicensePayload();
            toast("Device berhasil disinkronkan");
            if (result.dropped && result.dropped.length) {
                toast(result.dropped.length + " device lama terhapus", "success");
            }
            renderDashboard();
        } catch (e) {
            // Cancelled
        }
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
            box.innerHTML = '<div class="alert alert-warn" style="margin:0"><i>&#9888;</i><div><b>Belum ada License PRO.</b><br>Download versi <b>Trial</b> gratis. Untuk versi PRO, masukkan License Key dari Admin.</div></div>';
            show(pasteBtn); show(payBtn); hide(removeBtn);
            return;
        }

        const p = CURRENT_PAYLOAD;
        const tier = (p.t || "").toLowerCase();
        const isPro = isProTier(tier);
        const exp = p.e || "-";
        const days = daysRemaining(exp);

        // Produk scope
        let scopeLabel = "";
        if (p.tools && Array.isArray(p.tools) && p.tools.length) {
            scopeLabel = '<div class="info-row"><span class="label">Produk</span><span class="value">' +
                p.tools.map(function (t) { return "<b>" + escapeHtml(t) + "</b>"; }).join(", ") + "</span></div>";
        } else if (p.tool) {
            scopeLabel = '<div class="info-row"><span class="label">Produk</span><span class="value"><b>' + escapeHtml(p.tool) + "</b></span></div>";
        } else {
            scopeLabel = '<div class="info-row"><span class="label">Produk</span><span class="value"><b>Universal</b> (semua produk)</span></div>';
        }

        box.innerHTML =
            '<div class="info-row"><span class="label">Tier</span><span class="value"><span class="badge badge-' + (tier || "pro") + '">' + (tier || "pro") + "</span></span></div>" +
            scopeLabel +
            '<div class="info-row"><span class="label">Berlaku sampai</span><span class="value">' + fmtDate(exp) + ' <small style="color:#69756D">(' + days + " hari)</small></span></div>" +
            (isPro
                ? '<div class="alert alert-success" style="margin:12px 0 0"><i>&#10003;</i><div><b>Akses PRO aktif.</b></div></div>'
                : '<div class="alert alert-info" style="margin:12px 0 0"><i>&#8505;</i><div>License tier <b>' + tier + "</b> tidak membuka akses PRO.</div></div>");
        show(removeBtn);
        if (isPro) hide(pasteBtn); else show(pasteBtn);
        show(payBtn);
    }

    // ============================================================
    // PRODUCTS
    // ============================================================
    function getProductAllowed(payload, productId) {
        if (!payload) return false;
        if (!isProTier(payload.t)) return false;
        if (payload.tools && Array.isArray(payload.tools) && payload.tools.length) {
            return payload.tools.indexOf(productId) >= 0;
        }
        if (payload.tool) return payload.tool === productId;
        return true; // universal
    }

    function renderProducts() {
        const grid = $("#productsGrid");
        if (!grid || !CURRENT_CUSTOMER) return;

        grid.innerHTML = PRODUCTS.map(function (p) {
            const icon = ICONS[p.id] || "";
            const isAvail = p.available;
            const hasProForThis = getProductAllowed(CURRENT_PAYLOAD, p.id);

            const trialBtn = isAvail
                ? '<a class="product-btn product-btn-trial" href="' + DIST + "/" + p.trial + '" download><svg viewBox="0 0 24 24"><path d="M12 15l-5-5h3V4h4v6h3l-5 5zM5 19h14v2H5z"/></svg> Download Trial</a>'
                : '<button class="product-btn product-btn-trial" disabled><svg viewBox="0 0 24 24"><path d="M12 15l-5-5h3V4h4v6h3l-5 5zM5 19h14v2H5z"/></svg> Trial</button>';

            const proBtn = !isAvail
                ? '<button class="product-btn product-btn-pro" disabled><svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5 3.8 9.4 9 11 5.2-1.6 9-6 9-11V5l-9-4z"/></svg> Coming Soon</button>'
                : (hasProForThis
                    ? '<a class="product-btn product-btn-pro" href="' + DIST + "/" + p.pro + '" download><svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5 3.8 9.4 9 11 5.2-1.6 9-6 9-11V5l-9-4z"/></svg> Download PRO</a>'
                    : '<button class="product-btn product-btn-pro" data-open-license="1" type="button"><svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5 3.8 9.4 9 11 5.2-1.6 9-6 9-11V5l-9-4z"/></svg> Butuh License</button>');

            return '<div class="product-card">' +
                (!isAvail ? '<span class="product-badge">Coming Soon</span>' : "") +
                '<div class="product-head">' +
                    '<div class="product-ico ' + p.accent + '"><svg viewBox="0 0 24 24">' + icon + "</svg></div>" +
                    '<div class="product-head-text">' +
                        '<div class="product-name">' + escapeHtml(p.name) + "</div>" +
                        '<div class="product-type">' + escapeHtml(p.type) + "</div>" +
                    "</div>" +
                "</div>" +
                '<p class="product-desc">' + escapeHtml(p.desc) + "</p>" +
                '<div class="product-actions">' + trialBtn + proBtn + "</div>" +
            "</div>";
        }).join("");

        grid.querySelectorAll("[data-open-license]").forEach(function (btn) {
            btn.addEventListener("click", openLicenseModal);
        });
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
        if (cb) cb.onclick = async function () {
            const ok = await copyText(curMid);
            if (ok) {
                cb.textContent = "OK!";
                cb.classList.add("ok");
                setTimeout(function () { cb.textContent = "Copy"; cb.classList.remove("ok"); }, 1500);
            }
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
        if (!CURRENT_CUSTOMER) { err.textContent = "Session hilang. Login ulang."; show(err); return; }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-dot" style="border-top-color:#fff;border-color:rgba(255,255,255,.3)"></span> Verifikasi...';

        try {
            const payload = await verifyLicense(key);

            const allowedMids = Array.isArray(payload.m) ? payload.m : [payload.m];
            const myMids = CURRENT_CUSTOMER.machine_ids || [];
            const isWildcard = allowedMids.indexOf("*") >= 0;
            const hasMatch = isWildcard || myMids.some(function (m) { return allowedMids.indexOf(m) >= 0; });

            if (!hasMatch) throw new Error("License ini tidak cocok dengan MID manapun di akun Anda.");

            await apiCall("/api/customer/set-license", {
                identifier: CURRENT_CUSTOMER.username,
                license_key: key
            });

            CURRENT_CUSTOMER.license_key = key;
            CURRENT_PAYLOAD = payload;

            closeLicenseModal();
            renderDashboard();
            toast("License PRO aktif");
        } catch (e) {
            err.textContent = "Gagal: " + e.message;
            show(err);
        } finally {
            btn.disabled = false;
            btn.textContent = "Verifikasi & Simpan";
        }
    }

    async function handleRemoveLicense() {
        if (!CURRENT_CUSTOMER) return;
        if (!confirm("Hapus License dari akun?")) return;
        try {
            await apiCall("/api/customer/set-license", {
                identifier: CURRENT_CUSTOMER.username,
                license_key: ""
            });
            CURRENT_CUSTOMER.license_key = null;
            CURRENT_PAYLOAD = null;
            renderDashboard();
            toast("License dihapus");
        } catch (e) { toast(e.message, "error"); }
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
        $$(".tab-btn").forEach(function (btn) {
            btn.addEventListener("click", function () { switchTab(btn.dataset.tab); });
        });

        const rForm = $("#registerForm");
        if (rForm) rForm.addEventListener("submit", handleRegister);
        const lForm = $("#loginForm");
        if (lForm) lForm.addEventListener("submit", handleLogin);

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

        const syncCancel = $("#syncCancel");
        if (syncCancel) syncCancel.addEventListener("click", function () { closeSyncModal(true); });
        const syncBg = $("#syncModal");
        if (syncBg) syncBg.addEventListener("click", function (e) { if (e.target === syncBg) closeSyncModal(true); });
        const syncConfirm = $("#syncConfirm");
        if (syncConfirm) syncConfirm.addEventListener("click", handleSyncConfirm);
        const syncOldMid = $("#syncOldMid");
        if (syncOldMid) syncOldMid.addEventListener("keydown", function (e) { if (e.key === "Enter") handleSyncConfirm(); });

        const pasteBtn = $("#pasteLicenseBtn");
        if (pasteBtn) pasteBtn.addEventListener("click", openLicenseModal);
        const mCancel = $("#modalCancel");
        if (mCancel) mCancel.addEventListener("click", closeLicenseModal);
        const licBg = $("#licenseModal");
        if (licBg) licBg.addEventListener("click", function (e) { if (e.target === licBg) closeLicenseModal(); });
        const mConfirm = $("#modalConfirm");
        if (mConfirm) mConfirm.addEventListener("click", handleLicenseConfirm);

        const removeBtn = $("#removeLicenseBtn");
        if (removeBtn) removeBtn.addEventListener("click", handleRemoveLicense);

        const buyBtn = $("#buyProBtn");
        if (buyBtn) buyBtn.addEventListener("click", function () { window.open(WA_URL, "_blank", "noopener"); });

        const dlBtn = $("#downloadJsonBtn");
        if (dlBtn) dlBtn.addEventListener("click", function () { if (CURRENT_CUSTOMER) downloadBackup(CURRENT_CUSTOMER); });

        const importBtn = $("#importJsonBtn");
        if (importBtn) importBtn.addEventListener("click", handleImportJson);
        const importFile = $("#importJsonFile");
        if (importFile) importFile.addEventListener("change", handleImportFile);

        const navLogout = $("#navLogout");
        if (navLogout) navLogout.addEventListener("click", doLogout);
        const logout2 = $("#logoutBtn2");
        if (logout2) logout2.addEventListener("click", doLogout);

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