/*! both-controller v4.0.2 — Persistence Fix + Glassmorphism Tuning */
(function () {
  var hostEl = document.getElementById("reviews-widget");
  if (!hostEl) return;

  var root = hostEl.attachShadow ? hostEl.attachShadow({ mode: "open" }) : hostEl;
  var scripts = document.scripts;
  var scriptEl = document.currentScript || scripts[scripts.length - 1];

  /* ---- config ---- */
  var REVIEWS_EP    = scriptEl && scriptEl.getAttribute("data-reviews-endpoint");
  var PURCHASES_EP = scriptEl && scriptEl.getAttribute("data-purchases-endpoint");
  var SHOW_MS    = Number((scriptEl && scriptEl.getAttribute("data-show-ms"))        || 15000);
  var GAP_MS     = Number((scriptEl && scriptEl.getAttribute("data-gap-ms"))         || 6000);
  var INIT_MS    = Number((scriptEl && scriptEl.getAttribute("data-init-delay-ms")) || 0);
  var DISMISS_COOLDOWN_MS = Number((scriptEl && scriptEl.getAttribute("data-dismiss-cooldown-ms")) || 45000);
  
  // Storage Key for persistence
  var STORAGE_KEY = 'evid:widget-state:v3';

  if (!REVIEWS_EP && !PURCHASES_EP) {
    root.innerHTML = '<div style="font-family: system-ui; color:#c00; background:#fff3f3; padding:12px; border:1px solid #f7caca; border-radius:8px">Missing endpoints.</div>';
    return;
  }

  /* =========================
      Font: Rubik
     ========================= */
  var FONT_HREF = 'https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700&display=swap';
  function ensureFontInHead(){
    try{
      if (!document.getElementById('evid-rubik-font')) {
        var link = document.createElement('link');
        link.id = 'evid-rubik-font';
        link.rel = 'stylesheet';
        link.href = FONT_HREF;
        document.head.appendChild(link);
      }
      return Promise.resolve(); 
    }catch(_){ return Promise.resolve(); }
  }

  /* ========== styles (Enhanced Glassmorphism) ========== */
  var style = document.createElement("style");
  style.textContent = ''
  + ':host{all:initial;}'
  + ':host, :host *, .wrap, .wrap * {'
  + '  font-family:"Rubik",ui-sans-serif,system-ui,-apple-system,sans-serif!important;'
  + '  box-sizing: border-box;'
  + '}'
  + '.wrap{'
  + '  position:fixed; bottom:20px; right:20px; z-index:2147483000;'
  + '  direction:rtl;'
  + '  pointer-events:none;' 
  + '}'
  + '.wrap.ready{visibility:visible;opacity:1;}'

  /* Shared Card Styles (Glassmorphism Tweaked) */
  + '.card {'
  + '  position: relative;'
  + '  width: 340px; max-width: 90vw;'
  /* Changed transparency from 0.93 to 0.65 for real glass effect */
  + '  background: rgba(255, 255, 255, 0.85);' 
  + '  backdrop-filter: blur(20px) saturate(180%);'
  + '  -webkit-backdrop-filter: blur(20px) saturate(180%);'
  + '  border-radius: 16px;'
  + '  border: 1px solid rgba(255, 255, 255, 0.4);' /* More subtle border */
  + '  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0,0,0,0.02);'
  + '  overflow: hidden;'
  + '  pointer-events: auto;' 
  + '  transition: transform 0.3s ease;'
  + '}'
  + '.card:hover { transform: translateY(-5px); }'

  /* Animations */
  + '.enter { animation: slideInRight 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }'
  + '.leave { animation: slideOutRight 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }'
  + '@keyframes slideInRight { from { opacity: 0; transform: translateX(50px); } to { opacity: 1; transform: translateX(0); } }'
  + '@keyframes slideOutRight { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(50px); } }'

  /* Close Button */
  + '.xbtn {'
  + '  position: absolute; top: 6px; left: 6px; width: 16px; height: 16px;'
  + '  background: rgba(241, 245, 249, 0.8); border-radius: 50%; border: none;'
  + '  display: flex; align-items: center; justify-content: center;'
  + '  cursor: pointer; color: #64748b; font-size: 10px; z-index: 10;'
  + '  opacity: 0; transition: opacity 0.2s;'
  + '}'
  + '.card:hover .xbtn { opacity: 1; }'

  /* --- Review Widget Specifics --- */
  + '.review-card { padding: 16px; display: flex; flex-direction: column; gap: 8px; }'
  + '.review-header { display: flex; align-items: center; width: 100%; margin-bottom: 2px; }'
  + '.user-profile { display: flex; align-items: center; gap: 10px; }'
  + '.review-avatar { width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 2px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.1); background: #eef2f7; }'
  + '.avatar-fallback { display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;width:42px;height:42px;border-radius:50%;border:2px solid #fff; }'
  + '.reviewer-name { font-weight: 700; font-size: 15px; color: #1a1a1a; line-height: 1.2; }'
   
  /* Text & Read More */
  + '.review-text {'
  + '  font-size: 13px; line-height: 1.5; color: #374151; margin: 0;'
  + '  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;'
  + '  transition: all 0.3s ease;'
  + '}'
  + '.review-text.expanded { -webkit-line-clamp: unset; overflow: visible; }'
  + '.read-more-btn {'
  + '  font-size: 12px; color: #2563eb; font-weight: 700; cursor: pointer;'
  + '  background: transparent!important; border: none; padding: 5px 0; align-self: flex-start;'
  + '  outline: none!important;'
  + '}'
  + '.read-more-btn:hover { text-decoration: underline; }'

  /* Footer */
  + '.review-footer {'
  + '  display: flex; justify-content: space-between; align-items: center;'
  + '  border-top: 1px solid rgba(0,0,0,0.08); padding-top: 8px; margin-top: 4px;'
  + '}'
  + '.stars-wrapper { display: flex; align-items: center; gap: 8px; }'
  + '.stars { color: #d97706; font-size: 13px; letter-spacing: 1px; font-weight:bold; }'
  + '.google-icon { width: 16px; height: 16px; opacity: 1; display:block; }'
  + '.compact-badge {'
  + '  background: rgba(16, 185, 129, 0.15); color: #047857; padding: 4px 8px; border-radius: 6px;'
  + '  font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 4px;'
  + '}'

  /* --- Purchase Widget Specifics --- */
  + '.purchase-card { height: 100px; padding: 0; display: flex; flex-direction: row; gap: 0; }'
  + '.course-img-wrapper { width: 90px; height: 100%; flex-shrink: 0; position: relative; }'
  + '.course-img { width: 100%; height: 100%; object-fit: cover; display:block; }'
  + '.pimg-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #475569; font-weight: 700; background: #f1f5f9; }'
   
  + '.p-content {'
  + '  flex-grow: 1; padding: 12px 16px; display: flex; flex-direction: column;'
  + '  justify-content: center; gap: 2px; text-align: right; height: 100%;'
  + '}'
  + '.fomo-header { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #64748b; }'
  + '.fomo-name { font-weight: 700; color: #1e293b; font-size: 14px; }'
  + '.fomo-time { font-size: 11px; }'
  + '.fomo-body { font-size: 14px; color: #334155; line-height: 1.2; margin-bottom: 4px; }'
  + '.product-highlight { font-weight: 500; color: #2563eb; }'
   
  + '.fomo-footer-row { display: flex; justify-content: space-between; align-items: center; margin-top: 2px; }'
  + '.live-indicator { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #ef4444; font-weight: 600; }'
  + '.pulsing-dot { width: 8px; height: 8px; background-color: #ef4444; border-radius: 50%; position: relative; }'
  + '.pulsing-dot::after {'
  + '  content: ""; position: absolute; width: 100%; height: 100%; top: 0; left: 0;'
  + '  background-color: #ef4444; border-radius: 50%; animation: pulse 1.5s infinite; opacity: 0.6;'
  + '}'
  + '.verified-badge {'
  + '  font-size: 10px; color: #059669; background: rgba(16, 185, 129, 0.1);'
  + '  padding: 2px 8px; border-radius: 4px; font-weight: 500; display: flex; align-items: center; gap: 3px;'
  + '}'
  + '.timer-bar { position: absolute; bottom: 0; right: 0; height: 3px; background: linear-gradient(90deg, #2563eb, #9333ea); width: 100%; animation: timerShrink 5s linear forwards; }'
   
  + '@keyframes pulse { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(3); opacity: 0; } }'
  + '@keyframes timerShrink { from { width: 100%; } to { width: 0%; } }'
   
  /* Mobile sticky adjustments */
  + '@media (max-width:480px){'
  + '  .wrap.sticky-review { right:0; left:0; bottom:0; padding:0; width:100%; display:flex; justify-content:center; }'
  + '  .card { width: 100%; max-width: 100%; border-radius: 16px 16px 0 0; border-bottom: none; }'
  + '}'
  ;
  root.appendChild(style);

  /* wrapper */
  var wrap = document.createElement("div");
  wrap.className = "wrap";
  root.appendChild(wrap);

  /* ---- helpers ---- */
  function firstLetter(s){ s=(s||"").trim(); return (s[0]||"?").toUpperCase(); }
  function colorFromString(s){ s=s||""; for(var h=0,i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return "hsl("+(h%360)+" 70% 45%)"; }
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

  /* Avatar helpers */
  function renderMonogram(name){ var d=document.createElement("div"); d.className="avatar-fallback"; d.textContent=firstLetter(name); d.style.background=colorFromString(name); return d; }
  function renderAvatarPreloaded(name, url){
    var shell = renderMonogram(name);
    if(url){
      var img = new Image(); img.decoding="async"; img.loading="eager";
      img.onload=function(){ var tag=document.createElement("img"); tag.className="review-avatar"; tag.alt=""; tag.src=url; shell.replaceWith(tag); };
      img.src=url;
    }
    return shell;
  }

  /* Image preloader */
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

  function normalizeArray(data, as){
    var arr=[];
    if(Array.isArray(data)) arr=data;
    else if(data&&typeof data==="object"){
      if(Array.isArray(data.reviews)) arr=data.reviews;
      else if(Array.isArray(data.purchases)) arr=data.purchases;
      else if(Array.isArray(data.items)) arr=data.items;
    }
    return arr.map(function(x){
      if(as==="review") return { kind:"review", data:{
        authorName: x.Header||x.authorName||x.name||"Anonymous",
        text: x.Content||x.text||"",
        rating: x.rating||5,
        profilePhotoUrl: x.Photo||x.reviewerPhotoUrl||""
      }};
      if(as==="purchase") return { kind:"purchase", data:{
        buyer: x.buyer||x.name||"לקוח/ה",
        product: x.product||"מוצר",
        image: x.image||x.productImage||"",
        purchased_at: x.purchased_at||new Date().toISOString()
      }};
    });
  }

  /* persistence - STATE MANAGEMENT UPDATED */
  var itemsSig = "0_0";
  function itemsSignature(arr){ return arr.length + "_" + (arr[0]?arr[0].kind:"x"); } 
  
  function saveState(idxShown, sig, opt){
    try {
      var st = { idx: idxShown, shownAt: Date.now(), sig: sig };
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

  /* ---- rotation ---- */
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

    var header = document.createElement("div"); header.className = "review-header";
    var profile = document.createElement("div"); profile.className = "user-profile";
    profile.appendChild(renderAvatarPreloaded(item.authorName, item.profilePhotoUrl));
    
    var name = document.createElement("span"); name.className = "reviewer-name"; 
    name.textContent = item.authorName;
    profile.appendChild(name);
    
    header.appendChild(profile);
    
    var badge = document.createElement("div"); badge.className="compact-badge";
    badge.innerHTML = '<svg width="10" height="10" fill="currentColor" viewBox="0 0 512 512"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg> מאומת EVID';
    
    var body = document.createElement("div"); 
    body.className = "review-text";
    body.textContent = item.text; 
    
    var readMoreBtn = document.createElement("button");
    readMoreBtn.className = "read-more-btn";
    readMoreBtn.textContent = "קרא עוד...";
    readMoreBtn.style.display = "none"; 

    setTimeout(function(){
      if (body.scrollHeight > body.clientHeight + 2) {
        readMoreBtn.style.display = "block";
      }
    }, 0);

    readMoreBtn.onclick = function(e){
      e.stopPropagation();
      var isExpanded = body.classList.toggle("expanded");
      readMoreBtn.textContent = isExpanded ? "סגור" : "קרא עוד...";
      if(isExpanded) pauseForReadMore(); else resumeFromReadMore();
    };

    var footer = document.createElement("div"); footer.className = "review-footer";
    var stars = document.createElement("div"); stars.className = "stars-wrapper";
    
    stars.innerHTML = '<svg class="google-icon" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>'
                    + '<div class="stars">★★★★★</div>';
    
    footer.appendChild(stars);
    footer.appendChild(badge); 

    card.appendChild(x);
    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(readMoreBtn);
    card.appendChild(footer);
    
    return card;
  }

  function renderPurchaseCard(p){
    var card = document.createElement("div"); 
    card.className = "card purchase-card enter";

    var x = document.createElement("button"); x.className="xbtn"; x.textContent="×";
    x.onclick = function(){ handleDismiss(); card.remove(); };
    card.appendChild(x);

    var imgWrap = document.createElement("div"); imgWrap.className = "course-img-wrapper";
    var img = document.createElement("img"); img.className = "course-img";
    img.src = p.image || ""; 
    img.onerror = function(){ this.style.display='none'; var fb=document.createElement('div'); fb.className='pimg-fallback'; fb.textContent='✓'; imgWrap.appendChild(fb); };
    imgWrap.appendChild(img);

    var content = document.createElement("div"); content.className = "p-content";
    
    var header = document.createElement("div"); header.className = "fomo-header";
    header.innerHTML = '<span class="fomo-name">' + escapeHTML(firstName(p.buyer)) + '</span>'
                     + '<span class="fomo-time">' + escapeHTML(timeAgo(p.purchased_at)) + '</span>';
    
    var body = document.createElement("div"); body.className = "fomo-body";
    body.innerHTML = 'רכש/ה <span class="product-highlight">' + escapeHTML(p.product) + '</span>';

    var footer = document.createElement("div"); footer.className = "fomo-footer-row";
    footer.innerHTML = '<div class="live-indicator"><div class="pulsing-dot"></div>מבוקש עכשיו</div>'
                     + '<div class="verified-badge"><span>✓</span> הרשמה מאומתת</div>';

    content.appendChild(header);
    content.appendChild(body);
    content.appendChild(footer);

    var timer = document.createElement("div"); timer.className = "timer-bar";
    timer.style.animationDuration = (SHOW_MS/1000) + 's';

    card.appendChild(imgWrap);
    card.appendChild(content);
    card.appendChild(timer);

    return card;
  }

  function showNext(){
    if(!items.length || isDismissed) return;
    clearShowTimers();
    isPausedForReadMore = false;

    var itm = items[idx % items.length];
    
    // Save state explicitly every time we show a card
    saveState(idx % items.length, itemsSig);
    
    idx++;

    if (itm.kind === "review") wrap.classList.add('sticky-review'); 
    else wrap.classList.remove('sticky-review');

    warmForItem(itm).then(function(){
      if(isDismissed) return;
      var card = (itm.kind==="purchase") ? renderPurchaseCard(itm.data) : renderReviewCard(itm.data);
      wrap.innerHTML=""; 
      wrap.appendChild(card);
      currentCard = card;
      scheduleHide(SHOW_MS);
    });
  }

  function startFrom(delay){
    if(loop) clearInterval(loop);
    if(preTimer) clearTimeout(preTimer);
    if(isDismissed) return;

    var cycle = SHOW_MS + GAP_MS;
    function begin(){
      if(isDismissed) return;
      showNext();
      loop = setInterval(showNext, cycle);
    }
    if (delay > 0) preTimer = setTimeout(begin, delay);
    else begin();
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
    var p1 = REVIEWS_EP ? fetchJSON(REVIEWS_EP).then(function(d){ return normalizeArray(d,"review"); }) : Promise.resolve([]);
    var p2 = PURCHASES_EP ? fetchJSON(PURCHASES_EP).then(function(d){ return normalizeArray(d,"purchase"); }) : Promise.resolve([]);

    Promise.all([p1,p2]).then(function(r){
      var rev = r[0]||[], pur = r[1]||[];
      rev = rev.filter(function(v){ return normalizeSpaces(v.data.text).length > 0; });
      
      items = interleave(rev, pur);
      itemsSig = itemsSignature(items);

      if(!items.length) return;

      ensureFontInHead().then(function(){
        wrap.classList.add('ready');
        var state = restoreState();
        var now = Date.now();

        // Resume Logic
        if (state && state.sig === itemsSig) {
          if (state.manualClose && state.snoozeUntil > now) {
             // Still snoozed
             setTimeout(function(){ isDismissed=false; idx=state.idx+1; startFrom(0); }, state.snoozeUntil - now);
          } else if (!state.manualClose) {
             // Resume from next item immediately (No Delay)
             idx = state.idx + 1;
             startFrom(0); 
          } else {
             // Snooze expired, start fresh
             startFrom(INIT_MS);
          }
        } else {
          // First time visitor
          if (INIT_MS > 0) setTimeout(function(){ startFrom(0); }, INIT_MS);
          else startFrom(0);
        }
      });
    });
  }

  loadAll();
})();
