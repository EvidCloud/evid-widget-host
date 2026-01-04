/* both-controller v4.6.6 — STABLE + SEMANTIC PRO (BASIC DEFAULT):
   - Works with regular <script defer> (no type="module" required) using dynamic import()
   - Prevents "Firebase App already exists"
   - Aligns Firebase config with public/firebase-config.js
   - Reads widgetId from query (?id=) OR data-widget-id/data-id
   - Avoids using widgetId as slug fallback (prevents wrong API calls)
   - Safer shadowRoot reuse + duplicate mount guard
   - SEMANTIC: DEFAULT OFF (Basic). Enable via:
       * data-semantic="on"/"true"/"1" OR data-pro="1"
       * OR via Firestore: plan="pro" / semanticEnabled=true / features.semantic=true
   - data-mode: reviews | semantic | auto | hybrid
   - Semantic fetch uses /api/get-reviews?slug=...&url=... (expects semantic.used=true)
*/

(function () {
  // ---------- Find current script ----------
  function getThisScriptEl() {
    if (document.currentScript && document.currentScript.src) return document.currentScript;

    const scripts = Array.from(document.getElementsByTagName("script"));
    for (let i = scripts.length - 1; i >= 0; i--) {
      const s = scripts[i];
      if (!s || !s.src) continue;
      if (String(s.src).indexOf("both-controller") > -1) return s;
    }
    return null;
  }

  const currentScript = getThisScriptEl();

  function pickAttr(...names) {
    for (const n of names) {
      const val = currentScript ? currentScript.getAttribute(n) : "";
      if (val != null && String(val).trim() !== "") return String(val).trim();
    }
    return "";
  }

  // ---------- Parse query params from script src ----------
  function getScriptURL() {
    try {
      if (currentScript && currentScript.src) return new URL(currentScript.src, document.baseURI);
    } catch (_) {}
    try { return new URL(location.href); } catch (_) {}
    return null;
  }

  const scriptURL = getScriptURL();

  const __WIDGET_ID__ = (function () {
    try {
      const qid = scriptURL ? (scriptURL.searchParams.get("id") || "").trim() : "";
      if (qid) return qid;
    } catch (_) {}

    const aid = pickAttr("data-widget-id", "data-id", "data-wid");
    if (aid) return aid;

    return "";
  })();

  const __SLUG_QS__ = (function () {
    try {
      const q = scriptURL ? (scriptURL.searchParams.get("slug") || "").trim() : "";
      if (q) return q;
    } catch (_) {}
    return "";
  })();

  // ---------- Utils ----------
   // אייקון גוגל לשימוש בכל העיצובים
  const GOOGLE_ICON_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" style="margin-inline-start:6px; vertical-align:middle; background:white; border-radius:50%; padding:1px; box-shadow:0 1px 2px rgba(0,0,0,0.1);"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="#FBBC05"/><path d="M12 4.61c1.61 0 3.09.56 4.23 1.64l3.18-3.18C17.45 1.19 14.97 0 12 0 7.7 0 3.99 2.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>';

  // המרת צבע לשקיפות
  function hexToRgb(hex) {
    hex = String(hex).replace(/^#/, "");
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const num = parseInt(hex, 16);
    return [num >> 16, (num >> 8) & 255, num & 255].join(",");
  }
  function cleanFontValue(raw) {
    const v = String(raw || "").trim();
    const main = v.split(",")[0].replace(/['"]/g, "").trim();
    return main || "";
  }

  function parseBoolRaw(v) {
    const s = String(v || "").toLowerCase().trim();
    if (!s) return null;
    if (s === "true" || s === "1" || s === "on" || s === "yes") return true;
    if (s === "false" || s === "0" || s === "off" || s === "no") return false;
    return null;
  }

  function escapeHTML(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function stripAllTags(s) {
    return String(s || "").replace(/<\/?[^>]+>/g, "");
  }

  function normalizeSpaces(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function firstName(s) {
    s = String(s || "").trim();
    const parts = s.split(/\s+/);
    return parts[0] || s;
  }

  function timeAgo(ts) {
    try {
      const d = new Date(ts);
      const diff = Math.max(0, (Date.now() - d.getTime()) / 1000);
      const m = Math.floor(diff / 60),
            h = Math.floor(m / 60),
            d2 = Math.floor(h / 24);
      
      // שימוש במילון
      const _t = DICT[DYNAMIC_SETTINGS.lang === 'en' ? 'en' : 'he'];

      if (d2 > 0) return d2 === 1 ? _t.yesterday : _t.ago(d2, _t.units.d);
      if (h > 0) return _t.ago(h, _t.units.h);
      if (m > 0) return _t.ago(m, _t.units.m);
      return _t.justNow;
    } catch (_) {
      return "";
    }
  }

  // Allow only <span class="smart-mark">...</span>
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
    tmp = tmp.replace(/<\/?[^>]+>/g, "");
    tmp = escapeHTML(tmp);
    tmp = tmp.replace(/__EVIDMARK_(\d+)__/g, function (_, i) {
      const inner = tokens[Number(i)] || "";
      return '<span class="smart-mark">' + escapeHTML(inner) + "</span>";
    });
    return tmp;
  }

  function readDeep(obj, path) {
    try {
      const parts = String(path || "").split(".");
      let cur = obj;
      for (const p of parts) {
        if (!cur || typeof cur !== "object") return undefined;
        cur = cur[p];
      }
      return cur;
    } catch (_) {
      return undefined;
    }
  }

  // ---------- Dynamic imports ----------
  (async function boot() {
    const { initializeApp, getApps, getApp } = await import(
      "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js"
    );

    const {
      getFirestore,
      doc,
      getDoc,
      collection,
      query,
      where,
      getDocs,
      orderBy,
      limit
    } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");

    /* =========================================
       1) FIREBASE
       ========================================= */
    const firebaseConfig = {
      apiKey: "AIzaSyCbRxawm1ewrPGMQKo3bqUCAgFzmtSjsUU",
      authDomain: "evid-mvp-e59cc.firebaseapp.com",
      projectId: "evid-mvp-e59cc",
      storageBucket: "evid-mvp-e59cc.appspot.com",
      messagingSenderId: "120890864280",
      appId: "1:120890864280:web:b28cb794b68db35b81d6ed",
      measurementId: "G-TXV4PH2YY8"
    };

    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const db = getFirestore(app);

    /* =========================================
       2) HOST + ROOT
       ========================================= */
    let hostEl = document.getElementById("reviews-widget");
    if (!hostEl) {
      hostEl = document.createElement("div");
      hostEl.id = "reviews-widget";
      document.body.appendChild(hostEl);
    }

    if (hostEl.__EVID_MOUNTED__) return;
    hostEl.__EVID_MOUNTED__ = true;

    let root;
    try {
      if (hostEl.shadowRoot) root = hostEl.shadowRoot;
      else if (hostEl.attachShadow) root = hostEl.attachShadow({ mode: "open" });
      else root = hostEl;
    } catch (_) {
      root = hostEl;
    }

   /* =========================================
       3) SETTINGS & TRANSLATIONS
       ========================================= */
    const DYNAMIC_SETTINGS = {
      lang: "he",
      color: "#4f46e5",
      font: "Rubik",
      position: "bottom-right",
      delay: 0,
      businessName: "",
      slug: "",
      marker: false,
      size: "large",
      badge: true,
      badgeText: "פידבק מהשטח",
      semanticEnabled: false,
      cardStyle: "default"
    };

    const DICT = {
      he: {
        dir: "rtl",
        align: "right",
        oppAlign: "left",
        readMore: "קרא עוד...",
        close: "סגור",
        ago: (val, unit) => `לפני ${val} ${unit}`,
        justNow: "כרגע",
        yesterday: "אתמול",
        units: { d: "ימים", h: "שעות", m: "דקות" }
      },
      en: {
        dir: "ltr",
        align: "left",
        oppAlign: "right",
        readMore: "Read more...",
        close: "Close",
        ago: (val, unit) => `${val} ${unit} ago`,
        justNow: "Just now",
        yesterday: "Yesterday",
        units: { d: "days", h: "hours", m: "minutes" }
      }
    };
    
    // === התיקון הגדול: משתנים גלובליים ===
    let CURR_LANG = "he";
    let T_DATA = DICT.he;

    let markerSource = "default";
    let badgeSource = "default";
    let sizeSource = "default";
    let visualSource = "default";
    let semanticSource = "default";

    let markerFromFirestorePresent = false;
    let badgeFromFirestorePresent = false;
    let sizeFromFirestorePresent = false;
    let colorFromFirestorePresent = false;
    let fontFromFirestorePresent = false;
    let positionFromFirestorePresent = false;
    let delayFromFirestorePresent = false;
    let badgeTextFromFirestorePresent = false;
    let semanticFromFirestorePresent = false;

    function readAny(obj, keys) {
      for (const k of keys) {
        if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
      }
      return undefined;
    }

    // ---- Firestore widget settings ----
    try {
      const widgetId = __WIDGET_ID__;
      if (widgetId) {
        const docRef = doc(db, "widgets", widgetId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() || {};
          const s = (data.settings && typeof data.settings === "object") ? data.settings : data;

           // lang
          if (readAny(s, ["lang", "language"]) !== undefined) {
            DYNAMIC_SETTINGS.lang = String(readAny(s, ["lang", "language"])).toLowerCase().trim();
          }
          // color
          if (readAny(s, ["color", "primaryColor", "themeColor"]) !== undefined) {
            colorFromFirestorePresent = true;
            DYNAMIC_SETTINGS.color = String(readAny(s, ["color", "primaryColor", "themeColor"]) || DYNAMIC_SETTINGS.color);
          }

          // font
          if (readAny(s, ["font", "fontFamily"]) !== undefined) {
            fontFromFirestorePresent = true;
            const rawFont = cleanFontValue(readAny(s, ["font", "fontFamily"]) || DYNAMIC_SETTINGS.font);
            DYNAMIC_SETTINGS.font = rawFont || DYNAMIC_SETTINGS.font;
          }

          // position
          if (readAny(s, ["position"]) !== undefined) {
            positionFromFirestorePresent = true;
            DYNAMIC_SETTINGS.position = String(readAny(s, ["position"]) || DYNAMIC_SETTINGS.position);
          }

          // delay
          if (readAny(s, ["delay", "delaySeconds", "initDelay", "initDelayMs"]) !== undefined) {
            delayFromFirestorePresent = true;
            const raw = Number(readAny(s, ["initDelayMs", "delay", "delaySeconds", "initDelay"]));
            if (Number.isFinite(raw)) DYNAMIC_SETTINGS.delay = raw <= 300 ? raw * 1000 : raw;
            else DYNAMIC_SETTINGS.delay = 0;
          }

          // businessName
          DYNAMIC_SETTINGS.businessName = String(data.businessName || data.name || "");

          // slug / placeId
          const slugVal = String(
            data.slug ||
            data.placeId || data.place_id || data.placeID ||
            data.googlePlaceId ||
            readAny(s, ["slug", "placeId", "googlePlaceId"]) ||
            ""
          ).trim();
          DYNAMIC_SETTINGS.slug = slugVal;

          // size
          if (readAny(s, ["size"]) !== undefined) {
            sizeFromFirestorePresent = true;
            const sz = String(readAny(s, ["size"]) || "").toLowerCase().trim();
            if (sz === "compact" || sz === "large") DYNAMIC_SETTINGS.size = sz;
          }

          // marker
          if (readAny(s, ["marker"]) !== undefined) {
            markerFromFirestorePresent = true;
            markerSource = "firestore";
            DYNAMIC_SETTINGS.marker = !!readAny(s, ["marker"]);
          }

          // badge
          if (readAny(s, ["badge"]) !== undefined) {
            badgeFromFirestorePresent = true;
            badgeSource = "firestore";
            DYNAMIC_SETTINGS.badge = !!readAny(s, ["badge"]);
          }

          // badgeText
          if (readAny(s, ["badgeText", "badge_text"]) !== undefined) {
            badgeTextFromFirestorePresent = true;
            DYNAMIC_SETTINGS.badgeText =
              String(readAny(s, ["badgeText", "badge_text"]) || DYNAMIC_SETTINGS.badgeText).trim() ||
              DYNAMIC_SETTINGS.badgeText;
          }

           // קריאת סגנון עיצוב
          if (readAny(s, ["cardStyle", "style", "design"]) !== undefined) {
             DYNAMIC_SETTINGS.cardStyle = String(readAny(s, ["cardStyle", "style", "design"])).toLowerCase().trim();
          }
          // semanticEnabled (FireStore flags)
          const plan = String(readAny(s, ["plan", "tier"]) || "").toLowerCase().trim();
          const sem1 = readAny(s, ["semanticEnabled", "semantic", "isPro", "pro"]);
          const sem2 = readDeep(s, "features.semantic");
          const sem3 = readDeep(data, "features.semantic");

          let enabled = null;
          if (plan === "pro") enabled = true;
          if (enabled === null && sem1 !== undefined) {
            const b = parseBoolRaw(sem1);
            if (b !== null) enabled = b;
          }
          if (enabled === null && sem2 !== undefined) {
            const b = parseBoolRaw(sem2);
            if (b !== null) enabled = b;
          }
          if (enabled === null && sem3 !== undefined) {
            const b = parseBoolRaw(sem3);
            if (b !== null) enabled = b;
          }

          if (enabled !== null) {
            semanticFromFirestorePresent = true;
            semanticSource = "firestore";
            DYNAMIC_SETTINGS.semanticEnabled = !!enabled;
          }

          console.log("EVID: Widget settings loaded from Firestore", {
            id: widgetId,
            color: DYNAMIC_SETTINGS.color,
            font: DYNAMIC_SETTINGS.font,
            position: DYNAMIC_SETTINGS.position,
            delayMs: DYNAMIC_SETTINGS.delay,
            businessName: DYNAMIC_SETTINGS.businessName,
            slug: DYNAMIC_SETTINGS.slug,
            marker: DYNAMIC_SETTINGS.marker,
            badge: DYNAMIC_SETTINGS.badge,
            badgeText: DYNAMIC_SETTINGS.badgeText,
            size: DYNAMIC_SETTINGS.size,
            semanticEnabled: DYNAMIC_SETTINGS.semanticEnabled,
            semanticSource
          });
        }
      }
    } catch (e) {
      console.warn("EVID: Could not load settings from Firestore, using defaults.", e);
    }

    // ---- <script data-*> overrides ----
    try {
       // קריאת שפה מהסקריפט (כדי שהתצוגה המקדימה תתעדכן מיד)
      const langAttr = pickAttr("data-lang");
      if (langAttr) {
        DYNAMIC_SETTINGS.lang = langAttr.toLowerCase().trim();
      }
      // === הגדרות ויזואליות (פתוחות לשינוי מהדשבורד) ===
      
      const c = pickAttr("data-primary-color", "data-color", "data-theme-color");
      if (c) { DYNAMIC_SETTINGS.color = c; visualSource = "attr"; }

      const f = cleanFontValue(pickAttr("data-font"));
      if (f) { DYNAMIC_SETTINGS.font = f; visualSource = "attr"; }

      const p = pickAttr("data-position");
      if (p) { DYNAMIC_SETTINGS.position = p; visualSource = "attr"; }

      const ds = pickAttr("data-delay-seconds", "data-delay", "data-init-delay-ms");
      if (ds) {
        const n = Number(ds);
        if (Number.isFinite(n)) {
          DYNAMIC_SETTINGS.delay = n > 50 ? n : n * 1000;
          visualSource = "attr";
        }
      }

      if (!badgeFromFirestorePresent) {
        const bRaw = pickAttr("data-badge");
        const b = parseBoolRaw(bRaw);
        if (bRaw) {
          const low = bRaw.toLowerCase().trim();
          if (low === "force-on") { DYNAMIC_SETTINGS.badge = true; badgeSource = "attr(force)"; }
          else if (low === "force-off") { DYNAMIC_SETTINGS.badge = false; badgeSource = "attr(force)"; }
          else if (b !== null) { DYNAMIC_SETTINGS.badge = b; badgeSource = "attr(fallback)"; }
        }
      }

      if (!badgeTextFromFirestorePresent) {
        const bt = pickAttr("data-badge-text");
        if (bt) DYNAMIC_SETTINGS.badgeText = bt;
      }
    } catch (_) {}

    // marker fallback
    try {
      const mkRaw = currentScript ? String(currentScript.getAttribute("data-marker") || "").toLowerCase().trim() : "";
      const forceOn = mkRaw === "force-on";
      const forceOff = mkRaw === "force-off";
      const attrSaysOn = mkRaw === "on" || mkRaw === "true" || mkRaw === "1";
      const attrSaysOff = mkRaw === "off" || mkRaw === "false" || mkRaw === "0";

      if (forceOn) { DYNAMIC_SETTINGS.marker = true; markerSource = "attr(force)"; }
      else if (forceOff) { DYNAMIC_SETTINGS.marker = false; markerSource = "attr(force)"; }
      else if (!markerFromFirestorePresent) {
        if (attrSaysOn) { DYNAMIC_SETTINGS.marker = true; markerSource = "attr(fallback)"; }
        if (attrSaysOff) { DYNAMIC_SETTINGS.marker = false; markerSource = "attr(fallback)"; }
      }
    } catch (_) {}

    // size fallback
    try {
      const szRaw = currentScript ? String(currentScript.getAttribute("data-size") || "").toLowerCase().trim() : "";
      if (!sizeFromFirestorePresent && (szRaw === "compact" || szRaw === "large")) {
        DYNAMIC_SETTINGS.size = szRaw;
        sizeSource = "attr";
      }
    } catch (_) {}

    // semantic toggle fallback (BASIC DEFAULT)
    try {
      const semRaw =
        String(
          (currentScript && (currentScript.getAttribute("data-semantic") || currentScript.getAttribute("data-pro"))) || ""
        )
          .toLowerCase()
          .trim();

      if (semRaw) {
        // force overrides always win
        if (semRaw === "force-on") { DYNAMIC_SETTINGS.semanticEnabled = true; semanticSource = "attr(force)"; }
        else if (semRaw === "force-off") { DYNAMIC_SETTINGS.semanticEnabled = false; semanticSource = "attr(force)"; }
        else if (!semanticFromFirestorePresent) {
          const b = parseBoolRaw(semRaw);
          if (b !== null) { DYNAMIC_SETTINGS.semanticEnabled = b; semanticSource = "attr"; }
        }
      }
    } catch (_) {}

    /* =========================================
       4) RUNTIME CONFIG
       ========================================= */
    const REVIEWS_EP_ATTR = currentScript ? currentScript.getAttribute("data-reviews-endpoint") : "";
    const PURCHASES_EP = currentScript ? currentScript.getAttribute("data-purchases-endpoint") : "";

    const SHOW_MS = Number((currentScript && currentScript.getAttribute("data-show-ms")) || 15000);
    const GAP_MS = Number((currentScript && currentScript.getAttribute("data-gap-ms")) || 6000);
    const INIT_MS = DYNAMIC_SETTINGS.delay || Number((currentScript && currentScript.getAttribute("data-init-delay-ms")) || 0);
    const DISMISS_COOLDOWN_MS = Number((currentScript && currentScript.getAttribute("data-dismiss-cooldown-ms")) || 45000);

    const TXT_LIVE = (currentScript && currentScript.getAttribute("data-live-text")) || "מבוקש עכשיו";
    const TXT_BOUGHT = (currentScript && currentScript.getAttribute("data-purchase-label")) || "רכש/ה";

    const SELECTED_FONT = DYNAMIC_SETTINGS.font;
    const WIDGET_POS = DYNAMIC_SETTINGS.position;
    const THEME_COLOR = DYNAMIC_SETTINGS.color;
    const MARKER_ENABLED = !!DYNAMIC_SETTINGS.marker;
    const BADGE_ENABLED = !!DYNAMIC_SETTINGS.badge;
    const BADGE_TEXT = String(DYNAMIC_SETTINGS.badgeText || "פידבק מהשטח").trim() || "פידבק מהשטח";
    const SIZE_MODE = (String(DYNAMIC_SETTINGS.size || "large").toLowerCase().trim() === "compact") ? "compact" : "large";

    const SEMANTIC_ENABLED = !!DYNAMIC_SETTINGS.semanticEnabled;
     const CARD_STYLE = DYNAMIC_SETTINGS.cardStyle || "default";
    const THEME_RGB = hexToRgb(THEME_COLOR) || "79, 70, 229";
     // === FIX: Missing Dictionary for English Badge ===
    const BADGE_TRANSLATIONS = {
      "פידבק מהשטח": "Real Customer Feedback",
      "הפרגונים שלכם": "Your Kind Words",
      "המחמאות שקיבלנו": "Wall of Love",
      "מה כתבתם עלינו": "What People Say",
      "": ""
    };

    // === תיקון: עדכון המשתנים הגלובליים (בלי const) ===
    CURR_LANG = (DYNAMIC_SETTINGS.lang === "en") ? "en" : "he";
    T_DATA = DICT[CURR_LANG];
    
    // תרגום באדג'
    let FINAL_BADGE_TEXT = BADGE_TEXT;
    if (CURR_LANG === "en" && BADGE_TRANSLATIONS[BADGE_TEXT]) {
        FINAL_BADGE_TEXT = BADGE_TRANSLATIONS[BADGE_TEXT];
    }

    const DEFAULT_PRODUCT_IMG =
      (currentScript && currentScript.getAttribute("data-default-image")) ||
      "https://cdn-icons-png.flaticon.com/128/2331/2331970.png";

    const PAGE_TRANSITION_DELAY = 3000;
    const STORAGE_KEY = "evid:widget-state:v4";

    const DEFAULT_REVIEWS_API_BASE = "https://review-widget-psi.vercel.app/api/get-reviews";

    // ===== SEMANTIC MODE =====
    const MODE_ATTR_RAW = (currentScript && currentScript.getAttribute("data-mode")) || "";
    const MODE = (String(MODE_ATTR_RAW || "auto").toLowerCase().trim() || "auto");

    const SEMANTIC_TOP = Math.max(
      1,
      Math.min(25, Number((currentScript && currentScript.getAttribute("data-semantic-top")) || 20) || 20)
    );

    const HYBRID_SEMANTIC_TOP = Math.max(
      1,
      Math.min(25, Number((currentScript && currentScript.getAttribute("data-hybrid-semantic-top")) || 10) || 10)
    );

    const HYBRID_TOTAL = Math.max(
      1,
      Math.min(25, Number((currentScript && currentScript.getAttribute("data-hybrid-total")) || 20) || 20)
    );

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
      } catch (e) {
        console.warn("EVID: Failed to derive CURRENT_SLUG:", e);
      }
      return "";
    })();

    // ---------- Hebrew verbs ----------
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

    // ---------- Fonts ----------
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

    /* =========================================
       5) STYLES + DOM
       ========================================= */
     // === FIX: חישוב מחדש של השפה והכיוון (מונע קריסה באנגלית) ===
    // אנחנו עושים את זה שוב כאן כדי לוודא שקראנו את ההגדרות העדכניות מהדשבורד
    CURR_LANG = (DYNAMIC_SETTINGS.lang === "en") ? "en" : "he";
    T_DATA = DICT[CURR_LANG];
    
    if (CURR_LANG === "en" && BADGE_TRANSLATIONS[BADGE_TEXT]) {
         FINAL_BADGE_TEXT = BADGE_TRANSLATIONS[BADGE_TEXT];
    } else {
         FINAL_BADGE_TEXT = BADGE_TEXT;
    }
    const style = document.createElement("style");
    style.textContent =
      ""
      + ":host{all:initial;}"
      + ":host, :host *, .wrap, .wrap *{font-family:'" + SELECTED_FONT + "',sans-serif !important;box-sizing:border-box;}"
      + ".wrap{position:fixed;z-index:2147483000;direction:" + T_DATA.dir + ";pointer-events:none;display:block;text-align:" + T_DATA.align + ";}"
      
      + ".card{position:relative;width:290px;max-width:90vw;background:#fff;padding:16px;pointer-events:auto;overflow:hidden;transition:none!important;height:auto;}"
      
      + ".enter{animation:slideInUp .6s cubic-bezier(.34,1.56,.64,1) forwards;}"
      + ".leave{animation:slideOutDown .6s cubic-bezier(.34,1.56,.64,1) forwards;}"
      + "@keyframes slideInUp{from{opacity:0;transform:translateY(30px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}"
      + "@keyframes slideOutDown{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(30px)}}"
      + "@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(" + THEME_RGB + ", 0.7);}70%{box-shadow:0 0 0 6px rgba(" + THEME_RGB + ", 0);}100%{box-shadow:0 0 0 0 rgba(" + THEME_RGB + ", 0);}}"
      
      // X Button
      + ".xbtn{position:absolute;top:8px;" + T_DATA.oppAlign + ":8px;width:18px;height:18px;background:rgba(0,0,0,0.05);border-radius:50%;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#94a3b8;font-size:10px;z-index:20;opacity:0;transition:opacity .2s;}"
      + ".card:hover .xbtn{opacity:1;}"
      
      + ".smart-mark{background-color:#fef08a;color:#854d0e;padding:0 2px;border-radius:2px;font-weight:500;}"
      
      // === תיקון כוכבים קריטי ===
      // אנחנו משתמשים ב-oppAlign (הצד הנגדי) כדי למקם אותם
      + ".stars{color:#f59e0b; font-size:10px; letter-spacing:1px; display:flex; align-items:center; gap:4px; z-index:5; flex-shrink:0;}"      
      + ".top-badge-container{display:flex;justify-content:flex-start;margin-bottom:10px;width:100%;}"
      + ".modern-badge{font-size:10px;font-weight:700;color:" + THEME_COLOR + ";background:#eef2ff;padding:3px 8px;border-radius:12px;display:flex;align-items:center;gap:5px;letter-spacing:.3px;}"
      + ".pulse-dot{width:5px;height:5px;background:" + THEME_COLOR + ";border-radius:50%;animation:pulse 2s infinite;}"
      + ".card.style-forest .modern-badge{background:rgba(255,255,255,0.15); color:#fff;}"
      + ".card.style-forest .pulse-dot{background:#4ade80;}"

      + ".review-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}"
      + ".user-pill{display:flex;align-items:center;gap:10px;}"
      + ".review-avatar,.avatar-fallback{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%);color:#fff;font-size:14px;font-weight:700;display:grid;place-items:center;object-fit:cover;flex-shrink:0;}"
      + ".name-col{display:flex;flex-direction:column; justify-content:center;}"
      + ".reviewer-name{font-size:14px;font-weight:700;color:#1e293b;line-height:1.2;}"
      
      + ".review-text{font-size:13px;line-height:1.5;color:#334155;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}"
      + ".review-text.expanded{display:block;-webkit-line-clamp:unset;overflow:visible;}"
      + ".read-more-btn{font-size:11px;font-weight:700;cursor:pointer;background:transparent!important;border:none;padding:0;outline:none!important;margin-top:10px;text-decoration:underline;}"      // === STYLES ===
      + ".card.style-default{border-radius:18px;box-shadow:0 8px 25px -8px rgba(0,0,0,.1);border-top:4px solid " + THEME_COLOR + ";}"
      + ".card.style-default .read-more-btn{color:#000;}"

      + ".card.style-forest{background:linear-gradient(145deg, rgba(" + THEME_RGB + ", 0.95), rgba(" + THEME_RGB + ", 0.85)); border:1px solid rgba(255,255,255,0.2); border-radius:20px; box-shadow:0 8px 32px rgba(0,0,0,0.25); color:#fff;}"
      + ".card.style-forest .reviewer-name{color:#fff;}"
      + ".card.style-forest .review-text{color:rgba(255,255,255,0.9);}"
      + ".card.style-forest .smart-mark{background-color:rgba(255,255,255,0.2); color:#fff; border:1px solid rgba(255,255,255,0.4);}"
      + ".card.style-forest .xbtn{background:rgba(255,255,255,0.2);color:#fff;}"
      + ".card.style-forest .read-more-btn{color:#fff; opacity:0.9; text-decoration:none; border-bottom:1px solid rgba(255,255,255,0.5);}"

      + ".card.style-leaf{border-radius:24px 4px 24px 4px; box-shadow:0 10px 25px -5px rgba(0,0,0,0.1); border-right:4px solid " + THEME_COLOR + ";}"
      + ".card.style-leaf .avatar-fallback{background:rgba(" + THEME_RGB + ", 0.15); color:" + THEME_COLOR + "; border:1px solid " + THEME_COLOR + ";}"
      + ".card.style-leaf .reviewer-name{color:" + THEME_COLOR + ";}"
      + ".card.style-leaf .read-more-btn{background:rgba(" + THEME_RGB + ", 0.1) !important; color:" + THEME_COLOR + "; padding:4px 12px; border-radius:20px; text-decoration:none; display:inline-block; transition:none;}"
      + ".card.style-leaf .read-more-btn:hover{background:" + THEME_COLOR + "!important; color:#fff;}"

      + ".card.style-exec{border-radius:0px; border:2px solid " + THEME_COLOR + "; box-shadow:6px 6px 0px " + THEME_COLOR + ";}"
      + ".card.style-exec .avatar-fallback{background:" + THEME_COLOR + "; color:#fff; border-radius:0;}"
      + ".card.style-exec .reviewer-name{color:#000; letter-spacing:-0.5px;}"
      + ".card.style-exec .review-text{color:#000;}"
+ ".card.style-exec .read-more-btn{display:none; background:" + THEME_COLOR + "!important; color:#fff; padding:6px 0; width:100%; text-align:center; text-decoration:none; text-transform:uppercase; margin-top:12px;}"      // === תיקון ספציפי ל-Executive (כוכבים ולוגו) ===
      // 1. צבע הכוכבים תואם לצבע הראשי + ביטול מיקום אבסולוטי
      // 1. כוכבים בצבע שחור (#000000)
      + ".card.style-exec .stars { position: static; margin-top: 4px; color: #000000; }"
      
      // 2. לוגו גוגל ללא רקע (שקוף) וללא שינוי צבע
      + ".card.style-exec .stars svg { display: none !important; }"
      // === תיקון מצב קומפקטי (Compact) - פיתרון פרפקט ===
      + ".card.compact { padding: 10px 12px !important; width: 260px !important; min-height: auto; }"
      
      // יישור הכותרת - קריטי ליישור כוכבים מול שם
      + ".card.compact .review-header { margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }" 
      
      // הגנה על השם שלא ישבור שורה וידרוס את הכוכבים
      + ".card.compact .user-pill { flex: 1; min-width: 0; overflow: hidden; }"
      + ".card.compact .name-col { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }"
      + ".card.compact .reviewer-name { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }"
      
      // טקסט הביקורת
      + ".card.compact .review-text { font-size: 12px; line-height: 1.35; margin-top: 2px; }"
      
      // הקטנת אווטאר
      + ".card.compact .avatar-fallback, .card.compact .review-avatar { width: 24px; height: 24px; font-size: 10px; }"
      
      // === הכוכבים בקומפקט ===
      // ביטלנו את ה-scale שדופק יישור. במקום זה הקטנו פונט.
      // margin-inline-start דואג לרווח מהשם בהתאם לשפה (RTL/LTR)
      + ".card.compact .stars { display: flex !important; position: static !important; font-size: 9px !important; gap: 2px; margin: 0; flex-shrink: 0; margin-inline-start: auto; }"
      + ".card.compact .stars svg { width: 10px; height: 10px; }"

      + "@media (max-width:480px){.wrap{right:0!important;left:0!important;width:100%!important;display:flex!important;justify-content:center!important}.card{width:95%!important;margin:0 auto 10px!important;}}"
      + ".purchase-card{display:flex;padding:0;height:85px;overflow:hidden; border-radius:12px;}"
      + ".card.style-forest.purchase-card{background:rgba(" + THEME_RGB + ", 0.95);}"
      + ".card.style-exec.purchase-card{border-radius:0; box-shadow:4px 4px 0 " + THEME_COLOR + ";}"
      ;
      ;    root.appendChild(style);

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

    /* =========================================
       6) FETCH HELPERS
       ========================================= */
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

    function withCacheBuster(url) {
      try {
        const u = new URL(url, document.baseURI);
        u.searchParams.set("t", String(Date.now()));
        return u.toString();
      } catch (_) {
        return url + (url.indexOf("?") > -1 ? "&" : "?") + "t=" + Date.now();
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
        try { return JSON.parse(raw); } catch (_) { return { items: [] }; }
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
        else if (Array.isArray(data.matches)) {
          arr = data.matches.map((m) => (m && (m.review || m.data || m)) || null).filter(Boolean);
        }
      }

      if (as === "review") {
        return arr
          .map((x) => {
            if (!x) return null;

            const txt = String((x.text || x.reviewText || (x.data && x.data.text) || "")).trim();
            if (!txt) return null;
            if (txt.includes("אנא ספק לי") || txt.includes("כמובן!")) return null;

            let r = (typeof x.rating !== "undefined" ? x.rating : (x.data && x.data.rating)) ?? 5;
            r = Number(r);
            if (!Number.isFinite(r)) r = 5;
            r = Math.max(1, Math.min(5, r));

            const nm =
              x.name ||
              x.authorName ||
              x.author_name ||
              x.user ||
              (x.data && (x.data.authorName || x.data.name)) ||
              "Anonymous";

            return {
              kind: "review",
              data: {
                authorName: nm,
                rating: r,
                text: txt,
                profilePhotoUrl:
                  x.profilePhotoUrl ||
                  x.photo ||
                  x.avatar ||
                  (x.data && (x.data.profilePhotoUrl || x.data.photo || x.data.avatar)) ||
                  ""
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

    // ===== Reviews fetching: endpoint first, fallback to Firestore =====
    async function fetchReviewsViaEndpoint(url) {
      const safeUrl = withCacheBuster(url);
      const res = await fetch(safeUrl, { method: "GET", credentials: "omit", cache: "no-store" });
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

    // ===== Semantic (PRO-only by enable flag) via /api/get-reviews =====
    function isLikelyProductPage() {
      try {
        const p = String(location.pathname || "").toLowerCase();
        const href = String(location.href || "").toLowerCase();
        if (p.includes("/products/")) return true; // Shopify
        if (p.includes("/product/")) return true;
        if (p.match(/\/p\/[^/]+/)) return true;
        if (href.includes("variant=") && p.includes("/products/")) return true;
      } catch (_) {}
      return false;
    }

    function dedupeReviews(arr) {
      const seen = new Set();
      const out = [];
      for (const it of arr || []) {
        if (!it || it.kind !== "review") continue;
        const d = it.data || {};
        const key =
          normalizeSpaces(stripAllTags(d.authorName || "")) +
          "|" +
          String(d.rating || "") +
          "|" +
          normalizeSpaces(stripAllTags(d.text || "")).slice(0, 120);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(it);
      }
      return out;
    }
function getMetaContent(name) {
  const el = document.querySelector(`meta[name="${name}"]`);
  return el ? (el.getAttribute("content") || "").trim() : "";
}

function buildClientContextText() {
  const title = (document.title || "").trim();
  const h1 = (document.querySelector("h1")?.textContent || "").trim();
  const desc = getMetaContent("description");

  // נסיון פשוט לבירדקרמבס/כותרות מוצר (עוזר לאיקומרס)
  const crumbs =
    Array.from(document.querySelectorAll("nav.breadcrumb, .breadcrumb, [aria-label*='breadcrumb'], .woocommerce-breadcrumb a, .woocommerce-breadcrumb"))
      .map((x) => (x.textContent || "").trim())
      .filter(Boolean)
      .slice(0, 12)
      .join(" | ");

  const parts = [title, h1, desc, crumbs].filter(Boolean);
  // לא צריך מגילה—רק מספיק טקסט כדי לדרג ביקורות
  const ctx = parts.join("\n").slice(0, 1200);
  return ctx;
}

    async function fetchSemanticReviewsForCurrentPage(slug, topN) {
  if (!slug) return [];

  // Prefer canonical URL (cleaner + more stable)
  let pageUrl = "";
  try {
    const canonicalEl = document.querySelector('link[rel="canonical"]');
    const canonicalHref = canonicalEl ? canonicalEl.getAttribute("href") : "";
    pageUrl = String(canonicalHref || location.href || "").trim();
  } catch (_) {
    pageUrl = String(location.href || "").trim();
  }
  if (!pageUrl) return [];

  // Build a focused context (avoid menus / mega text)
  function pickText(sel) {
    try {
      const el = document.querySelector(sel);
      return el ? String(el.textContent || "").replace(/\s+/g, " ").trim() : "";
    } catch (_) {
      return "";
    }
  }
  function pickAttr(sel, attr) {
    try {
      const el = document.querySelector(sel);
      const v = el ? el.getAttribute(attr) : "";
      return String(v || "").replace(/\s+/g, " ").trim();
    } catch (_) {
      return "";
    }
  }
  function uniqJoin(parts, maxLen) {
    const seen = new Set();
    const out = [];
    for (const p of parts) {
      const s = String(p || "").trim();
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    let txt = out.join(". ").replace(/\s+/g, " ").trim();
    if (txt.length > maxLen) txt = txt.slice(0, maxLen).trim();
    return txt;
  }

  const h1 = pickText("h1");
  const title = String(document.title || "").trim();
  const desc = pickAttr('meta[name="description"]', "content");
  const bc =
    pickText('nav[aria-label="breadcrumb"]') ||
    pickText(".breadcrumb") ||
    pickText(".breadcrumbs") ||
    pickText("ol.breadcrumb");

  const ctx = uniqJoin([h1, title, bc, desc], 900);

  const top = Math.max(1, Math.min(25, Number(topN) || 20));

  // IMPORTANT: ask backend to scan more candidates for ranking
  const limit = 200;

  const url =
    DEFAULT_REVIEWS_API_BASE +
    "?slug=" + encodeURIComponent(slug) +
    "&url=" + encodeURIComponent(pageUrl) +
    "&ctx=" + encodeURIComponent(ctx) +
    "&fetchMissing=0" +
    "&limit=" + encodeURIComponent(limit) +
    "&top=" + encodeURIComponent(top) +
    "&t=" + Date.now();

  const res = await fetch(url, { method: "GET", credentials: "omit", cache: "no-store" });
  if (!res.ok) throw new Error("Semantic(get-reviews) HTTP " + res.status);

  const data = await res.json().catch(() => null);
  if (!data || !data.ok) return [];

  const sem = data.semantic || null;
  if (!sem || sem.used !== true) return [];

  return normalizeArray(data, "review");
}

    /* =========================================
       7) PERSISTENCE
       ========================================= */
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
      try {
        const head = (arr || []).slice(0, 3).map((it) => {
          const k = it?.kind || "x";
          const d = it?.data || {};
          if (k === "review") {
            return "r:" + String(d.authorName || "").slice(0, 20) + ":" + String(d.rating || "") + ":" + String(d.text || "").slice(0, 40);
          }
          if (k === "purchase") {
            return "p:" + String(d.buyer || "").slice(0, 20) + ":" + String(d.product || "").slice(0, 30);
          }
          return "x";
        }).join("|");
        return String(arr.length) + "_" + String(arr[0]?.kind || "x") + "_" + head;
      } catch (_) {
        return (arr || []).length + "_" + (arr[0] ? arr[0].kind : "x");
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
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) { return null; }
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
      if (fadeTimeout) { clearTimeout(fadeTimeout); fadeTimeout = null; }
      if (removeTimeout) { clearTimeout(removeTimeout); removeTimeout = null; }
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

      const current = items.length ? ((idx - 1 + items.length) % items.length) : 0;
      saveState(current, itemsSig, { manualClose: true, snoozeUntil: Date.now() + DISMISS_COOLDOWN_MS });
    }

    function animateCardHeight(card, toHeightPx, cb) {
      try {
        const start = card.getBoundingClientRect().height;
        card.style.height = start + "px";
        card.offsetHeight;
        card.style.height = toHeightPx + "px";

        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          card.removeEventListener("transitionend", onEnd);
          card.style.height = "auto";
          if (typeof cb === "function") cb();
        };
        const onEnd = (ev) => {
          if (ev && ev.target !== card) return;
          finish();
        };
        card.addEventListener("transitionend", onEnd);
        setTimeout(finish, 260);
      } catch (_) {
        card.style.height = "auto";
        if (typeof cb === "function") cb();
      }
    }

    function expandCardToFit(card) {
      try {
        card.style.height = "auto";
        requestAnimationFrame(() => {
          const h = Math.max(card.scrollHeight, card.getBoundingClientRect().height);
          animateCardHeight(card, h);
        });
      } catch (_) {}
    }

    function collapseCardToFit(card) {
      try {
        card.style.height = "auto";
        requestAnimationFrame(() => {
          const h = Math.max(card.scrollHeight, 40);
          animateCardHeight(card, h);
        });
      } catch (_) {}
    }
function calcNeedsReadMore(body, card) {
      try {
        const clampH = body.getBoundingClientRect().height;
        const w = Math.ceil(body.getBoundingClientRect().width);

        if (!clampH || w < 50) {
          const plain = normalizeSpaces(stripAllTags(body.textContent || ""));
          return plain.length > 75;
        }

        const probe = document.createElement("div");
        probe.className = "review-text expanded";
        probe.style.position = "absolute";
        probe.style.left = "-99999px";
        probe.style.top = "0";
        probe.style.width = w + "px";
        probe.style.visibility = "hidden";
        probe.style.pointerEvents = "none";

        probe.innerHTML = body.innerHTML;
        card.appendChild(probe);
        const fullH = probe.getBoundingClientRect().height;
        card.removeChild(probe);

        return fullH > clampH + 2;
      } catch (_) {
        return true;
      }
    }

    function scheduleReadMoreCheck(el, btn, card) {
      // 1. קודם כל נסתיר, כדי לא להראות סתם
      btn.style.display = "none";

      // 2. נמתין שהדפדפן יסיים לצייר את הטקסט ואז נמדוד פיקסלים
      setTimeout(function() {
        // קובעים את סוג התצוגה לפי העיצוב (באקזקיוטיב זה בלוק, באחרים זה בשורה)
        const displayType = card.classList.contains("style-exec") ? "block" : "inline-block";
        
        // בדיקה 1: הפונקציה המדויקת (שכבר קיימת אצלך בקוד)
        if (typeof calcNeedsReadMore === "function") {
            if (calcNeedsReadMore(el, card)) {
                btn.style.display = displayType;
                return; // מצאנו שיש חריגה, סיימנו
            }
        } 
        
        // בדיקה 2: גיבוי (בדיקת גלילה רגילה)
        // אם גובה התוכן (scrollHeight) גדול מהגובה הנראה (clientHeight)
        if (el.scrollHeight > el.clientHeight + 2) {
            btn.style.display = displayType;
        }
      }, 50); // טיימר קצרצר של 50ms מספיק כדי לקבל מידות מדויקות
    }

    // הפונקציה שהייתה חסרה וגרמה לשגיאות
    function run() {
      try { positionWrap(); } catch(_) {}
    }

    run(); 

    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
    
    setTimeout(run, 200);
    setTimeout(run, 800);
    
    try {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => setTimeout(run, 0));
      }
    } catch (_) {}

    /* =========================================
       8) RENDERERS
       ========================================= */
    function renderReviewCard(item) {
      const card = document.createElement("div");
      card.className = "card review-card enter style-" + CARD_STYLE + (SIZE_MODE === "compact" ? " compact" : "");

      const x = document.createElement("button");
      x.className = "xbtn";
      x.textContent = "×";
      x.onclick = function () { handleDismiss(); try { card.remove(); } catch (_) {} };
      card.appendChild(x);
      
      // באדג' (כותרת)
      if (SIZE_MODE !== "compact" && BADGE_ENABLED) {
        const topBadge = document.createElement("div");
        topBadge.className = "top-badge-container";
        topBadge.innerHTML = '<div class="modern-badge"><div class="pulse-dot"></div> ' + escapeHTML(FINAL_BADGE_TEXT) + "</div>";
        card.appendChild(topBadge);
      }

      // === אזור עליון (Header) ===
      // זה הקונטיינר שמפזר לצדדים
      const header = document.createElement("div");
      header.className = "review-header";

      // --- צד ימין: תמונה ושם ---
      const userPill = document.createElement("div");
      userPill.className = "user-pill";
      userPill.appendChild(renderAvatarPreloaded(item.authorName, item.profilePhotoUrl));

      const nameCol = document.createElement("div");
      nameCol.className = "name-col";
      const nm = document.createElement("span");
      nm.className = "reviewer-name";
      nm.textContent = item.authorName || "Anonymous";
      nameCol.appendChild(nm);
      userPill.appendChild(nameCol);

      // --- צד שמאל: כוכבים ולוגו ---
      const starsDiv = document.createElement("div");
      starsDiv.className = "stars";
      starsDiv.innerHTML = "★★★★★" + GOOGLE_ICON_SVG;

      // מכניסים ל-Header: הראשון ילך לימין, השני לשמאל
      header.appendChild(userPill);
     // === מיקום כוכבים ולוגו (פיתרון אחיד ומושלם) ===
      if (CARD_STYLE === 'exec') {
          // 1. Executive: סגנון מיוחד - הכוכבים מתחת לשם
          nameCol.style.display = "flex";
          nameCol.style.flexDirection = "column";
          nameCol.appendChild(starsDiv);
      } else {
          // 2. Large & Compact (Default/Forest/Leaf)
          // אנחנו מכניסים את הכוכבים לתוך ה-Header!
          // בגלל שה-Header הוא Flexbox עם justify-content: space-between:
          // ב-RTL: שם מימין, כוכבים משמאל.
          // ב-LTR: שם משמאל, כוכבים מימין.
          header.appendChild(starsDiv);
      }
      
      card.appendChild(header);

      // גוף הביקורת
      const body = document.createElement("div");
      body.className = "review-text";
      const rawText = String(item.text || "");
      if (MARKER_ENABLED) body.innerHTML = safeReviewHtmlAllowSmartMark(rawText);
      else body.textContent = normalizeSpaces(stripAllTags(rawText));

      const readMoreBtn = document.createElement("button");
      readMoreBtn.className = "read-more-btn";
      readMoreBtn.textContent = T_DATA.readMore; // שימוש בתרגום
      
      // ... (המשך קוד) ...

      // שימוש ב-T_DATA הגלובלי
  readMoreBtn.onclick = function (e) {
    e.stopPropagation();
    const wasExpanded = body.classList.contains("expanded");
    card.style.transition = "none";
    card.style.height = "auto";

    if (!wasExpanded) {
      body.classList.add("expanded");
      readMoreBtn.textContent = T_DATA.close; // כאן היה הבאג
      pauseForReadMore();
    } else {
      body.classList.remove("expanded");
      readMoreBtn.textContent = T_DATA.readMore; // וגם כאן
      resumeFromReadMore();
    }
  };

      card.appendChild(body);
      card.appendChild(readMoreBtn);
       // מפעיל את הבדיקה החכמה מיד ביצירת הכרטיס
      scheduleReadMoreCheck(body, readMoreBtn, card);

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

    /* =========================================
       9) LOAD ALL
       ========================================= */
    async function loadAll() {
      let reviewsItems = [];
      let used = "none";

      const mode = (MODE === "reviews" || MODE === "semantic" || MODE === "hybrid" || MODE === "auto") ? MODE : "auto";

      // BASIC DEFAULT: only attempt semantic if explicitly enabled
      const wantsSemantic =
        SEMANTIC_ENABLED &&
        (mode === "semantic" || mode === "hybrid" || (mode === "auto" && isLikelyProductPage()));

      // Try semantic first
      if (wantsSemantic && CURRENT_SLUG) {
        try {
          if (mode === "hybrid") {
            const sem = await fetchSemanticReviewsForCurrentPage(CURRENT_SLUG, HYBRID_SEMANTIC_TOP);
            reviewsItems = dedupeReviews(sem);
            used = reviewsItems.length ? "semantic(hybrid)" : "semantic(hybrid-empty)";
          } else {
            const sem = await fetchSemanticReviewsForCurrentPage(CURRENT_SLUG, SEMANTIC_TOP);
            reviewsItems = dedupeReviews(sem);
            used = reviewsItems.length ? "semantic" : "semantic-empty";
          }
        } catch (e) {
          console.warn("EVID: semantic fetch failed, fallback to regular.", e);
          reviewsItems = [];
          used = "semantic-error";
        }
      }

      // Fallback to regular reviews if needed
      const needRegularFallback =
        !reviewsItems.length ||
        mode === "reviews" ||
        (mode === "hybrid" && reviewsItems.length < HYBRID_TOTAL) ||
        (mode === "semantic" && !SEMANTIC_ENABLED); // semantic requested but not enabled => fallback

      let regularReviews = [];

      if (needRegularFallback) {
        if (REVIEWS_EP_ATTR) {
          let url = REVIEWS_EP_ATTR;
          if (CURRENT_SLUG && url.indexOf("slug=") === -1) {
            url += (url.indexOf("?") > -1 ? "&" : "?") + "slug=" + encodeURIComponent(CURRENT_SLUG);
          }
          try {
            regularReviews = await fetchReviewsViaEndpoint(url);
            if (used === "none" || used.indexOf("semantic") === 0) used = "endpoint(attr)";
          } catch (e) {
            console.warn("EVID: reviews endpoint (attr) failed, fallback next.", e);
          }
        }

        if (!regularReviews.length && CURRENT_SLUG) {
          try {
            const url = DEFAULT_REVIEWS_API_BASE + "?slug=" + encodeURIComponent(CURRENT_SLUG);
            regularReviews = await fetchReviewsViaEndpoint(url);
            if (used === "none" || used.indexOf("semantic") === 0) used = "endpoint(default)";
          } catch (e) {
            console.warn("EVID: default reviews API failed, fallback to Firestore.", e);
          }
        }

        if (!regularReviews.length) {
          regularReviews = await fetchReviewsViaFirestore(CURRENT_SLUG);
          if (used === "none" || used.indexOf("semantic") === 0) used = "firestore";
        }
      }

      // If hybrid: fill to HYBRID_TOTAL using regular reviews
      if (mode === "hybrid" && SEMANTIC_ENABLED) {
        const target = HYBRID_TOTAL;
        const merged = dedupeReviews(reviewsItems.concat(regularReviews));
        reviewsItems = merged.slice(0, target);
        used = used + "+fill";
      } else if (!reviewsItems.length) {
        reviewsItems = regularReviews;
      }

      // Purchases
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
        widgetId: __WIDGET_ID__,
        mode,
        semanticEnabled: SEMANTIC_ENABLED,
        semanticSource,
        used,
        color: THEME_COLOR,
        font: SELECTED_FONT,
        position: WIDGET_POS,
        visualSource,
        marker: MARKER_ENABLED,
        markerSource,
        badge: BADGE_ENABLED,
        badgeText: BADGE_TEXT,
        badgeSource,
        size: SIZE_MODE,
        sizeSource,
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
  })().catch((e) => {
    console.error("EVID: dynamic import boot failed:", e);
  });
})();
