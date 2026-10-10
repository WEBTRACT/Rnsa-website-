/* RNSA public site: menu, next-event countdown, merch, cart, gallery */
(function () {
  "use strict";

  var cfg = window.RNSA_CONFIG || {};
  var configured = /^https:\/\//.test(cfg.SUPABASE_URL || "") && !/PASTE/.test(cfg.SUPABASE_ANON_KEY || "PASTE");
  var sb = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  // Sample content shown only until Supabase is connected
  var DEMO = {
    events: [{ title: "RNSA Night Run", description: "Get ready for another night of cars, speed, sound and the RNSA community.", event_date: "2026-11-14T19:00:00+02:00", location: "Durban, South Africa" }],
    products: [
      { id: "d1", name: "RNSA Classic Tee", description: "Black tee with the red RNSA print.", price: 250, image_url: "images/rnsa-logo.webp", variants: [{ id: "d1a", colour: "Black", size: "M", stock: 10 }, { id: "d1b", colour: "Black", size: "L", stock: 10 }] },
      { id: "d2", name: "RNSA Cap", description: "Adjustable cap, black and red.", price: 180, image_url: "images/rnsa-logo-splash.webp", variants: [{ id: "d2a", colour: "Black", size: "One size", stock: 15 }] }
    ],
    gallery: []
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function money(n) { return "R" + Number(n).toLocaleString("en-ZA", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); }
  function pad(n) { return String(n).padStart(2, "0"); }
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("show"); }, 2200); }

  /* ---------- Mobile menu ---------- */
  var menuBtn = $("menuBtn"), menu = $("menu");
  menuBtn.addEventListener("click", function () {
    var open = menu.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", open);
  });
  menu.addEventListener("click", function (e) { if (e.target.tagName === "A") { menu.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); } });

  /* ---------- Load data ---------- */
  async function loadData() {
    if (!sb) return DEMO;
    var out = { events: [], products: [], gallery: [] };
    try {
      var ev = await sb.from("events").select("*").gte("event_date", new Date().toISOString()).order("event_date", { ascending: true }).limit(1);
      var pr = await sb.from("products").select("*, variants:product_variants(*)").order("created_at", { ascending: false });
      var ga = await sb.from("gallery").select("*").order("created_at", { ascending: false });
      out.events = ev.data || []; out.products = pr.data || []; out.gallery = ga.data || [];
    } catch (e) { console.error(e); }
    return out;
  }

  /* ---------- Next event + countdown ---------- */
  var timer = null;
  function showEvent(ev) {
    clearInterval(timer);
    if (!ev) {
      $("evTitle").textContent = "Next event coming soon";
      $("evDesc").textContent = "Join the WhatsApp community to be the first to know.";
      $("evDate").textContent = "TBA"; $("evLocation").textContent = "TBA"; $("evTime").textContent = "TBA";
      $("countdownWrap").hidden = true;
      return;
    }
    var d = new Date(ev.event_date);
    var tz = { timeZone: "Africa/Johannesburg" };
    $("evTitle").textContent = ev.title;
    $("evDesc").textContent = ev.description || "";
    $("evDate").textContent = d.toLocaleDateString("en-ZA", Object.assign({ day: "numeric", month: "long", year: "numeric" }, tz)).toUpperCase();
    $("evTime").textContent = d.toLocaleTimeString("en-ZA", Object.assign({ hour: "2-digit", minute: "2-digit", hour12: false }, tz));
    $("evLocation").textContent = (ev.location || "TBA").toUpperCase();
    $("countdownWrap").hidden = false;

    function tick() {
      var left = d - new Date();
      if (left <= 0) { clearInterval(timer); $("cdDays").textContent = $("cdHours").textContent = $("cdMins").textContent = $("cdSecs").textContent = "00"; return; }
      $("cdDays").textContent = pad(Math.floor(left / 864e5));
      $("cdHours").textContent = pad(Math.floor(left / 36e5) % 24);
      $("cdMins").textContent = pad(Math.floor(left / 6e4) % 60);
      var sEl = $("cdSecs"); sEl.textContent = pad(Math.floor(left / 1e3) % 60);
      sEl.classList.remove("tick"); void sEl.offsetWidth; sEl.classList.add("tick");
    }
    tick(); timer = setInterval(tick, 1000);
  }

  /* ---------- Merch ---------- */
  function renderProducts(list) {
    var grid = $("productGrid");
    if (!list.length) { grid.innerHTML = '<p class="muted">New RNSA merch is coming soon.</p>'; return; }
    grid.innerHTML = list.map(function (p) {
      var vs = (p.variants || []).filter(function (v) { return v.stock > 0; });
      var img = p.image_url || "images/rnsa-logo.webp";
      var opts = vs.map(function (v) { return '<option value="' + esc(v.id) + '">' + esc(v.colour) + " - " + esc(v.size) + "</option>"; }).join("");
      return '<article class="product" data-id="' + esc(p.id) + '">' +
        '<img src="' + esc(img) + '" alt="' + esc(p.name) + ' - RNSA merch" loading="lazy" width="400" height="400">' +
        '<div class="body"><h3>' + esc(p.name) + "</h3>" +
        '<p class="desc">' + esc(p.description || "") + "</p>" +
        '<div class="price">' + money(p.price) + "</div>" +
        (vs.length ? '<select aria-label="Choose colour and size for ' + esc(p.name) + '">' + opts + '</select><button class="btn btn-red add" type="button">Add to cart</button>'
                   : '<button class="btn btn-outline" type="button" disabled>Sold out</button>') +
        "</div></article>";
    }).join("");

    grid.querySelectorAll(".add").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var card = btn.closest(".product");
        var p = list.find(function (x) { return String(x.id) === card.dataset.id; });
        var vid = card.querySelector("select").value;
        var v = p.variants.find(function (x) { return String(x.id) === vid; });
        addToCart(p, v);
      });
    });
  }

  /* ---------- Cart (saved on the visitor's phone only) ---------- */
  var cart = [];
  try { cart = JSON.parse(localStorage.getItem("rnsa-cart") || "[]"); if (!Array.isArray(cart)) cart = []; } catch (e) { cart = []; }
  function saveCart() { try { localStorage.setItem("rnsa-cart", JSON.stringify(cart)); } catch (e) { /* ignore */ } }

  function addToCart(p, v) {
    var line = cart.find(function (i) { return i.variantId === v.id; });
    if (line) { if (line.qty < v.stock) line.qty++; else { toast("No more stock for that size"); return; } }
    else cart.push({ variantId: v.id, name: p.name, label: v.colour + " - " + v.size, price: Number(p.price), qty: 1, stock: v.stock, image: p.image_url || "images/rnsa-logo.webp" });
    saveCart(); renderCart(); toast("Added to cart");
  }

  function renderCart() {
    var list = $("cartList"), count = cart.reduce(function (n, i) { return n + i.qty; }, 0);
    $("cartCount").textContent = count;
    $("cartEmpty").hidden = cart.length > 0;
    list.hidden = cart.length === 0;
    updateCheckout();
    var total = cart.reduce(function (n, i) { return n + i.price * i.qty; }, 0);
    $("cartTotal").textContent = money(total);
    list.innerHTML = cart.map(function (i, idx) {
      return '<li><img src="' + esc(i.image) + '" alt="' + esc(i.name) + '" width="60" height="60"><div><strong>' + esc(i.name) + "</strong><small>" + esc(i.label) + " · " + money(i.price) + '</small>' +
        '<div class="qty"><button type="button" data-a="minus" data-i="' + idx + '" aria-label="Less">−</button><span>' + i.qty + '</span><button type="button" data-a="plus" data-i="' + idx + '" aria-label="More">+</button><button type="button" class="rm" data-a="rm" data-i="' + idx + '">Remove</button></div></div>' +
        "<strong>" + money(i.price * i.qty) + "</strong></li>";
    }).join("");
  }

  $("cartList").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-a]"); if (!b) return;
    var i = Number(b.dataset.i), a = b.dataset.a, line = cart[i]; if (!line) return;
    if (a === "plus") { if (line.qty < line.stock) line.qty++; else toast("No more stock for that size"); }
    if (a === "minus") { line.qty--; if (line.qty <= 0) cart.splice(i, 1); }
    if (a === "rm") cart.splice(i, 1);
    saveCart(); renderCart();
  });

  // Checkout is a normal link so phones and browsers always open WhatsApp
  function updateCheckout() {
    var btn = $("checkoutBtn");
    if (!cart.length) { btn.setAttribute("href", "#cart"); btn.setAttribute("aria-disabled", "true"); return; }
    var lines = cart.map(function (i) { return "- " + i.qty + " x " + i.name + " (" + i.label + ") = " + money(i.price * i.qty); });
    var total = cart.reduce(function (n, i) { return n + i.price * i.qty; }, 0);
    var msg = "Hi RNSA! I'd like to order:\n" + lines.join("\n") + "\n\nTotal: " + money(total) + "\n\nPlease let me know how to pay and collect/deliver.";
    btn.setAttribute("href", "https://wa.me/" + cfg.WHATSAPP_NUMBER + "?text=" + encodeURIComponent(msg));
    btn.removeAttribute("aria-disabled");
  }
  $("checkoutBtn").addEventListener("click", function (e) { if (this.getAttribute("aria-disabled") === "true") { e.preventDefault(); toast("Add an item to your cart first"); } });

  /* ---------- Gallery ---------- */
  function renderGallery(list) {
    var grid = $("galleryGrid");
    if (!list.length) { grid.innerHTML = '<p class="muted">Photos from RNSA events are coming soon.</p>'; return; }
    grid.innerHTML = list.map(function (g, i) {
      var alt = g.caption || "RNSA event photo " + (i + 1);
      return '<button type="button" data-src="' + esc(g.image_url) + '" data-alt="' + esc(alt) + '" aria-label="Open photo: ' + esc(alt) + '"><img src="' + esc(g.image_url) + '" alt="' + esc(alt) + '" loading="lazy" width="300" height="300">' + (g.caption ? '<span class="cap">' + esc(g.caption) + "</span>" : "") + "</button>";
    }).join("");
  }
  $("galleryGrid").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-src]"); if (!b) return;
    $("lbImg").src = b.dataset.src; $("lbImg").alt = b.dataset.alt; $("lightbox").hidden = false;
  });
  function closeLb() { $("lightbox").hidden = true; $("lbImg").src = ""; }
  $("lbClose").addEventListener("click", closeLb);
  $("lightbox").addEventListener("click", function (e) { if (e.target.id === "lightbox") closeLb(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeLb(); });

  /* ---------- Scroll reveal + progress bar + active menu ---------- */
  var revealReady = false;
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { var t = e.target; t.classList.add("in"); io.unobserve(t); setTimeout(function () { t.style.transitionDelay = ""; }, 1300); } });
  }, { threshold: 0.1 }) : null;

  function initReveal() {
    document.querySelectorAll(".hero-text > *, .hero-art, .section .container > *, .product, .pillar, .event-info li, .gallery button, .contact-info li").forEach(function (el, i) {
      if (el.dataset.r) return;
      el.dataset.r = "1"; el.classList.add("reveal");
      el.style.transitionDelay = (i % 5) * 70 + "ms";
      if (io) io.observe(el); else el.classList.add("in");
    });
  }
  function startReveal() { revealReady = true; initReveal(); }

  var navEl = document.querySelector(".nav"), prog = $("progress");
  var secs = document.querySelectorAll("main section[id]"), navLinks = menu.querySelectorAll('a[href^="#"]');
  function onScroll() {
    var y = window.scrollY, h = document.documentElement.scrollHeight - window.innerHeight;
    prog.style.width = (h > 0 ? (y / h) * 100 : 0) + "%";
    navEl.classList.toggle("scrolled", y > 30);
    var cur = "";
    secs.forEach(function (s) { if (s.getBoundingClientRect().top <= 140) cur = "#" + s.id; });
    navLinks.forEach(function (l) { l.classList.toggle("active", l.getAttribute("href") === cur); });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Intro animation (once per visit) ---------- */
  var introEl = $("intro"), introOn = document.documentElement.classList.contains("intro-on");
  function finishIntro() {
    if (!introEl || introEl.classList.contains("done")) return;
    introEl.classList.add("done");
    try { sessionStorage.setItem("rnsa-intro", "1"); } catch (e) { /* ignore */ }
    startReveal();
    setTimeout(function () { document.documentElement.classList.remove("intro-on"); introEl.remove(); }, 1300);
  }
  if (introOn && introEl) {
    var counter = $("inCount"), t0 = performance.now(), dur = 2000;
    (function step(now) {
      if (introEl.classList.contains("done")) return;
      var p = Math.min(1, (now - t0) / dur);
      counter.textContent = String(Math.round(p * 100)).padStart(3, "0");
      if (p < 1) requestAnimationFrame(step); else setTimeout(finishIntro, 450);
    })(t0);
    introEl.addEventListener("click", finishIntro);
    setTimeout(finishIntro, 5000); // safety: never get stuck
  } else {
    if (introEl) introEl.remove();
    startReveal();
  }

  /* ---------- Start ---------- */
  renderCart();
  loadData().then(function (d) {
    showEvent(d.events[0]);
    renderProducts(d.products);
    renderGallery(d.gallery);
    if (revealReady) initReveal();
  });
})();
