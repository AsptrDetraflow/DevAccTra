// ============================================================
// DevAccTra — Modular Disclaimer
// Auto-render disclaimer berdasarkan konteks halaman
// ============================================================
(function () {
    "use strict";

    // Mapping produk → pihak ketiga terkait
    const PRODUCT_DISCLAIMERS = {
        "coretax-toolkit": {
            name: "Coretax PDF Downloader",
            parties: [
                { name: "Direktorat Jenderal Pajak (DJP)", marks: ["Coretax"] },
            ],
            text: 'Produk ini <b>tidak berafiliasi</b> dengan Direktorat Jenderal Pajak (DJP) Republik Indonesia. "Coretax" adalah merek terdaftar milik DJP RI. Produk hanya alat bantu otomasi; pengguna bertanggung jawab penuh atas kepatuhan perpajakan.',
        },
        "rekap-faktur": {
            name: "Rekap Faktur",
            parties: [
                { name: "Direktorat Jenderal Pajak (DJP)", marks: ["e-Faktur"] },
            ],
            text: 'Produk ini <b>tidak berafiliasi</b> dengan Direktorat Jenderal Pajak (DJP) Republik Indonesia. "e-Faktur" adalah merek milik DJP RI. Pengguna bertanggung jawab penuh atas kepatuhan perpajakan.',
        },
        "rekap-bupot-bppu": {
            name: "Rekap Bupot BPPU",
            parties: [
                { name: "Direktorat Jenderal Pajak (DJP)", marks: ["e-Bupot", "BPPU"] },
            ],
            text: 'Produk ini <b>tidak berafiliasi</b> dengan Direktorat Jenderal Pajak (DJP) Republik Indonesia. Pengguna bertanggung jawab penuh atas kepatuhan perpajakan.',
        },
        "rekap-bank-bca": {
            name: "Rekap Bank BCA",
            parties: [
                { name: "PT Bank Central Asia Tbk", marks: ["BCA"] },
            ],
            text: 'Produk ini <b>tidak berafiliasi</b> dengan PT Bank Central Asia Tbk. "BCA" adalah merek terdaftar milik PT Bank Central Asia Tbk. Produk hanya alat bantu rekap; pengguna bertanggung jawab penuh atas penggunaan data.',
        },
    };

    // Deteksi konteks
    function getContext() {
        const path = location.pathname;
        const params = new URLSearchParams(location.search);
        const tool = params.get("tool");

        if (path.includes("/trial/") || path.includes("/trial")) {
            return { type: "trial", tool: tool };
        }
        if (path.includes("/dashboard/")) {
            return { type: "dashboard" }; // skip
        }
        return { type: "landing" };
    }

    // Render universal disclaimer (untuk landing)
    function renderUniversal() {
        return (
            '<div class="dact-disclaimer dact-universal">' +
                '<div class="dact-disclaimer-icon"><i class="fa-solid fa-shield-halved"></i></div>' +
                '<div class="dact-disclaimer-body">' +
                    '<h4>Disclaimer Pihak Ketiga</h4>' +
                    '<p><b>DevAccTra</b> adalah platform tools &amp; software independen. Kami <b>tidak berafiliasi</b> dengan, tidak disponsori oleh, dan tidak didukung oleh:</p>' +
                    '<ul>' +
                        '<li><b>Direktorat Jenderal Pajak (DJP) Republik Indonesia</b> — "Coretax", "e-Faktur", "e-Bupot", "BPPU" adalah merek milik DJP RI</li>' +
                        '<li><b>PT Bank Central Asia Tbk</b> — "BCA" adalah merek terdaftar milik PT Bank Central Asia Tbk</li>' +
                    '</ul>' +
                    '<p class="dact-note">Semua nama merek, logo, dan trademark adalah milik pemiliknya masing-masing. Produk kami hanya alat bantu otomasi untuk mempercepat pekerjaan administratif. Pengguna bertanggung jawab penuh atas kepatuhan terhadap ketentuan yang berlaku.</p>' +
                '</div>' +
            '</div>'
        );
    }

    // Render per-product disclaimer (untuk trial)
    function renderPerProduct(tool) {
        const info = PRODUCT_DISCLAIMERS[tool];
        if (!info) {
            // Fallback — pakai universal
            return renderUniversal();
        }
        const marksList = info.parties.map(p => p.marks.join(", ")).join(", ");
        return (
            '<div class="dact-disclaimer dact-product">' +
                '<div class="dact-disclaimer-icon"><i class="fa-solid fa-circle-info"></i></div>' +
                '<div class="dact-disclaimer-body">' +
                    '<h4>Disclaimer — ' + info.name + '</h4>' +
                    '<p>' + info.text + '</p>' +
                    '<p class="dact-note">Semua nama merek, logo, dan trademark adalah milik pemiliknya masing-masing.</p>' +
                '</div>' +
            '</div>'
        );
    }

    // Inject disclaimer
    function inject(html) {
        // Cari target: prioritas footer, fallback end of main, fallback body
        let target = null;

        // 1. Coba cari <footer>
        target = document.querySelector("footer.footer, footer.site-footer, body > footer");

        if (target) {
            // Inject SEBELUM footer
            const wrap = document.createElement("section");
            wrap.className = "dact-disclaimer-wrap";
            wrap.innerHTML = '<div class="dact-container">' + html + '</div>';
            target.parentNode.insertBefore(wrap, target);
            return;
        }

        // 2. Fallback: cari <main>
        target = document.querySelector("main");
        if (target) {
            const wrap = document.createElement("section");
            wrap.className = "dact-disclaimer-wrap";
            wrap.innerHTML = '<div class="dact-container">' + html + '</div>';
            target.appendChild(wrap);
            return;
        }

        // 3. Last resort: append ke body
        const wrap = document.createElement("section");
        wrap.className = "dact-disclaimer-wrap";
        wrap.innerHTML = '<div class="dact-container">' + html + '</div>';
        document.body.appendChild(wrap);
    }

    function init() {
        const ctx = getContext();
        if (ctx.type === "dashboard") return; // skip

        let html = "";
        if (ctx.type === "trial") {
            html = renderPerProduct(ctx.tool);
        } else {
            html = renderUniversal();
        }

        if (html) inject(html);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();