#!/usr/bin/env node
/**
 * prompt-studio — Local Web UI server
 * Run: prompt ui
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = process.env.PROMPT_STUDIO_DIR || './.prompts';
const DEFAULT_PORT = 3456;

// ─── API handlers (reuse index.js logic) ────────────────────────

function promptsDir() { return CONFIG_DIR; }
function promptPath(name) { return promptsDir() + '/' + name + '.md'; }
function logPath() { return promptsDir() + '/.history.jsonl'; }

function parsePromptFile(content) {
  const lines = content.split('\n');
  let meta = {};
  let bodyLines = [];
  if (lines[0]?.trim() === '---') {
    let i = 1;
    const metaLines = [];
    while (i < lines.length && lines[i]?.trim() !== '---') { metaLines.push(lines[i]); i++; }
    for (const ml of metaLines) {
      const m = ml.match(/^(\w[\w_]*)\s*:\s*(.*?)\s*$/);
      if (m) {
        let val = m[2].trim();
        if (val === 'true') val = true; else if (val === 'false') val = false;
        else if (!isNaN(val) && val !== '') val = Number(val);
        meta[m[1]] = val;
      }
    }
    bodyLines = lines.slice(i + 1);
  } else { bodyLines = lines; }
  return { meta, body: bodyLines.join('\n').trim() };
}

function listPrompts() {
  const dir = promptsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md') && f !== '.history.jsonl' && !f.startsWith('.'))
    .map(f => {
      const name = f.replace('.md', '');
      const content = fs.readFileSync(dir + '/' + f, 'utf-8');
      const { meta, body } = parsePromptFile(content);
      const firstLine = body.split('\n')[0]?.slice(0, 80) || '';
      return { name, meta, firstLine, body };
    });
}

function getLog() {
  const lf = logPath();
  if (!fs.existsSync(lf)) return [];
  return fs.readFileSync(lf, 'utf-8').trim().split('\n').filter(Boolean).slice(-50).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

// ─── MIME types ─────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// ─── Inline HTML (single-file UI) ────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>prompt-studio</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#f5f5f5;color:#222;display:flex;height:100vh}
.sidebar{width:280px;background:#fff;border-right:1px solid #e0e0e0;display:flex;flex-direction:column;flex-shrink:0}
.sidebar h2{font-size:16px;padding:20px 16px 12px;border-bottom:1px solid #eee}
.sidebar .actions{padding:12px 16px;display:flex;gap:8px;border-bottom:1px solid #eee}
.sidebar .actions button{flex:1;padding:6px 0;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;font-size:13px}
.sidebar .actions button:hover{background:#f0f0f0}
.prompt-list{flex:1;overflow-y:auto;padding:8px 0}
.prompt-item{padding:10px 16px;cursor:pointer;border-left:3px solid transparent;transition:.15s}
.prompt-item:hover{background:#f0f4ff}
.prompt-item.active{background:#e8f0fe;border-left-color:#1a73e8}
.prompt-item .name{font-weight:600;font-size:14px}
.prompt-item .desc{font-size:12px;color:#666;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.prompt-item .meta{font-size:11px;color:#999;margin-top:2px}
.main{flex:1;display:flex;flex-direction:column;overflow:hidden}
.toolbar{display:flex;align-items:center;gap:10px;padding:12px 20px;background:#fff;border-bottom:1px solid #e0e0e0;flex-wrap:wrap}
.toolbar h3{font-size:16px;flex:1}
.toolbar button,.toolbar select{padding:6px 14px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;font-size:13px}
.toolbar button.primary{background:#1a73e8;color:#fff;border-color:#1a73e8}
.toolbar button.primary:hover{background:#1557b0}
.toolbar button.danger{color:#d93025;border-color:#d93025}
.editor{flex:1;display:flex;flex-direction:column;padding:0;overflow:hidden}
.editor textarea{flex:1;width:100%;padding:16px 20px;font-family:SF Mono,Menlo,monospace;font-size:13px;line-height:1.6;border:none;outline:none;resize:none;background:#fff}
.editor .output{padding:16px 20px;background:#1e1e2e;color:#cdd6f4;font-family:SF Mono,Menlo,monospace;font-size:13px;line-height:1.6;max-height:200px;overflow-y:auto;white-space:pre-wrap;flex-shrink:0}
.empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;color:#999;gap:8px}
.empty-state .big{font-size:48px;margin-bottom:8px}
</style>
</head>
<body>
<div class="sidebar">
  <h2>📋 prompt-studio</h2>
  <div class="actions">
    <button onclick="newPrompt()">+ New</button>
    <button onclick="refreshList()">⟳</button>
  </div>
  <div class="prompt-list" id="promptList"></div>
</div>
<div class="main">
  <div class="toolbar">
    <h3 id="currentName">Select a prompt</h3>
    <select id="modelSelect"><option value="">default model</option><option value="gpt-4o-mini">gpt-4o-mini</option><option value="gpt-4o">gpt-4o</option></select>
    <button onclick="runPrompt()" class="primary">▶ Run</button>
    <button onclick="savePrompt()">💾 Save</button>
    <button onclick="deletePrompt()" class="danger">🗑</button>
  </div>
  <div class="editor"><textarea id="editor" placeholder="Select or create a prompt to get started..."></textarea><div class="output" id="output"></div></div>
  <div class="empty-state" id="emptyState"><div class="big">🎯</div><div>No prompts yet. Click "+ New" to create one.</div></div>
</div>
<script>
let currentName = null;
let dirty = false;
let saveTimer = null;

async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch('/api' + path, opts);
  return r.json();
}

async function refreshList() {
  const data = await api('GET', '/prompts');
  const list = document.getElementById('promptList');
  list.innerHTML = data.prompts.map(p => \`<div class="prompt-item\${p.name===currentName?' active':''}" onclick="selectPrompt('\${p.name}')"><div class="name">\${p.name}</div><div class="desc">\${p.firstLine||'<empty>'}</div><div class="meta">\${p.meta.model||'default model'}  ·  \${(p.body||'').length} chars</div></div>\`).join('');
}

async function selectPrompt(name) {
  if (dirty && !confirm('Unsaved changes. Discard?')) return;
  const data = await api('GET', '/prompts/' + encodeURIComponent(name));
  if (!data.content) return alert('Not found');
  currentName = name;
  dirty = false;
  document.getElementById('editor').value = data.content;
  document.getElementById('currentName').textContent = name;
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('promptList').querySelectorAll('.prompt-item').forEach(el => el.classList.remove('active'));
  const item = document.getElementById('promptList').querySelector(\`.prompt-item[onclick*="'\${name}'"]\`);
  if(item) item.classList.add('active');
  document.getElementById('output').textContent = '';
}

async function savePrompt() {
  if (!currentName) return;
  const content = document.getElementById('editor').value;
  await api('PUT', '/prompts/' + encodeURIComponent(currentName), { content });
  dirty = false;
  refreshList();
}

function markDirty() { dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(savePrompt, 2000); }

async function runPrompt() {
  if (!currentName) return alert('Select a prompt first');
  const model = document.getElementById('modelSelect').value;
  const vars = prompt('Variables (key=val, comma separated):');
  const varObj = {};
  if (vars) vars.split(',').forEach(p => { const [k,v] = p.split('='); if(k) varObj[k.trim()] = (v||'').trim(); });
  document.getElementById('output').textContent = '⏳ Running...';
  const data = await api('POST', '/run/' + encodeURIComponent(currentName), { model: model||undefined, vars: varObj });
  document.getElementById('output').textContent = data.success ? data.output : '❌ ' + (data.error||'Failed');
}

async function newPrompt() {
  const name = prompt('Prompt name:');
  if (!name) return;
  const data = await api('POST', '/new/' + encodeURIComponent(name));
  if (data.success) { refreshList(); selectPrompt(name); }
  else alert(data.error||'Failed');
}

async function deletePrompt() {
  if (!currentName) return;
  if (!confirm('Delete "' + currentName + '"?')) return;
  const data = await api('DELETE', '/prompts/' + encodeURIComponent(currentName));
  if (data.success) { currentName = null; document.getElementById('editor').value = ''; document.getElementById('currentName').textContent = 'Select a prompt'; refreshList(); }
}

// Auto-save on input
document.getElementById('editor').addEventListener('input', markDirty);

// Init
refreshList();
</script>
</body>
</html>`;

// ─── Server ──────────────────────────────────────────────────────

function startServer(port) {
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    
    async function json(code, data) {
      res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(data));
    }

    async function sendHTML() {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(HTML);
    }

    // ── API routes ──
    if (p === '/') return sendHTML();
    if (p === '/api/prompts') {
      const prompts = listPrompts();
      return json(200, { prompts });
    }
    const m = p.match(/^\/api\/prompts\/(.+)$/);
    if (m) {
      const name = decodeURIComponent(m[1]);
      const fp = promptPath(name);
      if (req.method === 'GET') {
        if (!fs.existsSync(fp)) return json(404, { error: 'Not found' });
        const content = fs.readFileSync(fp, 'utf-8');
        const { meta, body } = parsePromptFile(content);
        return json(200, { name, content, meta, body });
      }
      if (req.method === 'PUT') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
          try {
            const { content } = JSON.parse(body);
            const dir = path.dirname(fp);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(fp, content, 'utf-8');
            json(200, { success: true });
          } catch(e) { json(400, { error: e.message }); }
        });
        return;
      }
      if (req.method === 'DELETE') {
        try {
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
          json(200, { success: true });
        } catch(e) { json(400, { error: e.message }); }
        return;
      }
    }
    const rm = p.match(/^\/api\/new\/(.+)$/);
    if (rm && req.method === 'POST') {
      const name = decodeURIComponent(rm[1]);
      const fp = promptPath(name);
      if (fs.existsSync(fp)) return json(409, { error: 'Already exists' });
      const template = `---
model: gpt-4o-mini
temperature: 0.5
max_tokens: 1000
lang: en
---
Your prompt here. Use {{variable}} for template variables.
`;
      const dir = path.dirname(fp);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fp, template.trimStart(), 'utf-8');
      return json(200, { success: true });
    }
    const rrm = p.match(/^\/api\/run\/(.+)$/);
    if (rrm && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const { model, vars } = JSON.parse(body);
          const name = decodeURIComponent(rrm[1]);
          const fp = promptPath(name);
          if (!fs.existsSync(fp)) return json(404, { error: 'Not found' });
          
          const content = fs.readFileSync(fp, 'utf-8');
          const { meta, body: promptBody } = parsePromptFile(content);
          
          const API_KEY = process.env.AI_ANNOTATOR_API_KEY || process.env.OPENAI_API_KEY || '';
          if (!API_KEY) return json(400, { error: 'No API key. Set AI_ANNOTATOR_API_KEY or OPENAI_API_KEY.' });
          
          // Resolve variables
          let userPrompt = promptBody;
          if (vars) {
            for (const [k, v] of Object.entries(vars)) {
              userPrompt = userPrompt.replace(new RegExp('\\{\\{' + k + '\\}\\}', 'g'), v);
            }
          }
          
          const m = model || meta.model || 'gpt-4o-mini';
          const temp = meta.temperature ?? 0.5;
          const maxT = meta.max_tokens ?? 2000;
          
          const r = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
            body: JSON.stringify({
              model: m,
              messages: [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: userPrompt }
              ],
              temperature: temp,
              max_tokens: maxT,
            }),
          });
          
          if (!r.ok) return json(500, { error: 'API ' + r.status + ': ' + (await r.text()).slice(0, 200) });
          const d = await r.json();
          const output = d.choices?.[0]?.message?.content || '';
          
          // Log
          try {
            const lf = logPath();
            const dir = path.dirname(lf);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const entry = JSON.stringify({ name, model: m, time: new Date().toISOString(), chars: output.length });
            fs.appendFileSync(lf, entry + '\n', 'utf-8');
          } catch {}
          
          json(200, { success: true, output, chars: output.length });
        } catch(e) { json(500, { error: e.message }); }
      });
      return;
    }
    if (p === '/api/log') {
      return json(200, { entries: getLog() });
    }
    
    // 404
    res.writeHead(404);
    res.end('Not found');
  });
  
  srv.listen(port, '127.0.0.1', () => {
    const addr = `http://127.0.0.1:${port}`;
    console.log(`\n🎯 prompt-studio Web UI`);
    console.log(`   ${addr}\n`);
    console.log(`   Press Ctrl+C to stop\n`);
    if (process.env.PROMPT_STUDIO_DIR) {
      console.log(`   Directory: ${process.env.PROMPT_STUDIO_DIR}\n`);
    }
  });
  
  return srv;
}

// ─── CLI entry ──────────────────────────────────────────────────

const port = parseInt(process.argv[2] || process.env.PORT || DEFAULT_PORT);
const srv = startServer(port);

process.on('SIGINT', () => { srv.close(); process.exit(0); });
process.on('SIGTERM', () => { srv.close(); process.exit(0); });
