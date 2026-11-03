#!/usr/bin/env node
// Product Design Harness gates. Node 18+. Reads the hook's JSON input from stdin.
//   node gate.mjs pre     PreToolUse on Write|Edit|MultiEdit: screens wait for the brief, the flows and the copy, and
//                         only the UI teammate writes them; flows.md and copy.md belong to their teammates
//   node gate.mjs post    PostToolUse on Write|Edit|MultiEdit: records which screens changed, and when
//   node gate.mjs agent   SubagentStop: records which teammate finished, and when
//   node gate.mjs stop    Stop: asks for the design review and the code review when screens changed after them
// Quiet unless design/run.json exists, while it says "paused": true, and once a run marked "step": "done" is over:
// both reviews newer than its last screen change, or a framing run ("mode": "frame") that wrote no screens. Exit 2 blocks the tool call with a message to Claude; exit 1 reports an
// internal error and lets the call through. PDH_DEBUG=<folder> appends every hook input to <folder>/hook-inputs.jsonl.
import fs from 'node:fs'
import path from 'node:path'

const UI = new Set(['.tsx', '.jsx', '.vue', '.svelte', '.astro', '.html', '.htm', '.css', '.scss', '.sass', '.less', '.mdx', '.swift'])
const SKIP = /(^|\/)(node_modules|\.git|dist|build|out|coverage|\.next|\.nuxt|\.svelte-kit)\//
const NAME = 'Product Design Harness'
const PLUGIN = 'product-design-harness'
const OWNED = { 'design/flows.md': 'flows', 'design/copy.md': 'copywriter' }
const MAX_STOP_BLOCKS = 3

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function projectPath(root, filePath) {
  if (!filePath || typeof filePath !== 'string') return null
  const rel = path.relative(root, path.resolve(root, filePath)).split(path.sep).join('/')
  if (rel === '' || rel.startsWith('../') || path.isAbsolute(rel)) return null
  return rel
}

// The project-relative path of a screen file the gates watch, or null.
function uiPath(root, filePath) {
  const rel = projectPath(root, filePath)
  if (!rel || rel.startsWith('design/') || SKIP.test(rel)) return null
  return UI.has(path.extname(rel).toLowerCase()) ? rel : null
}

// The teammate a hook fired in: "ui-builder" for "product-design-harness:ui-builder", null in the lead's session.
function teammate(input) {
  const t = input.agent_type
  if (!t || typeof t !== 'string') return null
  return t.startsWith(`${PLUGIN}:`) ? t.slice(PLUGIN.length + 1) : t
}

function section(text, title) {
  return text.split(/^## /m).find((s) => new RegExp(`^${title}\\b`, 'i').test(s)) ?? ''
}

// True when the "Success criteria" section of brief.md has a bullet that isn't the template placeholder.
export function criteriaFilled(text) {
  return section(text, 'Success criteria')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((line) => line.match(/^\s*[-*]\s+(.+?)\s*$/)?.[1])
    .some((item) => item && !/^<[^>]*>$/.test(item))
}

// True when a section of a design file has a table row below its header that isn't a placeholder.
export function tableFilled(text, title) {
  const rows = section(text, title)
    .split('\n')
    .filter((l) => /^\s*\|/.test(l))
  return rows.slice(2).some((row) => row.split('|').slice(1, -1).some((cell) => cell.trim() && !/^<[^>]*>$/.test(cell.trim())))
}

// True when review.md states a verdict: pass, fix or decide.
export function hasVerdict(text) {
  return /\bVerdict:\s*\**\s*(pass|fix|decide)\b/i.test(text)
}

function statePath(root) {
  return path.join(root, 'design', '.harness', 'state.json')
}

function readState(root) {
  const file = statePath(root)
  return fs.existsSync(file) ? readJson(file) : {}
}

function writeState(root, state) {
  const dir = path.join(root, 'design', '.harness')
  fs.mkdirSync(dir, { recursive: true })
  const ignore = path.join(dir, '.gitignore')
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n')
  fs.writeFileSync(statePath(root), JSON.stringify(state, null, 2) + '\n')
}

// What still stands between the last screen change and finishing, as short reasons; empty when nothing does.
export function reviewGaps(root, state) {
  if (!state.lastUiWriteMs) return []
  const after = (name) => (state.agents?.[name] ?? 0) > state.lastUiWriteMs
  const gaps = []
  if (!after('design-reviewer')) gaps.push(`${PLUGIN}:design-reviewer hasn't reviewed the screens since they last changed`)
  if (!after('code-reviewer')) gaps.push(`${PLUGIN}:code-reviewer hasn't reviewed the code since it last changed`)
  const review = path.join(root, 'design', 'review.md')
  const fresh = fs.existsSync(review) && fs.statSync(review).mtimeMs + 1000 > state.lastUiWriteMs && hasVerdict(fs.readFileSync(review, 'utf8'))
  if (!fresh) gaps.push('design/review.md has no verdict written after the last screen change')
  return gaps
}

// A run marked done is over when its screens were reviewed after their last change, or when it was a framing run
// that writes no screens ("mode": "frame").
function closed(root, run) {
  const state = readState(root)
  return state.lastUiWriteMs ? reviewGaps(root, state).length === 0 : run.mode === 'frame'
}

function block(message) {
  process.stderr.write(`${NAME}: ${message}\n`)
  return 2
}

const ESCAPE = 'To work outside the harness, set "paused": true in design/run.json.'

function pre(root, input, run) {
  const rel = projectPath(root, input.tool_input?.file_path)
  if (!rel) return 0
  const who = teammate(input)
  if (OWNED[rel]) {
    if (who === OWNED[rel]) return 0
    return block(`${rel} is written by ${PLUGIN}:${OWNED[rel]}. Delegate to it with the Agent tool (called Task in some versions), giving it the step and the paths to read. ${ESCAPE}`)
  }
  if (!uiPath(root, rel)) return 0
  const design = (name) => {
    const file = path.join(root, 'design', name)
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  }
  if (!criteriaFilled(design('brief.md'))) {
    return block(`${rel} is a screen, and screens wait for the brief: design/brief.md has no success criteria yet. ${ESCAPE}`)
  }
  if (!run.briefApproved) {
    return block(
      `${rel} is a screen, and screens wait for the user's approval of the brief. Show the user the success criteria and ` +
        `principles in design/brief.md; when they agree, set "briefApproved" in design/run.json to the date and time. ${ESCAPE}`
    )
  }
  if (!tableFilled(design('flows.md'), 'States')) {
    return block(`${rel} is a screen, and screens wait for the states: delegate step 3 to ${PLUGIN}:flows, which writes design/flows.md. ${ESCAPE}`)
  }
  if (!tableFilled(design('copy.md'), 'Strings')) {
    return block(`${rel} is a screen, and screens wait for the copy: delegate step 4 to ${PLUGIN}:copywriter, which writes design/copy.md. ${ESCAPE}`)
  }
  if (who !== 'ui-builder') {
    return block(
      `${rel} is a screen, and screens are written by ${PLUGIN}:ui-builder. Delegate to it with the Agent tool (called Task ` +
        `in some versions), with the paths to the spec, the preview and the way to see the page. ${ESCAPE}`
    )
  }
  return 0
}

function post(root, input) {
  const rel = uiPath(root, input.tool_input?.file_path)
  if (!rel) return 0
  const state = readState(root)
  const touched = new Set(Array.isArray(state.touched) ? state.touched : [])
  touched.add(rel)
  state.touched = [...touched].slice(-500)
  state.lastUiWrite = new Date().toISOString()
  state.lastUiWriteMs = Date.now()
  state.stopBlocks = 0
  writeState(root, state)
  return 0
}

function agent(root, input) {
  const who = teammate(input)
  if (!who) return 0
  const state = readState(root)
  state.agents = { ...(state.agents ?? {}), [who]: Date.now() }
  state.stopBlocks = 0
  writeState(root, state)
  return 0
}

function stop(root) {
  const state = readState(root)
  const gaps = reviewGaps(root, state)
  if (!gaps.length) return 0
  const blocks = state.stopBlocks ?? 0
  // Three reminders in a row with no progress in between, then the lead may stop: the gate asks, it doesn't trap.
  if (blocks >= MAX_STOP_BLOCKS) return 0
  state.stopBlocks = blocks + 1
  writeState(root, state)
  const n = Array.isArray(state.touched) ? state.touched.length : 0
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason:
        `${NAME}: screens changed in this run (${n} file${n === 1 ? '' : 's'}) and the review isn't done: ${gaps.join('; ')}. ` +
        `Delegate to ${PLUGIN}:design-reviewer (the preview, the way to see the page and the spec, nothing about how it ` +
        `was built) and to ${PLUGIN}:code-reviewer, in parallel; write the design reviewer's report with its verdict to ` +
        'design/review.md, then finish. If the user asked to stop, set "paused": true in design/run.json.',
    }) + '\n'
  )
  return 0
}

const MODES = { pre, post, agent, stop }

function main(mode) {
  if (!MODES[mode]) {
    process.stderr.write('usage: node gate.mjs pre|post|agent|stop  (hook input JSON on stdin)\n')
    return 1
  }
  let raw = ''
  try {
    raw = fs.readFileSync(0, 'utf8')
  } catch {}
  const input = raw.trim() ? JSON.parse(raw) : {}
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()
  if (process.env.PDH_DEBUG) {
    fs.appendFileSync(path.join(process.env.PDH_DEBUG, 'hook-inputs.jsonl'), JSON.stringify({ mode, ...input, tool_input: input.tool_input ? Object.keys(input.tool_input) : undefined }) + '\n')
  }
  const runFile = path.join(root, 'design', 'run.json')
  if (!fs.existsSync(runFile)) return 0
  const run = readJson(runFile)
  if (run.paused === true) return 0
  if (run.step === 'done' && closed(root, run)) return 0
  return MODES[mode](root, input, run)
}

if (process.argv[1] && path.basename(process.argv[1]) === 'gate.mjs') {
  try {
    process.exitCode = main(process.argv[2])
  } catch (err) {
    process.stderr.write(`${NAME} gate: ${err.message}\n`)
    process.exitCode = 1
  }
}
