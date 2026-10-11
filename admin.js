/* RNSA admin dashboard. Security is enforced by Supabase rules (only the admin email can write). */
(function () {
  "use strict";

  var cfg = window.RNSA_CONFIG || {};
  var configured = /^https:\/\//.test(cfg.SUPABASE_URL || "") && !/PASTE/.test(cfg.SUPABASE_ANON_KEY || "PASTE");
  var sb = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function say(el, text, ok) { el.innerHTML = '<div class="msg ' + (ok ? "ok" : "err") + '">' + esc(text) + "</div>"; if (ok) setTimeout(function () { el.innerHTML = ""; }, 3000); }

  if (!sb) { $("setupMsg").hidden = false; $("loginBtn").disabled = true; return; }

  /* ---------- Login ---------- */
  function isAdminUser(user) { return user && user.email && user.email.toLowerCase() === String(cfg.ADMIN_EMAIL).toLowerCase(); }

  async function showDash(session) {
    var ok = session && isAdminUser(session.user);
    $("loginPanel").hidden = !!ok; $("dash").hidden = !ok; $("logoutBtn").hidden = !ok;
    if (session && !ok) { await sb.auth.signOut(); say($("loginMsg"), "This account is not the RNSA admin.", false); return; }
    if (ok) refreshAll();
  }

  $("loginBtn").addEventListener("click", async function () {
    var email = $("email").value.trim(), pass = $("password").value;
    if (!/^\S+@\S+\.\S+$/.test(email) || !pass) { say($("loginMsg"), "Enter a valid email and your password.", false); return; }
    $("loginBtn").disabled = true;
    var r = await sb.auth.signInWithPassword({ email: email, password: pass });
    $("loginBtn").disabled = false; $("password").value = "";
    if (r.error) { say($("loginMsg"), "Login failed: " + r.error.message, false); return; }
    showDash(r.data.session);
  });
  $("logoutBtn").addEventListener("click", async function () { await sb.auth.signOut(); location.reload(); });
  sb.auth.getSession().then(function (r) { showDash(r.data.session); });

  /* ---------- Picture helper: shrink then upload ---------- */
  async function shrink(file, maxSide) {
    var bmp = await createImageBitmap(file);
    var scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    var c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise(function (res) { c.toBlob(res, "image/jpeg", 0.82); });
  }
  async function uploadImage(file, folder) {
    var blob = await shrink(file, 1600);
    var path = folder + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
    var up = await sb.storage.from(cfg.BUCKET).upload(path, blob, { contentType: "image/jpeg" });
    if (up.error) throw up.error;
    return { path: path, url: sb.storage.from(cfg.BUCKET).getPublicUrl(path).data.publicUrl };
  }
  async function removeImage(path) { if (path) await sb.storage.from(cfg.BUCKET).remove([path]); }

  /* ---------- EVENTS ---------- */
  async function loadEvents() {
    var r = await sb.from("events").select("*").order("event_date", { ascending: true });
    var rows = r.data || []; $("stEvents").textContent = rows.length;
    $("eventList").innerHTML = rows.length ? rows.map(function (e) {
      var when = new Date(e.event_date).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium", timeStyle: "short" });
      return '<div class="row-item"><div class="grow"><strong>' + esc(e.title) + "</strong><br><small class='muted'>" + esc(when) + " · " + esc(e.location || "") + '</small></div><button class="btn btn-outline small" data-del-event="' + esc(e.id) + '" type="button">Delete</button></div>';
    }).join("") : '<p class="muted">No events yet.</p>';
  }
  $("addEventBtn").addEventListener("click", async function () {
    var title = $("evTitleIn").value.trim(), date = $("evDateIn").value;
    if (!title || !date) { say($("globalMsg"), "Event name and date are required.", false); return; }
    var r = await sb.from("events").insert({ title: title, description: $("evDescIn").value.trim(), event_date: new Date(date).toISOString(), location: $("evLocIn").value.trim() });
    if (r.error) { say($("globalMsg"), "Could not save the event: " + r.error.message, false); return; }
    $("evTitleIn").value = $("evDescIn").value = $("evDateIn").value = $("evLocIn").value = "";
    say($("globalMsg"), "Event added.", true); loadEvents();
  });
  $("eventList").addEventListener("click", async function (e) {
    var id = e.target.getAttribute("data-del-event"); if (!id || !confirm("Delete this event?")) return;
    var r = await sb.from("events").delete().eq("id", id);
    if (r.error) say($("globalMsg"), r.error.message, false); else loadEvents();
  });

  /* ---------- GALLERY ---------- */
  async function loadGallery() {
    var r = await sb.from("gallery").select("*").order("created_at", { ascending: false });
    var rows = r.data || []; $("stPhotos").textContent = rows.length;
    $("galList").innerHTML = rows.length ? rows.map(function (g) {
      return '<div><img src="' + esc(g.image_url) + '" alt="' + esc(g.caption || "RNSA photo") + '" loading="lazy"><button class="btn btn-red small" data-del-photo="' + esc(g.id) + '" data-path="' + esc(g.image_path || "") + '" type="button" aria-label="Delete photo">×</button></div>';
    }).join("") : '<p class="muted">No pictures yet.</p>';
  }
  $("addPhotoBtn").addEventListener("click", async function () {
    var files = Array.prototype.slice.call($("galFiles").files);
    if (!files.length) { say($("globalMsg"), "Pick at least one photo first.", false); return; }
    var btn = $("addPhotoBtn"); btn.disabled = true;
    try {
      for (var i = 0; i < files.length; i++) {
        btn.textContent = "Uploading " + (i + 1) + " of " + files.length + "...";
        var up = await uploadImage(files[i], "gallery");
        var r = await sb.from("gallery").insert({ image_url: up.url, image_path: up.path, caption: $("galCaption").value.trim() });
        if (r.error) throw r.error;
      }
      $("galFiles").value = ""; $("galCaption").value = "";
      say($("globalMsg"), "Pictures added.", true); loadGallery();
    } catch (err) { say($("globalMsg"), "Upload failed: " + err.message, false); }
    btn.disabled = false; btn.textContent = "+ Add pictures";
  });
  $("galList").addEventListener("click", async function (e) {
    var b = e.target.closest("[data-del-photo]"); if (!b || !confirm("Delete this picture?")) return;
    await removeImage(b.getAttribute("data-path"));
    var r = await sb.from("gallery").delete().eq("id", b.getAttribute("data-del-photo"));
    if (r.error) say($("globalMsg"), r.error.message, false); else loadGallery();
  });

  /* ---------- PRODUCTS ---------- */
  async function loadProducts() {
    var r = await sb.from("products").select("*, variants:product_variants(*)").order("created_at", { ascending: false });
    var rows = r.data || []; $("stProducts").textContent = rows.length;
    $("productList").innerHTML = rows.length ? rows.map(function (p) {
      var vs = (p.variants || []).map(function (v) {
        return '<div class="row-item"><span class="grow">' + esc(v.colour) + " · " + esc(v.size) + " · stock: " + Number(v.stock) + '</span><button class="btn btn-outline small" data-del-var="' + esc(v.id) + '" type="button">Remove</button></div>';
      }).join("");
      return '<div class="panel" style="background:#000"><div class="row-item" style="border:0;padding-top:0">' +
        (p.image_url ? '<img src="' + esc(p.image_url) + '" alt="' + esc(p.name) + '">' : "") +
        '<div class="grow"><strong>' + esc(p.name) + "</strong><br><small class='muted'>R" + Number(p.price) + '</small></div>' +
        '<button class="btn btn-outline small" data-del-prod="' + esc(p.id) + '" data-path="' + esc(p.image_path || "") + '" type="button">Delete product</button></div>' +
        vs +
        '<div class="sizebox" data-prod="' + esc(p.id) + '" data-have="' + esc((p.variants || []).map(function (v) { return (v.colour + "|" + v.size).toLowerCase(); }).join(";")) + '">' +
        '<p class="opt-label">Add sizes</p>' +
        '<div class="form" style="grid-template-columns:1fr 110px;align-items:end"><label>Colour<input class="vc" maxlength="30" placeholder="Black"></label><label>Stock each<input class="vk" type="number" min="0" value="10" inputmode="numeric"></label></div>' +
        '<div class="chips pick">' + ["XS", "S", "M", "L", "XL", "XXL"].map(function (z) { return '<label class="chip-check"><input type="checkbox" value="' + z + '" checked><span>' + z + "</span></label>"; }).join("") + "</div>" +
        '<div class="form" style="grid-template-columns:1fr;margin-bottom:0"><label>Other size (optional, e.g. 3XL or Kids 10)<input class="vo" maxlength="20" placeholder=""></label></div>' +
        '<button class="btn btn-red small" data-add-sizes type="button">Add sizes</button></div></div>';
    }).join("") : '<p class="muted">No products yet.</p>';
  }
  $("addProductBtn").addEventListener("click", async function () {
    var name = $("pName").value.trim(), price = parseFloat($("pPrice").value);
    if (!name || isNaN(price) || price < 0) { say($("globalMsg"), "Product name and a valid price are required.", false); return; }
    var btn = $("addProductBtn"); btn.disabled = true;
    try {
      var img = null, f = $("pImage").files[0];
      if (f) img = await uploadImage(f, "products");
      var r = await sb.from("products").insert({ name: name, description: $("pDesc").value.trim(), price: price, image_url: img && img.url, image_path: img && img.path });
      if (r.error) throw r.error;
      $("pName").value = $("pDesc").value = $("pPrice").value = ""; $("pImage").value = "";
      say($("globalMsg"), "Product added. Now add its colours and sizes below.", true); loadProducts();
    } catch (err) { say($("globalMsg"), "Could not save product: " + err.message, false); }
    btn.disabled = false;
  });
  $("productList").addEventListener("click", async function (e) {
    var t = e.target;
    if (t.hasAttribute("data-add-sizes")) {
      var box = t.closest("[data-prod]"), colour = box.querySelector(".vc").value.trim(), stock = parseInt(box.querySelector(".vk").value, 10);
      var sizes = Array.prototype.map.call(box.querySelectorAll(".pick input:checked"), function (c) { return c.value; });
      var other = box.querySelector(".vo").value.trim(); if (other) sizes.push(other);
      if (!colour) { say($("globalMsg"), "Type the colour first (for example Black).", false); return; }
      if (!sizes.length) { say($("globalMsg"), "Tick at least one size.", false); return; }
      if (isNaN(stock) || stock < 0) { say($("globalMsg"), "Stock must be 0 or more.", false); return; }
      var have = (box.getAttribute("data-have") || "").split(";");
      var rowsNew = sizes.filter(function (z) { return have.indexOf((colour + "|" + z).toLowerCase()) < 0; }).map(function (z) { return { product_id: box.getAttribute("data-prod"), colour: colour, size: z, stock: stock }; });
      if (!rowsNew.length) { say($("globalMsg"), "Those sizes are already added for " + colour + ".", false); return; }
      t.disabled = true;
      var r = await sb.from("product_variants").insert(rowsNew);
      t.disabled = false;
      if (r.error) say($("globalMsg"), r.error.message, false); else { say($("globalMsg"), rowsNew.length + " size(s) added.", true); loadProducts(); }
    }
    if (t.hasAttribute("data-del-var")) {
      var r2 = await sb.from("product_variants").delete().eq("id", t.getAttribute("data-del-var"));
      if (r2.error) say($("globalMsg"), r2.error.message, false); else loadProducts();
    }
    if (t.hasAttribute("data-del-prod")) {
      if (!confirm("Delete this product and all its sizes?")) return;
      await removeImage(t.getAttribute("data-path"));
      var r3 = await sb.from("products").delete().eq("id", t.getAttribute("data-del-prod"));
      if (r3.error) say($("globalMsg"), r3.error.message, false); else loadProducts();
    }
  });

  function refreshAll() { loadEvents(); loadGallery(); loadProducts(); }
})();
