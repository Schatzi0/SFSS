// ═══════════════════════════════════════════════════════════
// SFSS RAG — AI Chat Interface
// ═══════════════════════════════════════════════════════════

var ragHistory = [];
var ragIsOpen = false;

function initRag() {
  // RAG button already in HTML — inject chat panel
  var panel = document.getElementById('ragPanel');
  if (!panel) return;
  loadRagStatus();
}

async function loadRagStatus() {
  try {
    var r = await fetch('/api/rag/status');
    if (!r.ok) return;
    var d = await r.json();
    var el = document.getElementById('ragStatusText');
    if (el) {
      el.textContent = d.hasApiKey
        ? d.totalChunks + ' chunks indexed from ' + (d.indexedFiles ? d.indexedFiles.length : 0) + ' files'
        : '⚠️ OpenAI API key not set';
    }
    var hasKey = d.hasApiKey;
    var inp = document.getElementById('ragInput');
    if (inp) inp.disabled = !hasKey;
    var btn = document.getElementById('ragSendBtn');
    if (btn) btn.disabled = !hasKey;
  } catch(e) {}
}

function toggleRag() {
  var panel = document.getElementById('ragPanel');
  ragIsOpen = !ragIsOpen;
  panel.style.display = ragIsOpen ? 'flex' : 'none';
  if (ragIsOpen) {
    loadRagStatus();
    document.getElementById('ragInput').focus();
  }
}

async function sendRagMessage() {
  var inp = document.getElementById('ragInput');
  var question = inp.value.trim();
  if (!question) return;

  inp.value = '';
  appendMessage('user', question);
  appendMessage('thinking', '...');

  // Build history for context
  var historyForApi = ragHistory.slice(-6).map(function(m) {
    return {role: m.role === 'user' ? 'user' : 'assistant', content: m.content};
  }).filter(function(m) { return m.role === 'user' || m.role === 'assistant'; });

  try {
    var r = await fetch('/api/rag/chat', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({question: question, history: historyForApi})
    });
    var d = await r.json();

    removeThinking();

    if (d.error) {
      appendMessage('error', d.error);
    } else {
      appendMessage('assistant', d.answer, d.sources);
      // Store in history
      ragHistory.push({role:'user', content: question});
      ragHistory.push({role:'assistant', content: d.answer});
    }
  } catch(e) {
    removeThinking();
    appendMessage('error', 'Connection error. Please try again.');
  }
}

function appendMessage(role, content, sources) {
  var msgs = document.getElementById('ragMessages');
  var div = document.createElement('div');
  div.className = 'rag-msg rag-' + role;
  div.id = role === 'thinking' ? 'ragThinking' : '';

  if (role === 'user') {
    div.innerHTML = '<div class="rag-bubble user-bubble">' + escRag(content) + '</div>';
  } else if (role === 'thinking') {
    div.innerHTML = '<div class="rag-bubble ai-bubble thinking-bubble"><span class="dot">●</span><span class="dot">●</span><span class="dot">●</span></div>';
  } else if (role === 'error') {
    div.innerHTML = '<div class="rag-bubble error-bubble">⚠️ ' + escRag(content) + '</div>';
  } else {
    var sourcesHtml = '';
    if (sources && sources.length) {
      sourcesHtml = '<div class="rag-sources">📚 Sources: ' +
        sources.map(function(s) { return '<span class="rag-src">' + escRag(s) + '</span>'; }).join(' ') +
        '</div>';
    }
    div.innerHTML = '<div class="rag-bubble ai-bubble">' +
      content.replace(/\n/g, '<br>') +
      '</div>' + sourcesHtml;
  }

  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function removeThinking() {
  var el = document.getElementById('ragThinking');
  if (el) el.remove();
}

async function indexCurrentFile(fileId) {
  var btn = document.getElementById('idx_' + fileId);
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
  try {
    var r = await fetch('/api/rag/index/' + fileId, {method:'POST'});
    var d = await r.json();
    if (btn) {
      btn.textContent = d.error ? '❌' : '✅';
      btn.title = d.error || d.chunks + ' chunks indexed';
      setTimeout(function() {
        btn.textContent = '⚡';
        btn.disabled = false;
      }, 2000);
    }
    if (!d.error) loadRagStatus();
  } catch(e) {
    if (btn) { btn.textContent = '❌'; btn.disabled = false; }
  }
}

async function indexAllFiles() {
  var btn = document.getElementById('ragIndexAllBtn');
  if (btn) { btn.textContent = '⏳ Indexing...'; btn.disabled = true; }
  try {
    var r = await fetch('/api/rag/index-all', {method:'POST'});
    var d = await r.json();
    if (btn) {
      btn.textContent = '⚡ Index All';
      btn.disabled = false;
    }
    appendMessage('assistant', '✅ ' + d.message + '. Indexing runs in background — check status in a minute.', []);
    setTimeout(loadRagStatus, 3000);
  } catch(e) {
    if (btn) { btn.textContent = '⚡ Index All'; btn.disabled = false; }
  }
}

function clearRagChat() {
  ragHistory = [];
  document.getElementById('ragMessages').innerHTML =
    '<div class="rag-welcome">👋 Ask me anything about your files!</div>';
}

function escRag(s) {
  return String(s || '').replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

// Enter key send
document.addEventListener('DOMContentLoaded', function() {
  var inp = document.getElementById('ragInput');
  if (inp) {
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendRagMessage();
      }
    });
  }
});