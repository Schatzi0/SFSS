var ST = {view:'home',id:null};
var folders = [];
var flatF   = [];
var unlocked= {};
var shareId = null;
var pinFid  = null;
var pinFname= null;
var pinVal  = '';
var setPinId= null;
var setPinRm= false;
var subPId  = null;
var sTimer  = null;

var CATS = [
  {key:'PDFs',         cls:'cp',  label:'PDFs',          icon:'&#128213;'},
  {key:'Images',       cls:'ci2', label:'Images',        icon:'&#128444;'},
  {key:'Documents',    cls:'cd',  label:'Documents',     icon:'&#128221;'},
  {key:'Spreadsheets', cls:'cs',  label:'Spreadsheets',  icon:'&#128202;'},
  {key:'Presentations',cls:'cpt', label:'Presentations', icon:'&#128209;'},
  {key:'Text Files',   cls:'ct',  label:'Text Files',    icon:'&#128196;'},
  {key:'Code',         cls:'cco', label:'Code',          icon:'&#128187;'},
  {key:'Archives',     cls:'ca',  label:'Archives',      icon:'&#128476;'},
  {key:'Others',       cls:'cot', label:'Others',        icon:'&#128230;'}
];

var GCOL = {
  'Study':        'linear-gradient(135deg,#2563eb,#1d4ed8)',
  'Work':         'linear-gradient(135deg,#059669,#047857)',
  'Personal':     'linear-gradient(135deg,#d97706,#b45309)',
  'Code':         'linear-gradient(135deg,#ca8a04,#a16207)',
  'Fiction':      'linear-gradient(135deg,#7c3aed,#6d28d9)',
  'Reference':    'linear-gradient(135deg,#dc2626,#b91c1c)',
  'Other':        'linear-gradient(135deg,#475569,#334155)',
  'Uncategorized':'linear-gradient(135deg,#475569,#334155)'
};
var GICO = {
  'Study':'&#127891;','Work':'&#128188;','Personal':'&#128100;',
  'Code':'&#128187;','Fiction':'&#128218;','Reference':'&#128216;',
  'Other':'&#128230;','Uncategorized':'&#128230;'
};

window.onload = function() { boot(); };

async function boot() {
  try {
    var r = await fetch('/api/auth/me');
    if (!r.ok) { location.href='/login.html'; return; }
    var u = await r.json();
    document.getElementById('un').textContent = u.name||'User';
    document.getElementById('av').textContent = (u.name||'U').charAt(0).toUpperCase();
    await loadFolders();
    await showHome();
    setTimeout(ragLoadStatus, 1000);
  } catch(e) { location.href='/login.html'; }
}

async function loadFolders() {
  try {
    var r = await fetch('/api/folders');
    if (!r.ok) return;
    folders = await r.json();
    flatF = flatten(folders, 0);
    renderSB();
    var r2 = await fetch('/api/folders/flat');
    if (!r2.ok) return;
    var flat = await r2.json();
    var sel = document.getElementById('fsel');
    sel.innerHTML = '<option value="">Auto-detect by file type</option>';
    for (var i=0;i<flat.length;i++) {
      var o = document.createElement('option');
      o.value = flat[i].folderId;
      o.textContent = (flat[i].parentFolderId?'  > ':'')+flat[i].folderName;
      sel.appendChild(o);
    }
  } catch(e) {}
}

function flatten(list, d) {
  var r=[];
  if (!list) return r;
  for (var i=0;i<list.length;i++) {
    var f=list[i];
    r.push({folderId:f.folderId,folderName:f.folderName,parentFolderId:f.parentFolderId,
            fileCount:f.fileCount||0,isProtected:!!f.isProtected,_d:d});
    if (f.subFolders&&f.subFolders.length) {
      var s=flatten(f.subFolders,d+1);
      for (var j=0;j<s.length;j++) r.push(s[j]);
    }
  }
  return r;
}

function renderSB() {
  document.getElementById('navHome').className   = 'ni'+(ST.view==='home'  ?' act':'');
  document.getElementById('navGenre').className  = 'ni'+(ST.view==='genre-lib'?' act':'');
  document.getElementById('navShared').className = 'ni'+(ST.view==='shared'?' act':'');
  var el = document.getElementById('sbf');
  if (!flatF.length) { el.innerHTML='<div style="font-size:.73rem;color:#475569;text-align:center;padding:.75rem">No folders yet</div>'; return; }
  var h='';
  for (var i=0;i<flatF.length;i++) {
    var f=flatF[i];
    var act=(ST.view==='folder'&&ST.id===f.folderId)?' act':'';
    var pl=.65+f._d*.85;
    var lk=f.isProtected?'<span class="lkbadge">&#128274;</span>':'';
    var pre=f._d>0?'&#9492;':'';
    h+='<div class="ni'+act+'" style="padding-left:'+pl+'rem" onclick="handleFolderClick('+f.folderId+',\''+esc(f.folderName)+'\','+f.isProtected+')">';
    h+='<span class="ico">'+pre+'&#128194;</span>';
    h+='<span class="lbl">'+esc(f.folderName)+lk+'</span>';
    h+='<span class="cnt">'+f.fileCount+'</span>';
    h+='<button class="nbtn nlock" onclick="openSetPinModal('+f.folderId+',\''+esc(f.folderName)+'\','+f.isProtected+',event)" title="PIN">&#128273;</button>';
    h+='<button class="nbtn ndel" onclick="delFolder('+f.folderId+',event)" title="Delete">&#10005;</button>';
    h+='</div>';
  }
  el.innerHTML=h;
}

function setNav(view,id,title,bcs) {
  ST={view:view,id:id};
  document.getElementById('pt').textContent=title;
  var h='';
  for (var i=0;i<bcs.length;i++) {
    var b=bcs[i];
    if (i>0) h+='<span class="bcs">&#8250;</span>';
    if (b.fn) h+='<span onclick="'+b.fn+'">'+esc(b.label)+'</span>';
    else      h+='<span>'+esc(b.label)+'</span>';
  }
  document.getElementById('bc').innerHTML=h;
  renderSB();
}

async function refresh() {
  if      (ST.view==='home')      await showHome();
  else if (ST.view==='all')       await showAllFiles();
  else if (ST.view==='shared')    await showSharedWithMe();
  else if (ST.view==='genre-lib') await showGenreLibrary();
  else if (ST.view==='genre')     await openGenre(ST.id);
  else if (ST.view==='cat')       await openCat(ST.id,'',ST.id);
  else if (ST.view==='code-subs') await showCodeSubs();
  else if (ST.view==='code-sub')  await openCodeSub(ST.id);
  else if (ST.view==='o-subs')    await showOthersSubs();
  else if (ST.view==='o-sub')     await openOthersSub(ST.id);
  else if (ST.view==='folder')    await openFolder(ST.id, ST._fname||'Folder');
  else await showHome();
}

// ── HOME ────────────────────────────────────────────────
async function showHome() {
  setNav('home',null,'Overview',[{label:'Home'}]);
  var el=document.getElementById('content');
  el.innerHTML='<div style="padding:3rem;text-align:center;color:var(--mu)">Loading...</div>';
  try {
    var r=await fetch('/api/files/stats');
    if (!r.ok) throw new Error('Stats failed');
    var d=await r.json();
    var cats=d.categories||{},total=d.total||0,used=d.storageUsed||'0 B';
    var bytes=d.storageBytes||0,pct=Math.min((bytes/1073741824)*100,100).toFixed(1);
    var uname=document.getElementById('un').textContent;
    var recent=d.recentFiles||[];
    var h='';
    // Hero
    h+='<div class="hero"><div class="hero-l"><h2>Welcome, '+esc(uname)+'!</h2>';
    h+='<p>Your secure file vault</p>';
    h+='<div class="sbar"><div class="sfill" style="width:'+pct+'%"></div></div>';
    h+='<div class="slbl">Used: <strong style="color:#94a3b8">'+used+'</strong></div></div>';
    h+='<div class="hero-r"><div class="big">'+total+'</div><div class="sub">Files</div></div></div>';
    // Type tiles
    h+='<div class="shd"><h3>Browse by Type</h3></div><div class="cg">';
    for (var i=0;i<CATS.length;i++) {
      var c=CATS[i];
      h+='<div class="cc '+c.cls+'" onclick="openCat(\''+c.key+'\',\''+c.icon+'\',\''+c.label+'\')">';
      h+='<div class="ci">'+c.icon+'</div><div class="ck">'+(cats[c.key]||0)+'</div>';
      h+='<div class="cl">'+c.label+'</div></div>';
    }
    h+='</div>';
    // Recent
    h+='<div class="shd"><h3>Recent Uploads</h3><span onclick="showAllFiles()" style="cursor:pointer;font-size:.78rem;color:var(--bl)">View all</span></div>';
    h+='<div class="rl">';
    if (recent.length) {
      for (var ri=0;ri<recent.length;ri++) {
        var rf=recent[ri];
        h+='<div class="ri" onclick="prevFile('+rf.fileId+',\''+esc(rf.fileName)+'\',\''+(rf.fileType||'')+'\'  ,false)">';
        h+='<div class="rii">'+ficon(rf.fileType,rf.fileName)+'</div>';
        h+='<div style="flex:1;min-width:0"><div class="rin">'+esc(rf.fileName)+'</div>';
        h+='<div class="rim">'+rf.fileSize+' &middot; '+fmtDate(rf.uploadedAt)+'</div></div>';
        h+='<div class="ric">'+esc(rf.genre||rf.category||'')+'</div></div>';
      }
    } else {
      h+='<div style="font-size:.84rem;color:var(--mu);padding:.75rem">No files yet</div>';
    }
    h+='</div>';
    el.innerHTML=h;
  } catch(e) {
    el.innerHTML='<div class="empty"><h3>'+esc(e.message)+'</h3></div>';
  }
}

async function showAllFiles() {
  setNav('all',null,'All Files',[{label:'Home',fn:'showHome()'}]);
  var r=await fetch('/api/files');
  renderGrid(r.ok?await r.json():[],'All Files');
}

// ── GENRE LIBRARY ─────────────────────────────────────────
async function showGenreLibrary() {
  setNav('genre-lib',null,'Genre Library',[{label:'Home',fn:'showHome()'},{label:'Genre Library'}]);
  var el=document.getElementById('content');
  el.innerHTML='<div style="padding:3rem;text-align:center;color:var(--mu)">Loading genres...</div>';
  try {
    var r=await fetch('/api/rag/genres');
    var genres=r.ok?await r.json():[];
    // Group by genre
    var gmap={};
    for (var i=0;i<genres.length;i++) {
      var g=genres[i];
      if (!g.genre) continue;
      if (!gmap[g.genre]) gmap[g.genre]={count:0,subs:[]};
      gmap[g.genre].count+=parseInt(g.count||0);
      if (g.genre_sub) gmap[g.genre].subs.push({sub:g.genre_sub,count:parseInt(g.count||0)});
    }
    var gkeys=Object.keys(gmap);
    if (!gkeys.length) {
      el.innerHTML='<div class="empty"><div style="font-size:3rem">&#127991;</div>'+
        '<h3 style="margin:.75rem 0 .3rem">No genres yet</h3>'+
        '<p style="font-size:.82rem">Upload files — genre is auto-detected on upload</p></div>';
      return;
    }
    var h='<div class="shd"><h3>All Genres</h3><span style="font-size:.78rem;color:var(--mu)">Auto-classified by filename</span></div>';
    h+='<div class="cg">';
    for (var gi=0;gi<gkeys.length;gi++) {
      var gn=gkeys[gi],gd=gmap[gn];
      var gc=GCOL[gn]||GCOL['Other'];
      var gico=GICO[gn]||'&#128230;';
      h+='<div class="cc" style="background:'+gc+'" onclick="openGenre(\''+esc(gn)+'\')">';
      h+='<div class="ci">'+gico+'</div><div class="ck">'+gd.count+'</div>';
      h+='<div class="cl">'+esc(gn)+'</div></div>';
    }
    h+='</div>';
    el.innerHTML=h;
  } catch(e) {
    el.innerHTML='<div class="empty"><h3>Error loading genres</h3></div>';
  }
}

async function openGenre(genre) {
  setNav('genre',genre,genre,[{label:'Home',fn:'showHome()'},{label:'Genre Library',fn:'showGenreLibrary()'},{label:genre}]);
  var el=document.getElementById('content');
  el.innerHTML='<div style="padding:2rem;text-align:center;color:var(--mu)">Loading...</div>';
  try {
    // Get sub-genres
    var gr=await fetch('/api/rag/genres');
    var allg=gr.ok?await gr.json():[];
    var subs={};
    for (var gi=0;gi<allg.length;gi++) {
      var g=allg[gi];
      if (g.genre===genre&&g.genre_sub) subs[g.genre_sub]=(subs[g.genre_sub]||0)+parseInt(g.count||0);
    }
    var subkeys=Object.keys(subs);
    var h='';
    if (subkeys.length>1) {
      h+='<div class="shd"><h3>Sub-categories in '+esc(genre)+'</h3></div><div class="sg">';
      for (var si=0;si<subkeys.length;si++) {
        var sk=subkeys[si];
        h+='<div class="sc" onclick="openGenreSub(\''+esc(genre)+'\',\''+esc(sk)+'\')">';
        h+='<div class="sci">&#128194;</div><div class="scn">'+subs[sk]+'</div>';
        h+='<div class="scl">'+esc(sk)+'</div></div>';
      }
      h+='</div>';
    }
    // All files in genre
    var r2=await fetch('/api/files/genre/'+encodeURIComponent(genre));
    var files=r2.ok?await r2.json():[];
    h+='<div class="shd"><h3>All '+esc(genre)+' files</h3>'+
       '<span style="font-size:.78rem;color:var(--mu)">'+files.length+' files</span></div>';
    if (files.length) {
      h+='<div class="fg">';
      for (var fi=0;fi<files.length;fi++) h+=fileCard(files[fi],false);
      h+='</div>';
    } else {
      h+='<div class="empty"><h3>No files yet</h3><p style="font-size:.82rem">Upload files — genre is detected automatically</p></div>';
    }
    el.innerHTML=h;
  } catch(e) {
    el.innerHTML='<div class="empty"><h3>Error: '+esc(e.message)+'</h3></div>';
  }
}

async function openGenreSub(genre,sub) {
  setNav('genre',genre,genre+' \u203a '+sub,[
    {label:'Home',fn:'showHome()'},
    {label:'Genre Library',fn:'showGenreLibrary()'},
    {label:genre,fn:'openGenre(\''+esc(genre)+'\')'},
    {label:sub}
  ]);
  var r=await fetch('/api/files/genre/'+encodeURIComponent(genre)+'?sub='+encodeURIComponent(sub));
  renderGrid(r.ok?await r.json():[],genre+' \u203a '+sub);
}

// ── CATEGORIES ────────────────────────────────────────────
async function openCat(key,icon,label) {
  if (key==='Code')   { await showCodeSubs(); return; }
  if (key==='Others') { await showOthersSubs(); return; }
  setNav('cat',key,label,[{label:'Home',fn:'showHome()'},{label:label}]);
  var r=await fetch('/api/files/category/'+encodeURIComponent(key));
  renderGrid(r.ok?await r.json():[],label);
}

async function showCodeSubs() {
  setNav('code-subs',null,'Code',[{label:'Home',fn:'showHome()'},{label:'Code'}]);
  var r=await fetch('/api/files/code-subcats');
  if (!r.ok) return;
  var data=await r.json(),keys=Object.keys(data);
  if (!keys.length) { document.getElementById('content').innerHTML='<div class="empty"><h3>No code files</h3></div>'; return; }
  var h='<div class="shd"><h3>Code by Language</h3></div><div class="sg">';
  for (var i=0;i<keys.length;i++) {
    var k=keys[i],lbl=k.replace('Code \u203a ','');
    h+='<div class="sc" onclick="openCodeSub(\''+esc(k)+'\')">';
    h+='<div class="sci">&#128187;</div><div class="scn">'+data[k]+'</div>';
    h+='<div class="scl">'+esc(lbl)+'</div></div>';
  }
  h+='</div>';
  document.getElementById('content').innerHTML=h;
}

async function openCodeSub(cat) {
  var lbl=cat.replace('Code \u203a ','');
  setNav('code-sub',cat,'Code \u203a '+lbl,[{label:'Home',fn:'showHome()'},{label:'Code',fn:'showCodeSubs()'},{label:lbl}]);
  var r=await fetch('/api/files/category/'+encodeURIComponent(cat));
  renderGrid(r.ok?await r.json():[],lbl);
}

async function showOthersSubs() {
  setNav('o-subs',null,'Others',[{label:'Home',fn:'showHome()'},{label:'Others'}]);
  var r=await fetch('/api/files/others-subcats');
  if (!r.ok) return;
  var data=await r.json(),keys=Object.keys(data);
  if (!keys.length) { document.getElementById('content').innerHTML='<div class="empty"><h3>No other files</h3></div>'; return; }
  var h='<div class="shd"><h3>Others by Extension</h3></div><div class="sg">';
  for (var i=0;i<keys.length;i++) {
    var k=keys[i];
    h+='<div class="sc" onclick="openOthersSub(\''+esc(k)+'\')">';
    h+='<div class="sci">&#128196;</div><div class="scn">'+data[k]+'</div>';
    h+='<div class="scl">'+esc(k)+'</div></div>';
  }
  h+='</div>';
  document.getElementById('content').innerHTML=h;
}

async function openOthersSub(ext) {
  var clean=ext.startsWith('.')?ext.slice(1):ext;
  setNav('o-sub',ext,ext+' Files',[{label:'Home',fn:'showHome()'},{label:'Others',fn:'showOthersSubs()'},{label:ext}]);
  var r=await fetch('/api/files/ext/'+encodeURIComponent(clean));
  renderGrid(r.ok?await r.json():[],ext+' Files');
}

// ── FOLDERS ───────────────────────────────────────────────
async function openFolder(fid,fname) {
  ST._fname=fname;
  setNav('folder',fid,'&#128194; '+fname,[{label:'Home',fn:'showHome()'},{label:fname}]);
  var el=document.getElementById('content');
  el.innerHTML='<div style="padding:2rem;text-align:center;color:var(--mu)">Loading...</div>';
  var h='';
  // Sub-folders
  var subs=[];
  for (var i=0;i<flatF.length;i++) { if (flatF[i].parentFolderId===fid) subs.push(flatF[i]); }
  if (subs.length) {
    h+='<div class="shd"><h3>Sub-folders</h3>'+
       '<button onclick="openFolderModal('+fid+')" style="font-size:.75rem;color:var(--bl);background:none;border:1px solid var(--bl);border-radius:6px;padding:.2rem .6rem;cursor:pointer">+ New</button></div>';
    h+='<div class="cg">';
    for (var si=0;si<subs.length;si++) {
      var s=subs[si];
      h+='<div class="cc" style="background:linear-gradient(135deg,#1e293b,#0f172a)" onclick="handleFolderClick('+s.folderId+',\''+esc(s.folderName)+'\','+s.isProtected+')">';
      h+='<div class="ci">&#128194;</div>';
      h+='<div class="ck" style="font-size:1rem">'+(s.isProtected?'&#128274; ':'')+esc(s.folderName)+'</div>';
      h+='<div class="cl">'+s.fileCount+' files</div></div>';
    }
    h+='</div>';
  } else {
    h+='<div style="text-align:right;margin-bottom:.75rem">'+
       '<button onclick="openFolderModal('+fid+')" style="font-size:.75rem;color:var(--bl);background:none;border:1px solid var(--bl);border-radius:6px;padding:.2rem .65rem;cursor:pointer">+ New sub-folder</button></div>';
  }
  // Files — just show all, no extension tiles
  try {
    var r=await fetch('/api/files/folder/'+fid);
    var files=r.ok?await r.json():[];
    if (files.length) {
      h+='<div class="shd"><h3>Files in this folder</h3><span style="font-size:.78rem;color:var(--mu)">'+files.length+' files</span></div>';
      h+='<div class="fg">';
      for (var fi=0;fi<files.length;fi++) h+=fileCard(files[fi],false);
      h+='</div>';
    } else if (!subs.length) {
      h+='<div class="empty"><div style="font-size:3rem;opacity:.4">&#128235;</div><h3 style="margin:.75rem 0 .3rem">Empty folder</h3><p style="font-size:.82rem">Upload files here</p></div>';
    }
  } catch(ignored) {}
  el.innerHTML=h;
}

function handleFolderClick(fid,fname,isProt) {
  if (!isProt) { openFolder(fid,fname); return; }
  var t=unlocked[fid];
  if (t&&(Date.now()-t)<1800000) { openFolder(fid,fname); return; }
  pinFid=fid; pinFname=fname; pinVal='';
  document.getElementById('pinFolderName').textContent=fname;
  document.getElementById('pinError').textContent='';
  updatePinDots();
  document.getElementById('pinModal').classList.add('show');
}

async function delFolder(fid,e) {
  e.stopPropagation();
  if (!confirm('Delete folder? Files inside will move to root.')) return;
  var r=await fetch('/api/folders/'+fid,{method:'DELETE'});
  if (r.ok) {
    toast('Folder deleted','ts');
    if (ST.view==='folder'&&ST.id===fid) await showHome();
    await loadFolders();
  } else toast('Delete failed','te');
}

function openFolderModal(parentId) {
  subPId=(parentId!=null)?parentId:null;
  document.getElementById('fmodTitle').textContent=subPId?'New Sub-folder':'New Folder';
  document.getElementById('fni').value='';
  document.getElementById('fmod').classList.add('show');
  setTimeout(function(){document.getElementById('fni').focus();},50);
}

function closeFolderModal() {
  document.getElementById('fmod').classList.remove('show');
  document.getElementById('fni').value='';
  subPId=null;
  document.getElementById('fmodTitle').textContent='New Folder';
}

async function doCreateFolder() {
  var name=document.getElementById('fni').value.trim();
  if (!name) { toast('Enter folder name','te'); return; }
  var body={folderName:name};
  if (subPId) body.parentId=subPId;
  var r=await fetch('/api/folders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  var d=await r.json();
  if (d.error) { toast(d.error,'te'); return; }
  closeFolderModal();
  toast('Folder created!','ts');
  await loadFolders();
  if (ST.view==='folder'&&subPId&&ST.id===subPId) await refresh();
}

// ── PIN ───────────────────────────────────────────────────
function closePinModal() {
  document.getElementById('pinModal').classList.remove('show');
  pinVal=''; updatePinDots();
}

function pinKey(v) {
  if (v==='DEL') pinVal=pinVal.slice(0,-1);
  else if (v==='C') pinVal='';
  else if (pinVal.length<8) pinVal+=v;
  updatePinDots();
  if (pinVal.length===4) setTimeout(doVerifyPin,130);
}

function updatePinDots() {
  var dots=document.querySelectorAll('#pinDots .pin-dot');
  for (var i=0;i<dots.length;i++) dots[i].classList.toggle('filled',i<pinVal.length);
}

async function doVerifyPin() {
  try {
    var r=await fetch('/api/folders/'+pinFid+'/verify',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({pin:pinVal})
    });
    var d=await r.json();
    if (d.verified) {
      unlocked[pinFid]=Date.now();
      closePinModal();
      toast('Folder unlocked!','ts');
      await openFolder(pinFid,pinFname);
    } else {
      document.getElementById('pinError').textContent='Wrong PIN';
      pinVal=''; updatePinDots();
      setTimeout(function(){document.getElementById('pinError').textContent='';},1800);
    }
  } catch(e) { pinVal=''; updatePinDots(); }
}

function openSetPinModal(fid,fname,isProt,e) {
  e.stopPropagation();
  setPinId=fid; setPinRm=isProt;
  document.getElementById('setPinTitle').textContent=isProt?'Remove Protection':'Protect Folder';
  var b='';
  if (isProt) {
    b='<div class="mfg"><label class="mfl">Current PIN</label><input type="password" class="mfi" id="pi1" placeholder="Enter current PIN"/></div>'+
      '<div id="spe" style="font-size:.78rem;color:var(--rd);min-height:18px"></div>';
    document.getElementById('savePinBtn').textContent='Remove';
  } else {
    b='<div class="mfg"><label class="mfl">Set PIN (4-8 chars)</label><input type="password" class="mfi" id="pi1" placeholder="Enter PIN" maxlength="8"/></div>'+
      '<div class="mfg"><label class="mfl">Confirm PIN</label><input type="password" class="mfi" id="pi2" placeholder="Confirm PIN" maxlength="8" onkeydown="if(event.key===\'Enter\')doSavePin()"/></div>'+
      '<div id="spe" style="font-size:.78rem;color:var(--rd);min-height:18px"></div>';
    document.getElementById('savePinBtn').textContent='Set PIN';
  }
  document.getElementById('setPinBody').innerHTML=b;
  document.getElementById('setPinModal').classList.add('show');
  setTimeout(function(){var e2=document.getElementById('pi1');if(e2)e2.focus();},50);
}

function closeSetPinModal() { document.getElementById('setPinModal').classList.remove('show'); }

async function doSavePin() {
  var p1=document.getElementById('pi1'),pin=p1?p1.value:'';
  var err=document.getElementById('spe');
  if (!setPinRm) {
    var p2=document.getElementById('pi2'),p2v=p2?p2.value:'';
    if (pin.length<4) { if(err)err.textContent='Min 4 chars'; return; }
    if (pin!==p2v)    { if(err)err.textContent='PINs do not match'; return; }
  } else if (!pin) { toast('Enter current PIN','te'); return; }
  try {
    var r=await fetch('/api/folders/'+setPinId+'/protect',{
      method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({enable:!setPinRm,pin:pin})
    });
    var d=await r.json();
    if (d.error) { toast(d.error,'te'); return; }
    closeSetPinModal();
    toast(d.message,'ts');
    if (setPinRm) delete unlocked[setPinId];
    await loadFolders();
  } catch(e) { toast('Error saving PIN','te'); }
}

// ── FILE GRID ─────────────────────────────────────────────
function renderGrid(files,title) {
  var cnt=files.length;
  var h='<div class="shd"><h3>'+esc(title)+'</h3><span style="font-size:.78rem;color:var(--mu)">'+cnt+' file'+(cnt!==1?'s':'')+'</span></div>';
  if (!files.length) {
    document.getElementById('content').innerHTML=h+'<div class="empty"><div style="font-size:3rem;opacity:.4">&#128235;</div><h3 style="margin:.75rem 0 .3rem">No files</h3></div>';
    return;
  }
  h+='<div class="fg">';
  for (var i=0;i<files.length;i++) h+=fileCard(files[i],false);
  h+='</div>';
  document.getElementById('content').innerHTML=h;
}

function fileCard(f,isShared) {
  var base=isShared?'/api/share':'/api/files';
  var canP=f.isImage||canPreview(f.fileType,f.fileName);
  var thumb=f.isImage
    ?'<img src="'+base+'/preview/'+f.fileId+'" loading="lazy" onerror="this.style.display=\'none\'">'
    :'<div class="ti">'+ficon(f.fileType,f.fileName)+'</div>';
  var h='<div class="fc"><div class="ft">'+thumb+'<div class="fov">';
  if (canP) h+='<button class="ob" onclick="prevFile('+f.fileId+',\''+esc(f.fileName)+'\',\''+(f.fileType||'')+'\'  ,'+!!isShared+')">View</button>';
  if (!isShared||f.permission==='download')
    h+='<a class="ob" href="'+base+'/download/'+f.fileId+'" onclick="event.stopPropagation()">&#8659;</a>';
  if (!isShared) {
    h+='<button class="ob" style="background:rgba(99,102,241,.85);color:#fff" onclick="openShareModal('+f.fileId+',\''+esc(f.fileName)+'\',event)">&#128279;</button>';
    var nm=(f.fileName||'').toLowerCase();
    var eli=(f.fileType&&(f.fileType.includes('pdf')||f.fileType.includes('text')))||
      ['.txt','.md','.pdf','.py','.java','.js','.ts','.json','.xml','.html',
       '.css','.sql','.kt','.sh','.yaml','.yml','.go','.rs','.c','.cpp'].some(function(e){return nm.endsWith(e);});
    if (eli) h+='<button id="idx_'+f.fileId+'" class="ob" style="background:rgba(16,185,129,.8);color:#fff" onclick="ragIndexFile('+f.fileId+')" title="Index for AI">&#9889;</button>';
    h+='<button class="ob" style="background:rgba(239,68,68,.85);color:#fff" onclick="delFile('+f.fileId+',event)">&#128465;</button>';
  }
  h+='</div></div><div class="fb">';
  h+='<div class="fn" title="'+esc(f.fileName)+'">'+esc(f.fileName)+'</div>';
  h+='<div class="fs2">'+(f.fileSize||'')+'</div>';
  if (!isShared) h+='<div class="fd">'+fmtDate(f.uploadedAt)+'</div>';
  else           h+='<div class="fd">By '+esc(f.sharedBy||'')+'</div>';
  if (f.genre) h+='<div class="gbadge">&#127991; '+esc(f.genre)+(f.genreSub?' \u203a '+esc(f.genreSub):'')+'</div>';
  h+='</div></div>';
  return h;
}

function canPreview(type,name) {
  if (!name) return false;
  var n=name.toLowerCase();
  if (type&&(type.startsWith('image/')||type.includes('pdf'))) return true;
  var exts=['.java','.kt','.py','.js','.ts','.jsx','.tsx','.html','.htm','.css',
    '.json','.xml','.yaml','.yml','.sql','.sh','.bash','.md','.txt','.log',
    '.c','.cpp','.h','.cs','.go','.rs','.rb','.php','.gradle','.toml',
    '.bat','.ps1','.properties','.conf','.ini','.cfg'];
  for (var i=0;i<exts.length;i++) { if (n.endsWith(exts[i])) return true; }
  return false;
}

// ── PREVIEW ───────────────────────────────────────────────
async function prevFile(fid,fname,ftype,isShared) {
  var base=isShared?'/api/share':'/api/files';
  document.getElementById('pov').classList.add('show');
  document.getElementById('ptitle').textContent=fname;
  document.getElementById('picon').textContent=ficon(ftype,fname);
  document.getElementById('pdl').href=base+'/download/'+fid;
  document.getElementById('plang').style.display='none';
  document.getElementById('pbody').innerHTML='<div style="text-align:center;padding:4rem;color:#475569">Loading...</div>';
  try {
    var resp=await fetch(base+'/preview/'+fid);
    if (!resp.ok) throw new Error('Status '+resp.status);
    if (ftype&&ftype.startsWith('image/')) {
      var b=await resp.blob(),u=URL.createObjectURL(b);
      document.getElementById('pbody').innerHTML='<div style="text-align:center;padding:1rem;background:#0a0f1a;min-height:300px;display:flex;align-items:center;justify-content:center"><img src="'+u+'" style="max-width:100%;max-height:78vh;border-radius:8px;object-fit:contain"/></div>';
    } else if (ftype&&ftype.includes('pdf')) {
      var b2=await resp.blob(),u2=URL.createObjectURL(b2);
      document.getElementById('pbody').innerHTML='<embed src="'+u2+'" type="application/pdf" style="width:100%;height:80vh;display:block"/>';
    } else {
      var text=await resp.text(),lang=getLang(fname),hlang=hljsLang(fname);
      if (lang!=='Plain Text') { var lb=document.getElementById('plang'); lb.textContent=lang; lb.style.display='inline'; }
      var hl=null;
      if (window.hljs&&hlang) { try{hl=hljs.highlight(text,{language:hlang,ignoreIllegals:true}).value.split('\n');}catch(ex){} }
      var lines=text.split('\n'),ph='<div class="cv"><table>';
      for (var i=0;i<lines.length;i++) {
        var lc=hl?(hl[i]||''):esc(lines[i]);
        ph+='<tr><td class="ln">'+(i+1)+'</td><td class="lc">'+lc+'</td></tr>';
      }
      ph+='</table></div>';
      document.getElementById('pbody').innerHTML=ph;
    }
  } catch(ex) {
    document.getElementById('pbody').innerHTML='<div style="text-align:center;padding:3rem;color:#ef4444">Preview unavailable &mdash; <a href="'+base+'/download/'+fid+'" style="color:#6366f1">Download</a></div>';
  }
}

function closePrev() { document.getElementById('pov').classList.remove('show'); }

// ── FILE OPS ──────────────────────────────────────────────
async function delFile(fid,e) {
  e.stopPropagation();
  if (!confirm('Delete this file permanently?')) return;
  var r=await fetch('/api/files/'+fid,{method:'DELETE'});
  if (r.ok) { toast('File deleted','ts'); await loadFolders(); await refresh(); }
  else toast('Delete failed','te');
}

// ── UPLOAD ────────────────────────────────────────────────
function openUpload() {
  document.getElementById('umod').classList.add('show');
  if (ST.view==='folder'&&ST.id) document.getElementById('fsel').value=ST.id;
}
function closeUpload() {
  document.getElementById('umod').classList.remove('show');
  document.getElementById('ufi').value='';
  document.getElementById('dtxt').textContent='Click or drag files here';
}
function onFilePick(inp) {
  var n=inp.files.length;
  document.getElementById('dtxt').textContent=n===1?inp.files[0].name:n+' files selected';
}
function onDrop(e) {
  e.preventDefault();
  var inp=document.getElementById('ufi');
  if (e.dataTransfer&&e.dataTransfer.files) { inp.files=e.dataTransfer.files; onFilePick(inp); }
}
async function doUpload() {
  var inp=document.getElementById('ufi');
  if (!inp.files||!inp.files.length) { toast('Select a file first','te'); return; }
  var fid=document.getElementById('fsel').value,ok=0,fail=0;
  toast('Uploading...','ti');
  for (var i=0;i<inp.files.length;i++) {
    var fd=new FormData();
    fd.append('file',inp.files[i]);
    if (fid) fd.append('folderId',fid);
    try {
      var r=await fetch('/api/files/upload',{method:'POST',body:fd});
      if (r.status===401) { toast('Session expired','te'); setTimeout(function(){location.href='/login.html';},1500); closeUpload(); return; }
      if (r.ok) ok++; else fail++;
    } catch(ex) { fail++; }
  }
  closeUpload();
  if (ok>0) { toast(ok+' file'+(ok>1?'s':'')+' uploaded!','ts'); await loadFolders(); await refresh(); }
  else toast('Upload failed','te');
}

// ── SEARCH ────────────────────────────────────────────────
function handleSearch(val) {
  clearTimeout(sTimer);
  if (!val||!val.trim()) { refresh(); return; }
  sTimer=setTimeout(async function(){
    setNav('search',val,'Search: '+val,[{label:'Home',fn:'showHome()'}]);
    var r=await fetch('/api/files/search?q='+encodeURIComponent(val.trim()));
    renderGrid(r.ok?await r.json():[],'Results for "'+val+'"');
  },350);
}

// ── SHARING ───────────────────────────────────────────────
function openShareModal(fid,fname,e) {
  e.stopPropagation();
  shareId=fid;
  document.getElementById('shareFileName').textContent=fname;
  document.getElementById('shareEmail').value='';
  document.getElementById('shareResult').innerHTML='';
  document.getElementById('shareModal').classList.add('show');
  loadShareList(fid);
  setTimeout(function(){document.getElementById('shareEmail').focus();},50);
}
function closeShareModal() { document.getElementById('shareModal').classList.remove('show'); }

async function loadShareList(fid) {
  try {
    var r=await fetch('/api/share/sent/'+fid);
    if (!r.ok) return;
    var list=await r.json(),el=document.getElementById('shareList');
    if (!list.length) { el.innerHTML='<div style="font-size:.75rem;color:var(--mu)">Not shared with anyone yet</div>'; return; }
    var h='<div style="font-size:.75rem;font-weight:700;color:var(--mu);margin-bottom:.4rem">Shared with:</div>';
    for (var i=0;i<list.length;i++) {
      var s=list[i];
      h+='<div style="display:flex;align-items:center;justify-content:space-between;padding:.4rem .6rem;background:var(--bg);border-radius:8px;margin-bottom:.3rem;font-size:.8rem">';
      h+='<span>'+esc(s.sharedWith||'')+' ('+( s.permission||'view')+')</span>';
      h+='<button onclick="revokeShare('+s.shareId+')" style="background:none;border:none;color:var(--rd);cursor:pointer;font-size:.8rem">Remove</button></div>';
    }
    el.innerHTML=h;
  } catch(e) {}
}
async function doShare() {
  var email=document.getElementById('shareEmail').value.trim();
  var perm=document.getElementById('sharePerm').value;
  var res=document.getElementById('shareResult');
  if (!email) { res.innerHTML='<span style="color:var(--rd)">Enter email</span>'; return; }
  try {
    var r=await fetch('/api/share',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({fileId:String(shareId),email:email,permission:perm})});
    var d=await r.json();
    if (d.error) res.innerHTML='<span style="color:var(--rd)">'+esc(d.error)+'</span>';
    else { res.innerHTML='<span style="color:var(--gr)">'+esc(d.message)+'</span>'; document.getElementById('shareEmail').value=''; loadShareList(shareId); }
  } catch(e) { res.innerHTML='<span style="color:var(--rd)">Error</span>'; }
}
async function revokeShare(sid) {
  var r=await fetch('/api/share/'+sid,{method:'DELETE'});
  if (r.ok) loadShareList(shareId);
}
async function showSharedWithMe() {
  setNav('shared',null,'Shared with Me',[{label:'Home',fn:'showHome()'},{label:'Shared with Me'}]);
  try {
    var r=await fetch('/api/share/received'),files=r.ok?await r.json():[];
    var el=document.getElementById('content');
    if (!files.length) { el.innerHTML='<div class="empty"><div style="font-size:3rem">&#129309;</div><h3 style="margin:.75rem 0 .3rem">No files shared with you</h3></div>'; return; }
    var h='<div class="shd"><h3>Shared with Me</h3><span style="font-size:.78rem;color:var(--mu)">'+files.length+' files</span></div><div class="fg">';
    for (var i=0;i<files.length;i++) h+=fileCard(files[i],true);
    h+='</div>';
    el.innerHTML=h;
  } catch(e) { document.getElementById('content').innerHTML='<div class="empty"><h3>Error loading</h3></div>'; }
}

// ── LOGOUT ────────────────────────────────────────────────
async function doLogout() {
  await fetch('/api/auth/logout',{method:'POST'});
  location.href='/login.html';
}

// ── UTILS ─────────────────────────────────────────────────
function ficon(type,name) {
  if (!type) type=''; if (!name) name='';
  var n=name.toLowerCase(),ct=type.toLowerCase();
  if (ct.includes('pdf')||n.endsWith('.pdf'))   return '&#128213;';
  if (ct.startsWith('image/'))                  return '&#128444;';
  if (ct.includes('word')||n.endsWith('.docx')||n.endsWith('.doc')) return '&#128221;';
  if (ct.includes('sheet')||ct.includes('excel')||n.endsWith('.xlsx')||n.endsWith('.xls')||n.endsWith('.csv')) return '&#128202;';
  if (ct.includes('presentation')||n.endsWith('.pptx')) return '&#128209;';
  if (n.endsWith('.java')||n.endsWith('.kt'))   return '&#9749;';
  if (n.endsWith('.py'))                        return '&#128013;';
  if (n.endsWith('.js')||n.endsWith('.ts')||n.endsWith('.jsx')||n.endsWith('.tsx')) return '&#128249;';
  if (n.endsWith('.html')||n.endsWith('.css'))  return '&#127760;';
  if (n.endsWith('.json')||n.endsWith('.yaml')||n.endsWith('.yml')) return '&#9881;';
  if (n.endsWith('.sql'))                       return '&#128450;';
  if (n.endsWith('.md')||n.endsWith('.txt'))    return '&#128196;';
  if (n.endsWith('.zip')||n.endsWith('.rar')||n.endsWith('.gz')) return '&#128476;';
  if (ct.startsWith('video/'))                  return '&#127916;';
  if (ct.startsWith('audio/'))                  return '&#127925;';
  return '&#128230;';
}
function getLang(fname) {
  var n=fname.toLowerCase();
  if (n.endsWith('.java')||n.endsWith('.kt')) return 'Java';
  if (n.endsWith('.py'))         return 'Python';
  if (n.endsWith('.js'))         return 'JavaScript';
  if (n.endsWith('.ts'))         return 'TypeScript';
  if (n.endsWith('.html'))       return 'HTML';
  if (n.endsWith('.css'))        return 'CSS';
  if (n.endsWith('.json'))       return 'JSON';
  if (n.endsWith('.xml'))        return 'XML';
  if (n.endsWith('.yaml')||n.endsWith('.yml')) return 'YAML';
  if (n.endsWith('.sql'))        return 'SQL';
  if (n.endsWith('.sh'))         return 'Shell';
  if (n.endsWith('.md'))         return 'Markdown';
  if (n.endsWith('.go'))         return 'Go';
  if (n.endsWith('.rs'))         return 'Rust';
  if (n.endsWith('.c')||n.endsWith('.cpp')||n.endsWith('.h')) return 'C/C++';
  return 'Plain Text';
}
function hljsLang(fname) {
  var n=fname.toLowerCase();
  if (n.endsWith('.java'))  return 'java';
  if (n.endsWith('.kt'))    return 'kotlin';
  if (n.endsWith('.py'))    return 'python';
  if (n.endsWith('.js')||n.endsWith('.mjs')) return 'javascript';
  if (n.endsWith('.ts'))    return 'typescript';
  if (n.endsWith('.html')||n.endsWith('.htm')) return 'xml';
  if (n.endsWith('.css'))   return 'css';
  if (n.endsWith('.json'))  return 'json';
  if (n.endsWith('.yaml')||n.endsWith('.yml')) return 'yaml';
  if (n.endsWith('.sql'))   return 'sql';
  if (n.endsWith('.sh'))    return 'bash';
  if (n.endsWith('.md'))    return 'markdown';
  if (n.endsWith('.c')||n.endsWith('.h')) return 'c';
  if (n.endsWith('.cpp'))   return 'cpp';
  if (n.endsWith('.cs'))    return 'csharp';
  if (n.endsWith('.go'))    return 'go';
  if (n.endsWith('.rs'))    return 'rust';
  return null;
}
function fmtDate(s) {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); }
  catch(e) { return ''; }
}
function esc(s) {
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function toast(msg,cls) {
  var t=document.getElementById('toast');
  t.textContent=msg; t.className='toast '+(cls||'ts')+' show';
  clearTimeout(t._t);
  t._t=setTimeout(function(){t.classList.remove('show');},2800);
}
document.addEventListener('keydown',function(e){
  if (e.key==='Escape') {
    closePrev();
    document.getElementById('umod').classList.remove('show');
    document.getElementById('fmod').classList.remove('show');
    closeShareModal(); closeSetPinModal(); closePinModal();
  }
  if ((e.ctrlKey||e.metaKey)&&e.key==='u') { e.preventDefault(); openUpload(); }
});