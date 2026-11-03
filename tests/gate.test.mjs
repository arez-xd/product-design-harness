import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { criteriaFilled, family, hasVerdict, modelProblem, tableFilled } from '../scripts/gate.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const gate = path.join(here, '..', 'scripts', 'gate.mjs')
const templates = path.join(here, '..', 'skills', 'product-design', 'templates')
const tpl = (name) => fs.readFileSync(path.join(templates, name), 'utf8')

const FILLED = '# Brief\n\n## Success criteria\n\n- An accountant finds an unpaid invoice → time to the invoice → under 10 s in a test\n\n## Principles\n'
const FLOWS = '# Flows\n\n## States\n\n| Screen | State | What the user sees | Copy keys | How to reach it in the preview |\n|---|---|---|---|---|\n| Invoices | Empty | What the list is for and New invoice | empty.title | ?state=empty |\n'
const COPY = '# Copy\n\n## Strings\n\n| Key | Screen and state | Text | Notes |\n|---|---|---|---|\n| empty.title | Invoices, empty | No invoices yet | |\n'
const READY = { run: { briefApproved: '2026-11-04T10:00:00Z' }, brief: FILLED, flows: FLOWS, copy: COPY }

function project({ run, brief, flows, copy } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pdh-'))
  if (run !== undefined) {
    fs.mkdirSync(path.join(root, 'design'), { recursive: true })
    fs.writeFileSync(path.join(root, 'design', 'run.json'), JSON.stringify({ ...JSON.parse(tpl('run.json')), ...run }))
    fs.writeFileSync(path.join(root, 'design', 'brief.md'), brief ?? tpl('brief.md'))
    fs.writeFileSync(path.join(root, 'design', 'flows.md'), flows ?? tpl('flows.md'))
    fs.writeFileSync(path.join(root, 'design', 'copy.md'), copy ?? tpl('copy.md'))
  }
  return root
}

function run(mode, root, input) {
  return spawnSync(process.execPath, [gate, mode], {
    input: typeof input === 'string' ? input : JSON.stringify(input ?? {}),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  })
}

const write = (file, agent) => ({ tool_name: 'Write', tool_input: { file_path: file }, ...(agent ? { agent_type: `product-design-harness:${agent}` } : {}) })
const finished = (agent, id) => ({ hook_event_name: 'SubagentStop', agent_type: `product-design-harness:${agent}`, ...(id ? { agent_id: id } : {}) })
const started = (agent, id) => ({ hook_event_name: 'SubagentStart', agent_type: `product-design-harness:${agent}`, agent_id: id })
const call = (agent, extra = {}) => ({ tool_name: 'Agent', tool_input: { subagent_type: `product-design-harness:${agent}`, description: 'x', prompt: 'x', ...extra } })
function session(model) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pdh-t-')), 'transcript.jsonl')
  fs.writeFileSync(file, [{ type: 'user', message: { content: 'go' } }, { type: 'assistant', message: { model, content: [] } }].map((e) => JSON.stringify(e)).join('\n') + '\n')
  return file
}
const verdict = (root) => fs.writeFileSync(path.join(root, 'design/review.md'), '# Design review\n\n**Verdict: fix**\n')

test('quiet without design/run.json', () => {
  const root = project()
  assert.equal(run('pre', root, write(path.join(root, 'src/App.tsx'))).status, 0)
  assert.equal(run('stop', root, {}).stdout, '')
})

test('screens wait for the criteria, the approval, the states and the copy, in that order', () => {
  const steps = [
    [{ run: {} }, /no success criteria yet/],
    [{ run: {}, brief: FILLED }, /approval of the brief/],
    [{ run: { briefApproved: 'x' }, brief: FILLED }, /delegate step 3/],
    [{ run: { briefApproved: 'x' }, brief: FILLED, flows: FLOWS }, /delegate step 4/],
  ]
  for (const [setup, message] of steps) {
    const r = run('pre', project(setup), write('src/App.tsx', 'ui-builder'))
    assert.equal(r.status, 2)
    assert.match(r.stderr, message)
  }
})

test('only the UI teammate writes screens once everything is in place', () => {
  const root = project(READY)
  const lead = run('pre', root, write('src/App.tsx'))
  assert.equal(lead.status, 2)
  assert.match(lead.stderr, /written by product-design-harness:ui-builder/)
  assert.equal(run('pre', root, write('src/App.tsx', 'flows')).status, 2)
  assert.equal(run('pre', root, write(path.join(root, 'src/App.tsx'), 'ui-builder')).status, 0)
})

test('a quick change needs the brief and the UI teammate, and still the reviews before finishing', () => {
  const root = project({ run: { mode: 'quick', briefApproved: 'x' }, brief: FILLED })
  assert.equal(run('pre', root, write('src/App.tsx')).status, 2, 'the lead still delegates')
  assert.equal(run('pre', root, write('src/App.tsx', 'ui-builder')).status, 0, 'no wait for flows and copy')
  run('post', root, write('src/App.tsx', 'ui-builder'))
  assert.equal(JSON.parse(run('stop', root, {}).stdout).decision, 'block')
  const unbriefed = project({ run: { mode: 'quick', briefApproved: 'x' } })
  assert.equal(run('pre', unbriefed, write('src/App.tsx', 'ui-builder')).status, 2, 'a quick change still says what done is')
})

test('flows.md and copy.md belong to their teammates', () => {
  const root = project(READY)
  assert.equal(run('pre', root, write('design/flows.md')).status, 2)
  assert.equal(run('pre', root, write('design/flows.md', 'flows')).status, 0)
  assert.equal(run('pre', root, write('design/copy.md', 'ui-builder')).status, 2)
  assert.equal(run('pre', root, write('design/copy.md', 'copywriter')).status, 0)
  assert.equal(run('pre', root, write('design/brief.md')).status, 0, 'the lead keeps the brief and the decisions')
})

test('files that are not screens, and files outside the project, pass', () => {
  const root = project({ run: {} })
  for (const file of ['data/invoices.json', 'README.md', 'design/review.md', 'design/.harness/shot.mjs', 'node_modules/x/a.tsx', '../elsewhere/App.tsx']) {
    assert.equal(run('pre', root, write(file)).status, 0, file)
  }
  assert.equal(run('pre', root, { tool_name: 'Write', tool_input: {} }).status, 0)
})

test('the scripts a page runs on are screen code', () => {
  const root = project(READY)
  for (const file of ['scripts/invoices.js', 'src/api.ts', 'lib/format.mjs']) {
    assert.match(run('pre', root, write(file)).stderr, /written by product-design-harness:ui-builder/, file)
  }
  run('post', root, write('scripts/invoices.js', 'ui-builder'))
  const state = JSON.parse(fs.readFileSync(path.join(root, 'design/.harness/state.json'), 'utf8'))
  assert.deepEqual(state.touched, ['scripts/invoices.js'])
})

test('a nested folder that happens to be named design is still screens', () => {
  assert.equal(run('pre', project({ run: {} }), write('src/design/Button.tsx', 'ui-builder')).status, 2)
})

test('post records each changed screen once', () => {
  const root = project(READY)
  run('post', root, write('src/App.tsx', 'ui-builder'))
  run('post', root, write(path.join(root, 'src/App.tsx'), 'ui-builder'))
  run('post', root, write('data/invoices.json', 'ui-builder'))
  const state = JSON.parse(fs.readFileSync(path.join(root, 'design/.harness/state.json'), 'utf8'))
  assert.deepEqual(state.touched, ['src/App.tsx'])
  assert.ok(state.lastUiWriteMs > 0)
  assert.equal(fs.readFileSync(path.join(root, 'design/.harness/.gitignore'), 'utf8'), '*\n')
})

test('stop waits for both reviewers and a fresh verdict after the last screen change', () => {
  const root = project(READY)
  assert.equal(run('stop', root, {}).stdout, '', 'no screens changed yet')
  run('post', root, write('src/App.tsx', 'ui-builder'))
  assert.match(JSON.parse(run('stop', root, {}).stdout).reason, /design-reviewer.*code-reviewer.*review\.md/)
  run('agent', root, finished('design-reviewer'))
  verdict(root)
  const r = JSON.parse(run('stop', root, {}).stdout)
  assert.match(r.reason, /code-reviewer/)
  assert.doesNotMatch(r.reason, /design-reviewer hasn't/)
  run('agent', root, finished('code-reviewer'))
  assert.equal(run('stop', root, {}).stdout, '')
})

test('a review of an older version of the screens doesn\'t count', async () => {
  const root = project(READY)
  run('agent', root, finished('design-reviewer'))
  run('agent', root, finished('code-reviewer'))
  verdict(root)
  await new Promise((r) => setTimeout(r, 20))
  run('post', root, write('src/App.tsx', 'ui-builder'))
  assert.equal(JSON.parse(run('stop', root, {}).stdout).decision, 'block')
})

test('stop asks three times in a row, then lets the lead go', () => {
  const root = project(READY)
  run('post', root, write('src/App.tsx', 'ui-builder'))
  for (let i = 0; i < 3; i++) assert.equal(JSON.parse(run('stop', root, {}).stdout).decision, 'block')
  assert.equal(run('stop', root, {}).stdout, '')
})

test('done ends the gates only when the reviews are fresh; paused always does', () => {
  const stale = project({ ...READY, run: { briefApproved: 'x' } })
  run('post', stale, write('src/App.tsx', 'ui-builder'))
  const file = path.join(stale, 'design/run.json')
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), step: 'done' }))
  assert.equal(JSON.parse(run('stop', stale, {}).stdout).decision, 'block', 'done with no review keeps the gate')
  assert.equal(run('pre', stale, write('src/App.tsx')).status, 2)
  run('agent', stale, finished('design-reviewer'))
  run('agent', stale, finished('code-reviewer'))
  verdict(stale)
  assert.equal(run('stop', stale, {}).stdout, '')
  assert.equal(run('pre', stale, write('src/App.tsx')).status, 0, 'a closed run leaves the project alone')
  const paused = project({ run: { paused: true } })
  assert.equal(run('pre', paused, write('src/App.tsx')).status, 0)
})

test('done before any screen keeps the gates, unless the run was framing only', () => {
  const early = project({ ...READY, run: { briefApproved: 'x', step: 'done' } })
  assert.equal(run('pre', early, write('src/App.tsx')).status, 2)
  const frame = project({ run: { step: 'done', mode: 'frame' } })
  assert.equal(run('pre', frame, write('src/App.tsx')).status, 0)
})

test('each teammate waits for the step before it; the two reviewers work together', () => {
  const root = project(READY)
  run('start', root, started('ui-builder', 'b1'))
  for (const agent of ['design-reviewer', 'code-reviewer']) {
    const r = run('spawn', root, call(agent))
    assert.equal(r.status, 2, agent)
    assert.match(r.stderr, /waits for product-design-harness:ui-builder, still working\. End your turn/)
  }
  run('agent', root, finished('ui-builder', 'b1'))
  run('start', root, started('design-reviewer', 'd1'))
  assert.equal(run('spawn', root, call('code-reviewer')).status, 0, 'the reviewers run side by side')
  run('start', root, started('code-reviewer', 'c1'))
  assert.match(run('spawn', root, call('ui-builder')).stderr, /waits for product-design-harness:design-reviewer and product-design-harness:code-reviewer/)
  run('agent', root, finished('design-reviewer', 'd1'))
  run('agent', root, finished('code-reviewer', 'c1'))
  assert.equal(run('spawn', root, call('ui-builder')).status, 0, 'the fix round starts once both reviews are in')
})

test('copy waits for the states, and agents from elsewhere pass', () => {
  const root = project(READY)
  run('start', root, started('flows', 'f1'))
  assert.equal(run('spawn', root, call('copywriter')).status, 2)
  assert.equal(run('spawn', root, { tool_name: 'Agent', tool_input: { subagent_type: 'Explore', prompt: 'x' } }).status, 0)
  run('start', root, { hook_event_name: 'SubagentStart', agent_type: 'Explore', agent_id: 'e1' })
  run('agent', root, finished('flows', 'f1'))
  assert.equal(run('spawn', root, call('copywriter')).status, 0)
})

test('a message that resumes the UI teammate waits for the reviews too', () => {
  const root = project(READY)
  run('start', root, started('ui-builder', 'b1'))
  run('agent', root, finished('ui-builder', 'b1'))
  run('start', root, started('design-reviewer', 'd1'))
  const resume = { tool_name: 'SendMessage', tool_input: { to: 'b1', message: 'fix the findings' } }
  assert.equal(run('spawn', root, resume).status, 2)
  assert.equal(run('spawn', root, { tool_name: 'SendMessage', tool_input: { to: 'd1', message: 'also check 320 px' } }).status, 0, 'a note to the reviewer itself')
  assert.equal(run('spawn', root, { tool_name: 'SendMessage', tool_input: { to: 'someone', message: 'x' } }).status, 0)
  run('agent', root, finished('design-reviewer', 'd1'))
  assert.equal(run('spawn', root, resume).status, 0)
})

test('a teammate that started over an hour ago no longer holds anyone up', () => {
  const root = project(READY)
  fs.mkdirSync(path.join(root, 'design/.harness'), { recursive: true })
  fs.writeFileSync(path.join(root, 'design/.harness/state.json'), JSON.stringify({ running: { b1: { who: 'ui-builder', at: Date.now() - 61 * 60000 } } }))
  assert.equal(run('spawn', root, call('design-reviewer')).status, 0)
})

test('the stop gate lets the lead wait for a teammate still working', () => {
  const root = project(READY)
  run('post', root, write('src/App.tsx', 'ui-builder'))
  const inFlight = { background_tasks: [{ id: 't1', type: 'subagent', status: 'running', description: 'review', agent_type: 'product-design-harness:design-reviewer' }] }
  for (let i = 0; i < 5; i++) assert.equal(run('stop', root, inFlight).stdout, '', 'waiting is not a reminder')
  const server = { background_tasks: [{ id: 't2', type: 'shell', status: 'running', description: 'preview', command: 'node serve.mjs' }] }
  assert.equal(JSON.parse(run('stop', root, server).stdout).decision, 'block', 'a preview server is no teammate')
  run('start', root, started('code-reviewer', 'c1'))
  assert.equal(run('stop', root, {}).stdout, '', 'versions without background_tasks fall back to the started teammates')
  assert.equal(JSON.parse(run('stop', root, { background_tasks: [] }).stdout).decision, 'block', 'the session\'s own report wins')
})

test('the session\'s list of work in flight clears a teammate whose stop went unrecorded', () => {
  const root = project(READY)
  run('start', root, started('ui-builder', 'b1'))
  run('start', root, started('flows', 'f1'))
  run('agent', root, { ...finished('flows', 'f1'), background_tasks: [{ id: 'f1', type: 'subagent', status: 'running', agent_type: 'product-design-harness:flows' }] })
  assert.equal(run('spawn', root, call('design-reviewer')).status, 0, 'b1 is no longer in flight')
  run('start', root, started('ui-builder', 'b2'))
  run('stop', root, { background_tasks: [{ id: 'b2', type: 'subagent', status: 'running', agent_type: 'product-design-harness:ui-builder' }] })
  assert.equal(run('spawn', root, call('design-reviewer')).status, 2, 'b2 still is')
  run('stop', root, { background_tasks: [] })
  assert.equal(run('spawn', root, call('design-reviewer')).status, 0)
})

test('teammates run on the session model, Flows and Copy on Sonnet under Opus or Fable', () => {
  const root = project(READY)
  const on = (model, agent, extra) => run('spawn', root, { ...call(agent, extra), transcript_path: session(model) })
  assert.equal(on('claude-opus-5-5', 'flows', { model: 'sonnet' }).status, 0)
  assert.match(on('claude-opus-5-5', 'copywriter').stderr, /runs on Sonnet: call it again with "model": "sonnet"/)
  assert.equal(on('claude-fable-5-1', 'ui-builder').status, 0)
  assert.equal(on('claude-opus-5-5', 'code-reviewer', { model: 'sonnet' }).status, 0, 'an interface-only code review')
  assert.equal(on('claude-opus-5-5', 'code-reviewer').status, 0, 'a code review of server code')
  assert.match(on('claude-opus-5-5', 'ui-builder', { model: 'sonnet' }).stderr, /without "model"/)
  assert.match(on('claude-haiku-5-5', 'ui-builder', { model: 'sonnet' }).stderr, /runs on the session's model \(claude-haiku-5-5\)/)
  assert.equal(on('claude-haiku-5-5', 'design-reviewer', { model: 'opus' }).status, 2, 'never above the session unasked')
  assert.equal(on('claude-sonnet-5-5', 'flows').status, 0)
  assert.equal(on('claude-sonnet-5-5', 'flows', { model: 'sonnet' }).status, 0, 'the same model, named')
  assert.equal(run('spawn', root, call('design-reviewer', { model: 'opus' })).status, 0, 'no transcript: nothing to compare with')
})

test('the user\'s models in run.json win', () => {
  const root = project({ ...READY, run: { ...READY.run, models: { ui: 'opus', 'Design-review': 'claude-opus-5-5', all: 'sonnet' } } })
  const on = (agent, extra) => run('spawn', root, { ...call(agent, extra), transcript_path: session('claude-sonnet-5-5') })
  assert.equal(on('ui-builder', { model: 'opus' }).status, 0)
  assert.match(on('ui-builder').stderr, /has ui-builder on "opus", the user's choice: call .* with "model": "opus"/)
  assert.equal(on('design-reviewer', { model: 'opus' }).status, 0)
  assert.equal(on('flows').status, 0, '"all": "sonnet" on a Sonnet session needs no model')
  assert.equal(on('flows', { model: 'haiku' }).status, 2)
  assert.equal(modelProblem('flows', undefined, 'claude-opus-5-5', { flows: 'inherit' }), null, 'inherit keeps the session model')
  assert.match(modelProblem('flows', 'sonnet', 'claude-opus-5-5', { flows: 'inherit' }), /without "model"/)
  assert.equal(family('claude-opus-5-5[1m]'), 'opus')
  assert.equal(family('gpt-5'), null)
})

test('a finished run still records who starts and stops', () => {
  const root = project({ ...READY, run: { ...READY.run, step: 'done', mode: 'frame' } })
  run('start', root, started('code-reviewer', 'c9'))
  run('agent', root, finished('code-reviewer', 'c9'))
  const state = JSON.parse(fs.readFileSync(path.join(root, 'design/.harness/state.json'), 'utf8'))
  assert.deepEqual(state.running, {})
  assert.equal(run('pre', root, write('src/App.tsx')).status, 0, 'the gates stay quiet')
})

test('the lead finishing a subagent-less turn records nothing', () => {
  const root = project(READY)
  run('agent', root, { hook_event_name: 'SubagentStop' })
  assert.equal(fs.existsSync(path.join(root, 'design/.harness/state.json')), false)
})

test('bad input and a bad mode are reported without blocking', () => {
  const root = project({ run: {} })
  const bad = run('pre', root, '{not json')
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /gate:/)
  assert.equal(run('nope', root, {}).status, 1)
  assert.equal(run('pre', root, '').status, 0)
})

test('the templates read as empty', () => {
  assert.equal(criteriaFilled(tpl('brief.md')), false)
  assert.equal(criteriaFilled(FILLED), true)
  assert.equal(criteriaFilled('## Success criteria\n\n- Loads in < 2 s on 4G\n'), true)
  assert.equal(criteriaFilled('## Success criteria\n\n1. **Book a class quickly.** Signal: 5 of 5 book in 45 s\n'), true, 'a numbered list counts')
  assert.equal(criteriaFilled('## Success criteria\n\n1) <criterion>\n'), false)
  assert.equal(criteriaFilled('## Success criterion\n\nDone when: every row over 10,000 shows the phone.\n\n## Assumptions\n'), true, 'a quick brief')
  assert.equal(criteriaFilled('## Success criteria\n\n## Principles\n\n- Rows over cards\n'), false, 'the next section doesn\'t count')
  assert.equal(tableFilled(tpl('flows.md'), 'States'), false)
  assert.equal(tableFilled(FLOWS, 'States'), true)
  assert.equal(tableFilled(tpl('copy.md'), 'Strings'), false)
  assert.equal(hasVerdict(tpl('review.md')), false)
  assert.equal(hasVerdict('**Verdict: decide**'), true)
})
