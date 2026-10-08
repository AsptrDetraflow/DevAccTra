// ============================================================
// Coretax PDF Downloader - Dashboard Auth
// Login via Email + Machine ID. License verify client-side.
// ============================================================

const PUBLIC_KEY_B64 = "kN08rrwZddPxF2KjSIgZ0bH6veMmE94ExuEE3FbGs6s=";
const SESSION_KEY = "coretax_dashboard_session_v2";

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
    const pkBytes = b64ToBytes(PUBLIC_KEY_B64);
    const pk = await crypto.subtle.importKey("raw", pkBytes, { name: "Ed25519" }, false, ["verify"]);

    const sig = b64urlToBytes(sigB64);
    const data = new TextEncoder().encode(payloadB64);
    const ok = await crypto.subtle.verify({ name: "Ed25519" }, pk, sig, data);
    if (!ok) throw new Error("License tidak sah");

    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
    const today = new Date().toISOString().slice(0, 10);
    if (payload.e < today) throw new Error("License sudah kadaluarsa");

    return payload;
}

// ============ SESSION ============
function saveSession(data) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
}
function getSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}
function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}
function updateSession(patch) {
    const s = getSession() || {};
    saveSession({ ...s, ...patch });
}

// ============ HELPERS ============
function daysRemaining(expiresAt) {
    if (!expiresAt) return 0;
    const e = new Date(expiresAt + "T23:59:59").getTime();
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

// PRO check: license tier BUKAN trial
function isProTier(tier) {
    const t = (tier || "").toLowerCase();
    return t === "pro" || t === "basic" || t === "enterprise" || t === "lifetime" || t === "subscription";
}