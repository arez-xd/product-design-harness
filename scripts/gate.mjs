#!/usr/bin/env node
// Product Design Harness gates. Node 18+. Reads the hook's JSON input from stdin.
//   node gate.mjs pre    PreToolUse on Write|Edit|MultiEdit: no screen before the brief is approved
//   node gate.mjs post   PostToolUse on Write|Edit|MultiEdit: records which UI files changed, and when
//   node gate.mjs stop   Stop: asks for a design review when screens changed after the last design/review.md
// Quiet unless design/run.json exists, and while it says "paused": true or "step": "done".
// Exit 2 blocks the tool call with a message to Claude; exit 1 reports an internal error and lets the call through.
import fs from 'node:fs'
import path from 'node:path'

const UI = new Set(['.tsx', '.jsx', '.vue', '.svelte', '.astro', '.html', '.htm', '.css', '.scss', '.sass', '.less', '.mdx', '.swift'])
const SKIP = /(^|\/)(node_modules|\.git|dist|build|out|coverage|\.next|\.nuxt|\.svelte-kit)\//
const NAME = 'Product Design Harness'

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

// The project-relative path of a UI file the gates watch, or null.
function uiPath(root, filePath) {
  if (!filePath || typeof filePath !== 'string') return null
  const rel = path.relative(root, path.resolve(root, filePath)).split(path.sep).join('/')
  if (rel === '' || rel.startsWith('../') || path.isAbsolute(rel)) return null
  if (rel.startsWith('design/') || SKIP.test(rel)) return null
  return UI.has(path.extname(rel).toLowerCase()) ? rel : null
}

// True when the "Success criteria" section of brief.md has a bullet that isn't the template placeholder.
export function criteriaFilled(text) {
  const section = text.split(/^## /m).find((s) => /^Success criteria\b/i.test(s))
  if (!section) return false
  return section
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((line) => line.match(/^\s*[-*]\s+(.+?)\s*$/)?.[1])
    .some((item) => item && !/^<[^>]*>$/.test(item))
}

// True when review.md states a verdict: pass, fix or decide.
export function hasVerdict(text) {
  return /\bVerdict:\s*\**\s*(pass|fix|decide)\b/i.test(text)
}

function pre(root, input) {
  const rel = uiPath(root, input.tool_input?.file_path)
  if (!rel) return 0
  const run = readJson(path.join(root, 'design', 'run.json'))
  const briefFile = path.join(root, 'design', 'brief.md')
  const filled = fs.existsSync(briefFile) && criteriaFilled(fs.readFileSync(briefFile, 'utf8'))
  if (run.briefApproved && filled) return 0
  const why = filled
    ? 'the user hasn\'t approved the brief yet ("briefApproved" in design/run.json is empty)'
    : 'design/brief.md has no success criteria yet'
  process.stderr.write(
    `${NAME}: ${rel} is a screen, and screens wait for the brief: ${why}. ` +
      'Show the user the success criteria and principles in design/brief.md; when they agree, set "briefApproved" ' +
      'in design/run.json to the date and time. To work outside the harness, set "paused": true in design/run.json.\n'
  )
  return 2
}

function statePath(root) {
  return path.join(root, 'design', '.harness', 'state.json')
}

function post(root, input) {
  const rel = uiPath(root, input.tool_input?.file_path)
  if (!rel) return 0
  const dir = path.join(root, 'design', '.harness')
  fs.mkdirSync(dir, { recursive: true })
  const ignore = path.join(dir, '.gitignore')
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n')
  const file = statePath(root)
  const state = fs.existsSync(file) ? readJson(file) : {}
  const touched = new Set(Array.isArray(state.touched) ? state.touched : [])
  touched.add(rel)
  state.touched = [...touched].slice(-500)
  state.lastUiWrite = new Date().toISOString()
  state.lastUiWriteMs = Date.now()
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n')
  return 0
}

function stop(root, input) {
  if (input.stop_hook_active) return 0
  const file = statePath(root)
  if (!fs.existsSync(file)) return 0
  const state = readJson(file)
  if (!state.lastUiWriteMs) return 0
  const review = path.join(root, 'design', 'review.md')
  if (fs.existsSync(review)) {
    // One second of slack for file systems that keep modification times to the second.
    const fresh = fs.statSync(review).mtimeMs + 1000 > state.lastUiWriteMs
    if (fresh && hasVerdict(fs.readFileSync(review, 'utf8'))) return 0
  }
  const n = Array.isArray(state.touched) ? state.touched.length : 0
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason:
        `${NAME}: screens changed after the last design review (${n} file${n === 1 ? '' : 's'} in this run). ` +
        'Delegate to product-design-harness:design-reviewer with the preview and the spec only, write its report ' +
        'with a verdict to design/review.md, then finish. If the user asked to stop, set "paused": true in design/run.json.',
    }) + '\n'
  )
  return 0
}

const MODES = { pre, post, stop }

function main(mode) {
  if (!MODES[mode]) {
    process.stderr.write('usage: node gate.mjs pre|post|stop  (hook input JSON on stdin)\n')
    return 1
  }
  let raw = ''
  try {
    raw = fs.readFileSync(0, 'utf8')
  } catch {}
  const input = raw.trim() ? JSON.parse(raw) : {}
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()
  const runFile = path.join(root, 'design', 'run.json')
  if (!fs.existsSync(runFile)) return 0
  const run = readJson(runFile)
  if (run.paused === true || run.step === 'done') return 0
  return MODES[mode](root, input)
}

if (process.argv[1] && path.basename(process.argv[1]) === 'gate.mjs') {
  try {
    process.exitCode = main(process.argv[2])
  } catch (err) {
    process.stderr.write(`${NAME} gate: ${err.message}\n`)
    process.exitCode = 1
  }
}
