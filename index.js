#!/usr/bin/env node

/**
 * prompt-studio — Local prompt manager for AI developers.
 *
 * Create, version, test, and compare prompts across LLMs.
 *
 * Quick Start:
 *   prompt init                    Create example config in current dir
 *   prompt list                    List all prompts
 *   prompt run my-prompt           Run with default model/vars
 *   prompt run my-prompt --model claude-3-haiku --var name=John
 *   prompt compare my-prompt       Run on multiple models side by side
 *   prompt new my-prompt           Create a new prompt template
 */

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

// ─── Config ──────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = process.env.PROMPT_STUDIO_MODEL || process.env.AI_ANNOTATOR_MODEL || 'gpt-4o-mini';
const API_KEY = process.env.AI_ANNOTATOR_API_KEY || process.env.OPENAI_API_KEY || '';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

function hash(x) { return createHash('sha256').update(x).digest('hex').slice(0, 8); }

// ─── Help ────────────────────────────────────────────────────────────────────

function help() {
  console.log(`
prompt-studio — Local prompt manager for AI developers

Usage:
  prompt init                            Create example prompts in ./.prompts/
  prompt list                            List all prompts
  prompt new <name>                      Create a new prompt template
  prompt show <name>                     Show prompt template content
  prompt run <name>                      Run prompt with default model
  prompt run <name> --model <m>          Run with specific model
  prompt run <name> --var key=val        Set template variables
  prompt run <name> --raw <text>         Use raw text instead of file
  prompt compare <name>                  Run on multiple models side by side
  prompt preview <name>                  Preview resolved prompt (dry-run)
  prompt log                             Show recent run history
  prompt rm <name>                       Delete a prompt
  prompt update                          Check for updates and upgrade
  prompt ui                              Start local web UI (port 3456)
  prompt --help

Environment Variables:
  AI_ANNOTATOR_API_KEY  or  OPENAI_API_KEY   API key
  PROMPT_STUDIO_MODEL                         Default model (default: gpt-4o-mini)

Example:
  prompt init
  prompt run greeting --var name=World --lang zh
`);
}

// ─── Paths ───────────────────────────────────────────────────────────────────

const CONFIG_DIR = './.prompts';

function promptsDir() {
  return CONFIG_DIR;
}

function promptPath(name) {
  return promptsDir() + '/' + name + '.md';
}

function logPath() {
  return promptsDir() + '/.history.jsonl';
}

// ─── Init ────────────────────────────────────────────────────────────────────

function initPrompts() {
  const dir = promptsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const examples = {
    'greeting.md': `---
model: gpt-4o-mini
temperature: 0.7
max_tokens: 500
lang: en
---
You are a friendly assistant. Greet {{name}} warmly. Keep it under 50 words.`,
    'code-review.md': `---
model: gpt-4o-mini
temperature: 0.2
max_tokens: 2000
lang: en
---
Review the following {{language}} code. Focus on:
1. Potential bugs
2. Performance issues
3. Code style

\`\`\`{{language}}
{{code}}
\`\`\``,
    'summarize.md': `---
model: gpt-4o-mini
temperature: 0.3
max_tokens: 300
lang: en
---
Summarize the following text in {{max_words}} words or less:

{{text}}`,
    'translate.md': `---
model: gpt-4o-mini
temperature: 0.1
max_tokens: 1000
lang: zh
---
Translate the following text from {{from_lang}} to {{to_lang}}:
Only return the translation, no explanations.

原文：
{{text}}`,
  };

  for (const [file, content] of Object.entries(examples)) {
    const path = dir + '/' + file;
    if (!fs.existsSync(path)) {
      fs.writeFileSync(path, content.trimStart(), 'utf-8');
      console.log('  Created:', path.replace('./', ''));
    }
  }
  console.log('\n✅ Example prompts created in ./.prompts/');
  console.log('   Try: prompt run greeting --var name=World');
  console.log('   Try: prompt run code-review --var language=JavaScript --var code="const x = 1"');
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

function parsePromptFile(content) {
  const lines = content.split('\n');
  let meta = {};
  let bodyLines = [];
  let inMeta = false;

  if (lines[0]?.trim() === '---') {
    inMeta = true;
    let i = 1;
    const metaLines = [];
    while (i < lines.length && lines[i]?.trim() !== '---') {
      metaLines.push(lines[i]);
      i++;
    }
    // Parse YAML-ish
    for (const ml of metaLines) {
      const match = ml.match(/^(\w[\w_]*)\s*:\s*(.*?)\s*$/);
      if (match) {
        let val = match[2].trim();
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (!isNaN(val) && val !== '') val = Number(val);
        meta[match[1]] = val;
      }
    }
    bodyLines = lines.slice(i + 1);
  } else {
    bodyLines = lines;
  }

  return { meta, body: bodyLines.join('\n').trim() };
}

function resolveVariables(template, vars) {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp('\\{\\{' + key + '\\}\\}', 'g'), val);
  }
  return result;
}

// ─── List ────────────────────────────────────────────────────────────────────

function listPrompts() {
  const dir = promptsDir();
  if (!fs.existsSync(dir)) {
    console.log('No prompts directory found. Run: prompt init');
    return;
  }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  if (files.length === 0) {
    console.log('No prompts found in ./.prompts/');
    return;
  }
  console.log('\n📋 Prompts:\n');
  for (const f of files) {
    const name = f.replace('.md', '');
    const content = fs.readFileSync(dir + '/' + f, 'utf-8');
    const { meta, body } = parsePromptFile(content);
    const firstLine = body.split('\n')[0]?.slice(0, 60) || '';
    console.log(`  ${name.padEnd(25)} ${meta.model || '(default)'.padEnd(20)} ${firstLine}`);
  }
  console.log();
}

// ─── Show, New, Delete ──────────────────────────────────────────────────────

function showPrompt(name) {
  const path = promptPath(name);
  if (!fs.existsSync(path)) { console.error('Prompt not found:', name); return; }
  console.log(fs.readFileSync(path, 'utf-8'));
}

function newPrompt(name) {
  const dir = promptsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const path = promptPath(name);
  if (fs.existsSync(path)) { console.error('Already exists:', name); return; }
  const template = `---
model: ${DEFAULT_MODEL}
temperature: 0.5
max_tokens: 1000
lang: en
---
Your prompt here. Use {{variable}} for template variables.
`;
  fs.writeFileSync(path, template.trimStart(), 'utf-8');
  console.log('Created:', path);
}

function deletePrompt(name) {
  const path = promptPath(name);
  if (!fs.existsSync(path)) { console.error('Not found:', name); return; }
  fs.unlinkSync(path);
  console.log('Deleted:', name);
}

// ─── Run ─────────────────────────────────────────────────────────────────────

async function runLLM(systemPrompt, userPrompt, model, temperature, maxTokens) {
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: temperature ?? 0.5,
    max_tokens: maxTokens ?? 2000,
  };

  const r = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
    body: JSON.stringify(body),
  });

  if (!r.ok) throw new Error('API error ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const d = await r.json();
  return d.choices?.[0]?.message?.content || '';
}

function parseVarArgs(vars) {
  const result = {};
  for (const v of vars) {
    const eq = v.indexOf('=');
    if (eq > 0) {
      result[v.slice(0, eq)] = v.slice(eq + 1);
    }
  }
  return result;
}

async function runPrompt(name, opts) {
  const path = promptPath(name);
  if (!fs.existsSync(path)) { console.error('Prompt not found:', name); process.exit(1); }
  const content = fs.readFileSync(path, 'utf-8');
  const { meta, body } = parsePromptFile(content);

  const vars = opts.vars || {};
  const model = opts.model || meta.model || DEFAULT_MODEL;
  const temperature = opts.temperature ?? meta.temperature ?? 0.5;
  const maxTokens = opts.maxTokens ?? meta.max_tokens ?? 2000;

  let userPrompt;
  if (opts.raw) {
    userPrompt = opts.raw;
  } else {
    userPrompt = resolveVariables(body, vars);
    // Check for unresolved variables
    const unresolved = userPrompt.match(/\{\{(\w+)\}\}/g);
    if (unresolved) {
      console.warn('⚠ Unresolved variables:', [...new Set(unresolved)].join(', '));
      console.warn('  Use --var to set them.');
      return;
    }
  }

  if (opts.preview) {
    console.log('='.repeat(50));
    console.log('Prompt Preview:', name);
    console.log('Model:', model);
    console.log('='.repeat(50));
    console.log(userPrompt);
    console.log('='.repeat(50));
    console.log(`${userPrompt.length} chars, ~${Math.ceil(userPrompt.length / 4)} tokens`);
    return;
  }

  console.log(`🤖 Running "${name}" → ${model}...\n`);
  const startTime = Date.now();
  try {
    const result = await runLLM(
      fs.existsSync(promptsDir() + '/system.md') ? fs.readFileSync(promptsDir() + '/system.md', 'utf-8') : 'You are a helpful assistant.',
      userPrompt,
      model,
      temperature,
      maxTokens
    );
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(result);
    console.log(`\n---\n⏱ ${elapsed}s  |  📄 ${result.length} chars  |  💰 ~${Math.ceil(result.length / 4)} tokens`);

    // Log
    try {
      const logFile = logPath();
      const entry = JSON.stringify({ name, model, time: new Date().toISOString(), elapsed: parseFloat(elapsed), chars: result.length, hash: hash(result) });
      fs.appendFileSync(logFile, entry + '\n', 'utf-8');
    } catch {}

    return result;
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
}

async function comparePrompts(name, opts) {
  const models = (opts.compareModels || 'gpt-4o-mini,gpt-4o,claude-3-haiku').split(',').map(s => s.trim());
  console.log(`🔄 Comparing "${name}" across ${models.length} models...\n`);
  const results = [];
  for (const model of models) {
    console.log(`─ Running ${model}...`);
    const r = await runPrompt(name, { ...opts, model, quiet: true });
    if (r) results.push({ model, output: r, chars: r.length });
    console.log();
  }

  console.log('\n' + '='.repeat(60));
  console.log('COMPARISON RESULTS');
  console.log('='.repeat(60));
  for (const r of results) {
    console.log(`\n── ${r.model} (${r.chars} chars)`);
    console.log(r.output.slice(0, 300) + (r.output.length > 300 ? '...' : ''));
    console.log();
  }
}

function checkUpdate() {
  console.log('Checking for updates...\n');
  try {
    const pkgPath = new URL('./package.json', import.meta.url).pathname;
    const current = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version;
    const latest = execSync('npm view @kevinxyz/prompt-studio version 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (latest && latest !== current) {
      console.log(`📦 Update available: v${current} → v${latest}`);
      console.log('Running: npm install -g @kevinxyz/prompt-studio@latest\n');
      execSync('npm install -g @kevinxyz/prompt-studio@latest', { stdio: 'inherit' });
      console.log('\n✅ Updated to v' + latest);
    } else {
      console.log('✅ You are on the latest version (v' + current + ')');
    }
  } catch (e) {
    console.error('Update failed:', e.message);
    console.log('Try manually: npm install -g @kevinxyz/prompt-studio@latest');
  }
}

function showLog() {
  const lf = logPath();
  if (!fs.existsSync(lf)) { console.log('No run history yet.'); return; }
  const lines = fs.readFileSync(lf, 'utf-8').trim().split('\n').filter(Boolean);
  console.log('\n📊 Run History (last ' + lines.length + ' runs):\n');
  for (const line of lines.slice(-20)) {
    try {
      const e = JSON.parse(line);
      console.log(`  ${e.time.slice(0, 19)} | ${e.model.padEnd(20)} | ${e.name.padEnd(25)} | ${e.chars} chars | #${e.hash}`);
    } catch {}
  }
  console.log();
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') { help(); process.exit(0); }

  const cmd = args[0];
  const cmdArgs = args.slice(1);
  const opts = { vars: {}, compareModels: null, preview: false, raw: null };

  // Parse command-specific options
  for (let i = 0; i < cmdArgs.length; i++) {
    const arg = cmdArgs[i];
    if (arg === '--var' && cmdArgs[i+1]) {
      const v = cmdArgs[++i];
      const eq = v.indexOf('=');
      if (eq > 0) opts.vars[v.slice(0, eq)] = v.slice(eq + 1);
    } else if (arg === '--model' && cmdArgs[i+1]) { opts.model = cmdArgs[++i]; }
    else if (arg === '--raw' && cmdArgs[i+1]) { opts.raw = cmdArgs[++i]; }
    else if (arg === '--temp' && cmdArgs[i+1]) { opts.temperature = parseFloat(cmdArgs[++i]); }
    else if (arg === '--max-tokens' && cmdArgs[i+1]) { opts.maxTokens = parseInt(cmdArgs[++i]); }
    else if (arg === '--models' && cmdArgs[i+1]) { opts.compareModels = cmdArgs[++i]; }
    else if (arg === '--preview' || arg === '--dry-run') { opts.preview = true; }
    else if (arg === '--lang' && cmdArgs[i+1]) { opts.vars.lang = cmdArgs[++i]; }
    else if (arg.startsWith('--')) { /* skip unknown, let subcommand handle */ }
    else { opts._posArgs = opts._posArgs || []; opts._posArgs.push(arg); }
  }

  switch (cmd) {
    case 'init':
      initPrompts();
      break;
    case 'list':
    case 'ls':
      listPrompts();
      break;
    case 'new':
      if (opts._posArgs?.[0]) newPrompt(opts._posArgs[0]);
      else console.error('Usage: prompt new <name>');
      break;
    case 'show':
    case 'cat':
      if (opts._posArgs?.[0]) showPrompt(opts._posArgs[0]);
      else console.error('Usage: prompt show <name>');
      break;
    case 'rm':
    case 'delete':
      if (opts._posArgs?.[0]) deletePrompt(opts._posArgs[0]);
      else console.error('Usage: prompt rm <name>');
      break;
    case 'run':
      if (!API_KEY) { console.error('❌ No API key. Set AI_ANNOTATOR_API_KEY or OPENAI_API_KEY.'); process.exit(1); }
      if (opts._posArgs?.[0]) await runPrompt(opts._posArgs[0], opts);
      else console.error('Usage: prompt run <name> [--var key=val]');
      break;
    case 'compare':
      if (!API_KEY) { console.error('❌ No API key. Set AI_ANNOTATOR_API_KEY or OPENAI_API_KEY.'); process.exit(1); }
      if (opts._posArgs?.[0]) await comparePrompts(opts._posArgs[0], opts);
      else console.error('Usage: prompt compare <name> [--models gpt-4o,claude-3]');
      break;
    case 'preview':
      opts.preview = true;
      if (opts._posArgs?.[0]) await runPrompt(opts._posArgs[0], opts);
      else console.error('Usage: prompt preview <name> [--var key=val]');
      break;
    case 'log':
    case 'history':
      showLog();
      break;
    case 'update':
    case 'upgrade':
      checkUpdate();
      break;
    case 'ui':
    case 'server':
    case 'web':
    case 'dashboard':
      import('./server.js').catch(e => { console.error('Failed to start UI:', e.message); });
      break;
    default:
      console.error('Unknown command:', cmd);
      console.log('Run: prompt --help');
      process.exit(1);
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
