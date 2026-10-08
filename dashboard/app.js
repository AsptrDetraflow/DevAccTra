// ============================================================
// DevAccTra - Dashboard App Logic
// ============================================================

const WA_NUMBER = "6287888370395";
const WA_MSG = encodeURIComponent("Halo, saya mau beli License PRO DevAccTra");
const WA_URL = `https://wa.me/${WA_NUMBER}?text=${WA_MSG}`;
const DIST = "https://asptrdetraflow.github.io/DevAccTra/dist";

const PRODUCTS = [
    {
        id: "coretax-toolkit",
        name: "Coretax PDF Downloader",
        type: "Chrome Extension",
        accent: "dev",
        desc: "Download PDF Faktur Pajak Keluaran, Masukan, dan Bukti Potong dari Coretax secara massal.",
        trial: "CoretaxPDFDownloader-Trial.zip",
        pro: "CoretaxPDFDownloader-Pro.zip",
        available: true,
    },
    {
        id: "rekap-faktur",
        name: "Rekap Faktur",
        type: "Software Desktop",
        accent: "tra",
        desc: "Rekap faktur pajak dari PDF ke Excel siap pelaporan SPT secara otomatis.",
        trial: null, pro: null, available: false,
    },
    {
        id: "rekap-bupot-bppu",
        name: "Rekap Bupot BPPU",
        type: "Software Desktop",
        accent: "acc",
        desc: "Rekap Bukti Potong BPPU dari folder PDF ke Excel otomatis dengan deteksi duplikat.",
        trial: null, pro: null, available: false,
    },
    {
        id: "rekap-bank-bca",
        name: "Rekap Bank BCA",
        type: "Software Desktop",
        accent: "sage",
        desc: "Ekstrak mutasi bank BCA dari PDF atau CSV ke Excel siap rekonsiliasi.",
        trial: null, pro: null, available: false,
    },
];

const ICONS = {
    "coretax-toolkit": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM8 13h8v2H8v-2zm0 4h8v2H8v-2z"/>',
    "rekap-faktur": '<path d="M4 2h16v20H4V2zm2 2v16h12V4H6zm2 3h8v2H8V7zm0 4h8v2H8v-2zm0 4h5v2H8v-2z"/>',
    "rekap-bupot-bppu": '<path d="M3 2h18v20H3V2zm2 2v16h14V4H5zm2 2h10v2H7V6zm0 4h10v2H7v-2zm0 4h6v2H7v-2z"/>',
    "rekap-bank-bca": '<path d="M12 2L2 7v2h20V7L12 2zM4 11v8H2v2h20v-2h-2v-8h-2v8h-4v-8h-2v8H8v-8H4z"/>',
};

const $ = (s, r = document) => r.querySelector(s);
const show = el => el && el.classList.remove("hidden");
const hide = el => el && el.classList.add("hidden");

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
// AUTO-LOAD MID (editable)
// ============================================================
let _autoMid = null;
(async function autoLoadMid() {
    const midInput = $("#midInput");
    const midHint = $("#midHint");
    const midBadge = $("#midBadge");
    if (!midInput || !midHint || !midBadge) {
        console.warn("[MID] Element tidak ketemu, skip auto-load");
        return;
    }
    try {
        const mid = await getMachineId();
        _autoMid = mid;
        if (!midInput.value) midInput.value = mid;
        midHint.textContent = "Machine ID terdeteksi otomatis. Bisa diedit kalau perlu.";
        midHint.style.color = "var(--acc-green)";
        midBadge.textContent = "(otomatis - bisa diedit)";
        midBadge.style.color = "var(--acc-green)";
        console.log("[MID] Auto-loaded:", mid.substring(0, 16) + "...");
    } catch (e) {
        console.error("[MID] Gagal:", e);
        midHint.textContent = "Gagal deteksi otomatis. Isi manual dari extension.";
        midHint.style.color = "var(--danger)";
        midBadge.textContent = "(isi manual)";
        midBadge.style.color = "var(--warning)";
    }
})();

// ============ LOGIN ============
$("#loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = $("#emailInput").value.trim();
    const mid = ($("#midInput").value || _autoMid || "").trim();
    const err = $("#loginError");
    hide(err);

    if (!email) { err.textContent = "Email wajib diisi."; show(err); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        err.textContent = "Format email tidak valid.";
        show(err); return;
    }
    if (!mid || mid.length < 20) {
        err.textContent = "Machine ID belum terdeteksi. Refresh halaman atau isi manual.";
        show(err); return;
    }

    saveSession({ email, machineId: mid });
    showDashboard();
});

function doLogout() {
    if (!confirm("Logout dari dashboard? License yang sudah dimasukkan akan dihapus.")) return;
    clearSession();
    $("#emailInput").value = "";
    showLogin();
}
$("#navLogout").addEventListener("click", doLogout);

// ============ LICENSE STATUS ============
function renderLicenseStatus(session) {
    const box = $("#licenseStatusContent");
    const payBtn = $("#buyProBtn");
    const pasteBtn = $("#pasteLicenseBtn");
    const removeBtn = $("#removeLicenseBtn");

    if (!session.licenseKey) {
        box.innerHTML = `
            <div class="alert alert-warn" style="margin:0">
                <i>&#9888;</i>
                <div><b>Belum ada License PRO.</b><br>Anda hanya bisa download versi <b>Trial</b>. Untuk versi PRO, masukkan License Key dari Admin atau hubungi kami.</div>
            </div>`;
        show(pasteBtn); show(payBtn); hide(removeBtn);
        return;
    }

    const p = session.payload || {};
    const tier = (p.t || "").toLowerCase();
    const isPro = isProTier(tier);
    const exp = p.e || "-";
    const days = daysRemaining(exp);

    box.innerHTML = `
        <div class="info-row"><span class="label">Tier</span><span class="value"><span class="badge badge-${tier || "pro"}">${tier || "pro"}</span></span></div>
        <div class="info-row"><span class="label">Produk</span><span class="value">${escapeHtml(p.tool || "coretax-toolkit")}</span></div>
        <div class="info-row"><span class="label">Berlaku sampai</span><span class="value">${fmtDate(exp)} <small style="color:var(--muted)">(${days} hari)</small></span></div>
        ${isPro
            ? `<div class="alert alert-success" style="margin:12px 0 0"><i>&#10003;</i><div><b>Akses PRO aktif.</b> Semua produk bisa di-download versi PRO.</div></div>`
            : `<div class="alert alert-info" style="margin:12px 0 0"><i>&#8505;</i><div>License tier <b>${tier}</b> tidak membuka akses PRO. Masukkan License PRO dari Admin.</div></div>`}
    `;
    show(removeBtn);
    if (isPro) hide(pasteBtn); else show(pasteBtn);
    show(payBtn);
}

// ============ PRODUCTS ============
function renderProducts(session) {
    const grid = $("#productsGrid");
    const hasPro = session.payload && isProTier(session.payload.t);

    grid.innerHTML = PRODUCTS.map(p => {
        const icon = ICONS[p.id] || "";
        const isAvail = p.available;

        const trialBtn = isAvail
            ? `<a class="product-btn product-btn-trial" href="${DIST}/${p.trial}" download><svg viewBox="0 0 24 24"><path d="M12 15l-5-5h3V4h4v6h3l-5 5zM5 19h14v2H5z"/></svg> Download Trial</a>`
            : `<button class="product-btn product-btn-trial" disabled><svg viewBox="0 0 24 24"><path d="M12 15l-5-5h3V4h4v6h3l-5 5zM5 19h14v2H5z"/></svg> Trial</button>`;

        const proBtn = !isAvail
            ? `<button class="product-btn product-btn-pro" disabled><svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5 3.8 9.4 9 11 5.2-1.6 9-6 9-11V5l-9-4z"/></svg> Coming Soon</button>`
            : (hasPro
                ? `<a class="product-btn product-btn-pro" href="${DIST}/${p.pro}" download><svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5 3.8 9.4 9 11 5.2-1.6 9-6 9-11V5l-9-4z"/></svg> Download PRO</a>`
                : `<button class="product-btn product-btn-pro" disabled onclick="openLicenseModal()"><svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5 3.8 9.4 9 11 5.2-1.6 9-6 9-11V5l-9-4z"/></svg> Butuh License</button>`);

        return `
            <div class="product-card">
                ${!isAvail ? '<span class="product-badge">Coming Soon</span>' : ""}
                <div class="product-head">
                    <div class="product-ico ${p.accent}"><svg viewBox="0 0 24 24">${icon}</svg></div>
                    <div class="product-head-text">
                        <div class="product-name">${escapeHtml(p.name)}</div>
                        <div class="product-type">${escapeHtml(p.type)}</div>
                    </div>
                </div>
                <p class="product-desc">${escapeHtml(p.desc)}</p>
                <div class="product-actions">${trialBtn}${proBtn}</div>
            </div>`;
    }).join("");
}

function renderDashboard() {
    const s = getSession();
    if (!s || !s.email || !s.machineId) { showLogin(); return; }

    $("#heroEmail").textContent = s.email;
    $("#heroMid").textContent = shortMid(s.machineId);

    renderLicenseStatus(s);
    renderProducts(s);

    const cb = $("#copyMidHero");
    cb.onclick = () => {
        navigator.clipboard.writeText(s.machineId).then(() => {
            const orig = cb.textContent;
            cb.textContent = "OK!";
            cb.classList.add("ok");
            setTimeout(() => { cb.textContent = orig; cb.classList.remove("ok"); }, 1500);
        });
    };
}

// ============ LICENSE MODAL ============
function openLicenseModal() {
    $("#licenseTextarea").value = "";
    hide($("#modalError"));
    $("#licenseModal").classList.add("show");
    setTimeout(() => $("#licenseTextarea").focus(), 100);
}
function closeLicenseModal() {
    $("#licenseModal").classList.remove("show");
}
window.openLicenseModal = openLicenseModal;

$("#pasteLicenseBtn").addEventListener("click", openLicenseModal);
$("#modalCancel").addEventListener("click", closeLicenseModal);
$("#licenseModal").addEventListener("click", (e) => {
    if (e.target === $("#licenseModal")) closeLicenseModal();
});

$("#modalConfirm").addEventListener("click", async () => {
    const key = $("#licenseTextarea").value.trim();
    const err = $("#modalError");
    const btn = $("#modalConfirm");
    hide(err);

    if (!key) { err.textContent = "License Key kosong."; show(err); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Verifikasi...';

    try {
        const payload = await verifyLicense(key);
        const session = getSession();
        if (payload.m && payload.m !== "*" && payload.m !== session.machineId) {
            throw new Error("License ini untuk Machine ID lain. Machine ID Anda: " + shortMid(session.machineId));
        }
        updateSession({ licenseKey: key, payload });
        closeLicenseModal();
        renderDashboard();
    } catch (e) {
        err.textContent = "Gagal: " + e.message;
        show(err);
    } finally {
        btn.disabled = false;
        btn.textContent = "Verifikasi & Simpan";
    }
});

$("#removeLicenseBtn").addEventListener("click", () => {
    if (!confirm("Hapus License dari dashboard? Anda bisa masukkan lagi kapan saja.")) return;
    const s = getSession() || {};
    delete s.licenseKey;
    delete s.payload;
    saveSession(s);
    renderDashboard();
});

$("#buyProBtn").addEventListener("click", () => {
    window.open(WA_URL, "_blank", "noopener");
});

function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}

(function init() {
    const s = getSession();
    if (s && s.email && s.machineId) showDashboard();
    else showLogin();
})();