import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { criteriaFilled, hasVerdict, tableFilled } from '../scripts/gate.mjs'

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
const finished = (agent) => ({ hook_event_name: 'SubagentStop', agent_type: `product-design-harness:${agent}` })
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
  for (const file of ['src/api.ts', 'README.md', 'design/review.md', 'node_modules/x/a.tsx', '../elsewhere/App.tsx']) {
    assert.equal(run('pre', root, write(file)).status, 0, file)
  }
  assert.equal(run('pre', root, { tool_name: 'Write', tool_input: {} }).status, 0)
})

test('a nested folder that happens to be named design is still screens', () => {
  assert.equal(run('pre', project({ run: {} }), write('src/design/Button.tsx', 'ui-builder')).status, 2)
})

test('post records each changed screen once', () => {
  const root = project(READY)
  run('post', root, write('src/App.tsx', 'ui-builder'))
  run('post', root, write(path.join(root, 'src/App.tsx'), 'ui-builder'))
  run('post', root, write('src/api.ts', 'ui-builder'))
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
  assert.equal(tableFilled(tpl('flows.md'), 'States'), false)
  assert.equal(tableFilled(FLOWS, 'States'), true)
  assert.equal(tableFilled(tpl('copy.md'), 'Strings'), false)
  assert.equal(hasVerdict(tpl('review.md')), false)
  assert.equal(hasVerdict('**Verdict: decide**'), true)
})
