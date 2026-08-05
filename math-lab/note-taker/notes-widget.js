/* Personal review tool — NOT shipped site code. Auto-injected by engine-core.js on
   localhost/127.0.0.1 or file:// only (see the guard at the bottom of engine-core.js) — it
   never appears for a real visitor. Click any element on the page to pin a note to it; every
   noted element keeps a small numbered pin on the page (not just a hidden list entry) so you
   can see at a glance what's flagged, on this visit or the next.

   Everything renders inside a Shadow DOM root, so the page's own CSS can never leak in or be
   affected by this widget touching the DOM.

   Notes are cached in localStorage AND, on every change, POSTed to serve.py's
   /math-lab/note-taker/save endpoint, which writes them straight to note-taker/notes.json +
   note-taker/notes.md on disk. serve.py serves the whole repo from its root, so that one
   absolute path resolves the same from a math-lab page, the top-level hub, and the canvas app.
   Over file:// (or if you're running the plain `python3 -m http.server` instead of serve.py)
   that POST just fails silently and you fall back to the "Copy all notes" button — everything
   else still works. Nothing is ever sent anywhere off this machine. */
(function () {
  "use strict";
  if (document.getElementById("__notesWidgetHost")) return;

  var STORE_KEY = "mathlab-page-notes";
  var SAVE_URL = "/math-lab/note-taker/save";

  /* ---------------------------- data layer ---------------------------- */

  function loadAll() {
    var data;
    try { data = JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); } catch (e) { data = {}; }
    for (var p in data) {
      data[p] = data[p].map(function (n) {
        return typeof n === "string" ? { text: n, target: null } : n;
      });
    }
    return data;
  }
  function saveAll() {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
    syncToServer();
  }
  function totalCount() {
    var n = 0;
    for (var k in data) n += data[k].length;
    return n;
  }
  function syncToServer() {
    if (!window.fetch) return;
    fetch(SAVE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then(function (r) { setSyncStatus(r.ok ? "ok" : "error"); })
      .catch(function () { setSyncStatus("offline"); });
  }
  function setSyncStatus(state) {
    var el = sr.getElementById("nwSync");
    if (!el) return;
    var text = el.querySelector(".statusText");
    if (state === "ok") { text.textContent = "Saved to a file on your computer"; el.className = "status ok"; }
    else if (state === "offline") { text.textContent = "Only saved in this browser (start note-taker/serve.py to save to a file)"; el.className = "status warn"; }
    else { text.textContent = "Could not save — check the server is running"; el.className = "status bad"; }
  }

  /* target descriptor: `selector` is a real re-findable CSS path (used to place pins on
     reload); `label`/`snippet` are for display/export only. */
  function buildSelector(el) {
    if (el.id) return "#" + CSS.escape(el.id);
    var parts = [], node = el;
    while (node && node.nodeType === 1 && node !== document.body && node !== document.documentElement) {
      var part = node.tagName.toLowerCase();
      if (node.id) { parts.unshift(part + "#" + CSS.escape(node.id)); break; }
      var parent = node.parentElement;
      if (parent) {
        var sibs = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === node.tagName; });
        if (sibs.length > 1) part += ":nth-of-type(" + (sibs.indexOf(node) + 1) + ")";
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(" > ");
  }
  function describe(el) {
    var tag = el.tagName.toLowerCase();
    var id = el.id || null;
    var cls = (el.className && typeof el.className === "string") ? el.className.trim().split(/\s+/).filter(Boolean) : [];
    var text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
    var label = tag + (id ? "#" + id : cls.length ? "." + cls.slice(0, 2).join(".") : "");
    return { label: label, tag: tag, id: id, classes: cls, snippet: text, selector: buildSelector(el) };
  }
  function resolveEl(target) {
    var sel = target && (target.selector || (target.id ? "#" + CSS.escape(target.id) : null));
    if (!sel) return null;
    try { return document.querySelector(sel); } catch (e) { return null; }
  }
  function formatDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  function toggleStatus(note) {
    if (note.status === "done") { note.status = "open"; note.resolvedAt = null; }
    else { note.status = "done"; note.resolvedAt = new Date().toISOString(); }
    saveAll();
  }

  var path = location.pathname;
  var data = loadAll();
  if (!data[path]) data[path] = [];

  /* ---------------------------- shell (shadow dom) ---------------------------- */

  var ICON = {
    close: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };

  var CSS_TEXT = [
    ':host{all:initial;}',
    '*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
    ':host, .dock, .pins, .hl {',
    '  --bg:#15181b; --surface:#1c2024; --surface-2:#23282d; --border:#31373d;',
    '  --text:#eef0f1; --text-dim:#9aa3ab; --accent:#5c939f; --accent-strong:#7cb0bb;',
    '  --cta:#ed6d40; --ok:#59a993; --warn:#c99a3c; --bad:#e0552f;',
    '  --radius:8px; --radius-sm:5px;',
    '  --shadow:0 16px 36px rgba(0,0,0,.45), 0 4px 12px rgba(0,0,0,.3);',
    '  --ease:cubic-bezier(.2,.7,.3,1);',
    '}',
    /* -- dock & toggle -- */
    '.dock{position:fixed;bottom:16px;right:16px;pointer-events:auto;display:flex;flex-direction:column;align-items:flex-end;font-size:13.5px;color:var(--text);line-height:1.45;}',
    '.toggle{background:var(--accent);color:#08151a;border:none;border-radius:10px;',
    '  padding:11px 20px;cursor:pointer;font-weight:700;font-size:13px;letter-spacing:.02em;',
    '  box-shadow:var(--shadow);transition:transform .12s var(--ease),background .12s;}',
    '.toggle:hover{background:var(--accent-strong);transform:translateY(-1px);}',
    '.toggle:active{transform:translateY(0);}',
    /* -- panel shell -- */
    '.panel{width:340px;max-height:min(74vh,600px);overflow-y:auto;background:var(--bg);',
    '  border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);',
    '  padding:18px;margin-bottom:10px;transform-origin:bottom right;',
    '  animation:nw-in .16s var(--ease);}',
    '@keyframes nw-in{from{opacity:0;transform:scale(.97) translateY(4px);}to{opacity:1;transform:none;}}',
    '.panel-head{margin-bottom:16px;}',
    '.panel-title{font-size:15px;font-weight:700;margin-bottom:3px;}',
    '.path{font-size:11px;color:var(--text-dim);word-break:break-all;}',
    /* -- buttons: three unmistakably different kinds -- */
    '.btn{display:block;width:100%;text-align:center;border-radius:var(--radius);cursor:pointer;',
    '  font-size:13px;font-weight:600;line-height:1.3;transition:background .13s var(--ease),border-color .13s,opacity .13s,transform .1s;}',
    '.btn:active{transform:scale(.98);}',
    '.btn.small{width:auto;flex:1;}',
    '.btn.primary{background:var(--accent);color:#08151a;border:1.5px solid var(--accent);padding:12px 14px;}',
    '.btn.primary:hover{background:var(--accent-strong);border-color:var(--accent-strong);}',
    '.btn.primary.active{background:var(--cta);border-color:var(--cta);color:#1a0b04;}',
    '.btn.secondary{background:transparent;color:var(--text);border:1.5px solid var(--border);padding:10.5px 14px;}',
    '.btn.secondary:hover{border-color:var(--accent);color:var(--accent-strong);}',
    '.btn.secondary.full{margin-top:14px;}',
    '.btn.text{background:none;border:none;color:var(--text-dim);padding:6px 2px;font-weight:500;text-decoration:underline;text-decoration-color:transparent;}',
    '.btn.text:hover{text-decoration-color:currentColor;}',
    '.btn.text.danger{color:var(--bad);}',
    '.actions{display:flex;flex-direction:column;gap:8px;}',
    /* -- notes list: cards, clearly not buttons -- */
    '.section-label{font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;',
    '  color:var(--text-dim);margin:18px 0 8px;}',
    '.empty{font-size:12.5px;color:var(--text-dim);margin-top:16px;padding:14px;',
    '  background:var(--surface);border-radius:var(--radius);text-align:center;}',
    '.list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;}',
    '.item{background:var(--surface);border-radius:var(--radius);padding:10px 11px;}',
    '.item.done{opacity:.6;}',
    '.item-target{font-size:11px;color:var(--accent-strong);margin-bottom:4px;font-weight:600;}',
    '.item-row{display:flex;gap:8px;align-items:flex-start;}',
    '.item-text{flex:1;white-space:pre-wrap;line-height:1.45;font-size:13px;}',
    '.item.done .item-text{text-decoration:line-through;color:var(--text-dim);}',
    '.item-meta{display:flex;align-items:center;gap:6px;margin-top:6px;}',
    '.item-date{font-size:10.5px;color:var(--text-dim);white-space:nowrap;}',
    '.check-btn{background:none;border:1.5px solid var(--border);color:var(--text-dim);cursor:pointer;',
    '  width:20px;height:20px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;',
    '  font-size:11px;line-height:1;transition:all .12s var(--ease);padding:0;}',
    '.check-btn:hover{border-color:var(--ok);color:var(--ok);}',
    '.item.done .check-btn{background:var(--ok);border-color:var(--ok);color:#08151a;}',
    '.icon-btn{background:none;border:none;color:var(--text-dim);cursor:pointer;padding:3px;',
    '  border-radius:4px;display:flex;flex:none;transition:color .12s,background .12s;}',
    '.icon-btn:hover{color:var(--bad);background:rgba(224,85,47,.14);}',
    /* -- footer: status is text, not a control -- */
    '.panel-foot{border-top:1px solid var(--border);margin-top:16px;padding-top:14px;}',
    '.status{display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--text-dim);margin-bottom:12px;}',
    '.status .dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--text-dim);}',
    '.status.ok .dot{background:var(--ok);}.status.ok{color:var(--ok);}',
    '.status.warn .dot{background:var(--warn);}.status.warn{color:var(--warn);}',
    '.status.bad .dot{background:var(--bad);}.status.bad{color:var(--bad);}',
    /* -- write box / thread popover -- */
    '.row{display:flex;gap:8px;}',
    '.writebox{position:fixed;z-index:10;width:290px;background:var(--bg);color:var(--text);',
    '  border:1px solid var(--accent);border-radius:var(--radius);box-shadow:var(--shadow);',
    '  padding:13px;pointer-events:auto;animation:nw-in .14s var(--ease);}',
    '.writebox-target{font-size:11.5px;font-weight:600;color:var(--accent-strong);margin-bottom:8px;}',
    '.writebox textarea{width:100%;height:66px;background:var(--surface);color:var(--text);',
    '  border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:9px;resize:vertical;',
    '  font-size:13px;line-height:1.4;font-family:inherit;}',
    '.writebox textarea:focus{outline:none;border-color:var(--accent);}',
    '.writebox .row{margin-top:9px;}',
    '.thread-list{max-height:170px;overflow-y:auto;margin-bottom:9px;display:flex;flex-direction:column;gap:6px;}',
    '.thread-item{display:flex;gap:8px;align-items:flex-start;background:var(--surface);',
    '  border-radius:var(--radius-sm);padding:8px 9px;font-size:12.5px;}',
    '.thread-item span{flex:1;line-height:1.4;}',
    '.thread-item.done{opacity:.6;}',
    '.thread-item.done span{text-decoration:line-through;}',
    '.thread-item .check-btn{width:18px;height:18px;font-size:10px;}',
    /* -- persistent numbered pins on the page -- */
    '.pins{position:fixed;inset:0;pointer-events:none;}',
    '.pin{position:fixed;pointer-events:auto;width:20px;height:20px;border-radius:50%;',
    '  background:var(--accent);color:#08151a;font-size:11px;font-weight:800;',
    '  display:flex;align-items:center;justify-content:center;cursor:pointer;',
    '  box-shadow:0 2px 6px rgba(0,0,0,.4),0 0 0 2px var(--bg);',
    '  transition:transform .12s var(--ease);}',
    '.pin:hover{transform:scale(1.18);}',
    '.pin.multi{background:var(--cta);}',
    /* -- element highlight overlay while picking -- */
    '.hl{position:fixed;pointer-events:none;background:rgba(92,147,159,.18);',
    '  border:2px solid var(--accent);border-radius:3px;box-shadow:0 0 0 1px rgba(0,0,0,.4);}',
    '.hl-tip{position:absolute;left:0;background:#08151a;color:#eaf3f5;',
    '  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;',
    '  padding:3px 7px;border-radius:4px;white-space:nowrap;box-shadow:var(--shadow);}'
  ].join("\n");

  var host = document.createElement("div");
  host.id = "__notesWidgetHost";
  host.style.cssText = "all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
  document.body.appendChild(host);
  var sr = host.attachShadow({ mode: "open" });

  /* Keep typing inside the widget from reaching the host page's global key handlers.

     Shadow DOM hides our CSS, but it does NOT hide our events: when a keystroke from the note
     textarea crosses the shadow boundary, the browser RETARGETS it, so a document-level
     listener sees event.target as this host <div>, not the textarea. Any page that guards its
     shortcuts with the usual `target instanceof HTMLTextAreaElement` check therefore fails to
     recognise that you're typing, and swallows the keystroke.

     Concretely: on the canvas app, Excalidraw binds Space to hand/pan mode and calls
     preventDefault() on it, so every space typed into a note silently vanished. Stopping
     propagation at the shadow root fixes it for every host page, not just that one. Listeners
     bound inside the root (the textarea's own Escape / Cmd+Enter handling) run first and are
     unaffected; the element-picker's document-level Escape handler is untouched because
     nothing is focused in an input while picking. */
  ["keydown", "keyup", "keypress"].forEach(function (type) {
    sr.addEventListener(type, function (e) {
      var t = e.composedPath()[0];
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) {
        e.stopPropagation();
      }
    });
  });

  sr.innerHTML =
    '<style>' + CSS_TEXT + '</style>' +
    '<div class="pins" id="pins"></div>' +
    '<div class="hl" id="hl" hidden><div class="hl-tip" id="hlTip"></div></div>' +
    '<div class="dock">' +
    '  <div class="panel" id="panel" hidden>' +
    '    <div class="panel-head">' +
    '      <div class="panel-title">Notes for this page</div>' +
    '      <div class="path" id="path"></div>' +
    '    </div>' +
    '    <div class="actions">' +
    '      <button class="btn primary" id="pick">Click something on the page to note it</button>' +
    '      <button class="btn secondary" id="general">Write a note about this whole page</button>' +
    '    </div>' +
    '    <div class="section-label" id="notesLabel" hidden>Notes on this page</div>' +
    '    <div class="empty" id="empty">No notes on this page yet.</div>' +
    '    <ul class="list" id="list"></ul>' +
    '    <div class="panel-foot">' +
    '      <div class="status" id="nwSync"><span class="dot"></span><span class="statusText">Checking where notes are saved…</span></div>' +
    '      <button class="btn secondary full" id="export">Save to file &amp; clear browser (<span id="total">0</span>)</button>' +
    '      <button class="btn text danger" id="clear">Clear every note on every page</button>' +
    '    </div>' +
    '  </div>' +
    '  <button class="toggle" id="toggle">Notes</button>' +
    '</div>';

  var $ = function (id) { return sr.getElementById(id); };
  var panel = $("panel"), list = $("list"), totalEl = $("total"), pickBtn = $("pick");
  var pinsLayer = $("pins"), hl = $("hl"), hlTip = $("hlTip");
  var emptyEl = $("empty"), notesLabelEl = $("notesLabel");
  $("path").textContent = path;

  /* ---------------------------- persistent on-page pins ---------------------------- */

  var pinEls = {}; // selector -> {el: pinDiv, target}

  function notesByElement() {
    // group same-selector notes together so one element gets one pin, however many notes it has
    var groups = {}; // selector -> {target, indices:[i,...]}
    data[path].forEach(function (n, i) {
      if (!n.target) return;
      var sel = n.target.selector || (n.target.id ? "#" + n.target.id : null);
      if (!sel) return;
      if (!groups[sel]) groups[sel] = { target: n.target, indices: [] };
      groups[sel].indices.push(i);
    });
    return groups;
  }

  function layoutPins() {
    var groups = notesByElement();
    var seen = {};
    var order = 0;
    Object.keys(groups).forEach(function (sel) {
      seen[sel] = true;
      order++;
      var g = groups[sel];
      var el = resolveEl(g.target);
      var pin = pinEls[sel];
      if (!el) { if (pin) { pin.el.remove(); delete pinEls[sel]; } return; }
      if (!pin) {
        var div = document.createElement("div");
        div.className = "pin";
        div.addEventListener("click", function (ev) { ev.stopPropagation(); openThread(sel, g.target); });
        pinsLayer.appendChild(div);
        pin = pinEls[sel] = { el: div };
      }
      pin.el.textContent = order;
      pin.el.title = g.indices.length + (g.indices.length === 1 ? " note" : " notes");
      var r = el.getBoundingClientRect();
      pin.el.style.top = Math.max(2, r.top - 9) + "px";
      pin.el.style.left = Math.max(2, r.left - 9) + "px";
      pin.el.classList.toggle("multi", g.indices.length > 1);
    });
    Object.keys(pinEls).forEach(function (sel) {
      if (!seen[sel]) { pinEls[sel].el.remove(); delete pinEls[sel]; }
    });
  }
  var rafPending = false;
  function scheduleLayout() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () { rafPending = false; layoutPins(); });
  }
  window.addEventListener("scroll", scheduleLayout, true);
  window.addEventListener("resize", scheduleLayout);

  /* ---------------------------- panel list ---------------------------- */

  function render() {
    list.innerHTML = "";
    var pageNotes = data[path];
    emptyEl.hidden = pageNotes.length > 0;
    notesLabelEl.hidden = pageNotes.length === 0;
    var openCount = pageNotes.filter(function (n) { return n.status !== "done"; }).length;
    notesLabelEl.textContent = "Notes on this page (" + openCount + " open, " + (pageNotes.length - openCount) + " done)";
    pageNotes.forEach(function (note, i) {
      var li = document.createElement("li");
      li.className = "item" + (note.status === "done" ? " done" : "");
      if (note.target) {
        var tag = document.createElement("div");
        tag.className = "item-target";
        tag.textContent = "About: " + (note.target.snippet || note.target.label);
        li.appendChild(tag);
      }
      var row = document.createElement("div");
      row.className = "item-row";
      var check = document.createElement("button");
      check.className = "check-btn";
      check.textContent = note.status === "done" ? "✓" : "";
      check.setAttribute("aria-label", note.status === "done" ? "Mark as open" : "Mark as done");
      check.onclick = function () { toggleStatus(note); render(); };
      var span = document.createElement("span");
      span.className = "item-text";
      span.textContent = note.text;
      var del = document.createElement("button");
      del.className = "icon-btn";
      del.innerHTML = ICON.close;
      del.setAttribute("aria-label", "Delete note");
      del.onclick = function () { data[path].splice(i, 1); saveAll(); render(); layoutPins(); };
      row.appendChild(check);
      row.appendChild(span);
      row.appendChild(del);
      li.appendChild(row);
      var meta = document.createElement("div");
      meta.className = "item-meta";
      var dateText = note.status === "done" && note.resolvedAt
        ? "added " + formatDate(note.createdAt) + " · done " + formatDate(note.resolvedAt)
        : (note.createdAt ? "added " + formatDate(note.createdAt) : "");
      meta.innerHTML = '<span class="item-date">' + dateText + "</span>";
      li.appendChild(meta);
      list.appendChild(li);
    });
    totalEl.textContent = totalCount();
  }

  /* ---------------------------- write box (new note) ---------------------------- */

  function openWriteBox(target, anchorEl) {
    var box = document.createElement("div");
    box.className = "writebox";
    var r = anchorEl ? anchorEl.getBoundingClientRect() : null;
    if (r) {
      box.style.top = Math.max(8, Math.min(r.bottom + 10, window.innerHeight - 170)) + "px";
      box.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 300)) + "px";
    } else {
      box.style.top = "50%"; box.style.left = "50%"; box.style.transform = "translate(-50%,-50%)";
    }
    box.innerHTML =
      (target ? '<div class="writebox-target">About: ' + escapeHtml(target.snippet || target.label) + '</div>' : "") +
      '<textarea placeholder="What needs to change here?"></textarea>' +
      '<div class="row">' +
      '<button class="btn primary small" data-act="save">Save note</button>' +
      '<button class="btn secondary small" data-act="cancel">Cancel</button></div>';
    sr.appendChild(box);
    var ta = box.querySelector("textarea");
    ta.focus();
    function close() { box.remove(); }
    box.querySelector('[data-act="cancel"]').onclick = close;
    box.querySelector('[data-act="save"]').onclick = function () {
      var v = ta.value.trim();
      if (v) {
        data[path].push({ text: v, target: target || null, createdAt: new Date().toISOString(), status: "open" });
        saveAll(); render(); layoutPins();
      }
      close();
    };
    ta.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) box.querySelector('[data-act="save"]').click();
    });
  }
  function escapeHtml(s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------------------------- thread popover (existing pin, possibly several notes) ------- */

  function openThread(sel, target) {
    var existing = sr.querySelector(".thread");
    if (existing) existing.remove();
    var el = resolveEl(target);
    var box = document.createElement("div");
    box.className = "writebox thread";
    if (el) {
      var r = el.getBoundingClientRect();
      box.style.top = Math.max(8, Math.min(r.top, window.innerHeight - 220)) + "px";
      box.style.left = Math.max(8, Math.min(r.right + 10, window.innerWidth - 300)) + "px";
    } else {
      box.style.top = "50%"; box.style.left = "50%"; box.style.transform = "translate(-50%,-50%)";
    }
    function itemsHtml() {
      return data[path].map(function (n, i) {
        if (!n.target) return "";
        var s = n.target.selector || (n.target.id ? "#" + n.target.id : null);
        if (s !== sel) return "";
        var doneCls = n.status === "done" ? " done" : "";
        var dateText = n.createdAt ? formatDate(n.createdAt) : "";
        return '<div class="thread-item' + doneCls + '" data-i="' + i + '">' +
          '<button class="check-btn" data-check="' + i + '" aria-label="Toggle done">' + (n.status === "done" ? "✓" : "") + "</button>" +
          '<span>' + escapeHtml(n.text) + (dateText ? ' <span class="item-date">(' + dateText + ")</span>" : "") + "</span>" +
          '<button class="icon-btn" data-del="' + i + '">' + ICON.close + "</button>" +
          "</div>";
      }).join("");
    }
    box.innerHTML =
      '<div class="writebox-target">About: ' + escapeHtml(target.snippet || target.label) + '</div>' +
      '<div class="thread-list">' + itemsHtml() + '</div>' +
      '<textarea placeholder="Add another note about this…"></textarea>' +
      '<div class="row">' +
      '<button class="btn primary small" data-act="add">Add note</button>' +
      '<button class="btn secondary small" data-act="close">Close</button></div>';
    sr.appendChild(box);
    box.addEventListener("click", function (e) {
      var delI = e.target.closest && e.target.closest("[data-del]");
      var checkI = e.target.closest && e.target.closest("[data-check]");
      if (delI) {
        var i = parseInt(delI.getAttribute("data-del"), 10);
        data[path].splice(i, 1);
        saveAll(); render(); layoutPins();
        box.remove();
        if (data[path].some(function (n) { return n.target && (n.target.selector || ("#" + n.target.id)) === sel; })) openThread(sel, target);
      } else if (checkI) {
        var ci = parseInt(checkI.getAttribute("data-check"), 10);
        toggleStatus(data[path][ci]);
        render();
        box.remove();
        openThread(sel, target);
      }
    });
    box.querySelector('[data-act="close"]').onclick = function () { box.remove(); };
    var ta = box.querySelector("textarea");
    box.querySelector('[data-act="add"]').onclick = function () {
      var v = ta.value.trim();
      if (v) {
        data[path].push({ text: v, target: target, createdAt: new Date().toISOString(), status: "open" });
        saveAll(); render(); layoutPins(); ta.value = ""; box.remove(); openThread(sel, target);
      }
    };
  }

  /* ---------------------------- element picker ---------------------------- */

  var picking = false, hoverEl = null;
  function positionHl(el) {
    var r = el.getBoundingClientRect();
    hl.style.top = r.top + "px"; hl.style.left = r.left + "px";
    hl.style.width = r.width + "px"; hl.style.height = r.height + "px";
    var d = describe(el);
    hlTip.textContent = d.label + "  " + Math.round(r.width) + "×" + Math.round(r.height);
    var tipAbove = r.top > 26;
    hlTip.style.top = tipAbove ? "-22px" : (r.height + 4) + "px";
  }
  function onHover(e) {
    if (host.contains(e.target)) return;
    hoverEl = e.target;
    hl.hidden = false;
    positionHl(hoverEl);
  }
  function onEsc(e) { if (e.key === "Escape") stopPicking(); }
  function onPick(e) {
    if (host.contains(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    var el = e.target;
    stopPicking();
    openWriteBox(describe(el), el);
  }
  function stopPicking() {
    picking = false;
    document.body.style.cursor = "";
    hl.hidden = true;
    pickBtn.classList.remove("active");
    pickBtn.textContent = "Click something on the page to note it";
    document.removeEventListener("mouseover", onHover, true);
    document.removeEventListener("click", onPick, true);
    document.removeEventListener("keydown", onEsc, true);
  }
  function startPicking() {
    picking = true;
    document.body.style.cursor = "crosshair";
    pickBtn.classList.add("active");
    pickBtn.textContent = "Now click something on the page… (Esc to cancel)";
    document.addEventListener("mouseover", onHover, true);
    document.addEventListener("click", onPick, true);
    document.addEventListener("keydown", onEsc, true);
  }

  /* ---------------------------- wiring ---------------------------- */

  $("toggle").onclick = function () { panel.hidden = !panel.hidden; };
  pickBtn.onclick = function () { if (picking) { stopPicking(); return; } panel.hidden = true; startPicking(); };
  $("general").onclick = function () { openWriteBox(null, null); };
  $("clear").onclick = function () {
    if (!confirm("Clear every note on every page? This can't be undone.")) return;
    data = {}; saveAll(); render(); layoutPins();
  };
  $("export").onclick = function () {
    var btn = $("export");
    function original() { return 'Save to file &amp; clear browser (<span id="total">' + totalCount() + "</span>)"; }
    function flash(msg) {
      btn.textContent = msg;
      setTimeout(function () { btn.innerHTML = original(); }, 1500);
    }
    if (!totalCount()) { flash("No notes to save"); return; }
    if (!window.fetch) { flash("No fetch available"); return; }
    fetch(SAVE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then(function (r) {
        if (!r.ok) { setSyncStatus("error"); flash("Save failed — notes kept"); return; }
        data = {};
        if (!data[path]) data[path] = [];
        localStorage.removeItem(STORE_KEY);
        setSyncStatus("ok");
        render(); layoutPins();
        flash("Saved to file ✓ browser cleared");
      })
      .catch(function () { setSyncStatus("offline"); flash("Server offline — notes kept"); });
  };

  render();
  layoutPins();
  syncToServer();
})();
