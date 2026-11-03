#!/usr/bin/env node
// Product Design Harness gates. Node 18+. Reads the hook's JSON input from stdin.
//   node gate.mjs pre     PreToolUse on Write|Edit|MultiEdit: screens wait for the brief, the flows and the copy (a
//                         quick change, the brief only), and only the UI teammate writes them; flows.md and copy.md
//                         belong to their teammates
//   node gate.mjs post    PostToolUse on Write|Edit|MultiEdit: records which screens changed, and when
//   node gate.mjs spawn   PreToolUse on Agent|Task|SendMessage: a teammate waits for the step before it, and runs on
//                         the model the rules give it
//   node gate.mjs start   SubagentStart: records which teammates are working
//   node gate.mjs agent   SubagentStop: records which teammate finished, and when
//   node gate.mjs stop    Stop: asks for the design review and the code review when screens changed after them, unless
//                         a teammate is still working and the lead is waiting for it
// Quiet unless design/run.json exists, while it says "paused": true, and once a run marked "step": "done" is over:
// both reviews newer than its last screen change, or a framing run ("mode": "frame") that wrote no screens. Exit 2
// blocks the tool call with a message to Claude; exit 1 reports an internal error and lets the call through.
// PDH_DEBUG=<folder> appends every hook input to <folder>/hook-inputs.jsonl.
import fs from 'node:fs'
import path from 'node:path'

// Markup, styles and the scripts that render them; in a design run, all of it is the UI teammate's.
const UI = new Set(['.tsx', '.jsx', '.ts', '.js', '.mjs', '.cjs', '.vue', '.svelte', '.astro', '.html', '.htm', '.css', '.scss', '.sass', '.less', '.mdx', '.swift'])
const SKIP = /(^|\/)(node_modules|\.git|dist|build|out|coverage|\.next|\.nuxt|\.svelte-kit)\//
const NAME = 'Product Design Harness'
const PLUGIN = 'product-design-harness'
const OWNED = { 'design/flows.md': 'flows', 'design/copy.md': 'copywriter' }
const MAX_STOP_BLOCKS = 3

// Who may not start while another teammate is working: each step waits for the ones it reads, a fix round waits for
// both reviews, and the reviews wait for the build. A teammate counts as working from its start to its stop, for at
// most an hour.
const WAITS_FOR = {
  flows: ['brief'],
  copywriter: ['brief', 'flows'],
  'ui-builder': ['brief', 'flows', 'copywriter', 'design-reviewer', 'code-reviewer'],
  'design-reviewer': ['flows', 'copywriter', 'ui-builder'],
  'code-reviewer': ['ui-builder'],
}
const STALE_MS = 60 * 60 * 1000

// On Opus or Fable, Flows and Copy run on Sonnet, and Code review may (interface-only changes); everyone else runs on
// the session's model unless the user chose otherwise in run.json "models".
const SONNET_ON_TOP = new Set(['flows', 'copywriter'])
const SONNET_ALLOWED = new Set(['flows', 'copywriter', 'code-reviewer'])
const MODEL_KEYS = { ui: 'ui-builder', build: 'ui-builder', builder: 'ui-builder', copy: 'copywriter', 'design-review': 'design-reviewer', 'code-review': 'code-reviewer' }

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

// "ui-builder" for "product-design-harness:ui-builder"; null for anything else.
function ours(type) {
  return typeof type === 'string' && type.startsWith(`${PLUGIN}:`) ? type.slice(PLUGIN.length + 1) : null
}

// The teammate a hook fired in: "ui-builder" for "product-design-harness:ui-builder", null in the lead's session.
function teammate(input) {
  const t = input.agent_type
  if (!t || typeof t !== 'string') return null
  return ours(t) ?? t
}

function section(text, title) {
  return text.split(/^## /m).find((s) => new RegExp(`^${title}\\b`, 'i').test(s)) ?? ''
}

// True when the "Success criteria" (or "Success criterion") section of brief.md has a line that isn't the template
// placeholder: a bullet, a numbered item or a plain line such as "Done when …".
export function criteriaFilled(text) {
  return section(text, 'Success criteri(?:a|on)')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .slice(1)
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim())
    .some((item) => item && !/^<[^>]*>$/.test(item) && !/^[-|: ]+$/.test(item))
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

// The model family in a model name or alias: "opus" for "claude-opus-5-5", null when there is none.
export function family(model) {
  return String(model ?? '').toLowerCase().match(/fable|opus|sonnet|haiku/)?.[0] ?? null
}

// Why an Agent call's model breaks the routing, or null when it doesn't. `asked` is the call's model, `session` the
// lead's, `models` the user's choices from run.json.
export function modelProblem(who, asked, session, models) {
  const name = `${PLUGIN}:${who}`
  const want = asked ? family(asked) ?? String(asked) : null
  const own = family(session)
  const choices = {}
  for (const [key, value] of Object.entries(models && typeof models === 'object' ? models : {})) {
    choices[MODEL_KEYS[key.toLowerCase()] ?? key.toLowerCase()] = value
  }
  const chosen = choices[who] ?? choices.all
  if (typeof chosen === 'string' && chosen.trim()) {
    if (/^(inherit|session)$/i.test(chosen.trim())) {
      if (!want || want === own) return null
      return `design/run.json has ${who} on the session's model, the user's choice: call ${name} again without "model".`
    }
    const pick = family(chosen) ?? chosen.trim()
    if (want === pick || (!want && own === pick)) return null
    return `design/run.json has ${who} on "${chosen}", the user's choice: call ${name} again with "model": "${pick}".`
  }
  if (!own) return null // the session's model is unknown, so there is nothing to compare with
  const top = own === 'opus' || own === 'fable'
  if (top && SONNET_ON_TOP.has(who)) {
    if (want === 'sonnet') return null
    return `On ${session}, ${name} runs on Sonnet: call it again with "model": "sonnet".`
  }
  if (!want || want === own) return null
  if (top && want === 'sonnet' && SONNET_ALLOWED.has(who)) return null
  return (
    `${name} runs on the session's model (${session}): call it again without "model". ` +
    'Another model is the user\'s call, written under "models" in design/run.json.'
  )
}

// The lead's model, from the last assistant entry of the session's transcript; null when it can't be read.
function sessionModel(input) {
  const file = input.transcript_path
  if (!file || typeof file !== 'string' || !fs.existsSync(file)) return null
  const size = fs.statSync(file).size
  const length = Math.min(size, 512 * 1024)
  const buffer = Buffer.alloc(length)
  const fd = fs.openSync(file, 'r')
  try {
    fs.readSync(fd, buffer, 0, length, size - length)
  } finally {
    fs.closeSync(fd)
  }
  const lines = buffer.toString('utf8').split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"assistant"')) continue
    try {
      const entry = JSON.parse(lines[i])
      const model = entry?.message?.model
      if (entry.type === 'assistant' && typeof model === 'string' && family(model)) return model
    } catch {}
  }
  return null
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

// The teammates still working, by agent id, without the ones that started over an hour ago.
function working(state) {
  const now = Date.now()
  return Object.fromEntries(
    Object.entries(state.running ?? {}).filter(([, r]) => r && typeof r.who === 'string' && now - (r.at ?? 0) < STALE_MS)
  )
}

// The session's own list of work in flight, when the hook input carries one, replaces what the gates recorded: a
// teammate's background task has its agent id.
function resync(state, tasks) {
  if (!Array.isArray(tasks)) return false
  const before = JSON.stringify(state.running ?? {})
  const live = new Set(tasks.map((t) => t?.id).filter((id) => typeof id === 'string'))
  state.running = Object.fromEntries(Object.entries(working(state)).filter(([id]) => live.has(id)))
  return JSON.stringify(state.running) !== before
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
    return block(
      `${rel} is a screen, and screens wait for the brief: design/brief.md has no success criteria yet (a line under its ` +
        `"## Success criteria" heading). ${ESCAPE}`
    )
  }
  if (!run.briefApproved) {
    return block(
      `${rel} is a screen, and screens wait for the user's approval of the brief. Show the user the success criteria and ` +
        `principles in design/brief.md; when they agree, set "briefApproved" in design/run.json to the date and time. ${ESCAPE}`
    )
  }
  // A quick change works on screens whose states and copy already exist; the full path waits for both.
  if (run.mode !== 'quick' && !tableFilled(design('flows.md'), 'States')) {
    return block(`${rel} is a screen, and screens wait for the states: delegate step 3 to ${PLUGIN}:flows, which writes design/flows.md. ${ESCAPE}`)
  }
  if (run.mode !== 'quick' && !tableFilled(design('copy.md'), 'Strings')) {
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

// A starting teammate counts as working until it stops; its id is kept so a message to it later is known as its.
function start(root, input) {
  const who = ours(input.agent_type)
  if (!who || typeof input.agent_id !== 'string') return 0
  const state = readState(root)
  state.running = { ...working(state), [input.agent_id]: { who, at: Date.now() } }
  state.ids = Object.fromEntries([...Object.entries(state.ids ?? {}), [input.agent_id, who]].slice(-200))
  writeState(root, state)
  return 0
}

function agent(root, input) {
  const who = teammate(input)
  if (!who) return 0
  const state = readState(root)
  state.agents = { ...(state.agents ?? {}), [who]: Date.now() }
  if (state.running && typeof input.agent_id === 'string') delete state.running[input.agent_id]
  resync(state, input.background_tasks)
  state.stopBlocks = 0
  writeState(root, state)
  return 0
}

function spawn(root, input, run) {
  const state = readState(root)
  const running = working(state)
  const to = input.tool_input?.to
  const message = input.tool_name === 'SendMessage'
  const who = message ? (typeof to === 'string' ? running[to]?.who ?? state.ids?.[to] ?? null : null) : ours(input.tool_input?.subagent_type)
  if (!who) return 0
  const waits = WAITS_FOR[who] ?? []
  const busy = [...new Set(Object.entries(running).filter(([id, r]) => id !== to && waits.includes(r.who)).map(([, r]) => `${PLUGIN}:${r.who}`))]
  if (busy.length) {
    return block(
      `${PLUGIN}:${who} waits for ${busy.join(' and ')}, still working. End your turn now: the completion notice wakes ` +
        'you. Then read what it wrote and start this step. Polling, messages asking how it goes and placeholder agents only cost time.'
    )
  }
  if (message) return 0
  const problem = modelProblem(who, input.tool_input?.model, sessionModel(input), run.models)
  return problem ? block(problem) : 0
}

// True while the lead is waiting for a teammate: the session reports it in flight, or, on versions that don't report
// background work, a teammate started and hasn't stopped.
function waiting(input, state) {
  if (Array.isArray(input.background_tasks)) return input.background_tasks.some((t) => ours(t?.agent_type))
  return Object.keys(working(state)).length > 0
}

function stop(root, input) {
  const state = readState(root)
  if (resync(state, input.background_tasks)) writeState(root, state)
  const gaps = reviewGaps(root, state)
  if (!gaps.length || waiting(input, state)) return 0
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
        `was built) and to ${PLUGIN}:code-reviewer, in the same message; write the design reviewer's report with its verdict ` +
        'to design/review.md, then finish. If the user asked to stop, set "paused": true in design/run.json.',
    }) + '\n'
  )
  return 0
}

const MODES = { pre, post, spawn, start, agent, stop }

function main(mode) {
  if (!MODES[mode]) {
    process.stderr.write('usage: node gate.mjs pre|post|spawn|start|agent|stop  (hook input JSON on stdin)\n')
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
  // Who starts and stops is recorded even while the gates are quiet, so the next run doesn't inherit a stale record.
  const records = mode === 'start' || mode === 'agent'
  if (!records && run.paused === true) return 0
  if (!records && run.step === 'done' && closed(root, run)) return 0
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
