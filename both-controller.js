/* both-controller v4.2.9 — FIX: marker follows Firestore (data-marker is fallback); safer smart-mark parsing; default reviews API */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const __MODULE_URL__ = new URL(import.meta.url);
const __WIDGET_ID__ = (__MODULE_URL__.searchParams.get("id") || "").trim();
const __SLUG_QS__ = (__MODULE_URL__.searchParams.get("slug") || "").trim();

/* =========================================
   1) FIREBASE
   ========================================= */
const firebaseConfig = {
  apiKey: "AIzaSyCbRxawm1ewrPGMQKo3bqUCAgFzmtSjsUU",
  authDomain: "evid-mvp-e59cc.firebaseapp.com",
  projectId: "evid-mvp-e59cc",
  storageBucket: "evid-mvp-e59cc.firebasestorage.app",
  messagingSenderId: "120890864280",
  appId: "1:120890864280:web:b28cb794b68db35b81d6ed",
  measurementId: "G-TXV4PH2YY8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* =========================================
   2) MAIN
   ========================================= */
(async function () {
  // Host
  let hostEl = document.getElementById("reviews-widget");
  if (!hostEl) {
    hostEl = document.createElement("div");
    hostEl.id = "reviews-widget";
    document.body.appendChild(hostEl);
  }

  const root = hostEl.attachShadow ? hostEl.attachShadow({ mode: "open" }) : hostEl;

  function getThisScriptEl() {
    // In ES modules document.currentScript is usually null, so locate the <script> by src path.
    try {
      const me = new URL(import.meta.url, document.baseURI);
      const meKey = me.origin + me.pathname; // no query
      const scripts = Array.from(document.getElementsByTagName("script"));

      // 1) exact origin+pathname match (best)
      for (let i = scripts.length - 1; i >= 0; i--) {
        const s = scripts[i];
        if (!s || !s.src) continue;
        try {
          const su = new URL(s.src, document.baseURI);
          const suKey = su.origin + su.pathname;
          if (suKey === meKey) return s;
        } catch (_) {}
      }

      // 2) fallback: contains "both-controller" in src
      for (let i = scripts.length - 1; i >= 0; i--) {
        const s = scripts[i];
        if (!s || !s.src) continue;
        if (String(s.src).indexOf("both-controller") > -1) return s;
      }
    } catch (_) {}
    return null;
  }

  const currentScript = getThisScriptEl();

  // Defaults (overridden by Firebase widget doc if exists)
  const DYNAMIC_SETTINGS = {
    color: "#4f46e5",
    font: "Rubik",
    position: "bottom-right",
    delay: 0,
    businessName: "",
    slug: "",
    marker: false
  };

  let markerSource = "default";
  let markerFromFirestorePresent = false;

  // ===== Load widget settings from Firestore (widgets/{id}) =====
  try {
    const widgetId = __WIDGET_ID__;
    if (widgetId) {
      const docRef = doc(db, "widgets", widgetId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() || {};
        const s = data.settings || {};

        DYNAMIC_SETTINGS.color = s.color || DYNAMIC_SETTINGS.color;

        const rawFont = String(s.font || DYNAMIC_SETTINGS.font);
        DYNAMIC_SETTINGS.font =
          rawFont.split(",")[0].replace(/['"]/g, "").trim() || DYNAMIC_SETTINGS.font;

        DYNAMIC_SETTINGS.position = s.position || DYNAMIC_SETTINGS.position;

        const d = Number(s.delay);
        DYNAMIC_SETTINGS.delay = Number.isFinite(d) ? d * 1000 : 0;

        DYNAMIC_SETTINGS.businessName = data.businessName || "";

        // slug sources (optional)
        DYNAMIC_SETTINGS.slug = String(
          data.slug || data.placeId || data.place_id || data.placeID || data.placeID || data.googlePlaceId || ""
        ).trim();

        // ✅ Marker from Firestore takes priority (so dashboard changes affect live sites)
        if (Object.prototype.hasOwnProperty.call(s, "marker")) {
          markerFromFirestorePresent = true;
          markerSource = "firestore";
          DYNAMIC_SETTINGS.marker = !!s.marker;
        }

        console.log("EVID: Widget settings loaded from Firebase", {
          id: widgetId,
          color: DYNAMIC_SETTINGS.color,
          font: DYNAMIC_SETTINGS.font,
          position: DYNAMIC_SETTINGS.position,
          delayMs: DYNAMIC_SETTINGS.delay,
          businessName: DYNAMIC_SETTINGS.businessName,
          slug: DYNAMIC_SETTINGS.slug,
          marker: DYNAMIC_SETTINGS.marker,
          markerSource
        });
      }
    }
  } catch (e) {
    console.warn("EVID: Could not load settings from Firebase, using defaults.", e);
  }

  // ✅ data-marker fallback (ONLY if Firestore didn't provide marker)
  // Supports:
  // data-marker="on|off|true|false|1|0"
  // data-marker="force-on|force-off" (always overrides)
  try {
    const mkRaw = currentScript ? String(currentScript.getAttribute("data-marker") || "").toLowerCase().trim() : "";
    const forceOn = mkRaw === "force-on";
    const forceOff = mkRaw === "force-off";

    const attrSaysOn = mkRaw === "on" || mkRaw === "true" || mkRaw === "1";
    const attrSaysOff = mkRaw === "off" || mkRaw === "false" || mkRaw === "0";

    if (forceOn) {
      DYNAMIC_SETTINGS.marker = true;
      markerSource = "attr(force)";
    } else if (forceOff) {
      DYNAMIC_SETTINGS.marker = false;
      markerSource = "attr(force)";
    } else if (!markerFromFirestorePresent) {
      if (attrSaysOn) {
        DYNAMIC_SETTINGS.marker = true;
        markerSource = "attr(fallback)";
      }
      if (attrSaysOff) {
        DYNAMIC_SETTINGS.marker = false;
        markerSource = "attr(fallback)";
      }
    }
  } catch (_) {}

  // ===== Read config from <script> attributes (if present) =====
  const REVIEWS_EP_ATTR = currentScript ? currentScript.getAttribute("data-reviews-endpoint") : "";
  const PURCHASES_EP = currentScript ? currentScript.getAttribute("data-purchases-endpoint") : "";

  const SHOW_MS = Number((currentScript && currentScript.getAttribute("data-show-ms")) || 15000);
  const GAP_MS = Number((currentScript && currentScript.getAttribute("data-gap-ms")) || 6000);
  const INIT_MS =
    DYNAMIC_SETTINGS.delay ||
    Number((currentScript && currentScript.getAttribute("data-init-delay-ms")) || 0);
  const DISMISS_COOLDOWN_MS = Number(
    (currentScript && currentScript.getAttribute("data-dismiss-cooldown-ms")) || 45000
  );

  const TXT_LIVE = (currentScript && currentScript.getAttribute("data-live-text")) || "מבוקש עכשיו";
  const TXT_BOUGHT =
    (currentScript && currentScript.getAttribute("data-purchase-label")) || "רכש/ה";

  const SELECTED_FONT = DYNAMIC_SETTINGS.font;
  const WIDGET_POS = DYNAMIC_SETTINGS.position;
  const THEME_COLOR = DYNAMIC_SETTINGS.color;
  const MARKER_ENABLED = !!DYNAMIC_SETTINGS.marker;

  const DEFAULT_PRODUCT_IMG =
    (currentScript && currentScript.getAttribute("data-default-image")) ||
    "https://cdn-icons-png.flaticon.com/128/2331/2331970.png";

  const PAGE_TRANSITION_DELAY = 3000;
  const STORAGE_KEY = "evid:widget-state:v4";

  // ✅ Default reviews API (used when data-reviews-endpoint is missing)
  const DEFAULT_REVIEWS_API_BASE = "https://review-widget-psi.vercel.app/api/get-reviews?slug=";

  // ===== CURRENT SLUG =====
  const CURRENT_SLUG = (function () {
    try {
      if (__SLUG_QS__) return __SLUG_QS__;

      if (currentScript && currentScript.getAttribute("data-slug")) {
        const v = String(currentScript.getAttribute("data-slug")).trim();
        if (v) return v;
      }

      if (DYNAMIC_SETTINGS && DYNAMIC_SETTINGS.slug) return String(DYNAMIC_SETTINGS.slug).trim();

      if (typeof window !== "undefined" && window.EVID_SLUG) return String(window.EVID_SLUG).trim();

      if (__WIDGET_ID__) return __WIDGET_ID__;
    } catch (e) {
      console.warn("EVID: Failed to derive CURRENT_SLUG:", e);
    }
    return "";
  })();

  // ===== Helpers =====
  const HEBREW_VERBS = {
    "רכש/ה": { m: "רכש", f: "רכשה" },
    "קנה/תה": { m: "קנה", f: "קנתה" },
    "הזמין/ה": { m: "הזמין", f: "הזמינה" },
    "בחר/ה": { m: "בחר", f: "בחרה" },
    "הצטרף/ה": { m: "הצטרף", f: "הצטרפה" },
    "נרשם/ה": { m: "נרשם", f: "נרשמה" }
  };

  const DB_FEMALE =
    "שרה,רחל,לאה,רבקה,אסתר,מרים,חנה,אביגיל,אבישג,אביה,אדל,אורלי,איילה,אילנה,אפרת,גאיה,גלי,דנה,דניאלה,הדר,הילה,ורד,זהבה,חיה,טליה,יעל,יערה,לי,ליה,ליהי,לינוי,לילך,מאיה,מיכל,מירב,מור,מורן,מירי,נטע,נועה,נעמה,ספיר,עדי,ענבל,ענת,קרן,רוני,רות,רותם,רינה,שולמית,שירה,שירלי,שני,תמר";

  function getGenderedVerb(name, selectedKey) {
    const key = (selectedKey || "רכש/ה").trim();
    if (!HEBREW_VERBS[key]) return key;
    const first = (name || "").trim().split(/\s+/)[0].replace(/[^א-תa-z]/gi, "");
    return DB_FEMALE.indexOf(first) > -1 ? HEBREW_VERBS[key].f : HEBREW_VERBS[key].m;
  }

  function escapeHTML(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function stripAllTags(s) {
    return String(s || "").replace(/<\/?[^>]+>/g, "");
  }

  function firstName(s) {
    s = String(s || "").trim();
    const parts = s.split(/\s+/);
    return parts[0] || s;
  }

  function normalizeSpaces(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function timeAgo(ts) {
    try {
      const d = new Date(ts);
      const diff = Math.max(0, (Date.now() - d.getTime()) / 1000);
      const m = Math.floor(diff / 60),
        h = Math.floor(m / 60),
        d2 = Math.floor(h / 24);
      if (d2 > 0) return d2 === 1 ? "אתמול" : "לפני " + d2 + " ימים";
      if (h > 0) return "לפני " + h + " שעות";
      if (m > 0) return "לפני " + m + " דקות";
      return "כרגע";
    } catch (_) {
      return "";
    }
  }

  // ✅ Allow only <span class="smart-mark">...</span> (class can be among multiple classes). Strip everything else (safe).
  function safeReviewHtmlAllowSmartMark(raw) {
    raw = String(raw || "");

    const tokens = [];
    let tmp = raw.replace(
      /<span\b[^>]*class=(?:"[^"]*?\bsmart-mark\b[^"]*"|'[^']*?\bsmart-mark\b[^']*'|[^\s>]*\bsmart-mark\b[^\s>]*)[^>]*>([\s\S]*?)<\/span>/gi,
      function (_, inner) {
        tokens.push(inner);
        return "__EVIDMARK_" + (tokens.length - 1) + "__";
      }
    );

    // remove ANY other HTML tags
    tmp = tmp.replace(/<\/?[^>]+>/g, "");

    // escape remaining text
    tmp = escapeHTML(tmp);

    // restore safe markers (escape inside)
    tmp = tmp.replace(/__EVIDMARK_(\d+)__/g, function (_, i) {
      const inner = tokens[Number(i)] || "";
      return '<span class="smart-mark">' + escapeHTML(inner) + "</span>";
    });

    return tmp;
  }

  // ===== Fonts =====
  function ensureFontInHead() {
    try {
      const id = "evid-font-" + SELECTED_FONT.toLowerCase().replace(/\s+/g, "-");
      if (!document.getElementById(id)) {
        const link = document.createElement("link");
        link.id = id;
        link.rel = "stylesheet";
        link.href =
          "https://fonts.googleapis.com/css2?family=" +
          encodeURIComponent(SELECTED_FONT).replace(/%20/g, "+") +
          ":wght@300;400;500;600;700;800&display=swap";
        document.head.appendChild(link);
      }
    } catch (_) {}
    return Promise.resolve();
  }

  // ===== Styles =====
  const style = document.createElement("style");
  style.textContent =
    ""
      + ":host{all:initial;}"
      + ":host, :host *, .wrap, .wrap *{font-family:'" + SELECTED_FONT + "',sans-serif !important;box-sizing:border-box;}"
      + ".wrap{position:fixed;z-index:2147483000;direction:rtl;pointer-events:none;display:block;}"
      + ".card{position:relative;width:290px;max-width:90vw;background:rgba(255,255,255,.95);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:18px;border:1px solid rgba(255,255,255,.8);box-shadow:0 8px 25px -8px rgba(0,0,0,.1),0 2px 4px -1px rgba(0,0,0,.04);padding:16px;overflow:hidden;pointer-events:auto;border-top:4px solid " + THEME_COLOR + ";}"
      + ".enter{animation:slideInUp .6s cubic-bezier(.34,1.56,.64,1) forwards;}"
      + ".leave{animation:slideOutDown .6s cubic-bezier(.34,1.56,.64,1) forwards;}"
      + "@keyframes slideInUp{from{opacity:0;transform:translateY(30px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}"
      + "@keyframes slideOutDown{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(30px)}}"
      + ".xbtn{position:absolute;top:8px;left:8px;width:18px;height:18px;background:rgba(241,245,249,.5);border-radius:50%;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#94a3b8;font-size:10px;z-index:20;opacity:0;transition:opacity .2s;}"
      + ".card:hover .xbtn{opacity:1;}"
      + ".top-badge-container{display:flex;justify-content:flex-start;margin-bottom:10px;}"
      + ".modern-badge{font-size:10px;font-weight:700;color:" + THEME_COLOR + ";background:#eef2ff;padding:3px 8px;border-radius:12px;display:flex;align-items:center;gap:5px;letter-spacing:.3px;}"
      + ".pulse-dot{width:5px;height:5px;background:" + THEME_COLOR + ";border-radius:50%;animation:pulse 2s infinite;}"
      + "@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(79,70,229,.4)}70%{box-shadow:0 0 0 4px rgba(79,70,229,0)}100%{box-shadow:0 0 0 0 rgba(79,70,229,0)}}"
      + ".review-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}"
      + ".user-pill{display:flex;align-items:center;gap:8px;}"
      + ".review-avatar,.avatar-fallback{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg," + THEME_COLOR + " 0%,#8b5cf6 100%);color:#fff;font-size:12px;font-weight:700;display:grid;place-items:center;box-shadow:0 2px 5px rgba(0,0,0,.1);object-fit:cover;}"
      + ".reviewer-name{font-size:14px;font-weight:700;color:#1e293b;letter-spacing:-.3px;}"
      + ".rating-container{display:flex;align-items:center;gap:5px;background:#fff;border:1px solid #f1f5f9;padding:3px 6px;border-radius:6px;}"
      + ".stars{color:#f59e0b;font-size:11px;letter-spacing:1px;}"
      + ".g-icon-svg{width:12px;height:12px;display:block;}"
      + ".review-text{font-size:13px;line-height:1.4;color:#334155;font-weight:400;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}"
      + ".review-text.expanded{-webkit-line-clamp:unset;overflow:visible;}"
      + ".read-more-btn{font-size:11px;color:" + THEME_COLOR + ";font-weight:700;cursor:pointer;background:transparent!important;border:none;padding:2px 0 0 0;outline:none!important;margin-top:2px;}"
      + ".read-more-btn:hover{text-decoration:underline;}"
      // ✅ smart marker highlight
      + ".smart-mark{background:linear-gradient(to bottom, transparent 65%, #fef08a 65%);color:#0f172a;font-weight:800;padding:0 1px;}"
      + ".purchase-card{height:85px;padding:0;display:flex;flex-direction:row;gap:0;width:290px;}"
      + ".course-img-wrapper{flex:0 0 85px;height:100%;position:relative;overflow:hidden;background:#f8f9fa;display:flex;align-items:center;justify-content:center;}"
      + ".course-img{width:100%;height:100%;object-fit:cover;}"
      + ".course-img.default-icon{object-fit:contain;padding:12px;}"
      + ".p-content{flex-grow:1;padding:8px 12px;display:flex;flex-direction:column;justify-content:center;text-align:right;}"
      + ".fomo-header{display:flex;justify-content:space-between;font-size:10px;color:#64748b;margin-bottom:2px;}"
      + ".fomo-name{font-weight:700;color:#1e293b;}"
      + ".fomo-body{font-size:12px;color:#334155;line-height:1.2;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}"
      + ".product-highlight{font-weight:600;color:" + THEME_COLOR + ";}"
      + ".fomo-footer-row{display:flex;align-items:center;gap:6px;font-size:10px;color:#ef4444;font-weight:600;}"
      + ".pulsing-dot{width:5px;height:5px;background:#ef4444;border-radius:50%;display:inline-block;}"
      + "@media (max-width:480px){.wrap{right:0!important;left:0!important;width:100%!important;display:flex!important;justify-content:center!important}.card{width:95%!important;margin:0 auto 10px!important;border-radius:12px}}";
  root.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "wrap";
  root.appendChild(wrap);

  function renderMonogram(name) {
    const d = document.createElement("div");
    d.className = "avatar-fallback";
    const s = String(name || "").trim();
    d.textContent = (s[0] || "?").toUpperCase();
    return d;
  }

  function renderAvatarPreloaded(name, url) {
    const shell = renderMonogram(name);
    if (url) {
      const img = new Image();
      img.decoding = "async";
      img.loading = "eager";
      img.onload = function () {
        const tag = document.createElement("img");
        tag.className = "review-avatar";
        tag.alt = "";
        tag.src = url;
        shell.replaceWith(tag);
      };
      img.onerror = function () {};
      img.src = url;
    }
    return shell;
  }

  // ===== Fetch helpers =====
  const JS_MIRRORS = ["https://cdn.jsdelivr.net", "https://fastly.jsdelivr.net", "https://gcore.jsdelivr.net"];

  function rewriteToMirror(u, mirror) {
    try {
      const a = new URL(u);
      const m = new URL(mirror);
      a.protocol = m.protocol;
      a.host = m.host;
      return a.toString();
    } catch (_) {
      return u;
    }
  }

  function fetchTextWithMirrors(u) {
    const opts = { method: "GET", credentials: "omit", cache: "no-store" };
    let i = 0;
    const isJSD = /(^https?:)?\/\/([^\/]*jsdelivr\.net)/i.test(u);

    const urlWithBuster = u + (u.indexOf("?") > -1 ? "&" : "?") + "t=" + Date.now();

    function attempt(url) {
      return fetch(url, opts)
        .then((res) =>
          res.text().then((raw) => {
            if (!res.ok) throw new Error(raw || ("HTTP " + res.status));
            return raw;
          })
        )
        .catch((err) => {
          if (isJSD && i < JS_MIRRORS.length - 1) {
            i++;
            const next = rewriteToMirror(u, JS_MIRRORS[i]);
            return attempt(next + (next.indexOf("?") > -1 ? "&" : "?") + "t=" + Date.now());
          }
          throw err;
        });
    }

    return attempt(urlWithBuster);
  }

  function fetchJSON(url) {
    return fetchTextWithMirrors(url).then((raw) => {
      try {
        return JSON.parse(raw);
      } catch (_) {
        return { items: [] };
      }
    });
  }

  // ===== Normalize =====
  function normalizeArray(data, as) {
    let arr = [];

    if (Array.isArray(data)) {
      arr = data;
    } else if (data && typeof data === "object") {
      if (Array.isArray(data.reviews)) arr = data.reviews;
      else if (Array.isArray(data.purchases)) arr = data.purchases;
      else if (Array.isArray(data.items)) arr = data.items;
    }

    if (as === "review") {
      return arr
        .map((x) => {
          if (!x) return null;
          const txt = String(x.text || "").trim();
          if (!txt) return null;
          if (txt.includes("אנא ספק לי") || txt.includes("כמובן!")) return null;

          return {
            kind: "review",
            data: {
              authorName: x.name || x.authorName || x.author_name || "Anonymous",
              rating: typeof x.rating !== "undefined" ? x.rating : 5,
              // keep raw text (may include <span class="smart-mark">..</span>)
              text: txt,
              profilePhotoUrl: x.profilePhotoUrl || x.photo || x.avatar || ""
            }
          };
        })
        .filter(Boolean);
    }

    if (as === "purchase") {
      return arr
        .map((x) => {
          if (!x) return null;
          const txt = x.Content || x.text || "";
          if (txt && (String(txt).includes("אנא ספק לי") || String(txt).includes("כמובן!"))) return null;

          return {
            kind: "purchase",
            data: {
              buyer: x.buyerName || x.buyer_name || x.buyer || x.name || x.first_name || "לקוח/ה",
              product: x.productName || x.product_name || x.item_name || x.product || x.title || "מוצר",
              image: x.productImage || x.product_image || x.image || "",
              purchased_at: x.purchased_at || x.created_at || new Date().toISOString()
            }
          };
        })
        .filter(Boolean);
    }

    return [];
  }

  // ===== Reviews fetching: endpoint first, then default API, fallback to Firestore =====
  async function fetchReviewsViaEndpoint(url) {
    const res = await fetch(url, { method: "GET", credentials: "omit", cache: "no-store" });
    if (!res.ok) throw new Error("Endpoint HTTP " + res.status);
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("text/html")) throw new Error("Endpoint returned HTML (likely 404 page)");
    const data = await res.json();
    return normalizeArray(data, "review");
  }

  async function fetchReviewsViaFirestore(slug) {
    if (!slug) return [];
    try {
      const colRef = collection(db, "reviews");

      try {
        const q1 = query(colRef, where("slug", "==", slug), orderBy("createdAt", "desc"), limit(25));
        const snap1 = await getDocs(q1);
        const raw1 = snap1.docs.map((d) => d.data());
        return normalizeArray(raw1, "review");
      } catch (e1) {
        const q2 = query(colRef, where("slug", "==", slug), limit(25));
        const snap2 = await getDocs(q2);
        const raw2 = snap2.docs.map((d) => d.data());
        return normalizeArray(raw2, "review");
      }
    } catch (e) {
      console.warn("EVID: Firestore reviews fallback failed:", e);
      return [];
    }
  }

  // ===== Persistence =====
  let items = [];
  let idx = 0;
  let loop = null;
  let preTimer = null;

  let isDismissed = false;
  let currentCard = null;
  let fadeTimeout = null;
  let removeTimeout = null;

  let isPausedForReadMore = false;
  let currentShowDuration = 0;
  let currentShowStart = 0;
  let remainingShowMs = 0;

  function itemsSignature(arr) {
    // stronger signature so "same length" updates don't look identical
    try {
      const head = (arr || []).slice(0, 5).map((it) => {
        if (!it) return "x";
        if (it.kind === "review") {
          const t = normalizeSpaces(stripAllTags(it.data?.text || "")).slice(0, 40);
          const a = String(it.data?.authorName || "").slice(0, 20);
          return "r:" + a + ":" + t;
        }
        const p = String(it.data?.product || "").slice(0, 40);
        const b = String(it.data?.buyer || "").slice(0, 20);
        return "p:" + b + ":" + p;
      }).join("|");
      return String(arr.length) + "|" + head;
    } catch {
      return (arr.length || 0) + "_x";
    }
  }
  let itemsSig = "0_x";

  function saveState(idxShown, sig, opt) {
    try {
      const st = { idx: idxShown, shownAt: opt?.shownAt ? opt.shownAt : Date.now(), sig };
      if (opt?.manualClose) st.manualClose = true;
      if (opt?.snoozeUntil) st.snoozeUntil = Number(opt.snoozeUntil) || 0;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
    } catch (_) {}
  }

  function restoreState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (_) {
      return null;
    }
  }

  function interleave(reviews, purchases) {
    const out = [];
    let i = 0, j = 0;
    while (i < reviews.length || j < purchases.length) {
      if (i < reviews.length) out.push(reviews[i++]);
      if (j < purchases.length) out.push(purchases[j++]);
    }
    return out;
  }

  function clearShowTimers() {
    if (fadeTimeout) {
      clearTimeout(fadeTimeout);
      fadeTimeout = null;
    }
    if (removeTimeout) {
      clearTimeout(removeTimeout);
      removeTimeout = null;
    }
  }

  function scheduleHide(showFor) {
    clearShowTimers();
    if (!currentCard) return;

    currentShowDuration = showFor;
    currentShowStart = Date.now();

    fadeTimeout = setTimeout(() => {
      if (!currentCard) return;
      currentCard.classList.remove("enter");
      currentCard.classList.add("leave");
    }, showFor);

    removeTimeout = setTimeout(() => {
      if (currentCard && currentCard.parentNode) currentCard.parentNode.removeChild(currentCard);
      currentCard = null;
    }, showFor + 700);
  }

  function pauseForReadMore() {
    if (isPausedForReadMore || !currentCard) return;
    isPausedForReadMore = true;
    if (loop) clearInterval(loop);
    if (preTimer) clearTimeout(preTimer);
    const elapsed = Date.now() - currentShowStart;
    remainingShowMs = Math.max(0, currentShowDuration - elapsed);
    clearShowTimers();
  }

  function resumeFromReadMore() {
    if (!isPausedForReadMore || !currentCard) return;
    isPausedForReadMore = false;
    const showMs = Math.max(2000, remainingShowMs);
    scheduleHide(showMs);
    preTimer = setTimeout(() => startFrom(0), showMs + GAP_MS);
  }

  function handleDismiss() {
    isDismissed = true;
    if (loop) clearInterval(loop);
    if (preTimer) clearTimeout(preTimer);
    clearShowTimers();
    const current = (idx - 1 + items.length) % items.length;
    saveState(current, itemsSig, { manualClose: true, snoozeUntil: Date.now() + DISMISS_COOLDOWN_MS });
  }

  // ===== Renderers =====
  function renderReviewCard(item) {
    const card = document.createElement("div");
    card.className = "card review-card enter";

    const x = document.createElement("button");
    x.className = "xbtn";
    x.textContent = "×";
    x.onclick = function () {
      handleDismiss();
      try { card.remove(); } catch (_) {}
    };
    card.appendChild(x);

    const topBadge = document.createElement("div");
    topBadge.className = "top-badge-container";
    topBadge.innerHTML = '<div class="modern-badge"><div class="pulse-dot"></div> פידבק מהשטח</div>';
    card.appendChild(topBadge);

    const header = document.createElement("div");
    header.className = "review-header";

    const userPill = document.createElement("div");
    userPill.className = "user-pill";
    userPill.appendChild(renderAvatarPreloaded(item.authorName, item.profilePhotoUrl));

    const nm = document.createElement("span");
    nm.className = "reviewer-name";
    nm.textContent = item.authorName || "Anonymous";
    userPill.appendChild(nm);

    header.appendChild(userPill);

    const ratingDiv = document.createElement("div");
    ratingDiv.className = "rating-container";
    ratingDiv.innerHTML = `
      <svg class="g-icon-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="#FBBC05"/>
        <path d="M12 4.61c1.61 0 3.09.56 4.23 1.64l3.18-3.18C17.45 1.19 14.97 0 12 0 7.7 0 3.99 2.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      <div class="stars">★★★★★</div>
    `;
    header.appendChild(ratingDiv);

    card.appendChild(header);

    const body = document.createElement("div");
    body.className = "review-text";

    const rawText = String(item.text || "");

    // ✅ Marker ON: allow only smart-mark spans
    // ✅ Marker OFF: strip tags so we never show "<span ...>" as text
    if (MARKER_ENABLED) body.innerHTML = safeReviewHtmlAllowSmartMark(rawText);
    else body.textContent = normalizeSpaces(stripAllTags(rawText));

    const readMoreBtn = document.createElement("button");
    readMoreBtn.className = "read-more-btn";
    readMoreBtn.textContent = "קרא עוד...";
    readMoreBtn.style.display = "none";

    setTimeout(() => {
      if (body.scrollHeight > body.clientHeight + 1) readMoreBtn.style.display = "block";
    }, 0);

    readMoreBtn.onclick = function (e) {
      e.stopPropagation();
      const isExpanded = body.classList.toggle("expanded");
      readMoreBtn.textContent = isExpanded ? "סגור" : "קרא עוד...";
      if (isExpanded) pauseForReadMore();
      else resumeFromReadMore();
    };

    card.appendChild(body);
    card.appendChild(readMoreBtn);

    return card;
  }

  function renderPurchaseCard(p) {
    const card = document.createElement("div");
    card.className = "card purchase-card enter";

    const x = document.createElement("button");
    x.className = "xbtn";
    x.textContent = "×";
    x.onclick = function () {
      handleDismiss();
      try { card.remove(); } catch (_) {}
    };
    card.appendChild(x);

    const imgWrap = document.createElement("div");
    imgWrap.className = "course-img-wrapper";

    const img = document.createElement("img");
    const isRealImage = p.image && p.image.length > 5;
    const imageSource = isRealImage ? p.image : DEFAULT_PRODUCT_IMG;
    img.className = isRealImage ? "course-img real-photo" : "course-img default-icon";
    img.src = imageSource;
    imgWrap.appendChild(img);

    const content = document.createElement("div");
    content.className = "p-content";

    const header = document.createElement("div");
    header.className = "fomo-header";
    header.innerHTML =
      '<span class="fomo-name">' +
      escapeHTML(firstName(p.buyer)) +
      '</span><span class="fomo-time">' +
      escapeHTML(timeAgo(p.purchased_at)) +
      "</span>";

    const body = document.createElement("div");
    body.className = "fomo-body";
    const dynamicVerb = getGenderedVerb(p.buyer, TXT_BOUGHT);
    body.innerHTML = escapeHTML(dynamicVerb) + ' <span class="product-highlight">' + escapeHTML(p.product) + "</span>";

    const footer = document.createElement("div");
    footer.className = "fomo-footer-row";
    footer.innerHTML = '<span class="pulsing-dot"></span> ' + escapeHTML(TXT_LIVE);

    content.appendChild(header);
    content.appendChild(body);
    content.appendChild(footer);

    card.appendChild(imgWrap);
    card.appendChild(content);

    return card;
  }

  function positionWrap() {
    const isMobile = window.innerWidth <= 480;
    if (isMobile) {
      wrap.style.top = "auto";
      wrap.style.left = "0px";
      wrap.style.right = "0px";
      wrap.style.bottom = "10px";
      return;
    }

    wrap.style.top = "auto";
    wrap.style.bottom = "auto";
    wrap.style.left = "auto";
    wrap.style.right = "auto";

    if (String(WIDGET_POS).includes("top")) wrap.style.top = "20px";
    else wrap.style.bottom = "20px";

    if (String(WIDGET_POS).includes("left")) wrap.style.left = "20px";
    else wrap.style.right = "20px";
  }

  function showNext(overrideDuration, preserveTimestamp) {
    if (!items.length || isDismissed) return;
    clearShowTimers();
    isPausedForReadMore = false;

    const itm = items[idx % items.length];
    if (!preserveTimestamp) saveState(idx % items.length, itemsSig);
    if (!preserveTimestamp) idx++;

    positionWrap();
    wrap.innerHTML = "";

    const duration = overrideDuration || SHOW_MS;
    const card = itm.kind === "purchase" ? renderPurchaseCard(itm.data) : renderReviewCard(itm.data);

    wrap.appendChild(card);
    currentCard = card;

    scheduleHide(duration);
  }

  function startFrom(delay) {
    if (loop) clearInterval(loop);
    if (preTimer) clearTimeout(preTimer);
    if (isDismissed) return;

    const cycle = SHOW_MS + GAP_MS;

    function begin() {
      if (isDismissed) return;
      showNext();
      loop = setInterval(showNext, cycle);
    }

    if (delay > 0) preTimer = setTimeout(begin, delay);
    else begin();
  }

  function resumeCard(remainingTime) {
    showNext(remainingTime, true);
    idx++;
    preTimer = setTimeout(() => {
      showNext();
      loop = setInterval(showNext, SHOW_MS + GAP_MS);
    }, remainingTime + GAP_MS);
  }

  // ===== Load all =====
  async function loadAll() {
    // ---- Reviews ----
    let reviewsItems = [];
    let used = "none";

    // 1) explicit endpoint attribute if provided
    if (REVIEWS_EP_ATTR) {
      let url = REVIEWS_EP_ATTR;
      if (CURRENT_SLUG && url.indexOf("slug=") === -1) {
        url += (url.indexOf("?") > -1 ? "&" : "?") + "slug=" + encodeURIComponent(CURRENT_SLUG);
      }
      try {
        reviewsItems = await fetchReviewsViaEndpoint(url);
        used = "endpoint(attr)";
      } catch (e) {
        console.warn("EVID: reviews endpoint(attr) failed, will try default API / fallback.", e);
      }
    }

    // 2) default API if no attr or failed/empty
    if (!reviewsItems.length && CURRENT_SLUG) {
      const url = DEFAULT_REVIEWS_API_BASE + encodeURIComponent(CURRENT_SLUG) + "&t=" + Date.now();
      try {
        reviewsItems = await fetchReviewsViaEndpoint(url);
        used = "endpoint(default)";
      } catch (e) {
        console.warn("EVID: default reviews API failed, fallback to Firestore.", e);
      }
    }

    // 3) fallback: Firestore
    if (!reviewsItems.length) {
      reviewsItems = await fetchReviewsViaFirestore(CURRENT_SLUG);
      used = "firestore";
    }

    // ---- Purchases ----
    let purchasesItems = [];
    if (PURCHASES_EP) {
      try {
        const d = await fetchJSON(PURCHASES_EP);
        purchasesItems = normalizeArray(d, "purchase");
      } catch (_) {
        purchasesItems = [];
      }
    }

    reviewsItems = (reviewsItems || []).filter((v) => {
      const t = normalizeSpaces(stripAllTags(v?.data?.text || ""));
      return t.length > 0 && !t.includes("אנא ספק לי");
    });

    items = interleave(reviewsItems, purchasesItems);
    itemsSig = itemsSignature(items);

    console.log("EVID: loadAll done", {
      slug: CURRENT_SLUG,
      used,
      marker: MARKER_ENABLED,
      markerSource,
      reviews: reviewsItems.length,
      purchases: purchasesItems.length,
      total: items.length
    });

    if (!items.length) return;

    await ensureFontInHead();

    const state = restoreState();
    const now = Date.now();

    const runLogic = function () {
      if (state && state.sig === itemsSig) {
        if (state.manualClose && state.snoozeUntil > now) {
          setTimeout(() => {
            isDismissed = false;
            idx = state.idx + 1;
            startFrom(0);
          }, state.snoozeUntil - now);
        } else if (!state.manualClose) {
          const elapsed = now - state.shownAt;
          if (elapsed < SHOW_MS) {
            idx = state.idx;
            resumeCard(Math.max(1000, SHOW_MS - elapsed));
          } else {
            idx = state.idx + 1;
            startFrom(0);
          }
        } else {
          startFrom(INIT_MS);
        }
      } else {
        if (INIT_MS > 0) setTimeout(() => startFrom(0), INIT_MS);
        else startFrom(0);
      }
    };

    if (state && !state.manualClose) setTimeout(runLogic, PAGE_TRANSITION_DELAY);
    else runLogic();
  }

  // ===== GO =====
  try {
    positionWrap();
    await loadAll();
    window.addEventListener("resize", () => positionWrap());
  } catch (e) {
    console.error("EVID: fatal init error:", e);
  }
})();
