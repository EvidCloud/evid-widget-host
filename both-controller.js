import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================================
   1. הגדרות FIREBASE (כאן אתה מדביק את הפרטים)
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

// אתחול Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* =========================================
   2. לוגיקה ראשית
   ========================================= */
(async function () {
    var hostEl = document.getElementById("reviews-widget");
    // תמיכה בטעינה גם ללא אלמנט מארח ספציפי (יוצר לבד אם צריך)
    if (!hostEl) {
        hostEl = document.createElement('div');
        hostEl.id = 'reviews-widget';
        document.body.appendChild(hostEl);
    }

    var root = hostEl.attachShadow ? hostEl.attachShadow({ mode: "open" }) : hostEl;
    
    // זיהוי ה-ID מה-URL של הסקריפט
    var currentScript = document.currentScript || (function() {
        var scripts = document.getElementsByTagName('script');
        return scripts[scripts.length - 1];
    })();
    
    // ברירות מחדל למקרה שהסקריפט לא נטען עם ID
    let DYNAMIC_SETTINGS = {
        color: "#4f46e5",
        font: "Rubik",
        position: "bottom-right",
        delay: 0,
        businessName: ""
    };

    // --- שליפת הנתונים מ-Firebase ---
    try {
        const src = currentScript.src;
        if (src.includes('?id=')) {
            const urlParams = new URLSearchParams(src.split('?')[1]);
            const widgetId = urlParams.get('id');
            
            if (widgetId) {
                const docRef = doc(db, "widgets", widgetId);
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const s = data.settings || {};
                    
                    // עדכון הגדרות מהדאטה בייס
                    DYNAMIC_SETTINGS.color = s.color || "#4f46e5";
                    DYNAMIC_SETTINGS.font = s.font || "Rubik";
                    DYNAMIC_SETTINGS.position = s.position || "bottom-right";
                    DYNAMIC_SETTINGS.delay = (s.delay || 0) * 1000;
                    DYNAMIC_SETTINGS.businessName = data.businessName || "";
                    
                    console.log("EVID: Widget settings loaded from Firebase", DYNAMIC_SETTINGS);
                }
            }
        }
    } catch (e) {
        console.warn("EVID: Could not load settings from Firebase, using defaults.", e);
    }

    /* ---- config (Overridden by Firebase if exists) ---- */
    // שימוש בהגדרות שמשכנו, או בברירות המחדל של הסקריפט הישן
    var REVIEWS_EP      = currentScript && currentScript.getAttribute("data-reviews-endpoint");
    var PURCHASES_EP    = currentScript && currentScript.getAttribute("data-purchases-endpoint");
    
    var SHOW_MS         = Number((currentScript && currentScript.getAttribute("data-show-ms"))          || 15000);
    var GAP_MS          = Number((currentScript && currentScript.getAttribute("data-gap-ms"))           || 6000);
    // הדיליי הראשוני מגיע עכשיו מ-Firebase
    var INIT_MS         = DYNAMIC_SETTINGS.delay || Number((currentScript && currentScript.getAttribute("data-init-delay-ms")) || 0);
    var DISMISS_COOLDOWN_MS = Number((currentScript && currentScript.getAttribute("data-dismiss-cooldown-ms")) || 45000);
    
    var TXT_LIVE      = (currentScript && currentScript.getAttribute("data-live-text")) || "מבוקש עכשיו";
    var TXT_BOUGHT    = (currentScript && currentScript.getAttribute("data-purchase-label")) || "רכש/ה";
    
    // *** FONT CONFIGURATION (Dynamic) ***
    var SELECTED_FONT = DYNAMIC_SETTINGS.font;
    
    // *** POSITION CONFIGURATION (Dynamic) ***
    var WIDGET_POS    = DYNAMIC_SETTINGS.position;
    
    // *** COLOR CONFIGURATION (Dynamic) ***
    var THEME_COLOR   = DYNAMIC_SETTINGS.color;

    var DEFAULT_PRODUCT_IMG = (currentScript && currentScript.getAttribute("data-default-image")) || "https://cdn-icons-png.flaticon.com/128/2331/2331970.png";

    var PAGE_TRANSITION_DELAY = 3000;
    var STORAGE_KEY = 'evid:widget-state:v4';

    // ==== CURRENT SLUG (Business identifier) ====
    var CURRENT_SLUG = (function () {
        try {
            if (currentScript && currentScript.getAttribute("data-slug")) return currentScript.getAttribute("data-slug");
            if (typeof window !== "undefined" && window.EVID_SLUG) return window.EVID_SLUG;
            if (REVIEWS_EP) {
                var url = REVIEWS_EP.split("?")[0];
                var lastSegment = url.substring(url.lastIndexOf("/") + 1);
                if (lastSegment.toLowerCase().endsWith(".json")) lastSegment = lastSegment.slice(0, -5);
                return decodeURIComponent(lastSegment);
            }
        } catch (e) { console.warn("Failed to derive CURRENT_SLUG:", e); }
        return "";
    })();

    /* =========================================================
        1. HELPERS & LOGIC (Hebrew Grammar)
        ========================================================= */
    
    var HEBREW_VERBS = {
        "רכש/ה": { m: "רכש", f: "רכשה" }, "קנה/תה": { m: "קנה", f: "קנתה" }, "הזמין/ה": { m: "הזמין", f: "הזמינה" },
        "בחר/ה": { m: "בחר", f: "בחרה" }, "הצטרף/ה": { m: "הצטרף", f: "הצטרפה" }, "נרשם/ה": { m: "נרשם", f: "נרשמה" },
        "הוסיף/ה": { m: "הוסיף", f: "הוסיפה" }, "התחדש/ה": { m: "התחדש", f: "התחדשה" }, "שריין/ה": { m: "שריין", f: "שריינה" },
        "הבטיח/ה": { m: "הבטיח", f: "הבטיחה" }, "קיבל/ה": { m: "קיבל", f: "קיבלה" }, "אהב/ה": { m: "אהב", f: "אהבה" },
        "נהנה/תה": { m: "נהנה", f: "נהנתה" }, "ניסה/תה": { m: "ניסה", f: "ניסתה" }, "סגר/ה": { m: "סגר", f: "סגרה" },
        "למד/ה": { m: "למד", f: "למדה" }, "התחיל/ה": { m: "התחיל", f: "התחילה" }, "מצא/ה": { m: "מצא", f: "מצאה" },
        "תפס/ה": { m: "תפס", f: "תפסה" }, "חטף/ה": { m: "חטף", f: "חטפה" }
    };
    var DB_FEMALE = "שרה,רחל,לאה,רבקה,אסתר,מרים,חנה,אביגיל,אבישג,אביה,אדל,אורלי,איילה,אילנה,אפרת,גאיה,גלי,דנה,דניאלה,הדר,הילה,ורד,זהבה,חיה,טליה,יעל,יערה,לי,ליה,ליהי,לינוי,לילך,מאיה,מיכל,מירב,מור,מורן,מירי,נטע,נועה,נינט,נעמה,ספיר,עדי,ענבל,ענת,קרן,רוני,רות,רותם,רינה,שולמית,שירה,שירלי,שני,תמר,תהל,תמרה,פאטמה,עאישה,מריים,נור,יסמין,זינב,חדיג'ה,אמינה,סוהא,רנא,לילא,נאדיה,סמירה,אמל,מונה,סלמה,היבא,רואן,רים";

    function getGenderedVerb(name, selectedKey) {
        var key = (selectedKey || "רכש/ה").trim();
        if (!HEBREW_VERBS[key]) return key; 
        var first = (name||"").trim().split(/\s+/)[0].replace(/[^א-תa-z]/gi, ''); 
        return (DB_FEMALE.indexOf(first) > -1) ? HEBREW_VERBS[key].f : HEBREW_VERBS[key].m;
    }

    /* =========================
        2. STYLES & FONTS (DYNAMIC with Firebase Color)
        ========================================================= */
    
    function ensureFontInHead(){
        try{
            var fontId = 'evid-font-' + SELECTED_FONT.toLowerCase().replace(/\s+/g, '-');
            if (!document.getElementById(fontId)) {
                var link = document.createElement('link');
                link.id = fontId;
                link.rel = 'stylesheet';
                link.href = 'https://fonts.googleapis.com/css2?family=' + SELECTED_FONT.replace(/\s+/g, '+') + ':wght@300;400;500;600;700;800&display=swap';
                document.head.appendChild(link);
            }
            return Promise.resolve(); 
        }catch(_){ return Promise.resolve(); }
    }

    var style = document.createElement("style");
    // כאן אנחנו מזריקים את הצבע הנבחר (THEME_COLOR) לתוך ה-CSS
    style.textContent = ''
    + ':host{all:initial;}'
    + ':host, :host *, .wrap, .wrap * {'
    + '  font-family: "' + SELECTED_FONT + '", sans-serif !important;'
    + '  box-sizing: border-box;'
    + '}'
    + '.wrap{'
    + '  position:fixed; z-index:2147483000;'
    + '  direction:rtl;'
    + '  pointer-events:none;' 
    + '  display: block;'
    + '  transition: bottom 0.3s ease, top 0.3s ease, right 0.3s ease, left 0.3s ease;' 
    + '}'
    + '.wrap.ready{visibility:visible;opacity:1;}'

    /* Card Design */
    + '.card {'
    + '  position: relative;'
    + '  width: 290px; max-width: 90vw;' 
    + '  background: rgba(255, 255, 255, 0.95);' 
    + '  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);'
    + '  border-radius: 18px;' 
    + '  border: 1px solid rgba(255, 255, 255, 0.8);' 
    + '  box-shadow: 0 8px 25px -8px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.04);'
    + '  padding: 16px;'
    + '  overflow: hidden;'
    + '  pointer-events: auto;' 
    + '  transition: transform 0.3s ease;'
    + '  border-top: 4px solid ' + THEME_COLOR + ';' // הוספת הצבע הנבחר כבורדר עליון
    + '}'
    + '.card:hover { transform: translateY(-5px); }'

    /* Animations */
    + '.enter { animation: slideInUp 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }'
    + '.leave { animation: slideOutDown 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }'
    + '@keyframes slideInUp { from { opacity: 0; transform: translateY(30px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }'
    + '@keyframes slideOutDown { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(30px); } }'

    /* Close Button */
    + '.xbtn {'
    + '  position: absolute; top: 8px; left: 8px; width: 18px; height: 18px;'
    + '  background: rgba(241, 245, 249, 0.5); border-radius: 50%; border: none;'
    + '  display: flex; align-items: center; justify-content: center;'
    + '  cursor: pointer; color: #94a3b8; font-size: 10px; z-index: 20;'
    + '  opacity: 0; transition: opacity 0.2s;'
    + '}'
    + '.card:hover .xbtn { opacity: 1; }'

    /* Headers */
    + '.top-badge-container { display: flex; justify-content: flex-start; margin-bottom: 10px; }'
    + '.modern-badge {'
    + '  font-size: 10px; font-weight: 700;'
    + '  color: ' + THEME_COLOR + ';' // צבע דינמי
    + '  background: #eef2ff;'
    + '  padding: 3px 8px; border-radius: 12px;'
    + '  display: flex; align-items: center; gap: 5px; letter-spacing: 0.3px;'
    + '}'
    + '.pulse-dot {'
    + '  width: 5px; height: 5px;'
    + '  background-color: ' + THEME_COLOR + ';' // צבע דינמי
    + '  border-radius: 50%;'
    + '  animation: pulse 2s infinite;'
    + '}'
    + '@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.4); } 70% { box-shadow: 0 0 0 4px rgba(79, 70, 229, 0); } 100% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); } }'

    + '.review-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }'
    + '.user-pill { display: flex; align-items: center; gap: 8px; }'
    
    + '.review-avatar {' 
    + '  width: 30px; height: 30px; border-radius: 50%;' 
    + '  background: linear-gradient(135deg, ' + THEME_COLOR + ' 0%, #8b5cf6 100%);' // גרדיאנט דינמי
    + '  color: #fff; font-size: 12px; font-weight: 700;'
    + '  display: grid; place-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.1);' 
    + '  object-fit: cover;'
    + '}'
    + '.avatar-fallback { width: 30px; height: 30px; border-radius: 50%; background: linear-gradient(135deg, ' + THEME_COLOR + ' 0%, #8b5cf6 100%); color:#fff; display:grid; place-items:center; font-weight:700; font-size:12px; }'
    + '.reviewer-name { font-size: 14px; font-weight: 700; color: #1e293b; letter-spacing: -0.3px; }'
    
    + '.rating-container { display: flex; align-items: center; gap: 5px; background: #fff; border: 1px solid #f1f5f9; padding: 3px 6px; border-radius: 6px; }'
    + '.stars { color: #f59e0b; font-size: 11px; letter-spacing: 1px; }'
    + '.g-icon-svg { width: 12px; height: 12px; display: block; }'

    /* === Text & Read More === */
    + '.review-text { font-size: 13px; line-height: 1.4; color: #334155; font-weight: 400; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; transition: all 0.3s ease; }'
    + '.review-text.expanded { -webkit-line-clamp: unset; overflow: visible; }'
    
    + '.read-more-btn { font-size: 11px; color: ' + THEME_COLOR + '; font-weight: 700; cursor: pointer; background: transparent!important; border: none; padding: 2px 0 0 0; outline: none!important; margin-top: 2px; }'
    + '.read-more-btn:hover { text-decoration: underline; }'

    + '.smart-mark {'
    + '  background: linear-gradient(to bottom, transparent 65%, #fef08a 65%);'
    + '  color: #0f172a; font-weight: 700; padding: 0 1px;'
    + '}'

    /* --- Purchase Widget --- */
    + '.purchase-card { height: 85px; padding: 0; display: flex; flex-direction: row; gap: 0; width: 290px; }'
    + '.course-img-wrapper { flex: 0 0 85px; height: 100%; position: relative; overflow: hidden; background: #f8f9fa; display: flex; align-items: center; justify-content: center; }'
    + '.course-img { width: 100%; height: 100%; object-fit: cover; }'
    + '.course-img.default-icon { object-fit: contain; padding: 12px; }'
    + '.p-content { flex-grow: 1; padding: 8px 12px; display: flex; flex-direction: column; justify-content: center; text-align: right; }'
    + '.fomo-header { display: flex; justify-content: space-between; font-size: 10px; color: #64748b; margin-bottom: 2px; }'
    + '.fomo-name { font-weight: 700; color: #1e293b; }'
    + '.fomo-body { font-size: 12px; color: #334155; line-height: 1.2; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }'
    + '.product-highlight { font-weight: 600; color: ' + THEME_COLOR + '; }'
    + '.fomo-footer-row { display: flex; align-items: center; gap: 6px; font-size: 10px; color: #ef4444; font-weight: 600; }'
    + '.pulsing-dot { width: 5px; height: 5px; background-color: #ef4444; border-radius: 50%; display:inline-block; }'
    
    + '@media (max-width:480px){'
    + '  .wrap { right:0!important; left:0!important; width:100%!important; padding: 0!important; display:flex!important; justify-content:center!important; }'
    + '  .card { width: 95%!important; margin: 0 auto 10px!important; border-radius: 12px; }'
    + '}'
    ;
    root.appendChild(style);

    var wrap = document.createElement("div");
    wrap.className = "wrap";
    root.appendChild(wrap);

    /* ---- helpers ---- */
    function firstLetter(s){ s=(s||"").trim(); return (s[0]||"?").toUpperCase(); }
    function escapeHTML(s){ return String(s||"").replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;","&gt;":">","\"":"&quot;","'":"&#39;"}[c]);}); }
    function firstName(s){ s=String(s||"").trim(); var parts=s.split(/\s+/); return parts[0]||s; }
    function normalizeSpaces(text){ return (text||"").replace(/\s+/g," ").trim(); }
    function timeAgo(ts){
        try{ var d=new Date(ts);
        var diff=Math.max(0,(Date.now()-d.getTime())/1000);
        var m=Math.floor(diff/60), h=Math.floor(m/60), d2=Math.floor(h/24);
        if(d2>0) return d2===1?"אתמול":"לפני "+d2+" ימים";
        if(h>0) return "לפני "+h+" שעות";
        if(m>0) return "לפני "+m+" דקות";
        return "כרגע";
        }catch(_){ return ""; }
    }

    function renderMonogram(name){ var d=document.createElement("div"); d.className="avatar-fallback"; d.textContent=firstLetter(name); return d; }
    function renderAvatarPreloaded(name, url){
        var shell = renderMonogram(name);
        if(url){
        var img = new Image(); img.decoding="async"; img.loading="eager";
        img.onload=function(){ var tag=document.createElement("img"); tag.className="review-avatar"; tag.alt=""; tag.src=url; shell.replaceWith(tag); };
        img.src=url;
        }
        return shell;
    }

    var IMG_CACHE = new Map();
    function warmImage(url){
        if(!url) return Promise.resolve();
        if(IMG_CACHE.has(url)) return IMG_CACHE.get(url);
        var pr = new Promise(function(resolve){
        var im = new Image();
        im.onload = function(){ resolve(url); };
        im.onerror = function(){ resolve(url); };
        im.src = url;
        });
        IMG_CACHE.set(url, pr);
        return pr;
    }
    function warmForItem(itm){
        if(!itm) return Promise.resolve();
        if(itm.kind==="review") return warmImage(itm.data && itm.data.profilePhotoUrl);
        if(itm.kind==="purchase") return warmImage(itm.data && itm.data.image);
        return Promise.resolve();
    }

    /* ---- SUBMIT REVIEW: send to new API with slug ---- */
    async function submitReview(name, rating, text) {
        try {
        await fetch("https://review-widget-psi.vercel.app/api/save-review", {
            method: "POST",
            headers: {
            "Content-Type": "application/json"
            },
            body: JSON.stringify({
            name: name,
            rating: rating,
            text: text,
            slug: CURRENT_SLUG || "" 
            })
        });
        } catch (e) {
        console.error("submitReview failed:", e);
        }
    }

    if (typeof window !== "undefined") {
        window.EvidSubmitReview = submitReview;
    }

    /* fetchers */
    var JS_MIRRORS = ["https://cdn.jsdelivr.net","https://fastly.jsdelivr.net","https://gcore.jsdelivr.net"];
    function rewriteToMirror(u, mirror){ try { var a=new URL(u), m=new URL(mirror); a.protocol=m.protocol; a.host=m.host; return a.toString(); } catch(_){ return u; } }
    function fetchTextWithMirrors(u){
        var opts = {method:"GET", credentials:"omit", cache:"no-store"};
        var i = 0, isJSD = /(^https?:)?\/\/([^\/]*jsdelivr\.net)/i.test(u);
        var urlWithBuster = u + (u.indexOf('?')>-1?'&':'?') + 't=' + Date.now();
        function attempt(url){
        return fetch(url, opts).then(function(res){
            return res.text().then(function(raw){
            if(!res.ok) throw new Error(raw || ("HTTP "+res.status));
            return raw;
            });
        }).catch(function(err){
            if(isJSD && i < JS_MIRRORS.length-1){
            i++; var next = rewriteToMirror(u, JS_MIRRORS[i]);
            return attempt(next + (next.indexOf('?')>-1?'&':'?') + 't=' + Date.now());
            }
            throw err;
        });
        }
        return attempt(urlWithBuster);
    }
    function fetchJSON(url){ return fetchTextWithMirrors(url).then(function(raw){ try{ return JSON.parse(raw); }catch(_){ return { items: [] }; } }); }

    // ---- UPDATED NORMALIZE ARRAY ----
    function normalizeArray(data, as){
        var arr = [];

        if (Array.isArray(data)) {
        arr = data;
        } else if (data && typeof data === "object") {
        if (Array.isArray(data.reviews)) arr = data.reviews;
        else if (Array.isArray(data.purchases)) arr = data.purchases;
        else if (Array.isArray(data.items)) arr = data.items;
        }

        if (as === "review") {
        return arr.map(function (x) {
            if (!x) return null;
            var txt = (x.text || "").toString();
            if (txt.includes("אנא ספק לי") || txt.includes("כמובן!")) return null;

            return {
            kind: "review",
            data: {
                authorName: x.name || "Anonymous",
                rating: typeof x.rating !== "undefined" ? x.rating : 5,
                text: txt
            }
            };
        }).filter(Boolean);
        }

        if (as === "purchase") {
        return arr.map(function(x){
            if (!x) return null;
            var txt = x.Content || x.text || "";
            if (txt && (txt.includes("אנא ספק לי") || txt.includes("כמובן!"))) return null;

            return {
            kind:"purchase",
            data:{
                buyer: x.buyerName || x.buyer_name || x.buyer || x.name || x.first_name || "לקוח/ה",
                product: x.productName || x.product_name || x.item_name || x.product || x.title || "מוצר",
                image: x.productImage || x.product_image || x.image || "",
                purchased_at: x.purchased_at || x.created_at || new Date().toISOString()
            }
            };
        }).filter(Boolean);
        }

        return [];
    }

    /* persistence */
    var itemsSig = "0_0";
    function itemsSignature(arr){ return arr.length + "_" + (arr[0]?arr[0].kind:"x"); } 
    function saveState(idxShown, sig, opt){
        try {
        var st = { idx: idxShown, shownAt: opt && opt.shownAt ? opt.shownAt : Date.now(), sig: sig };
        if (opt && opt.manualClose) st.manualClose = true;
        if (opt && opt.snoozeUntil) st.snoozeUntil = Number(opt.snoozeUntil)||0;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
        } catch(_) {}
    }
    function restoreState(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch(_){ return null; } }

    function interleave(reviews, purchases){
        var out=[], i=0, j=0;
        while(i<reviews.length || j<purchases.length){
        if(i<reviews.length){ out.push(reviews[i++]); }
        if(j<purchases.length){ out.push(purchases[j++]); }
        }
        return out;
    }

    /* rotation */
    var items=[], idx=0, loop=null, preTimer=null;
    var isDismissed = false;
    var currentCard = null;
    var fadeTimeout = null;
    var removeTimeout = null;
    var isPausedForReadMore = false;
    var currentShowDuration = 0;
    var currentShowStart = 0;
    var remainingShowMs = 0;

    function clearShowTimers(){
        if(fadeTimeout){ clearTimeout(fadeTimeout); fadeTimeout = null; }
        if(removeTimeout){ clearTimeout(removeTimeout); removeTimeout = null; }
    }

    function scheduleHide(showFor){
        clearShowTimers();
        if(!currentCard) return;
        currentShowDuration = showFor;
        currentShowStart = Date.now();

        fadeTimeout = setTimeout(function(){
        if(!currentCard) return;
        currentCard.classList.remove("enter");
        currentCard.classList.add("leave");
        }, showFor);
        removeTimeout = setTimeout(function(){
        if(currentCard && currentCard.parentNode){ currentCard.parentNode.removeChild(currentCard); }
        currentCard = null;
        }, showFor + 700); 
    }

    function pauseForReadMore(){
        if(isPausedForReadMore || !currentCard) return;
        isPausedForReadMore = true;
        if(loop) clearInterval(loop);
        if(preTimer) clearTimeout(preTimer);
        var elapsed = Date.now() - currentShowStart;
        remainingShowMs = Math.max(0, currentShowDuration - elapsed);
        clearShowTimers();
    }

    function resumeFromReadMore(){
        if(!isPausedForReadMore || !currentCard) return;
        isPausedForReadMore = false;
        var showMs = Math.max(2000, remainingShowMs); 
        scheduleHide(showMs);
        preTimer = setTimeout(function(){ startFrom(0); }, showMs + GAP_MS);
    }

    /* ---- RENDERERS ---- */
    function renderReviewCard(item){
        var card = document.createElement("div"); 
        card.className = "card review-card enter";

        var x = document.createElement("button"); x.className="xbtn"; x.textContent="×";
        x.onclick = function(){ handleDismiss(); card.remove(); };
        card.appendChild(x);

        // 1. Badge
        var topBadge = document.createElement("div");
        topBadge.className = "top-badge-container";
        topBadge.innerHTML = '<div class="modern-badge"><div class="pulse-dot"></div> פידבק מהשטח</div>';
        card.appendChild(topBadge);

        // 2. Header
        var header = document.createElement("div"); header.className = "review-header";
        var userPill = document.createElement("div"); userPill.className = "user-pill";
        userPill.appendChild(renderAvatarPreloaded(item.authorName, item.profilePhotoUrl));
        var name = document.createElement("span"); name.className = "reviewer-name"; name.textContent = item.authorName;
        userPill.appendChild(name);
        header.appendChild(userPill);

        var ratingDiv = document.createElement("div"); ratingDiv.className = "rating-container";
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

        // 3. Body with Read More
        var body = document.createElement("div"); 
        body.className = "review-text";
        
        body.innerHTML = item.text; 
        
        var readMoreBtn = document.createElement("button");
        readMoreBtn.className = "read-more-btn";
        readMoreBtn.textContent = "קרא עוד...";
        readMoreBtn.style.display = "none"; 

        setTimeout(function(){
        if (body.scrollHeight > body.clientHeight + 1) {
            readMoreBtn.style.display = "block";
        }
        }, 0);

        readMoreBtn.onclick = function(e){
        e.stopPropagation();
        var isExpanded = body.classList.toggle("expanded");
        readMoreBtn.textContent = isExpanded ? "סגור" : "קרא עוד...";
        if(isExpanded) pauseForReadMore(); else resumeFromReadMore();
        };

        card.appendChild(body);
        card.appendChild(readMoreBtn);

        return card;
    }

    function renderPurchaseCard(p, overrideTime){
        var card = document.createElement("div"); 
        card.className = "card purchase-card enter";

        var x = document.createElement("button"); x.className="xbtn"; x.textContent="×";
        x.onclick = function(){ handleDismiss(); card.remove(); };
        card.appendChild(x);

        var imgWrap = document.createElement("div"); imgWrap.className = "course-img-wrapper";
        var img = document.createElement("img"); 
        var isRealImage = (p.image && p.image.length > 5);
        var imageSource = isRealImage ? p.image : DEFAULT_PRODUCT_IMG;
        img.className = isRealImage ? "course-img real-photo" : "course-img default-icon";
        img.src = imageSource;
        img.onerror = function(){ this.style.display='none'; var fb=document.createElement('div'); fb.className='pimg-fallback'; fb.textContent='✓'; imgWrap.appendChild(fb); };
        imgWrap.appendChild(img);

        var content = document.createElement("div"); content.className = "p-content";
        var header = document.createElement("div"); header.className = "fomo-header";
        header.innerHTML = '<span class="fomo-name">' + escapeHTML(firstName(p.buyer)) + '</span>' + '<span class="fomo-time">' + escapeHTML(timeAgo(p.purchased_at)) + '</span>';
        var body = document.createElement("div"); body.className = "fomo-body";
        var dynamicVerb = getGenderedVerb(p.buyer, TXT_BOUGHT);
        body.innerHTML = escapeHTML(dynamicVerb) + ' <span class="product-highlight">' + escapeHTML(p.product) + '</span>';
        
        var footer = document.createElement("div"); footer.className = "fomo-footer-row";
        footer.innerHTML = '<div class="live-indicator"><div class="pulsing-dot"></div> '+ escapeHTML(TXT_LIVE) +'</div>';

        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);
        card.appendChild(imgWrap);
        card.appendChild(content);

        return card;
    }

    function showNext(overrideDuration, preserveTimestamp){
        if(!items.length || isDismissed) return;
        clearShowTimers();
        isPausedForReadMore = false;

        var itm = items[idx % items.length];
        if (!preserveTimestamp) saveState(idx % items.length, itemsSig); 
        if (!preserveTimestamp) idx++; 

        warmForItem(itm).then(function(){
        if(isDismissed) return;
        var duration = overrideDuration || SHOW_MS;
        var card = (itm.kind==="purchase") ? renderPurchaseCard(itm.data, duration) : renderReviewCard(itm.data);
        
        var isMobile = window.innerWidth <= 480;
        
        // --- מיקום דינמי לפי Firebase ---
        if (isMobile) {
            wrap.style.top = "auto"; wrap.style.left = "0px"; wrap.style.right = "0px"; wrap.style.bottom = "10px";
        } else {
            wrap.style.top = "auto"; wrap.style.bottom = "auto"; wrap.style.left = "auto"; wrap.style.right = "auto";
            if (WIDGET_POS.includes("top")) wrap.style.top = "20px"; else wrap.style.bottom = "20px";
            if (WIDGET_POS.includes("left")) wrap.style.left = "20px"; else wrap.style.right = "20px"; 
        }
        
        wrap.innerHTML=""; 
        wrap.appendChild(card);
        currentCard = card;
        scheduleHide(duration);
        });
    }

    function startFrom(delay){
        if(loop) clearInterval(loop);
        if(preTimer) clearTimeout(preTimer);
        if(isDismissed) return;
        var cycle = SHOW_MS + GAP_MS;
        function begin(){
        if(isDismissed) return;
        showNext(); loop = setInterval(showNext, cycle);
        }
        if (delay > 0) preTimer = setTimeout(begin, delay);
        else begin();
    }
    
    function resumeCard(remainingTime){
        showNext(remainingTime, true); idx++; 
        preTimer = setTimeout(function(){ showNext(); loop = setInterval(showNext, SHOW_MS + GAP_MS); }, remainingTime + GAP_MS);
    }

    function handleDismiss(){
        isDismissed = true;
        if(loop) clearInterval(loop);
        if(preTimer) clearTimeout(preTimer);
        clearShowTimers();
        var current = (idx - 1 + items.length) % items.length;
        saveState(current, itemsSig, { manualClose: true, snoozeUntil: Date.now() + DISMISS_COOLDOWN_MS });
    }

    /* ---- init ---- */
  function loadAll(){
  // ---- REVIEWS ----
  var reviewsUrl =
    REVIEWS_EP ||
    (CURRENT_SLUG ? ("https://review-widget-psi.vercel.app/api/get-reviews?slug=" + encodeURIComponent(CURRENT_SLUG)) : "");

  var reviewsPromise = reviewsUrl
    ? fetch(reviewsUrl, {
        method: "GET",
        credentials: "omit",
        cache: "no-store"
      })
        .then(function(res){
          if (!res.ok) return [];
          return res.json();
        })
        .then(function(d){ return normalizeArray(d, "review"); })
        .catch(function(){ return []; })
    : Promise.resolve([]);

  // ---- PURCHASES ----
  var purchasesPromise = PURCHASES_EP
    ? fetchJSON(PURCHASES_EP).then(function(d){ return normalizeArray(d,"purchase"); }).catch(function(){ return []; })
    : Promise.resolve([]);

        Promise.all([reviewsPromise, purchasesPromise]).then(function(r){
        var rev = r[0]||[], pur = r[1]||[];
        rev = rev.filter(function(v){ 
            var t = normalizeSpaces(v.data.text);
            return t.length > 0 && !t.includes("אנא ספק לי"); 
        });
        items = interleave(rev, pur);
        itemsSig = itemsSignature(items);

        if(!items.length) {
            items = []; 
            if(!items.length) return;
        }

        ensureFontInHead().then(function(){
            wrap.classList.add('ready');
            var state = restoreState();
            var now = Date.now();
            var runLogic = function() {
                var isDemo = (items[0] && items[0].data && items[0].data.authorName === "ישראל ישראלי");
                if (!isDemo && state && state.sig === itemsSig) {
                if (state.manualClose && state.snoozeUntil > now) {
                    setTimeout(function(){ isDismissed=false; idx=state.idx+1; startFrom(0); }, state.snoozeUntil - now);
                } else if (!state.manualClose) {
                    var elapsed = now - state.shownAt;
                    if (elapsed < SHOW_MS) { idx = state.idx; resumeCard(Math.max(1000, SHOW_MS - elapsed)); } 
                    else { idx = state.idx + 1; startFrom(0); }
                } else { startFrom(INIT_MS); }
                } else { if (INIT_MS > 0) setTimeout(function(){ startFrom(0); }, INIT_MS); else startFrom(0); }
            };
            if (state && !state.manualClose) setTimeout(runLogic, PAGE_TRANSITION_DELAY); else runLogic();
        });
        });
    }

    loadAll();
})();
