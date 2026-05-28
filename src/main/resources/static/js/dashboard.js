// ═══════════════════════════════════════════════════════════
// SFSS Dashboard — dashboard.js
// ═══════════════════════════════════════════════════════════

// ── STATE ─────────────────────────────────────────────────
var ST = {view:'home', id:null, label:'', bc:[]};
var folders = [];
var unlockedFolders = {}; // {folderId: timestamp} — 30 min unlock cache
var currentShareFileId = null;
var currentPinFolderId = null;
var currentPinFolderName = null;
var currentPinValue = '';
var setPinFolderId = null;

// ── CATEGORY CONFIG ───────────────────────────────────────
var CATS = [
  {key:'PDFs',          icon:'📕', cls:'cp',  label:'PDFs'},
  {key:'Images',        icon:'🖼️',  cls:'ci2', label:'Images'},
  {key:'Documents',     icon:'📝', cls:'cd',  label:'Documents'},
  {key:'Spreadsheets',  icon:'📊', cls:'cs',  label:'Spreadsheets'},
  {key:'Presentations', icon:'📑', cls:'cpt', label:'Presentations'},
  {key:'Text Files',    icon:'📄', cls:'ct',  label:'Text Files'},
  {key:'Code',          icon:'💻', cls:'cco', label:'Code'},
  {key:'Archives',      icon:'🗜️',  cls:'ca',  label:'Archives'},
  {key:'Others',        icon:'📦', cls:'cot', label:'Others'}
];

var CICONS = {
  'Code \u203a Java':'☕',
  'Code \u203a Python':'🐍',
  'Code \u203a JavaScript':'🟨',
  'Code \u203a Web':'🌐',
  'Code \u203a Config':'⚙️',
  'Code \u203a Systems':'⚡',
  'Code \u203a Scripts':'📜',
  'Code \u203a SQL':'🗃️',
  'Code \u203a Other Languages':'🔤'
};

// ── BOOT ──────────────────────────────────────────────────
window.onload = async function() {
  var r = await fetch('/api/auth/me');
  if (!r.ok) { location.href = '/login.html'; return; }
  var u = await r.json();
  document.getElementById('un').textContent = u.name;
  document.getElementById('av').textContent = u.name.charAt(0).toUpperCase();
  await loadFolders();
  await showHome();
};

// ── FOLDERS ───────────────────────────────────────────────
async function loadFolders() {
  var r = await fetch('/api/folders');
  if (!r.ok) return;
  folders = await r.json();
  renderSB();

  // Upload dropdown — flat list
  var r2 = await fetch('/api/folders/flat');
  if (!r2.ok) return;
  var flat = await r2.json();
  var sel = document.getElementById('fsel');
  sel.innerHTML = '<option value="">🤖 Auto-detect by file type</option>';
  flat.forEach(function(f) {
    var o = document.createElement('option');
    o.value = f.folderId;
    var prefix = f.parentFolderId ? '  └ ' : '';
    o.textContent = prefix + '📂 ' + f.folderName;
    sel.appendChild(o);
  });
}

function renderSB() {
  document.getElementById('navHome').className = 'ni' + (ST.view === 'home' ? ' act' : '');
  document.getElementById('navShared').className = 'ni' + (ST.view === 'shared' ? ' act' : '');

  var el = document.getElementById('sbf');
  if (!folders.length) {
    el.innerHTML = '<div style="font-size:.73rem;color:#475569;text-align:center;padding:.75rem">No folders yet</div>';
    return;
  }
  el.innerHTML = renderFolderTree(folders, 0);
}

function renderFolderTree(folderList, depth) {
  var h = '';
  folderList.forEach(function(f) {
    var act = (ST.view === 'folder' && ST.id === f.folderId) ? ' act' : '';
    var indent = depth * 14;
    var lockIcon = f.isProtected ? '<span style="font-size:.6rem;color:#f87171;margin-left:2px">🔒</span>' : '';
    var hasSubs = f.subFolders && f.subFolders.length > 0;
    var expandIcon = hasSubs ? '<span style="font-size:.65rem;color:#475569;margin-right:2px">▸</span>' : '';

    h += '<div class="ni' + act + '" style="padding-left:' + (0.65 + depth * 0.9) + 'rem" ' +
         'onclick="handleFolderClick(' + f.folderId + ',\'' + esc(f.folderName) + '\',' + !!f.isProtected + ')">';
    h += expandIcon + '<span class="ico">📂</span>';
    h += '<span class="lbl">' + esc(f.folderName) + lockIcon + '</span>';
    h += '<span class="cnt">' + f.fileCount + '</span>';
    h += '<span class="lock-btn" onclick="openSetPinModal(' + f.folderId + ',\'' +
         esc(f.folderName) + '\',' + !!f.isProtected + ',event)" title="Protect">🔑</span>';
    h += '<span class="del" onclick="delFolder(' + f.folderId + ',event)">✕</span>';
    h += '</div>';

    // Sub-folders
    if (hasSubs) {
      h += renderFolderTree(f.subFolders, depth + 1);
    }
  });
  return h;
}

// ── FOLDER CLICK — checks protection ─────────────────────
function handleFolderClick(fid, name, isProtected) {
  if (!isProtected) {
    openFolder(fid, name);
    return;
  }
  // Check if already unlocked (within 30 min)
  var unlockTime = unlockedFolders[fid];
  if (unlockTime && (Date.now() - unlockTime) < 30 * 60 * 1000) {
    openFolder(fid, name);
    return;
  }
  // Show PIN modal
  showPinModal(fid, name);
}

// ── OVERVIEW ──────────────────────────────────────────────
async function showHome() {
  setNav('home', null, 'Overview', [{label:'Home'}]);
  var r = await fetch('/api/files/stats');
  var d = await r.json();
  var cats = d.categories || {};
  var total = d.total || 0;
  var used = d.storageUsed || '0 B';
  var bytes = d.storageBytes || 0;
  var pct = Math.min((bytes / (1024*1024*1024)) * 100, 100).toFixed(1);
  var uname = document.getElementById('un').textContent;

  var h = '';
  h += '<div class="hero"><div class="hero-l">';
  h += '<h2>Welcome back, ' + esc(uname) + '! 👋</h2>';
  h += '<p>Your personal secure file vault</p>';
  h += '<div class="sbar"><div class="sfill" style="width:' + pct + '%"></div></div>';
  h += '<div class="slbl">Storage used: <strong style="color:#94a3b8">' + used + '</strong></div>';
  h += '</div><div class="hero-r"><div class="big">' + total + '</div><div class="sub">Total Files</div></div></div>';
  h += '<div class="shd"><h3>Browse by Type</h3></div><div class="cg">';
  CATS.forEach(function(c) {
    h += '<div class="cc ' + c.cls + '" onclick="openCat(\'' + c.key + '\',\'' + c.icon + '\',\'' + c.label + '\')">';
    h += '<div class="ci">' + c.icon + '</div>';
    h += '<div class="ck">' + (cats[c.key] || 0) + '</div>';
    h += '<div class="cl">' + c.label + '</div></div>';
  });
  h += '</div><div class="shd"><h3>Recent Uploads</h3><a onclick="showAllFiles()" style="cursor:pointer">View all</a></div>';
  h += '<div class="rl">';



  // Genre Library section
  try {
    var gr = await fetch('/api/rag/genres');
    if (gr.ok) {
      var genres = await gr.json();
      if (genres.length) {
        // Group by genre
        var genreMap = {};
        genres.forEach(function(g) {
          if (!genreMap[g.genre]) genreMap[g.genre] = {count:0, subs:[]};
          genreMap[g.genre].count += parseInt(g.count);
          if (g.genre_sub) genreMap[g.genre].subs.push({sub:g.genre_sub, count:parseInt(g.count)});
        });

        var genreColors = {
          'Fiction':'linear-gradient(135deg,#7c3aed,#6d28d9)',
          'Academic':'linear-gradient(135deg,#2563eb,#1d4ed8)',
          'Philosophy':'linear-gradient(135deg,#0891b2,#0e7490)',
          'Professional':'linear-gradient(135deg,#059669,#047857)',
          'Personal':'linear-gradient(135deg,#d97706,#b45309)',
          'Reference':'linear-gradient(135deg,#dc2626,#b91c1c)',
          'Code':'linear-gradient(135deg,#ca8a04,#a16207)',
          'Other':'linear-gradient(135deg,#475569,#334155)'
        };
        var genreIcons = {
          'Fiction':'📚','Academic':'🎓','Philosophy':'🤔',
          'Professional':'💼','Personal':'👤','Reference':'📖',
          'Code':'💻','Uncategorized':'📦','Other':'📦'
        };

        h += '<div class="shd"><h3>📚 Genre Library</h3>' +
          '<span style="font-size:.75rem;color:var(--mu)">AI-classified content</span></div>';
        h += '<div class="cg">';
        Object.entries(genreMap).forEach(function(e) {
          var g = e[0], data = e[1];
          var color = genreColors[g] || 'linear-gradient(135deg,#475569,#334155)';
          var icon = genreIcons[g] || '📦';
          h += '<div class="cc" style="background:' + color + '" ' +
               'onclick="openGenre(\'' + esc(g) + '\')">';
          h += '<div class="ci">' + icon + '</div>';
          h += '<div class="ck">' + data.count + '</div>';
          h += '<div class="cl">' + esc(g) + '</div></div>';
        });
        h += '</div>';
      }
    }
  } catch(e) {}

  var recent = d.recentFiles || [];
  if (recent.length) {
    recent.forEach(function(f) {
      h += '<div class="ri" onclick="prevFile(' + f.fileId + ',\'' + esc(f.fileName) + '\',\'' + (f.fileType||'') + '\',false)">';
      h += '<div class="rii">' + fileIcon(f.fileType, f.fileName) + '</div>';
      h += '<div style="flex:1;min-width:0"><div class="rin">' + esc(f.fileName) + '</div>';
      h += '<div class="rim">' + f.fileSize + ' · ' + fmtDate(f.uploadedAt) + '</div></div>';
      h += '<div class="ric">' + esc(f.category || f.folderName || '') + '</div></div>';
    });
  } else {
    h += '<div style="font-size:.84rem;color:var(--mu);padding:.75rem">No files yet — upload something!</div>';
  }
  h += '</div>';
  document.getElementById('content').innerHTML = h;
}

//Open genre Function
async function openGenre(genre) {
  setNav('genre', genre, genreIcons[genre] || '📚' + ' ' + genre,
    [{label:'Home',fn:'showHome'},{label:genre}]);

  // Show sub-genre breakdown first
  var r = await fetch('/api/rag/genres');
  var allGenres = r.ok ? await r.json() : [];
  var subs = allGenres.filter(function(g) { return g.genre === genre && g.genre_sub; });

  var el = document.getElementById('content');
  var h = '';

  if (subs.length > 1) {
    h += '<div class="shd"><h3>Sub-categories</h3></div><div class="sg">';
    subs.forEach(function(s) {
      h += '<div class="sc" onclick="openGenreSub(\'' + esc(genre) + '\',\'' +
           esc(s.genre_sub) + '\')">';
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
      '<h3>No files in this genre</h3>' +
      '<p style="font-size:.82rem">Index your files using ⚡ to auto-classify</p></div>';
  }
  el.innerHTML = h;
}

async function openGenreSub(genre, sub) {
  setNav('genre-sub', genre + '/' + sub, genre + ' › ' + sub,
    [{label:'Home',fn:'showHome'},{label:genre,fn:'function(){openGenre(\''+genre+'\')}'},{label:sub}]);
  var r = await fetch('/api/files/genre/' + encodeURIComponent(genre) + '?sub=' + encodeURIComponent(sub));
  renderGrid(r.ok ? await r.json() : [], genre + ' › ' + sub);
}

var genreIcons = {
  'Fiction':'📚','Academic':'🎓','Philosophy':'🤔',
  'Professional':'💼','Personal':'👤','Reference':'📖',
  'Code':'💻','Uncategorized':'📦','Other':'📦'
};

async function showAllFiles() {
  setNav('all', null, 'All Files', [{label:'Home',fn:'showHome'}]);
  var r = await fetch('/api/files');
  renderGrid(await r.json(), 'All Files');
}

// ── CATEGORIES ────────────────────────────────────────────
async function openCat(key, icon, label) {
  if (key === 'Code') { await showCodeSubs(); return; }
  if (key === 'Others') { await showOthersSubs(); return; }
  setNav('cat', key, icon + ' ' + label, [{label:'Home',fn:'showHome'},{label:label}]);
  var r = await fetch('/api/files/category/' + encodeURIComponent(key));
  renderGrid(await r.json(), icon + ' ' + label);
}

async function showCodeSubs() {
  setNav('code-subs', null, '💻 Code', [{label:'Home',fn:'showHome'},{label:'Code'}]);
  var r = await fetch('/api/files/code-subcats');
  var data = await r.json();
  var h = '<div class="shd"><h3>Code Sub-categories</h3></div><div class="sg">';
  Object.entries(data).forEach(function(e) {
    var k = e[0], v = e[1];
    var ico = CICONS[k] || '💾';
    var lbl = k.replace('Code \u203a ', '');
    h += '<div class="sc" onclick="openCodeSub(\'' + esc(k) + '\',\'' + ico + '\',\'' + esc(lbl) + '\')">';
    h += '<div class="sci">' + ico + '</div><div class="scn">' + v + '</div>';
    h += '<div class="scl">' + esc(lbl) + '</div></div>';
  });
  h += '</div>';
  document.getElementById('content').innerHTML = h;
}

async function openCodeSub(cat, icon, label) {
  setNav('code-sub', cat, icon + ' ' + label,
    [{label:'Home',fn:'showHome'},{label:'Code',fn:'showCodeSubs'},{label:label}]);
  var r = await fetch('/api/files/category/' + encodeURIComponent(cat));
  renderGrid(await r.json(), icon + ' ' + label);
}

async function showOthersSubs() {
  setNav('others-subs', null, '📦 Others', [{label:'Home',fn:'showHome'},{label:'Others'}]);
  var r = await fetch('/api/files/others-subcats');
  var data = await r.json();
  var entries = Object.entries(data);
  if (!entries.length) {
    document.getElementById('content').innerHTML =
      '<div style="padding:3rem;text-align:center;color:var(--mu)">No miscellaneous files</div>';
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
  var extClean = ext.replace('.', '');
  setNav('others-sub', ext, ext + ' Files',
    [{label:'Home',fn:'showHome'},{label:'Others',fn:'showOthersSubs'},{label:ext}]);
  var r = await fetch('/api/files/ext/' + encodeURIComponent(extClean));
  renderGrid(await r.json(), ext + ' Files');
}

// ── FOLDER OPEN ───────────────────────────────────────────
async function openFolder(fid, fname, parentName) {
  var bc = [{label:'Home',fn:'showHome'}];
  if (parentName) bc.push({label:parentName});
  bc.push({label:fname});
  setNav('folder', fid, '📂 ' + fname, bc);

  // Get extension stats first
  var statsR = await fetch('/api/files/folder/' + fid + '/extstats');
  var stats = statsR.ok ? await statsR.json() : {};
  var entries = Object.entries(stats);

  var el = document.getElementById('content');
  var h = '';

  // Sub-folders section
  var allFolders = await getAllFoldersFlat();
  var subs = allFolders.filter(function(f) { return f.parentFolderId === fid; });
  if (subs.length) {
    h += '<div class="shd"><h3>📁 Sub-folders</h3>' +
      '<button onclick="openCreateSubFolder(' + fid + ',\'' + esc(fname) + '\')" ' +
      'style="font-size:.75rem;color:var(--bl);background:none;border:none;cursor:pointer">+ New sub-folder</button></div>';
    h += '<div class="cg" style="margin-bottom:1rem">';
    subs.forEach(function(s) {
      var lockIco = s.isProtected ? '🔒 ' : '';
      h += '<div class="cc" style="background:linear-gradient(135deg,#1e293b,#0f172a)" ' +
           'onclick="handleFolderClick(' + s.folderId + ',\'' + esc(s.folderName) + '\',' + !!s.isProtected + ')">';
      h += '<div class="ci">📂</div>';
      h += '<div class="ck" style="font-size:1.3rem">' + lockIco + esc(s.folderName) + '</div>';
      h += '<div class="cl">' + s.fileCount + ' files</div></div>';
    });
    h += '</div>';
  } else {
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">' +
      '<span style="font-size:.75rem;color:var(--mu)">📂 ' + fname + '</span>' +
      '<button onclick="openCreateSubFolder(' + fid + ',\'' + esc(fname) + '\')" ' +
      'style="font-size:.75rem;color:var(--bl);background:none;border:none;cursor:pointer;' +
      'padding:.2rem .6rem;border:1px solid var(--bl);border-radius:6px">+ Sub-folder</button></div>';
  }

  // File type tiles
  if (entries.length) {
    h += '<div class="shd"><h3>Files by Type</h3></div><div class="cg">';
    var extColors = {
      'PDF':'#dc2626','DOCX':'#2563eb','DOC':'#2563eb',
      'XLSX':'#059669','XLS':'#059669','CSV':'#059669',
      'PPTX':'#d97706','JPG':'#7c3aed','JPEG':'#7c3aed',
      'PNG':'#7c3aed','GIF':'#7c3aed','MP4':'#0891b2',
      'ZIP':'#475569','RAR':'#475569','TXT':'#4f46e5',
      'JSON':'#ca8a04','JAVA':'#ca8a04','PY':'#4f46e5',
      'JS':'#ca8a04','HTML':'#dc2626','CSS':'#2563eb'
    };
    entries.sort(function(a,b){return b[1]-a[1];}).forEach(function(e) {
      var ext = e[0], cnt = e[1];
      var color = extColors[ext] || '#475569';
      h += '<div class="cc" style="background:linear-gradient(135deg,' + color + ',' + color + 'cc)" ' +
           'onclick="openFolderByExt(' + fid + ',\'' + esc(fname) + '\',\'' + ext + '\')">';
      h += '<div class="ci">📄</div>';
      h += '<div class="ck">' + cnt + '</div>';
      h += '<div class="cl">.' + ext.toLowerCase() + '</div></div>';
    });
    h += '</div>';
  }

  // All files in folder
  var r = await fetch('/api/files/folder/' + fid);
  if (!r.ok) { el.innerHTML = h; return; }
  var files = await r.json();
  if (files.length) {
    h += '<div class="shd"><h3>All Files</h3><span style="font-size:.78rem;color:var(--mu)">' +
      files.length + ' files</span></div>';
    h += '<div class="fg">';
    files.forEach(function(f) { h += fileCard(f, false); });
    h += '</div>';
  } else {
    h += '<div class="empty"><div style="font-size:3rem;opacity:.4">📭</div>' +
      '<h3 style="margin:.75rem 0 .3rem">Empty folder</h3>' +
      '<p style="font-size:.82rem">Upload files here</p></div>';
  }

  el.innerHTML = h;
}

//New Addition
var currentSubFolderParentId = null;
var currentSubFolderParentName = null;

function openCreateSubFolder(parentId, parentName) {
  currentSubFolderParentId = parentId;
  currentSubFolderParentName = parentName;
  document.getElementById('fmod').classList.add('show');
  document.getElementById('fni').value = '';
  // Update modal title
  document.querySelector('#fmod .mh h3').textContent =
    '📂 New Sub-folder in "' + parentName + '"';
  setTimeout(function(){ document.getElementById('fni').focus(); }, 50);
}

// Update existing createFolder function:
async function createFolder() {
  var name = document.getElementById('fni').value.trim();
  if (!name) { toast('Enter folder name', 'error'); return; }
  var body = {folderName: name};
  if (currentSubFolderParentId) body.parentId = currentSubFolderParentId;

  var r = await fetch('/api/folders', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body)
  });
  var d = await r.json();
  if (d.error) { toast(d.error, 'error'); return; }

  closeFolderModal();
  toast('Folder created!', 'success');
  currentSubFolderParentId = null;
  currentSubFolderParentName = null;
  document.querySelector('#fmod .mh h3').textContent = '📂 New Folder';
  await loadFolders();

  // Reload current view if we're in the parent folder
  if (ST.view === 'folder' && ST.id === (body.parentId || null)) {
    await refresh();
  }
}


async function openFolderByExt(fid, fname, ext) {
  var bc = [{label:'Home',fn:'showHome'},{label:fname,fn:'function(){openFolder(' + fid + ',\'' + fname + '\')}'},{label:'.' + ext.toLowerCase()}];
  setNav('folder-ext', fid, '📂 ' + fname + ' › .' + ext.toLowerCase(), bc);
  var r = await fetch('/api/files/folder/' + fid + '/ext/' + ext);
  renderGrid(await r.json(), '.' + ext.toLowerCase() + ' files in ' + fname);
}

var allFoldersFlatCache = null;
async function getAllFoldersFlat() {
  var r = await fetch('/api/folders/flat');
  if (!r.ok) return [];
  return await r.json();
}
async function delFolder(fid, e) {
  e.stopPropagation();
  if (!confirm('Delete folder? Files move to root.')) return;
  var r = await fetch('/api/folders/' + fid, {method:'DELETE'});
  if (r.ok) {
    toast('Folder deleted', 'success');
    if (ST.view === 'folder' && ST.id === fid) await showHome();
    await loadFolders();
  }
}

async function createFolder() {
  var name = document.getElementById('fni').value.trim();
  if (!name) { toast('Enter folder name', 'error'); return; }
  var r = await fetch('/api/folders', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({folderName: name})
  });
  var d = await r.json();
  if (d.error) { toast(d.error, 'error'); return; }
  closeFolderModal();
  toast('Folder created!', 'success');
  await loadFolders();
}

// ── PIN — SENSITIVE FOLDER ────────────────────────────────
function showPinModal(fid, fname) {
  currentPinFolderId = fid;
  currentPinFolderName = fname;
  currentPinValue = '';
  document.getElementById('pinFolderName').textContent = fname;
  document.getElementById('pinError').textContent = '';
  updatePinDots();
  document.getElementById('pinModal').classList.add('show');
}

function closePinModal() {
  document.getElementById('pinModal').classList.remove('show');
  currentPinValue = '';
  updatePinDots();
}

function pinKey(val) {
  if (val === 'DEL') {
    currentPinValue = currentPinValue.slice(0, -1);
    updatePinDots();
    return;
  }
  if (val === 'C') {
    currentPinValue = '';
    updatePinDots();
    return;
  }
  if (currentPinValue.length >= 8) return;
  currentPinValue += val;
  updatePinDots();
  if (currentPinValue.length === 4) {
    setTimeout(submitPin, 150);
  }
}

function updatePinDots() {
  var dots = document.querySelectorAll('.pin-dot');
  dots.forEach(function(d, i) {
    d.classList.toggle('filled', i < currentPinValue.length);
  });
}

async function submitPin() {
  var r = await fetch('/api/folders/' + currentPinFolderId + '/verify', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({pin: currentPinValue})
  });
  var d = await r.json();
  if (d.verified) {
    unlockedFolders[currentPinFolderId] = Date.now();
    closePinModal();
    toast('✅ Folder unlocked!', 'success');
    await openFolder(currentPinFolderId, currentPinFolderName);
  } else {
    document.getElementById('pinError').textContent = '❌ Wrong PIN';
    currentPinValue = '';
    updatePinDots();
    setTimeout(function() {
      document.getElementById('pinError').textContent = '';
    }, 2000);
  }
}

// ── SET/REMOVE PIN ────────────────────────────────────────
function openSetPinModal(fid, fname, isProtected, e) {
  e.stopPropagation();
  setPinFolderId = fid;
  var title = document.getElementById('setPinTitle');
  var body = document.getElementById('setPinBody');
  var btn = document.getElementById('savePinBtn');

  if (isProtected) {
    title.textContent = '🔓 Remove Protection';
    body.innerHTML = '<div style="font-size:.85rem;color:var(--mu);padding:.5rem 0">' +
      'Remove PIN protection from <strong>' + esc(fname) + '</strong>?<br>' +
      '<div class="mfg" style="margin-top:.75rem">' +
      '<label class="mfl">Enter current PIN to confirm</label>' +
      '<input type="password" class="mfi" id="newPinInput" placeholder="Current PIN"/>' +
      '</div></div>';
    btn.textContent = 'Remove Protection';
    btn.onclick = function() { savePin(true); };
  } else {
    title.textContent = '🔒 Protect Folder';
    body.innerHTML =
      '<div class="mfg"><label class="mfl">Set PIN (4-8 digits)</label>' +
      '<input type="password" class="mfi" id="newPinInput" placeholder="Enter PIN" maxlength="8"/></div>' +
      '<div class="mfg"><label class="mfl">Confirm PIN</label>' +
      '<input type="password" class="mfi" id="confirmPinInput" placeholder="Confirm PIN" maxlength="8"/></div>' +
      '<div id="setPinError" style="font-size:.78rem;color:var(--rd);min-height:18px"></div>';
    btn.textContent = 'Set PIN';
    btn.onclick = function() { savePin(false); };
  }
  document.getElementById('setPinModal').classList.add('show');
}

async function savePin(removing) {
  var pinInput = document.getElementById('newPinInput');
  var pin = pinInput ? pinInput.value : '';
  var errEl = document.getElementById('setPinError');

  if (!removing) {
    var confirm = document.getElementById('confirmPinInput');
    var confirmVal = confirm ? confirm.value : '';
    if (pin.length < 4) {
      if (errEl) errEl.textContent = 'PIN must be at least 4 characters';
      return;
    }
    if (pin !== confirmVal) {
      if (errEl) errEl.textContent = 'PINs do not match';
      return;
    }
  } else {
    if (!pin) { toast('Enter current PIN', 'error'); return; }
  }

  var r = await fetch('/api/folders/' + setPinFolderId + '/protect', {
    method: 'PUT',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({enable: !removing, pin: pin})
  });
  var d = await r.json();
  if (d.error) {
    toast(d.error, 'error');
  } else {
    document.getElementById('setPinModal').classList.remove('show');
    toast(d.message, 'success');
    if (removing) delete unlockedFolders[setPinFolderId];
    await loadFolders();
  }
}

// ── FILE GRID ─────────────────────────────────────────────
function renderGrid(files, title) {
  var el = document.getElementById('content');
  var cnt = files.length;
  var hd = title ? '<div class="shd"><h3>' + esc(title) + '</h3>' +
    '<span style="font-size:.78rem;color:var(--mu)">' + cnt +
    ' file' + (cnt !== 1 ? 's' : '') + '</span></div>' : '';
  if (!files.length) {
    el.innerHTML = hd + '<div class="fg"><div class="empty">' +
      '<div style="font-size:3rem;opacity:.4">📭</div>' +
      '<h3 style="margin:.75rem 0 .3rem">No files here</h3>' +
      '<p style="font-size:.82rem">Upload files to get started</p></div></div>';
    return;
  }
  var h = hd + '<div class="fg">';
  files.forEach(function(f) { h += fileCard(f, false); });
  h += '</div>';
  el.innerHTML = h;
}

function fileCard(f, isShared) {
  var canP = f.isImage || canPreview(f.fileType, f.fileName);
  var thumb = f.isImage
    ? '<img src="/api/files/preview/' + f.fileId + '" loading="lazy"/>'
    : '<div class="ti">' + fileIcon(f.fileType, f.fileName) + '</div>';
  var h = '<div class="fc">';
  h += '<div class="ft">' + thumb + '<div class="fov">';
  if (canP) h += '<button class="ob" onclick="prevFile(' + f.fileId + ',\'' +
    esc(f.fileName) + '\',\'' + (f.fileType||'') + '\',' + !!isShared + ')">👁 View</button>';
  h += '<a href="/api/files/download/' + f.fileId + '" class="ob" onclick="event.stopPropagation()">⬇</a>';

  // Agar indexable file hai to index button add karo
  var indexable = (f.fileType && (f.fileType.includes('pdf') || f.fileType.includes('text'))) ||
    ['.txt','.md','.pdf','.py','.java','.js','.json','.xml','.yaml','.yml',
     '.html','.css','.sql','.kt','.ts','.sh'].some(function(e) {
       return f.fileName.toLowerCase().endsWith(e);
     });
  if (!isShared && indexable) {
    h += '<button id="idx_' + f.fileId + '" class="ob" title="Index for AI search" ' +
      'onclick="indexCurrentFile(' + f.fileId + ')">⚡</button>';
  }



  if (!isShared) {
    h += '<button class="ob" style="background:rgba(99,102,241,.85);color:#fff" ' +
      'onclick="openShareModal(' + f.fileId + ',\'' + esc(f.fileName) + '\',event)">🔗</button>';
    h += '<button class="ob obd" onclick="delFile(' + f.fileId + ',event)">🗑</button>';
  }
  h += '</div></div><div class="fb">';
  h += '<div class="fn" title="' + esc(f.fileName) + '">' + esc(f.fileName) + '</div>';
  h += '<div class="fs2">' + f.fileSize + '</div>';
  h += '<div class="fd">' + fmtDate(f.uploadedAt) +
  // fb div mein, fd ke baad:
  if (f.genre) {
    h += '<div style="font-size:.65rem;color:var(--bl);margin-top:2px;' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
      '🏷️ ' + esc(f.genre) + (f.genreSub ? ' › ' + esc(f.genreSub) : '') + '</div>';
  }'</div>';

  h += '</div></div>';
  return h;
}

function canPreview(type, name) {
  if (!name) return false;
  var n = name.toLowerCase();
  var exts = ['.java','.kt','.py','.js','.ts','.jsx','.tsx','.html','.htm',
    '.css','.scss','.json','.xml','.yaml','.yml','.sql','.sh','.bash',
    '.md','.txt','.log','.c','.cpp','.h','.cs','.go','.rs','.gradle',
    '.toml','.env','.bat','.ps1','.properties','.conf','.ini','.cfg','.rb','.php'];
  if (type && (type.startsWith('image/') || type.includes('pdf'))) return true;
  return exts.some(function(e) { return n.endsWith(e); });
}

// ── PREVIEW ───────────────────────────────────────────────
async function prevFile(fid, fname, ftype, isShared) {
  var baseUrl = isShared ? '/api/share' : '/api/files';
  document.getElementById('pov').classList.add('show');
  document.getElementById('ptitle').textContent = fname;
  document.getElementById('picon').textContent = fileIcon(ftype, fname);
  document.getElementById('pdl').href = baseUrl + '/download/' + fid;
  document.getElementById('plang').style.display = 'none';
  document.getElementById('pbody').innerHTML =
    '<div style="text-align:center;padding:4rem;color:#475569">Loading preview...</div>';

  try {
    var resp = await fetch(baseUrl + '/preview/' + fid);
    if (!resp.ok) throw new Error('fail');

    if (ftype && ftype.startsWith('image/')) {
      var blob = await resp.blob();
      var url = URL.createObjectURL(blob);
      document.getElementById('pbody').innerHTML =
        '<div style="text-align:center;padding:1.25rem;background:#0a0f1a;min-height:300px;' +
        'display:flex;align-items:center;justify-content:center">' +
        '<img src="' + url + '" style="max-width:100%;max-height:78vh;border-radius:8px;' +
        'object-fit:contain"/></div>';
    } else if (ftype && ftype.includes('pdf')) {
      var blob2 = await resp.blob();
      var url2 = URL.createObjectURL(blob2);
      document.getElementById('pbody').innerHTML =
        '<embed src="' + url2 + '" type="application/pdf" style="width:100%;height:80vh;display:block"/>';
    } else {
      var text = await resp.text();
      var lang = getLang(fname);
      if (lang !== 'Plain Text') {
        var lb = document.getElementById('plang');
        lb.textContent = lang; lb.style.display = 'inline';
      }
      var lines = text.split('\n');
      var highlighted = null;
      if (window.hljs) {
        var hl = hljsLang(fname);
        if (hl) {
          try {
            highlighted = hljs.highlight(text,
              {language:hl, ignoreIllegals:true}).value.split('\n');
          } catch(ex) {}
        }
      }
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

function closePrev() { document.getElementById('pov').classList.remove('show'); }

// ── FILE SHARING ──────────────────────────────────────────
function openShareModal(fileId, fileName, e) {
  e.stopPropagation();
  currentShareFileId = fileId;
  document.getElementById('shareFileName').textContent = fileName;
  document.getElementById('shareEmail').value = '';
  document.getElementById('shareResult').innerHTML = '';
  document.getElementById('shareModal').classList.add('show');
  loadShareList(fileId);
  setTimeout(function() { document.getElementById('shareEmail').focus(); }, 50);
}

async function loadShareList(fileId) {
  var r = await fetch('/api/share/sent/' + fileId);
  if (!r.ok) return;
  var list = await r.json();
  var el = document.getElementById('shareList');
  if (!list.length) {
    el.innerHTML = '<div style="font-size:.75rem;color:var(--mu)">Not shared with anyone yet</div>';
    return;
  }
  var h = '<div style="font-size:.75rem;font-weight:700;color:var(--mu);margin-bottom:.4rem">Currently shared with:</div>';
  list.forEach(function(s) {
    h += '<div style="display:flex;align-items:center;justify-content:space-between;' +
      'padding:.4rem .6rem;background:var(--bg);border-radius:8px;margin-bottom:.3rem;font-size:.8rem">';
    h += '<span>👤 ' + esc(s.sharedWith) + ' <span style="color:var(--mu)">(' + s.permission + ')</span></span>';
    h += '<button onclick="revokeShare(' + s.shareId + ')" ' +
      'style="background:none;border:none;color:var(--rd);cursor:pointer;font-size:.8rem">✕ Remove</button>';
    h += '</div>';
  });
  el.innerHTML = h;
}

async function doShare() {
  var email = document.getElementById('shareEmail').value.trim();
  var perm = document.getElementById('sharePerm').value;
  var res = document.getElementById('shareResult');
  if (!email) { res.innerHTML = '<span style="color:var(--rd)">Enter email</span>'; return; }
  var r = await fetch('/api/share', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({fileId: String(currentShareFileId), email: email, permission: perm})
  });
  var d = await r.json();
  if (d.error) {
    res.innerHTML = '<span style="color:var(--rd)">' + esc(d.error) + '</span>';
  } else {
    res.innerHTML = '<span style="color:var(--gr)">✅ ' + esc(d.message) + '</span>';
    document.getElementById('shareEmail').value = '';
    loadShareList(currentShareFileId);
  }
}

async function revokeShare(shareId) {
  var r = await fetch('/api/share/' + shareId, {method:'DELETE'});
  if (r.ok) loadShareList(currentShareFileId);
}

async function showSharedWithMe() {
  setNav('shared', null, '🤝 Shared with Me',
    [{label:'Home',fn:'showHome'},{label:'Shared with Me'}]);
  var r = await fetch('/api/share/received');
  if (!r.ok) { return; }
  var files = await r.json();
  var el = document.getElementById('content');
  if (!files.length) {
    el.innerHTML = '<div class="empty"><div class="ei">🤝</div>' +
      '<h3>No files shared with you</h3>' +
      '<p style="font-size:.82rem">When someone shares a file, it appears here</p></div>';
    return;
  }
  var h = '<div class="shd"><h3>Shared with Me</h3>' +
    '<span style="font-size:.78rem;color:var(--mu)">' + files.length + ' file(s)</span></div>';
  h += '<div class="fg">';
  files.forEach(function(f) {
    var canP = f.isImage || canPreview(f.fileType, f.fileName);
    var thumb = f.isImage
      ? '<img src="/api/share/preview/' + f.fileId + '" loading="lazy"/>'
      : '<div class="ti">' + fileIcon(f.fileType, f.fileName) + '</div>';
    h += '<div class="fc"><div class="ft">' + thumb + '<div class="fov">';
    if (canP) h += '<button class="ob" onclick="prevFile(' + f.fileId + ',\'' +
      esc(f.fileName) + '\',\'' + (f.fileType||'') + '\',true)">👁 View</button>';
    if (f.permission !== 'view') {
      h += '<a href="/api/share/download/' + f.fileId + '" class="ob">⬇</a>';
    }
    h += '</div></div><div class="fb">';
    h += '<div class="fn">' + esc(f.fileName) + '</div>';
    h += '<div class="fs2">' + f.fileSize + '</div>';
    h += '<div class="fd">By ' + esc(f.sharedBy) + ' · ' + f.permission + '</div>';
    h += '</div></div>';
  });
  h += '</div>';
  el.innerHTML = h;
}

// ── UPLOAD ────────────────────────────────────────────────
function openUpload() {
  document.getElementById('umod').classList.add('show');
  if (ST.view === 'folder') document.getElementById('fsel').value = ST.id;
}
function closeUpload() {
  document.getElementById('umod').classList.remove('show');
  document.getElementById('ufi').value = '';
  document.getElementById('dtxt').textContent = 'Click or drag files here';
}
function onFilePick(inp) {
  var n = inp.files.length;
  document.getElementById('dtxt').textContent =
    n === 1 ? inp.files[0].name : n + ' files selected';
}
async function doUpload() {
  var inp = document.getElementById('ufi');
  if (!inp.files.length) { toast('Select a file first', 'error'); return; }
  var fid = document.getElementById('fsel').value;
  var ok = 0;
  toast('Uploading...', 'info');
  for (var i = 0; i < inp.files.length; i++) {
    var fd = new FormData();
    fd.append('file', inp.files[i]);
    if (fid) fd.append('folderId', fid);
    var r = await fetch('/api/files/upload', {method:'POST', body:fd});
    if (r.status === 401) {
      toast('Session expired — logging out', 'error');
      setTimeout(function(){ location.href = '/login.html'; }, 1500);
      closeUpload(); return;
    }
    if (r.ok) ok++;
  }
  closeUpload();
  toast(ok + ' file(s) uploaded!', 'success');
  await loadFolders();
  await refresh();
}

// ── DELETE FILE ───────────────────────────────────────────
async function delFile(fid, e) {
  e.stopPropagation();
  if (!confirm('Delete this file permanently?')) return;
  var r = await fetch('/api/files/' + fid, {method:'DELETE'});
  if (r.ok) {
    toast('File deleted', 'success');
    await loadFolders();
    await refresh();
  }
}

// ── SEARCH ────────────────────────────────────────────────
var sTimer;
function handleSearch(val) {
  clearTimeout(sTimer);
  if (!val.trim()) { refresh(); return; }
  sTimer = setTimeout(async function() {
    setNav('search', val, 'Search: ' + val, [{label:'Home',fn:'showHome'}]);
    var r = await fetch('/api/files/search?q=' + encodeURIComponent(val));
    renderGrid(await r.json(), 'Results for "' + val + '"');
  }, 300);
}

// ── NAVIGATION HELPERS ────────────────────────────────────
function setNav(view, id, title, bcs) {
  ST = {view:view, id:id, label:title, bc:bcs};
  document.getElementById('pt').textContent = title;
  var h = '';
  bcs.forEach(function(b, i) {
    if (i > 0) h += '<span class="sep">›</span>';
    if (b.fn) h += '<span onclick="' + b.fn + '()">' + esc(b.label) + '</span>';
    else h += '<span>' + esc(b.label) + '</span>';
  });
  document.getElementById('bc').innerHTML = h;
  renderSB();
}

function goHome() { showHome(); }

async function refresh() {
  var v = ST.view;
  if (v === 'home') await showHome();
  else if (v === 'all') await showAllFiles();
  else if (v === 'cat') {
    var c = CATS.find(function(x){ return x.key === ST.id; });
    if (c) await openCat(ST.id, c.icon, c.label);
  }
  else if (v === 'code-subs') await showCodeSubs();
  else if (v === 'code-sub') {
    var ico = CICONS[ST.id] || '💾';
    var lbl = ST.id.replace('Code \u203a ', '');
    await openCodeSub(ST.id, ico, lbl);
  }
  else if (v === 'others-subs') await showOthersSubs();
  else if (v === 'others-sub') await openOthersSub(ST.id);
  else if (v === 'shared') await showSharedWithMe();
  else if (v === 'folder') {
    var f = folders.find(function(x){ return x.folderId === ST.id; });
    if (f) await openFolder(ST.id, f.folderName);
  }
}

// ── FOLDER MODAL ─────────────────────────────────────────
function openFolderModal() {
  document.getElementById('fmod').classList.add('show');
  setTimeout(function(){ document.getElementById('fni').focus(); }, 50);
}
function closeFolderModal() {
  document.getElementById('fmod').classList.remove('show');
  document.getElementById('fni').value = '';
}

// ── LOGOUT ───────────────────────────────────────────────
async function logout() {
  await fetch('/api/auth/logout', {method:'POST'});
  location.href = '/login.html';
}

// ── UTILITIES ─────────────────────────────────────────────
function getLang(fname) {
  var n = fname.toLowerCase();
  if (n.endsWith('.java')||n.endsWith('.kt')) return 'Java';
  if (n.endsWith('.py')) return 'Python';
  if (n.endsWith('.js')||n.endsWith('.mjs')) return 'JavaScript';
  if (n.endsWith('.ts')) return 'TypeScript';
  if (n.endsWith('.html')||n.endsWith('.htm')) return 'HTML';
  if (n.endsWith('.css')||n.endsWith('.scss')) return 'CSS';
  if (n.endsWith('.json')) return 'JSON';
  if (n.endsWith('.xml')) return 'XML';
  if (n.endsWith('.yaml')||n.endsWith('.yml')) return 'YAML';
  if (n.endsWith('.sql')) return 'SQL';
  if (n.endsWith('.sh')||n.endsWith('.bash')) return 'Shell';
  if (n.endsWith('.md')) return 'Markdown';
  if (n.endsWith('.c')||n.endsWith('.cpp')||n.endsWith('.h')) return 'C/C++';
  if (n.endsWith('.cs')) return 'C#';
  if (n.endsWith('.go')) return 'Go';
  if (n.endsWith('.rs')) return 'Rust';
  return 'Plain Text';
}

function hljsLang(fname) {
  var n = fname.toLowerCase();
  if (n.endsWith('.java')) return 'java';
  if (n.endsWith('.kt')) return 'kotlin';
  if (n.endsWith('.py')) return 'python';
  if (n.endsWith('.js')||n.endsWith('.mjs')) return 'javascript';
  if (n.endsWith('.ts')) return 'typescript';
  if (n.endsWith('.html')||n.endsWith('.htm')) return 'xml';
  if (n.endsWith('.css')||n.endsWith('.scss')) return 'css';
  if (n.endsWith('.json')) return 'json';
  if (n.endsWith('.xml')) return 'xml';
  if (n.endsWith('.yaml')||n.endsWith('.yml')) return 'yaml';
  if (n.endsWith('.sql')) return 'sql';
  if (n.endsWith('.sh')||n.endsWith('.bash')) return 'bash';
  if (n.endsWith('.md')) return 'markdown';
  if (n.endsWith('.c')||n.endsWith('.h')) return 'c';
  if (n.endsWith('.cpp')||n.endsWith('.hpp')) return 'cpp';
  if (n.endsWith('.cs')) return 'csharp';
  if (n.endsWith('.go')) return 'go';
  if (n.endsWith('.rs')) return 'rust';
  return null;
}

function fileIcon(type, name) {
  if (!type) type = ''; if (!name) name = '';
  var n = name.toLowerCase();
  if (type.includes('pdf')||n.endsWith('.pdf')) return '📕';
  if (type.startsWith('image/')) return '🖼️';
  if (type.includes('word')||n.endsWith('.docx')||n.endsWith('.doc')) return '📝';
  if (type.includes('sheet')||type.includes('excel')||n.endsWith('.xlsx')||n.endsWith('.xls')||n.endsWith('.csv')) return '📊';
  if (type.includes('presentation')||n.endsWith('.pptx')) return '📑';
  if (n.endsWith('.java')||n.endsWith('.kt')) return '☕';
  if (n.endsWith('.py')) return '🐍';
  if (n.endsWith('.js')||n.endsWith('.ts')||n.endsWith('.jsx')||n.endsWith('.tsx')) return '🟨';
  if (n.endsWith('.html')||n.endsWith('.css')) return '🌐';
  if (n.endsWith('.json')||n.endsWith('.yaml')||n.endsWith('.yml')) return '⚙️';
  if (n.endsWith('.sql')) return '🗃️';
  if (n.endsWith('.sh')||n.endsWith('.bash')||n.endsWith('.bat')) return '📜';
  if (n.endsWith('.md')||n.endsWith('.txt')) return '📄';
  if (n.endsWith('.zip')||n.endsWith('.rar')||n.endsWith('.gz')) return '🗜️';
  if (type.includes('video')) return '🎬';
  if (type.includes('audio')) return '🎵';
  return '📦';
}

function fmtDate(s) {
  if (!s) return '';
  return new Date(s).toLocaleDateString('en-IN',
    {day:'2-digit', month:'short', year:'numeric'});
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

function toast(msg, type) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + (type || 'success') + ' show';
  setTimeout(function(){ t.classList.remove('show'); }, 2800);
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closePrev();
    document.getElementById('umod').classList.remove('show');
    document.getElementById('fmod').classList.remove('show');
    document.getElementById('shareModal').classList.remove('show');
    document.getElementById('setPinModal').classList.remove('show');
    closePinModal();
  }
});