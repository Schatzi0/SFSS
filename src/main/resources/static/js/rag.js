//// ═══════════════════════════════════════════════════════
//// SFSS RAG — AI Chat (rag.js)
//// ═══════════════════════════════════════════════════════
//
//var ragHistory = [];
//var ragOpen    = false;
//
//// Called after page loads
//window.addEventListener('load', function() {
//  setTimeout(ragLoadStatus, 500);
//});
//
//async function ragLoadStatus() {
//  try {
//    var r = await fetch('/api/rag/status');
//    if (!r.ok) return;
//    var d = await r.json();
//    var el = document.getElementById('ragStatusText');
//    if (!el) return;
//    if (!d.hasApiKey) {
//      el.textContent = '⚠️ Set OPENAI_API_KEY in Render';
//      var inp = document.getElementById('ragInput');
//      if (inp) inp.placeholder = 'Add OPENAI_API_KEY to Render env vars first';
//    } else {
//      var fc  = parseInt(d.totalChunks || 0);
//      var fic = d.indexedFiles ? d.indexedFiles.length : 0;
//      el.textContent = fc > 0
//        ? fc + ' chunks · ' + fic + ' files indexed'
//        : 'Ready — click ⚡ Index All to start';
//    }
//  } catch(e) {
//    var el2 = document.getElementById('ragStatusText');
//    if (el2) el2.textContent = 'Status unavailable';
//  }
//}
//
//function toggleRag() {
//  ragOpen = !ragOpen;
//  var panel = document.getElementById('ragPanel');
//  panel.style.display = ragOpen ? 'flex' : 'none';
//  if (ragOpen) {
//    ragLoadStatus();
//    setTimeout(function() {
//      var inp = document.getElementById('ragInput');
//      if (inp) inp.focus();
//    }, 60);
//  }
//}
//
//async function ragSend() {
//  var inp = document.getElementById('ragInput');
//  if (!inp) return;
//  var question = inp.value.trim();
//  if (!question) return;
//  inp.value = '';
//
//  ragAppendMsg('user', question);
//  ragAppendMsg('thinking', '');
//
//  var historyForApi = [];
//  var slice = ragHistory.slice(-6);
//  for (var i = 0; i < slice.length; i++) {
//    var m = slice[i];
//    if (m.role === 'user' || m.role === 'assistant') {
//      historyForApi.push({role: m.role, content: m.content});
//    }
//  }
//
//  try {
//    var r = await fetch('/api/rag/chat', {
//      method:'POST',
//      headers:{'Content-Type':'application/json'},
//      body: JSON.stringify({question: question, history: historyForApi})
//    });
//    var d = await r.json();
//    ragRemoveThinking();
//
//    if (d.error) {
//      ragAppendMsg('error', d.error);
//    } else {
//      ragAppendMsg('assistant', d.answer, d.sources);
//      ragHistory.push({role:'user',      content: question});
//      ragHistory.push({role:'assistant', content: d.answer});
//    }
//  } catch(e) {
//    ragRemoveThinking();
//    ragAppendMsg('error', 'Connection error. Please try again.');
//  }
//}
//
//function ragAppendMsg(role, content, sources) {
//  var msgs = document.getElementById('ragMessages');
//  if (!msgs) return;
//
//  // Remove welcome message on first real message
//  var welcome = msgs.querySelector('div[style*="padding:2rem"]');
//  if (welcome && (role === 'user' || role === 'assistant')) {
//    welcome.remove();
//  }
//
//  var div = document.createElement('div');
//  div.className = 'rag-msg rag-' + role;
//  if (role === 'thinking') div.id = 'ragThinking';
//
//  if (role === 'user') {
//    div.innerHTML = '<div class="rag-bubble user-bubble">' + ragEsc(content) + '</div>';
//  } else if (role === 'thinking') {
//    div.innerHTML = '<div class="rag-bubble ai-bubble thinking-bubble">' +
//      '<span class="dot">●</span><span class="dot">●</span><span class="dot">●</span></div>';
//  } else if (role === 'error') {
//    div.innerHTML = '<div class="rag-bubble error-bubble">⚠️ ' + ragEsc(content) + '</div>';
//  } else {
//    var sourcesHtml = '';
//    if (sources && sources.length) {
//      sourcesHtml = '<div class="rag-sources">📚 Sources: ';
//      sources.forEach(function(s) {
//        sourcesHtml += '<span class="rag-src">' + ragEsc(s) + '</span>';
//      });
//      sourcesHtml += '</div>';
//    }
//    div.innerHTML = '<div class="rag-bubble ai-bubble">' +
//      content.replace(/\n/g, '<br>') + '</div>' + sourcesHtml;
//  }
//
//  msgs.appendChild(div);
//  msgs.scrollTop = msgs.scrollHeight;
//}
//
//function ragRemoveThinking() {
//  var el = document.getElementById('ragThinking');
//  if (el) el.remove();
//}
//
//function clearRagChat() {
//  ragHistory = [];
//  var msgs = document.getElementById('ragMessages');
//  if (msgs) {
//    msgs.innerHTML = '<div style="text-align:center;color:#94a3b8;font-size:.83rem;padding:2rem 1rem">' +
//      '👋 Ask me anything about your files!<br>' +
//      '<span style="font-size:.75rem;color:#cbd5e1">Click ⚡ Index All first to enable AI search</span></div>';
//  }
//}
//
//async function ragIndexAll() {
//  var btn = document.getElementById('ragIndexAllBtn');
//  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
//  try {
//    var r = await fetch('/api/rag/index-all', {method:'POST'});
//    var d = await r.json();
//    if (btn) { btn.textContent = '⚡ Index All'; btn.disabled = false; }
//    ragAppendMsg('assistant',
//      '✅ ' + (d.message || d.queued + ' files queued') +
//      '. Indexing runs in background — ask me questions in a moment!', []);
//    setTimeout(ragLoadStatus, 4000);
//  } catch(e) {
//    if (btn) { btn.textContent = '⚡ Index All'; btn.disabled = false; }
//    ragAppendMsg('error', 'Index all failed. Check if OpenAI API key is set.');
//  }
//}
//
//async function ragIndexFile(fileId) {
//  var btn = document.getElementById('idx_' + fileId);
//  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
//  try {
//    var r = await fetch('/api/rag/index/' + fileId, {method:'POST'});
//    var d = await r.json();
//    if (btn) {
//      btn.textContent = d.error ? '❌' : '✅';
//      btn.title       = d.error ? d.error : (d.chunks + ' chunks indexed');
//      setTimeout(function() {
//        if (btn) { btn.textContent = '⚡'; btn.disabled = false; }
//      }, 2500);
//    }
//    if (!d.error) ragLoadStatus();
//    else          toast(d.error, 'error');
//  } catch(e) {
//    if (btn) { btn.textContent = '⚡'; btn.disabled = false; }
//  }
//}
//
//function ragEsc(s) {
//  return String(s == null ? '' : s)
//    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
//    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
//}

var ragOpen=false,ragHistory=[];

function toggleRag(){
  ragOpen=!ragOpen;
  document.getElementById('ragPanel').style.display=ragOpen?'flex':'none';
  if (ragOpen){ragLoadStatus();setTimeout(function(){var i=document.getElementById('ragInp');if(i)i.focus();},50);}
}
async function ragLoadStatus(){
  try{
    var r=await fetch('/api/rag/status');
    if (!r.ok) return;
    var d=await r.json(),el=document.getElementById('ragStatus');
    if (!el) return;
    if (!d.hasApiKey) el.textContent='Set OPENAI_API_KEY in Render env';
    else {
      var tc=parseInt(d.totalChunks||0),fc=d.indexedFiles?d.indexedFiles.length:0;
      el.textContent=tc>0?tc+' chunks \u00b7 '+fc+' files indexed':'Ready \u2014 click \u26a1 Index All';
    }
  }catch(e){}
}
async function ragSend(){
  var inp=document.getElementById('ragInp');
  if (!inp) return;
  var q=inp.value.trim();
  if (!q) return;
  inp.value='';
  ragAppend('user',q);
  ragAppend('think','');
  var hist=[];
  var sl=ragHistory.slice(-6);
  for (var i=0;i<sl.length;i++){if(sl[i].role==='user'||sl[i].role==='assistant')hist.push({role:sl[i].role,content:sl[i].content});}
  try{
    var r=await fetch('/api/rag/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,history:hist})});
    var d=await r.json();
    ragRmThink();
    if (d.error) ragAppend('error',d.error);
    else{
      ragAppend('answer',d.answer,d.sources);
      ragHistory.push({role:'user',content:q});
      ragHistory.push({role:'assistant',content:d.answer});
    }
  }catch(e){ragRmThink();ragAppend('error','Connection error. Try again.');}
}
function ragAppend(role,content,sources){
  var msgs=document.getElementById('ragMsgs');
  if (!msgs) return;
  var w=document.getElementById('ragWelcome');
  if (w&&(role==='user'||role==='answer')) w.remove();
  var div=document.createElement('div');
  if (role==='user'){
    div.className='rag-msg rag-u';
    div.innerHTML='<div class="rbub rbu">'+ragEsc(content)+'</div>';
  } else if (role==='think'){
    div.className='rag-msg rag-a'; div.id='ragt';
    div.innerHTML='<div class="rbub rba"><span class="dot">&#9679;</span><span class="dot">&#9679;</span><span class="dot">&#9679;</span></div>';
  } else if (role==='error'){
    div.className='rag-msg rag-a';
    div.innerHTML='<div class="rbub rbe">&#9888; '+ragEsc(content)+'</div>';
  } else {
    div.className='rag-msg rag-a';
    var sh='';
    if (sources&&sources.length){
      sh='<div class="rsrc">&#128218; ';
      for (var i=0;i<sources.length;i++) sh+='<span class="rs">'+ragEsc(sources[i])+'</span>';
      sh+='</div>';
    }
    div.innerHTML='<div class="rbub rba">'+content.replace(/\n/g,'<br>')+'</div>'+sh;
  }
  msgs.appendChild(div);
  msgs.scrollTop=msgs.scrollHeight;
}
function ragRmThink(){var e=document.getElementById('ragt');if(e)e.remove();}
function ragClear(){
  ragHistory=[];
  var m=document.getElementById('ragMsgs');
  if (m) m.innerHTML='<div id="ragWelcome" style="text-align:center;color:#94a3b8;font-size:.83rem;padding:2rem 1rem">&#129302; Ask me anything about your files!</div>';
}
async function ragIndexAll(){
  var btn=document.getElementById('ragIdxBtn');
  if (btn){btn.textContent='Indexing...';btn.disabled=true;}
  try{
    var r=await fetch('/api/rag/index-all',{method:'POST'}),d=await r.json();
    if (btn){btn.textContent='&#9889; Index All';btn.disabled=false;}
    ragAppend('answer',(d.message||d.queued+' files queued')+'. Indexing in background!',[]);
    setTimeout(ragLoadStatus,4000);
  }catch(e){if(btn){btn.textContent='&#9889; Index All';btn.disabled=false;}ragAppend('error','Index failed.');}
}
async function ragIndexFile(fileId){
  var btn=document.getElementById('idx_'+fileId);
  if (btn){btn.textContent='&#8987;';btn.disabled=true;}
  try{
    var r=await fetch('/api/rag/index/'+fileId,{method:'POST'}),d=await r.json();
    if (btn){btn.innerHTML=d.error?'&#10060;':'&#9989;';btn.title=d.error?d.error:(d.chunks+' chunks');
      setTimeout(function(){if(btn){btn.innerHTML='&#9889;';btn.disabled=false;}},2500);}
    if (!d.error) ragLoadStatus();
    else if (typeof toast==='function') toast(d.error,'te');
  }catch(e){if(btn){btn.innerHTML='&#9889;';btn.disabled=false;}}
}
function ragEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}