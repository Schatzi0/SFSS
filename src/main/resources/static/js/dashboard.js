// ═══════════════════════════════════════════════════════
// SFSS Dashboard — dashboard.js
// ═══════════════════════════════════════════════════════

// ── GLOBAL STATE ─────────────────────────────────────
var ST          = {view:'home', id:null, label:'Overview', bc:[]};
var folders     = [];   // nested tree from API
var flatFolders = [];   // flat list with _depth
var unlockedFolders    = {};  // {folderId: timestamp}
var currentShareFileId = null;
var currentPinFolderId = null;
var currentPinFolderName = null;
var currentPinValue    = '';
var setPinFolderId     = null;
var setPinIsRemoving   = false;
var subFolderParentId  = null;
var sTimer             = null;

// ── CONSTANTS ─────────────────────────────────────────
var CATS = [
  {key:'PDFs',         icon:'📕', cls:'cp',  label:'PDFs'},
  {key:'Images',       icon:'🖼️',  cls:'ci2', label:'Images'},
  {key:'Documents',    icon:'📝', cls:'cd',  label:'Documents'},
  {key:'Spreadsheets', icon:'📊', cls:'cs',  label:'Spreadsheets'},
  {key:'Presentations',icon:'📑', cls:'cpt', label:'Presentations'},
  {key:'Text Files',   icon:'📄', cls:'ct',  label:'Text Files'},
  {key:'Code',         icon:'💻', cls:'cco', label:'Code'},
  {key:'Archives',     icon:'🗜️',  cls:'ca',  label:'Archives'},
  {key:'Others',       icon:'📦', cls:'cot', label:'Others'}
];

var CODE_ICONS = {
  'Code \u203a Java':'☕','Code \u203a Python':'🐍',
  'Code \u203a JavaScript':'🟨','Code \u203a Web':'🌐',
  'Code \u203a Config':'⚙️','Code \u203a Systems':'⚡',
  'Code \u203a Scripts':'📜','Code \u203a SQL':'🗃️',
  'Code \u203a Other Languages':'🔤'
};

var GENRE_ICONS = {
  'Fiction':'📚','Academic':'🎓','Philosophy':'🤔',
  'Professional':'💼','Personal':'👤','Reference':'📖',
  'Code':'💻','Uncategorized':'📦','Other':'📦'
};

var GENRE_COLORS = {
  'Fiction':'linear-gradient(135deg,#7c3aed,#6d28d9)',
  'Academic':'linear-gradient(135deg,#2563eb,#1d4ed8)',
  'Philosophy':'linear-gradient(135deg,#0891b2,#0e7490)',
  'Professional':'linear-gradient(135deg,#059669,#047857)',
  'Personal':'linear-gradient(135deg,#d97706,#b45309)',
  'Reference':'linear-gradient(135deg,#dc2626,#b91c1c)',
  'Code':'linear-gradient(135deg,#ca8a04,#a16207)',
  'Uncategorized':'linear-gradient(135deg,#475569,#334155)',
  'Other':'linear-gradient(135deg,#475569,#334155)'
};

var EXT_COLORS = {
  'PDF':'#dc2626','DOCX':'#2563eb','DOC':'#2563eb','XLSX':'#059669',
  'XLS':'#059669','CSV':'#059669','PPTX':'#d97706','PPT':'#d97706',
  'JPG':'#7c3aed','JPEG':'#7c3aed','PNG':'#7c3aed','GIF':'#7c3aed',
  'MP4':'#0891b2','ZIP':'#475569','RAR':'#475569','TXT':'#4f46e5',
  'JSON':'#ca8a04','JAVA':'#ca8a04','PY':'#4f46e5','JS':'#ca8a04',
  'TS':'#ca8a04','HTML':'#dc2626','CSS':'#2563eb','SQL':'#0891b2',
  'SH':'#059669','MD':'#4f46e5'
};

// ── BOOT ─────────────────────────────────────────────
window.onload = async function() {
  try {
    var r = await fetch('/api/auth/me');
    if (!r.ok) { location.href = '/login.html'; return; }
    var u = await r.json();
    document.getElementById('un').textContent = u.name;
    document.getElementById('av').textContent = u.name.charAt(0).toUpperCase();
    await loadFolders();
    await showHome();
  } catch(e) {
    console.error('Boot error:', e);
    location.href = '/login.html';
  }
};

// ── FOLDER LOADING ────────────────────────────────────
async function loadFolders() {
  try {
    var r = await fetch('/api/folders');
    if (!r.ok) return;
    folders = await r.json();
    flatFolders = flattenTree(folders, 0);
    renderSB();
    // Update upload dropdown
    var r2 = await fetch('/api/folders/flat');
    if (!r2.ok) return;
    var flat = await r2.json();
    var sel = document.getElementById('fsel');
    sel.innerHTML = '<option value="">🤖 Auto-detect by file type</option>';
    flat.forEach(function(f) {
      var o = document.createElement('option');
      o.value = f.folderId;
      o.textContent = (f.parentFolderId ? '  └ ' : '') + '📂 ' + f.folderName;
      sel.appendChild(o);
    });
  } catch(e) { console.error('loadFolders error:', e); }
}

function flattenTree(list, depth) {
  var result = [];
  (list || []).forEach(function(f) {
    var copy = {};
    for (var k in f) copy[k] = f[k];
    copy._depth = depth;
    result.push(copy);
    if (f.subFolders && f.subFolders.length) {
      var children = flattenTree(f.subFolders, depth + 1);
      for (var i = 0; i < children.length; i++) result.push(children[i]);
    }
  });
  return result;
}

function renderSB() {
  document.getElementById('navHome').className =
    'ni' + (ST.view === 'home' ? ' act' : '');
  document.getElementById('navShared').className =
    'ni' + (ST.view === 'shared' ? ' act' : '');

  var el = document.getElementById('sbf');
  if (!flatFolders.length) {
    el.innerHTML = '<div style="font-size:.73rem;color:#475569;text-align:center;padding:.75rem">No folders yet</div>';
    return;
  }
  var h = '';
  flatFolders.forEach(function(f) {
    var act = (ST.view === 'folder' && ST.id === f.folderId) ? ' act' : '';
    var pl = (.65 + f._depth * .85);
    var lk = f.isProtected ? '<span class="lkbadge">🔒</span>' : '';
    h += '<div class="ni' + act + '" style="padding-left:' + pl + 'rem"' +
         ' onclick="handleFolderClick(' + f.folderId + ',\'' + esc(f.folderName) + '\',' + !!f.isProtected + ')">';
    h += '<span class="ico">' + (f._depth > 0 ? '└📂' : '📂') + '</span>';
    h += '<span class="lbl">' + esc(f.folderName) + lk + '</span>';
    h += '<span class="cnt">' + f.fileCount + '</span>';
    h += '<button class="nbtn nlock" title="Set PIN" onclick="openSetPinModal(' +
         f.folderId + ',\'' + esc(f.folderName) + '\',' + !!f.isProtected + ',event)">🔑</button>';
    h += '<button class="nbtn ndel" title="Delete" onclick="delFolder(' + f.folderId + ',event)">✕</button>';
    h += '</div>';
  });
  el.innerHTML = h;
}

// ── NAVIGATION ────────────────────────────────────────
function setNav(view, id, title, bcs) {
  ST = {view:view, id:id, label:title, bc:bcs};
  document.getElementById('pt').textContent = title;
  var h = '';
  (bcs || []).forEach(function(b, i) {
    if (i > 0) h += '<span class="sep">›</span>';
    if (b.fn) h += '<span onclick="' + b.fn + '()">' + esc(b.label) + '</span>';
    else       h += '<span>' + esc(b.label) + '</span>';
  });
  document.getElementById('bc').innerHTML = h;
  renderSB();
}

function goHome() { showHome(); }

async function refresh() {
  var v = ST.view, id = ST.id;
  if      (v === 'home')       await showHome();
  else if (v === 'all')        await showAllFiles();
  else if (v === 'cat')        { var c = CATS.find(function(x){return x.key===id;}); if(c) await openCat(c.key,c.icon,c.label); }
  else if (v === 'code-subs')  await showCodeSubs();
  else if (v === 'code-sub')   await openCodeSub(id, CODE_ICONS[id]||'💾', id.replace('Code \u203a ',''));
  else if (v === 'others-subs')await showOthersSubs();
  else if (v === 'others-sub') await openOthersSub(id);
  else if (v === 'shared')     await showSharedWithMe();
  else if (v === 'genre')      await openGenre(id);
  else if (v === 'genre-sub')  { var parts=id.split('/'); await openGenreSub(parts[0],parts[1]); }
  else if (v === 'folder')     { var fn = ST.label.replace('📂 ',''); await openFolder(id, fn); }
  else if (v === 'search')     { if(id) handleSearch(id); }
  else await showHome();
}

// ── HOME OVERVIEW ────────────────────────────────────
async function showHome() {
  setNav('home', null, 'Overview', [{label:'Home'}]);
  try {
    var r = await fetch('/api/files/stats');
    if (!r.ok) throw new Error('stats failed');
    var d = await r.json();

    var cats    = d.categories || {};
    var total   = d.total || 0;
    var used    = d.storageUsed || '0 B';
    var bytes   = d.storageBytes || 0;
    var pct     = Math.min((bytes / (1073741824)) * 100, 100).toFixed(1);
    var uname   = document.getElementById('un').textContent;
    var recent  = d.recentFiles || [];

    var h = '';
    // Hero
    h += '<div class="hero">';
    h += '<div class="hero-l"><h2>Welcome back, ' + esc(uname) + '! 👋</h2>';
    h += '<p>Your personal secure file vault</p>';
    h += '<div class="sbar"><div class="sfill" style="width:' + pct + '%"></div></div>';
    h += '<div class="slbl">Used: <strong style="color:#94a3b8">' + used + '</strong></div></div>';
    h += '<div class="hero-r"><div class="big">' + total + '</div><div class="sub">Total Files</div></div></div>';

    // Category tiles
    h += '<div class="shd"><h3>Browse by Type</h3></div><div class="cg">';
    CATS.forEach(function(c) {
      h += '<div class="cc ' + c.cls + '" onclick="openCat(\'' + c.key + '\',\'' +
           c.icon + '\',\'' + c.label + '\')">';
      h += '<div class="ci">' + c.icon + '</div>';
      h += '<div class="ck">' + (cats[c.key] || 0) + '</div>';
      h += '<div class="cl">' + c.label + '</div></div>';
    });
    h += '</div>';

    // Genre Library
    try {
      var gr = await fetch('/api/rag/genres');
      if (gr.ok) {
        var genres = await gr.json();
        var genreMap = {};
        genres.forEach(function(g) {
          if (!g.genre) return;
          if (!genreMap[g.genre]) genreMap[g.genre] = 0;
          genreMap[g.genre] += parseInt(g.count || 0);
        });
        var gEntries = Object.entries(genreMap);
        if (gEntries.length) {
          h += '<div class="shd"><h3>📚 Genre Library</h3>' +
               '<span style="font-size:.75rem;color:var(--mu)">AI-classified</span></div>';
          h += '<div class="cg">';
          gEntries.forEach(function(e) {
            var g = e[0], cnt = e[1];
            var color = GENRE_COLORS[g] || GENRE_COLORS['Other'];
            var icon  = GENRE_ICONS[g]  || '📦';
            h += '<div class="cc" style="background:' + color + '" onclick="openGenre(\'' + esc(g) + '\')">';
            h += '<div class="ci">' + icon + '</div>';
            h += '<div class="ck">' + cnt + '</div>';
            h += '<div class="cl">' + esc(g) + '</div></div>';
          });
          h += '</div>';
        }
      }
    } catch(ignored) {}

    // Recent files
    h += '<div class="shd"><h3>Recent Uploads</h3>' +
         '<a onclick="showAllFiles()" style="cursor:pointer;font-size:.78rem;color:var(--bl)">View all</a></div>';
    h += '<div class="rl">';
    if (recent.length) {
      recent.forEach(function(f) {
        h += '<div class="ri" onclick="prevFile(' + f.fileId + ',\'' +
             esc(f.fileName) + '\',\'' + (f.fileType||'') + '\',false)">';
        h += '<div class="rii">' + fileIcon(f.fileType, f.fileName) + '</div>';
        h += '<div style="flex:1;min-width:0">';
        h += '<div class="rin">' + esc(f.fileName) + '</div>';
        h += '<div class="rim">' + f.fileSize + ' · ' + fmtDate(f.uploadedAt) + '</div></div>';
        h += '<div class="ric">' + esc(f.category || f.folderName || 'Other') + '</div></div>';
      });
    } else {
      h += '<div style="font-size:.84rem;color:var(--mu);padding:.75rem">No files yet — upload something!</div>';
    }
    h += '</div>';

    document.getElementById('content').innerHTML = h;
  } catch(e) {
    document.getElementById('content').innerHTML =
      '<div class="empty"><div style="font-size:3rem">⚠️</div><h3>Could not load dashboard</h3>' +
      '<p style="font-size:.82rem">' + e.message + '</p></div>';
  }
}

async function showAllFiles() {
  setNav('all', null, 'All Files', [{label:'Home',fn:'goHome'},{label:'All Files'}]);
  var r = await fetch('/api/files');
  renderGrid(r.ok ? await r.json() : [], 'All Files');
}

// ── CATEGORIES ────────────────────────────────────────
async function openCat(key, icon, label) {
  if (key === 'Code')   { await showCodeSubs(); return; }
  if (key === 'Others') { await showOthersSubs(); return; }
  setNav('cat', key, icon + ' ' + label,
    [{label:'Home',fn:'goHome'},{label:label}]);
  var r = await fetch('/api/files/category/' + encodeURIComponent(key));
  renderGrid(r.ok ? await r.json() : [], icon + ' ' + label);
}

async function showCodeSubs() {
  setNav('code-subs', null, '💻 Code', [{label:'Home',fn:'goHome'},{label:'Code'}]);
  var r = await fetch('/api/files/code-subcats');
  if (!r.ok) { document.getElementById('content').innerHTML = '<div class="empty">Error loading</div>'; return; }
  var data = await r.json();
  var entries = Object.entries(data);
  if (!entries.length) {
    document.getElementById('content').innerHTML =
      '<div class="empty"><div style="font-size:3rem;opacity:.4">💻</div><h3>No code files</h3></div>';
    return;
  }
  var h = '<div class="shd"><h3>Code Sub-categories</h3></div><div class="sg">';
  entries.forEach(function(e) {
    var k = e[0], v = e[1];
    var ico = CODE_ICONS[k] || '💾';
    var lbl = k.replace('Code \u203a ','');
    h += '<div class="sc" onclick="openCodeSub(\'' + esc(k) + '\',\'' + ico + '\',\'' + esc(lbl) + '\')">';
    h += '<div class="sci">' + ico + '</div><div class="scn">' + v + '</div>';
    h += '<div class="scl">' + esc(lbl) + '</div></div>';
  });
  h += '</div>';
  document.getElementById('content').innerHTML = h;
}

async function openCodeSub(cat, icon, label) {
  setNav('code-sub', cat, icon + ' ' + label,
    [{label:'Home',fn:'goHome'},{label:'Code',fn:'showCodeSubs'},{label:label}]);
  var r = await fetch('/api/files/category/' + encodeURIComponent(cat));
  renderGrid(r.ok ? await r.json() : [], icon + ' ' + label);
}

async function showOthersSubs() {
  setNav('others-subs', null, '📦 Others', [{label:'Home',fn:'goHome'},{label:'Others'}]);
  var r = await fetch('/api/files/others-subcats');
  if (!r.ok) { document.getElementById('content').innerHTML = '<div class="empty">Error loading</div>'; return; }
  var data = await r.json();
  var entries = Object.entries(data);
  if (!entries.length) {
    document.getElementById('content').innerHTML =
      '<div class="empty"><div style="font-size:3rem;opacity:.4">📦</div><h3>No miscellaneous files</h3></div>';
    return;
  }
  var h = '<div class="shd"><h3>Others — by Extension</h3></div><div class="sg">';
  entries.forEach(function(e) {
    var ext = e[0], cnt = e[1];
    h += '<div class="sc" onclick="openOthersSub(\'' + esc(ext) + '\')">';
    h += '<div class="sci">📄</div><div class="scn">' + cnt + '</div>';
    h += '<div class="scl">' + esc(ext) + '</div></div>';
  });
  h += '</div>';
  document.getElementById('content').innerHTML = h;
}

async function openOthersSub(ext) {
  var extClean = ext.startsWith('.') ? ext.slice(1) : ext;
  setNav('others-sub', ext, ext + ' Files',
    [{label:'Home',fn:'goHome'},{label:'Others',fn:'showOthersSubs'},{label:ext}]);
  var r = await fetch('/api/files/ext/' + encodeURIComponent(extClean));
  renderGrid(r.ok ? await r.json() : [], ext + ' Files');
}

// ── FOLDER VIEWS ──────────────────────────────────────
async function openFolder(fid, fname) {
  setNav('folder', fid, '📂 ' + fname,
    [{label:'Home',fn:'goHome'},{label:fname}]);

  var el = document.getElementById('content');
  el.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--mu)">Loading...</div>';

  var h = '';

  // Sub-folders (from already-loaded flat list)
  var subs = flatFolders.filter(function(f) {
    return f.parentFolderId === fid;
  });
  if (subs.length) {
    h += '<div class="shd"><h3>📁 Sub-folders</h3>' +
         '<button onclick="openFolderModal(' + fid + ')" ' +
         'style="font-size:.75rem;color:var(--bl);background:none;border:1px solid var(--bl);' +
         'border-radius:6px;padding:.2rem .6rem;cursor:pointer">+ New sub-folder</button></div>';
    h += '<div class="cg">';
    subs.forEach(function(s) {
      var lk = s.isProtected ? '🔒 ' : '';
      h += '<div class="cc" style="background:linear-gradient(135deg,#1e293b,#0f172a)" ' +
           'onclick="handleFolderClick(' + s.folderId + ',\'' + esc(s.folderName) + '\',' + !!s.isProtected + ')">';
      h += '<div class="ci">📂</div>';
      h += '<div class="ck" style="font-size:1.1rem">' + lk + esc(s.folderName) + '</div>';
      h += '<div class="cl">' + s.fileCount + ' files</div></div>';
    });
    h += '</div>';
  } else {
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">' +
         '<span></span>' +
         '<button onclick="openFolderModal(' + fid + ')" ' +
         'style="font-size:.75rem;color:var(--bl);background:none;border:1px solid var(--bl);' +
         'border-radius:6px;padding:.2rem .65rem;cursor:pointer">+ New sub-folder</button></div>';
  }

  // Extension stats tiles
  try {
    var statsR = await fetch('/api/files/folder/' + fid + '/extstats');
    if (statsR.ok) {
      var stats = await statsR.json();
      var entries = Object.entries(stats);
      if (entries.length) {
        h += '<div class="shd"><h3>Files by Type</h3></div><div class="cg">';
        entries.sort(function(a,b){return b[1]-a[1];}).forEach(function(e) {
          var ext = e[0], cnt = e[1];
          var color = EXT_COLORS[ext] || '#475569';
          h += '<div class="cc" style="background:linear-gradient(135deg,' + color + 'cc,' + color + '99)" ' +
               'onclick="openFolderByExt(' + fid + ',\'' + esc(fname) + '\',\'' + esc(ext) + '\')">';
          h += '<div class="ci">📄</div>';
          h += '<div class="ck">' + cnt + '</div>';
          h += '<div class="cl">.' + ext.toLowerCase() + '</div></div>';
        });
        h += '</div>';
      }
    }
  } catch(ignored) {}

  // All files in folder
  try {
    var r = await fetch('/api/files/folder/' + fid);
    var files = r.ok ? await r.json() : [];
    if (files.length) {
      h += '<div class="shd"><h3>All Files</h3>' +
           '<span style="font-size:.78rem;color:var(--mu)">' + files.length + ' files</span></div>';
      h += '<div class="fg">';
      files.forEach(function(f) { h += fileCard(f, false); });
      h += '</div>';
    } else if (!subs.length) {
      h += '<div class="empty"><div style="font-size:3rem;opacity:.4">📭</div>' +
           '<h3 style="margin:.75rem 0 .3rem">Empty folder</h3>' +
           '<p style="font-size:.82rem">Upload files to get started</p></div>';
    }
  } catch(ignored) {}

  el.innerHTML = h;
}

async function openFolderByExt(fid, fname, ext) {
  setNav('folder', fid, '📂 ' + fname + ' › .' + ext.toLowerCase(),
    [{label:'Home',fn:'goHome'},{label:fname,fn:'function(){openFolder(' + fid + ',\'' + esc(fname) + '\')}'},{label:'.' + ext.toLowerCase()}]);
  var r = await fetch('/api/files/folder/' + fid + '/ext/' + encodeURIComponent(ext));
  renderGrid(r.ok ? await r.json() : [], '.' + ext.toLowerCase() + ' in ' + fname);
}

function handleFolderClick(fid, fname, isProtected) {
  if (!isProtected) { openFolder(fid, fname); return; }
  var unlockTime = unlockedFolders[fid];
  if (unlockTime && (Date.now() - unlockTime) < 30 * 60 * 1000) {
    openFolder(fid, fname); return;
  }
  showPinModal(fid, fname);
}

async function delFolder(fid, e) {
  e.stopPropagation();
  if (!confirm('Delete this folder? Files inside will be moved to root.')) return;
  var r = await fetch('/api/folders/' + fid, {method:'DELETE'});
  if (r.ok) {
    toast('Folder deleted', 'success');
    await loadFolders();
    if (ST.view === 'folder' && ST.id === fid) await showHome();
    else renderSB();
  } else {
    toast('Could not delete folder', 'error');
  }
}

// ── FOLDER MODAL ─────────────────────────────────────
function openFolderModal(parentId) {
  subFolderParentId = parentId || null;
  var title = parentId ? '📂 New Sub-folder' : '📂 New Folder';
  document.getElementById('fmodTitle').textContent = title;
  document.getElementById('fni').value = '';
  document.getElementById('fmod').classList.add('show');
  setTimeout(function(){ document.getElementById('fni').focus(); }, 60);
}

function closeFolderModal() {
  document.getElementById('fmod').classList.remove('show');
  document.getElementById('fni').value = '';
  subFolderParentId = null;
}

async function doCreateFolder() {
  var name = document.getElementById('fni').value.trim();
  if (!name) { toast('Enter folder name', 'error'); return; }
  var body = {folderName: name};
  if (subFolderParentId) body.parentId = subFolderParentId;
  var r = await fetch('/api/folders', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body)
  });
  var d = await r.json();
  if (d.error) { toast(d.error, 'error'); return; }
  closeFolderModal();
  toast('Folder created!', 'success');
  await loadFolders();
  if (ST.view === 'folder' && ST.id === (subFolderParentId || null)) await refresh();
}

// ── PIN PROTECTION ────────────────────────────────────
function showPinModal(fid, fname) {
  currentPinFolderId   = fid;
  currentPinFolderName = fname;
  currentPinValue      = '';
  document.getElementById('pinFolderName').textContent = fname;
  document.getElementById('pinError').textContent      = '';
  updatePinDots();
  document.getElementById('pinModal').classList.add('show');
}

function closePinModal() {
  document.getElementById('pinModal').classList.remove('show');
  currentPinValue = '';
  updatePinDots();
}

function pinKey(val) {
  if      (val === 'DEL') { currentPinValue = currentPinValue.slice(0,-1); }
  else if (val === 'C')   { currentPinValue = ''; }
  else if (currentPinValue.length < 8) { currentPinValue += val; }
  updatePinDots();
  if (currentPinValue.length === 4) setTimeout(doVerifyPin, 120);
}

function updatePinDots() {
  var dots = document.querySelectorAll('#pinDots .pin-dot');
  dots.forEach(function(d, i) {
    d.classList.toggle('filled', i < currentPinValue.length);
  });
}

async function doVerifyPin() {
  try {
    var r = await fetch('/api/folders/' + currentPinFolderId + '/verify', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({pin: currentPinValue})
    });
    var d = await r.json();
    if (d.verified) {
      unlockedFolders[currentPinFolderId] = Date.now();
      closePinModal();
      toast('Folder unlocked!', 'success');
      await openFolder(currentPinFolderId, currentPinFolderName);
    } else {
      document.getElementById('pinError').textContent = '❌ Wrong PIN';
      currentPinValue = '';
      updatePinDots();
      setTimeout(function() {
        document.getElementById('pinError').textContent = '';
      }, 2000);
    }
  } catch(e) {
    document.getElementById('pinError').textContent = 'Error — try again';
    currentPinValue = '';
    updatePinDots();
  }
}

function openSetPinModal(fid, fname, isProtected, e) {
  e.stopPropagation();
  setPinFolderId   = fid;
  setPinIsRemoving = isProtected;

  var title = isProtected ? '🔓 Remove Protection' : '🔒 Protect Folder';
  document.getElementById('setPinTitle').textContent = title;

  var body = '';
  if (isProtected) {
    body = '<div style="font-size:.85rem;color:var(--mu);padding:.5rem 0 .75rem">' +
           'Enter current PIN to remove protection from <strong>' + esc(fname) + '</strong></div>' +
           '<div class="mfg"><label class="mfl">Current PIN</label>' +
           '<input type="password" class="mfi" id="pinInput1" placeholder="Enter current PIN"/></div>' +
           '<div id="setPinError" style="font-size:.78rem;color:var(--rd);min-height:18px"></div>';
    document.getElementById('savePinBtn').textContent = 'Remove Protection';
  } else {
    body = '<div class="mfg"><label class="mfl">Set PIN (4-8 characters)</label>' +
           '<input type="password" class="mfi" id="pinInput1" placeholder="Enter PIN" maxlength="8"/></div>' +
           '<div class="mfg"><label class="mfl">Confirm PIN</label>' +
           '<input type="password" class="mfi" id="pinInput2" placeholder="Confirm PIN" maxlength="8"' +
           ' onkeydown="if(event.key===\'Enter\')doSavePin()"/></div>' +
           '<div id="setPinError" style="font-size:.78rem;color:var(--rd);min-height:18px"></div>';
    document.getElementById('savePinBtn').textContent = 'Set PIN';
  }
  document.getElementById('setPinBody').innerHTML = body;
  document.getElementById('setPinModal').classList.add('show');
  setTimeout(function() {
    var inp = document.getElementById('pinInput1');
    if (inp) inp.focus();
  }, 60);
}

async function doSavePin() {
  var pin1El = document.getElementById('pinInput1');
  var pin  = pin1El ? pin1El.value : '';
  var errEl = document.getElementById('setPinError');

  if (!setPinIsRemoving) {
    var pin2El = document.getElementById('pinInput2');
    var pin2 = pin2El ? pin2El.value : '';
    if (pin.length < 4) { if(errEl) errEl.textContent = 'PIN must be at least 4 characters'; return; }
    if (pin !== pin2)   { if(errEl) errEl.textContent = 'PINs do not match'; return; }
  } else {
    if (!pin) { toast('Enter current PIN', 'error'); return; }
  }

  try {
    var r = await fetch('/api/folders/' + setPinFolderId + '/protect', {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({enable: !setPinIsRemoving, pin: pin})
    });
    var d = await r.json();
    if (d.error) { toast(d.error, 'error'); return; }
    document.getElementById('setPinModal').classList.remove('show');
    toast(d.message, 'success');
    if (setPinIsRemoving) delete unlockedFolders[setPinFolderId];
    await loadFolders();
  } catch(e) {
    toast('Error saving PIN', 'error');
  }
}

// ── FILE GRID ─────────────────────────────────────────
function renderGrid(files, title) {
  var cnt = files.length;
  var hd = '<div class="shd"><h3>' + esc(title) + '</h3>' +
           '<span style="font-size:.78rem;color:var(--mu)">' + cnt + ' file' + (cnt!==1?'s':'') + '</span></div>';
  if (!files.length) {
    document.getElementById('content').innerHTML = hd +
      '<div class="fg"><div class="empty"><div style="font-size:3rem;opacity:.4">📭</div>' +
      '<h3 style="margin:.75rem 0 .3rem">No files here</h3></div></div>';
    return;
  }
  var h = hd + '<div class="fg">';
  files.forEach(function(f) { h += fileCard(f, false); });
  h += '</div>';
  document.getElementById('content').innerHTML = h;
}

function fileCard(f, isShared) {
  var canP = f.isImage || canPreview(f.fileType, f.fileName);
  var thumb = f.isImage
    ? '<img src="/api/' + (isShared ? 'share' : 'files') + '/preview/' + f.fileId + '" loading="lazy" onerror="this.style.display=\'none\'">'
    : '<div class="ti">' + fileIcon(f.fileType, f.fileName) + '</div>';

  var baseUrl = isShared ? '/api/share' : '/api/files';

  var h = '<div class="fc"><div class="ft">' + thumb + '<div class="fov">';
  if (canP) {
    h += '<button class="ob" onclick="prevFile(' + f.fileId + ',\'' +
         esc(f.fileName) + '\',\'' + (f.fileType||'') + '\',' + !!isShared + ')">👁 View</button>';
  }
  if (!isShared || f.permission === 'download') {
    h += '<a class="ob" href="' + baseUrl + '/download/' + f.fileId +
         '" onclick="event.stopPropagation()">⬇</a>';
  }
  if (!isShared) {
    h += '<button class="ob" style="background:rgba(99,102,241,.85);color:#fff" ' +
         'onclick="openShareModal(' + f.fileId + ',\'' + esc(f.fileName) + '\',event)">🔗</button>';
    // Index button for eligible files
    var name = (f.fileName||'').toLowerCase();
    var eligible = (f.fileType && (f.fileType.includes('pdf')||f.fileType.includes('text'))) ||
      ['.txt','.md','.pdf','.py','.java','.js','.ts','.json','.xml',
       '.yaml','.yml','.html','.css','.sql','.kt','.sh','.go','.rs','.c','.cpp'].some(function(e){return name.endsWith(e);});
    if (eligible) {
      h += '<button id="idx_' + f.fileId + '" class="ob" title="Index for AI" ' +
           'onclick="ragIndexFile(' + f.fileId + ')" style="background:rgba(16,185,129,.8);color:#fff">⚡</button>';
    }
    h += '<button class="ob obd" onclick="delFile(' + f.fileId + ',event)">🗑</button>';
  }
  h += '</div></div>';
  h += '<div class="fb">';
  h += '<div class="fn" title="' + esc(f.fileName) + '">' + esc(f.fileName) + '</div>';
  h += '<div class="fs2">' + (f.fileSize||'') + '</div>';
  if (!isShared) h += '<div class="fd">' + fmtDate(f.uploadedAt) + '</div>';
  else           h += '<div class="fd">By ' + esc(f.sharedBy||'') + ' · ' + (f.permission||'view') + '</div>';
  if (f.genre)   h += '<div class="gbadge">🏷️ ' + esc(f.genre) + (f.genreSub ? ' › ' + esc(f.genreSub) : '') + '</div>';
  h += '</div></div>';
  return h;
}

function canPreview(type, name) {
  if (!name) return false;
  var n = name.toLowerCase();
  if (type && (type.startsWith('image/') || type.includes('pdf'))) return true;
  var exts = ['.java','.kt','.py','.js','.ts','.jsx','.tsx','.html','.htm','.css',
    '.scss','.json','.xml','.yaml','.yml','.sql','.sh','.bash','.md','.txt','.log',
    '.c','.cpp','.h','.cs','.go','.rs','.rb','.php','.gradle','.toml','.env',
    '.bat','.ps1','.properties','.conf','.ini','.cfg'];
  return exts.some(function(e) { return n.endsWith(e); });
}

// ── PREVIEW ───────────────────────────────────────────
async function prevFile(fid, fname, ftype, isShared) {
  var baseUrl = isShared ? '/api/share' : '/api/files';
  document.getElementById('pov').classList.add('show');
  document.getElementById('ptitle').textContent   = fname;
  document.getElementById('picon').textContent    = fileIcon(ftype, fname);
  document.getElementById('pdl').href             = baseUrl + '/download/' + fid;
  document.getElementById('plang').style.display  = 'none';
  document.getElementById('pbody').innerHTML      =
    '<div style="text-align:center;padding:4rem;color:#475569">Loading preview...</div>';

  try {
    var resp = await fetch(baseUrl + '/preview/' + fid);
    if (!resp.ok) throw new Error('Preview unavailable (status ' + resp.status + ')');

    if (ftype && ftype.startsWith('image/')) {
      var blob = await resp.blob();
      var url  = URL.createObjectURL(blob);
      document.getElementById('pbody').innerHTML =
        '<div style="text-align:center;padding:1.25rem;background:#0a0f1a;min-height:300px;' +
        'display:flex;align-items:center;justify-content:center">' +
        '<img src="' + url + '" style="max-width:100%;max-height:78vh;border-radius:8px;object-fit:contain"/></div>';
    } else if (ftype && ftype.includes('pdf')) {
      var blob2 = await resp.blob();
      var url2  = URL.createObjectURL(blob2);
      document.getElementById('pbody').innerHTML =
        '<embed src="' + url2 + '" type="application/pdf" style="width:100%;height:80vh;display:block"/>';
    } else {
      var text  = await resp.text();
      var lang  = getLang(fname);
      var hlang = hljsLang(fname);
      if (lang !== 'Plain Text') {
        var lb = document.getElementById('plang');
        lb.textContent   = lang;
        lb.style.display = 'inline';
      }
      var highlighted = null;
      if (window.hljs && hlang) {
        try { highlighted = hljs.highlight(text,{language:hlang,ignoreIllegals:true}).value.split('\n'); }
        catch(ex) {}
      }
      var lines = text.split('\n');
      var ph = '<div class="cv"><table>';
      lines.forEach(function(line, i) {
        var lc = highlighted ? (highlighted[i] || '') : esc(line);
        ph += '<tr><td class="ln">' + (i+1) + '</td><td class="lc">' + lc + '</td></tr>';
      });
      ph += '</table></div>';
      document.getElementById('pbody').innerHTML = ph;
    }
  } catch(ex) {
    document.getElementById('pbody').innerHTML =
      '<div style="text-align:center;padding:3rem;color:#ef4444">' +
      'Preview unavailable — <a href="' + baseUrl + '/download/' + fid +
      '" style="color:#6366f1">Download instead</a></div>';
  }
}

function closePrev() {
  document.getElementById('pov').classList.remove('show');
}

// ── FILE OPERATIONS ───────────────────────────────────
async function delFile(fid, e) {
  e.stopPropagation();
  if (!confirm('Delete this file permanently?')) return;
  var r = await fetch('/api/files/' + fid, {method:'DELETE'});
  if (r.ok) {
    toast('File deleted', 'success');
    await loadFolders();
    await refresh();
  } else {
    toast('Delete failed', 'error');
  }
}

// ── UPLOAD ────────────────────────────────────────────
function openUpload() {
  document.getElementById('umod').classList.add('show');
  if (ST.view === 'folder' && ST.id) {
    document.getElementById('fsel').value = ST.id;
  }
}

function closeUpload() {
  document.getElementById('umod').classList.remove('show');
  document.getElementById('ufi').value   = '';
  document.getElementById('dtxt').textContent = 'Click or drag files here';
}

function onFilePick(inp) {
  var n = inp.files.length;
  document.getElementById('dtxt').textContent =
    n === 1 ? inp.files[0].name : n + ' files selected';
}

function onDrop(e) {
  e.preventDefault();
  var dt   = e.dataTransfer;
  var inp  = document.getElementById('ufi');
  if (dt && dt.files) {
    inp.files = dt.files;
    onFilePick(inp);
  }
}

async function doUpload() {
  var inp = document.getElementById('ufi');
  if (!inp.files || !inp.files.length) { toast('Select a file first', 'error'); return; }
  var fid  = document.getElementById('fsel').value;
  var ok   = 0;
  var fail = 0;
  toast('Uploading...', 'info');

  for (var i = 0; i < inp.files.length; i++) {
    var fd = new FormData();
    fd.append('file', inp.files[i]);
    if (fid) fd.append('folderId', fid);
    try {
      var r = await fetch('/api/files/upload', {method:'POST', body:fd});
      if (r.status === 401) {
        toast('Session expired — please log in again', 'error');
        setTimeout(function(){ location.href = '/login.html'; }, 1500);
        closeUpload(); return;
      }
      if (r.ok) ok++; else fail++;
    } catch(ex) { fail++; }
  }

  closeUpload();
  if (ok > 0) {
    toast(ok + ' file' + (ok>1?'s':'') + ' uploaded!', 'success');
    await loadFolders();
    await refresh();
  } else {
    toast('Upload failed — check console', 'error');
  }
}

// ── SEARCH ────────────────────────────────────────────
function handleSearch(val) {
  clearTimeout(sTimer);
  if (!val || !val.trim()) { refresh(); return; }
  sTimer = setTimeout(async function() {
    setNav('search', val, 'Search: ' + val, [{label:'Home',fn:'goHome'}]);
    var r = await fetch('/api/files/search?q=' + encodeURIComponent(val.trim()));
    renderGrid(r.ok ? await r.json() : [], 'Results for "' + val + '"');
  }, 350);
}

// ── SHARING ───────────────────────────────────────────
function openShareModal(fileId, fileName, e) {
  e.stopPropagation();
  currentShareFileId = fileId;
  document.getElementById('shareFileName').textContent = fileName;
  document.getElementById('shareEmail').value          = '';
  document.getElementById('shareResult').innerHTML     = '';
  document.getElementById('shareModal').classList.add('show');
  loadShareList(fileId);
  setTimeout(function() { document.getElementById('shareEmail').focus(); }, 60);
}

function closeShareModal() {
  document.getElementById('shareModal').classList.remove('show');
}

async function loadShareList(fileId) {
  try {
    var r = await fetch('/api/share/sent/' + fileId);
    if (!r.ok) return;
    var list = await r.json();
    var el = document.getElementById('shareList');
    if (!list.length) {
      el.innerHTML = '<div style="font-size:.75rem;color:var(--mu)">Not shared with anyone yet</div>';
      return;
    }
    var h = '<div style="font-size:.75rem;font-weight:700;color:var(--mu);margin-bottom:.4rem">Shared with:</div>';
    list.forEach(function(s) {
      h += '<div style="display:flex;align-items:center;justify-content:space-between;' +
           'padding:.4rem .6rem;background:var(--bg);border-radius:8px;margin-bottom:.3rem;font-size:.8rem">';
      h += '<span>👤 ' + esc(s.sharedWith||'') + ' <span style="color:var(--mu)">(' + (s.permission||'view') + ')</span></span>';
      h += '<button onclick="revokeShare(' + s.shareId + ')" ' +
           'style="background:none;border:none;color:var(--rd);cursor:pointer;font-size:.8rem">✕ Remove</button>';
      h += '</div>';
    });
    el.innerHTML = h;
  } catch(e) {}
}

async function doShare() {
  var email  = document.getElementById('shareEmail').value.trim();
  var perm   = document.getElementById('sharePerm').value;
  var res    = document.getElementById('shareResult');
  if (!email) { res.innerHTML = '<span style="color:var(--rd)">Enter email</span>'; return; }
  try {
    var r = await fetch('/api/share', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({fileId: String(currentShareFileId), email:email, permission:perm})
    });
    var d = await r.json();
    if (d.error) {
      res.innerHTML = '<span style="color:var(--rd)">' + esc(d.error) + '</span>';
    } else {
      res.innerHTML = '<span style="color:var(--gr)">✅ ' + esc(d.message) + '</span>';
      document.getElementById('shareEmail').value = '';
      loadShareList(currentShareFileId);
    }
  } catch(e) {
    res.innerHTML = '<span style="color:var(--rd)">Error — try again</span>';
  }
}

async function revokeShare(shareId) {
  var r = await fetch('/api/share/' + shareId, {method:'DELETE'});
  if (r.ok) loadShareList(currentShareFileId);
}

async function showSharedWithMe() {
  setNav('shared', null, '🤝 Shared with Me',
    [{label:'Home',fn:'goHome'},{label:'Shared with Me'}]);
  try {
    var r = await fetch('/api/share/received');
    var files = r.ok ? await r.json() : [];
    var el = document.getElementById('content');
    if (!files.length) {
      el.innerHTML = '<div class="empty"><div style="font-size:3rem">🤝</div>' +
        '<h3 style="margin:.75rem 0 .3rem">No files shared with you</h3>' +
        '<p style="font-size:.82rem">When someone shares a file, it appears here</p></div>';
      return;
    }
    var h = '<div class="shd"><h3>Shared with Me</h3>' +
            '<span style="font-size:.78rem;color:var(--mu)">' + files.length + ' files</span></div>';
    h += '<div class="fg">';
    files.forEach(function(f) { h += fileCard(f, true); });
    h += '</div>';
    el.innerHTML = h;
  } catch(e) {
    document.getElementById('content').innerHTML =
      '<div class="empty"><h3>Error loading shared files</h3></div>';
  }
}

// ── GENRE LIBRARY ─────────────────────────────────────
async function openGenre(genre) {
  setNav('genre', genre, (GENRE_ICONS[genre]||'📚') + ' ' + genre,
    [{label:'Home',fn:'goHome'},{label:genre}]);
  try {
    // Sub-genres
    var gr = await fetch('/api/rag/genres');
    var allGenres = gr.ok ? await gr.json() : [];
    var subs = allGenres.filter(function(g) {
      return g.genre === genre && g.genre_sub;
    });

    var h = '';
    if (subs.length > 1) {
      h += '<div class="shd"><h3>Sub-categories</h3></div><div class="sg">';
      subs.forEach(function(s) {
        h += '<div class="sc" onclick="openGenreSub(\'' + esc(genre) + '\',\'' + esc(s.genre_sub) + '\')">';
        h += '<div class="sci">📂</div><div class="scn">' + s.count + '</div>';
        h += '<div class="scl">' + esc(s.genre_sub) + '</div></div>';
      });
      h += '</div>';
    }

    var r2 = await fetch('/api/files/genre/' + encodeURIComponent(genre));
    var files = r2.ok ? await r2.json() : [];
    h += '<div class="shd"><h3>All ' + esc(genre) + ' Files</h3>' +
         '<span style="font-size:.78rem;color:var(--mu)">' + files.length + ' files</span></div>';
    if (files.length) {
      h += '<div class="fg">';
      files.forEach(function(f) { h += fileCard(f, false); });
      h += '</div>';
    } else {
      h += '<div class="empty"><div style="font-size:3rem;opacity:.4">📚</div>' +
           '<h3>No files in this genre yet</h3>' +
           '<p style="font-size:.82rem">Index your files using ⚡ to auto-classify</p></div>';
    }
    document.getElementById('content').innerHTML = h;
  } catch(e) {
    document.getElementById('content').innerHTML =
      '<div class="empty"><h3>Error loading genre</h3></div>';
  }
}

async function openGenreSub(genre, sub) {
  setNav('genre-sub', genre + '/' + sub, genre + ' › ' + sub,
    [{label:'Home',fn:'goHome'},
     {label:genre,fn:'function(){openGenre(\'' + esc(genre) + '\')}'},
     {label:sub}]);
  var r = await fetch('/api/files/genre/' + encodeURIComponent(genre) +
          '?sub=' + encodeURIComponent(sub));
  renderGrid(r.ok ? await r.json() : [], genre + ' › ' + sub);
}

// ── LOGOUT ────────────────────────────────────────────
async function logout() {
  await fetch('/api/auth/logout', {method:'POST'});
  location.href = '/login.html';
}

// ── UTILITIES ─────────────────────────────────────────
function fileIcon(type, name) {
  if (!type) type = ''; if (!name) name = '';
  var n = name.toLowerCase(); var ct = type.toLowerCase();
  if (ct.includes('pdf')||n.endsWith('.pdf'))                 return '📕';
  if (ct.startsWith('image/'))                                return '🖼️';
  if (ct.includes('word')||n.endsWith('.docx')||n.endsWith('.doc')) return '📝';
  if (ct.includes('sheet')||ct.includes('excel')||n.endsWith('.xlsx')||n.endsWith('.xls')||n.endsWith('.csv')) return '📊';
  if (ct.includes('presentation')||n.endsWith('.pptx')||n.endsWith('.ppt')) return '📑';
  if (n.endsWith('.java')||n.endsWith('.kt'))  return '☕';
  if (n.endsWith('.py'))                       return '🐍';
  if (n.endsWith('.js')||n.endsWith('.ts')||n.endsWith('.jsx')||n.endsWith('.tsx')) return '🟨';
  if (n.endsWith('.html')||n.endsWith('.css')) return '🌐';
  if (n.endsWith('.json')||n.endsWith('.yaml')||n.endsWith('.yml')) return '⚙️';
  if (n.endsWith('.sql'))                      return '🗃️';
  if (n.endsWith('.sh')||n.endsWith('.bash')||n.endsWith('.bat')) return '📜';
  if (n.endsWith('.md')||n.endsWith('.txt'))   return '📄';
  if (n.endsWith('.zip')||n.endsWith('.rar')||n.endsWith('.gz')) return '🗜️';
  if (ct.startsWith('video/'))                 return '🎬';
  if (ct.startsWith('audio/'))                 return '🎵';
  return '📦';
}

function getLang(fname) {
  var n = fname.toLowerCase();
  if (n.endsWith('.java')||n.endsWith('.kt'))  return 'Java';
  if (n.endsWith('.py'))                       return 'Python';
  if (n.endsWith('.js')||n.endsWith('.mjs'))   return 'JavaScript';
  if (n.endsWith('.ts')||n.endsWith('.tsx'))   return 'TypeScript';
  if (n.endsWith('.html')||n.endsWith('.htm')) return 'HTML';
  if (n.endsWith('.css')||n.endsWith('.scss')) return 'CSS';
  if (n.endsWith('.json'))                     return 'JSON';
  if (n.endsWith('.xml'))                      return 'XML';
  if (n.endsWith('.yaml')||n.endsWith('.yml')) return 'YAML';
  if (n.endsWith('.sql'))                      return 'SQL';
  if (n.endsWith('.sh')||n.endsWith('.bash'))  return 'Shell';
  if (n.endsWith('.md'))                       return 'Markdown';
  if (n.endsWith('.c')||n.endsWith('.cpp')||n.endsWith('.h')) return 'C/C++';
  if (n.endsWith('.cs'))                       return 'C#';
  if (n.endsWith('.go'))                       return 'Go';
  if (n.endsWith('.rs'))                       return 'Rust';
  return 'Plain Text';
}

function hljsLang(fname) {
  var n = fname.toLowerCase();
  if (n.endsWith('.java'))                       return 'java';
  if (n.endsWith('.kt'))                         return 'kotlin';
  if (n.endsWith('.py'))                         return 'python';
  if (n.endsWith('.js')||n.endsWith('.mjs'))     return 'javascript';
  if (n.endsWith('.ts')||n.endsWith('.tsx'))     return 'typescript';
  if (n.endsWith('.html')||n.endsWith('.htm'))   return 'xml';
  if (n.endsWith('.css')||n.endsWith('.scss'))   return 'css';
  if (n.endsWith('.json'))                       return 'json';
  if (n.endsWith('.xml'))                        return 'xml';
  if (n.endsWith('.yaml')||n.endsWith('.yml'))   return 'yaml';
  if (n.endsWith('.sql'))                        return 'sql';
  if (n.endsWith('.sh')||n.endsWith('.bash'))    return 'bash';
  if (n.endsWith('.md'))                         return 'markdown';
  if (n.endsWith('.c')||n.endsWith('.h'))        return 'c';
  if (n.endsWith('.cpp')||n.endsWith('.hpp'))    return 'cpp';
  if (n.endsWith('.cs'))                         return 'csharp';
  if (n.endsWith('.go'))                         return 'go';
  if (n.endsWith('.rs'))                         return 'rust';
  return null;
}

function fmtDate(s) {
  if (!s) return '';
  try {
    return new Date(s).toLocaleDateString('en-IN',
      {day:'2-digit',month:'short',year:'numeric'});
  } catch(e) { return ''; }
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function toast(msg, type) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast ' + (type || 'success') + ' show';
  clearTimeout(t._timer);
  t._timer = setTimeout(function(){ t.classList.remove('show'); }, 2800);
}

// ── KEYBOARD SHORTCUTS ────────────────────────────────
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closePrev();
    document.getElementById('umod').classList.remove('show');
    document.getElementById('fmod').classList.remove('show');
    document.getElementById('shareModal').classList.remove('show');
    document.getElementById('setPinModal').classList.remove('show');
    closePinModal();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
    e.preventDefault(); openUpload();
  }
});