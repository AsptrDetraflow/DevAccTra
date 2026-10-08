// ============================================================
// Coretax PDF Downloader - Dashboard App Logic
// ============================================================

const PRODUCT_LABELS = {
    "coretax-toolkit": "Coretax PDF Downloader",
    "rekap-faktur": "Rekap Faktur",
    "rekap-bupot-bppu": "Rekap Bupot BPPU",
    "rekap-bank-bca": "Rekap Bank BCA",
};

const $ = (s, r = document) => r.querySelector(s);

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

function tierBadgeClass(tier) {
    switch ((tier || "").toLowerCase()) {
        case "pro": return "badge-pro";
        case "trial": return "badge-trial";
        case "basic": return "badge-basic";
        case "lifetime": return "badge-lifetime";
        default: return "badge-pro";
    }
}

function showLoginView() {
    show($("#loginView"));
    hide($("#dashboardView"));
    hide($("#logoutBtn"));
}

function showDashboardView(payload, licenseKey) {
    hide($("#loginView"));
    show($("#dashboardView"));
    show($("#logoutBtn"));

    const tier = (payload.t || "pro").toLowerCase();
    const expires = payload.e || "-";
    const issued = payload.i || "-";
    const tool = payload.tool || "coretax-toolkit";
    const mid = payload.m || "-";
    const name = payload.n || "Customer";
    const email = payload.x || "-";

    $("#userName").textContent = name.split(" ")[0] || "Customer";
    $("#statTier").innerHTML = `<span class="badge ${tierBadgeClass(tier)}">${tier}</span>`;
    $("#statExpiry").textContent = fmtDate(expires);
    $("#statDays").innerHTML = `${daysRemaining(expires)}<small>hari</small>`;

    $("#infoTier").className = "badge " + tierBadgeClass(tier);
    $("#infoTier").textContent = tier;
    $("#infoProduct").textContent = PRODUCT_LABELS[tool] || tool;
    $("#infoIssued").textContent = fmtDate(issued);
    $("#infoExpiry").textContent = fmtDate(expires);
    $("#infoMid").textContent = mid;
    $("#infoName").textContent = name;
    $("#infoEmail").textContent = email;

    $("#prodName").textContent = PRODUCT_LABELS[tool] || tool;

    if (tier === "trial") {
        show($("#trialWarning"));
    } else {
        hide($("#trialWarning"));
    }

    // Copy MID button
    $("#copyMidBtn").onclick = () => {
        navigator.clipboard.writeText(mid).then(() => {
            const btn = $("#copyMidBtn");
            const orig = btn.textContent;
            btn.textContent = "OK!";
            btn.classList.add("ok");
            setTimeout(() => {
                btn.textContent = orig;
                btn.classList.remove("ok");
            }, 1500);
        });
    };

    // Clean up query string if any (hide license from URL)
    if (location.search) {
        history.replaceState(null, "", location.pathname);
    }
}

// ============ LOGIN HANDLER ============
$("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errBox = $("#loginError");
    hide(errBox);

    const key = $("#licenseInput").value.trim();
    if (!key) {
        errBox.textContent = "License Key kosong.";
        show(errBox);
        return;
    }

    const btn = $("#loginBtn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Memverifikasi...';

    try {
        const payload = await verifyLicense(key);
        saveSession(payload, key);
        showDashboardView(payload, key);
    } catch (err) {
        errBox.textContent = "Gagal: " + err.message;
        show(errBox);
    } finally {
        btn.disabled = false;
        btn.textContent = "Login ke Dashboard";
    }
});

// ============ LOGOUT ============
function doLogout() {
    clearSession();
    $("#licenseInput").value = "";
    showLoginView();
}
$("#logoutBtn").addEventListener("click", doLogout);
$("#logoutBtn2").addEventListener("click", doLogout);

// ============ AUTO-LOGIN ============
(async function init() {
    const session = getSession();
    if (session && session.payload) {
        // Verify still valid
        try {
            const payload = await verifyLicense(session.licenseKey);
            saveSession(payload, session.licenseKey);
            showDashboardView(payload, session.licenseKey);
            return;
        } catch (e) {
            // Expired or invalid - clear session
            clearSession();
        }
    }
    showLoginView();
})();