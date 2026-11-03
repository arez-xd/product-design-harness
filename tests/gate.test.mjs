import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { criteriaFilled, hasVerdict } from '../scripts/gate.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const gate = path.join(here, '..', 'scripts', 'gate.mjs')
const templates = path.join(here, '..', 'skills', 'design', 'templates')

function project({ run, brief } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pdh-'))
  if (run !== undefined) {
    fs.mkdirSync(path.join(root, 'design'), { recursive: true })
    const base = JSON.parse(fs.readFileSync(path.join(templates, 'run.json'), 'utf8'))
    fs.writeFileSync(path.join(root, 'design', 'run.json'), JSON.stringify({ ...base, ...run }))
    fs.writeFileSync(path.join(root, 'design', 'brief.md'), brief ?? fs.readFileSync(path.join(templates, 'brief.md'), 'utf8'))
  }
  return root
}

function run(mode, root, input) {
  const stdin = typeof input === 'string' ? input : JSON.stringify(input ?? {})
  return spawnSync(process.execPath, [gate, mode], {
    input: stdin,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  })
}

const write = (file) => ({ tool_name: 'Write', tool_input: { file_path: file } })
const FILLED = '# Brief\n\n## Success criteria\n\n- An accountant finds an unpaid invoice → time to the invoice → under 10 s in a test\n\n## Principles\n'

test('quiet without design/run.json', () => {
  const root = project()
  assert.equal(run('pre', root, write(path.join(root, 'src/App.tsx'))).status, 0)
  assert.equal(run('stop', root, {}).status, 0)
})

test('pre blocks a screen while the brief has only the placeholder', () => {
  const root = project({ run: { briefApproved: '2026-11-04T10:00:00Z' } })
  const r = run('pre', root, write(path.join(root, 'src/App.tsx')))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /no success criteria yet/)
})

test('pre blocks a screen until the brief is approved', () => {
  const root = project({ run: {}, brief: FILLED })
  const r = run('pre', root, write('src/pages/Invoices.vue'))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /briefApproved/)
})

test('pre lets screens through once criteria are filled and approved', () => {
  const root = project({ run: { briefApproved: '2026-11-04T10:00:00Z' }, brief: FILLED })
  assert.equal(run('pre', root, write(path.join(root, 'src/App.tsx'))).status, 0)
})

test('pre ignores files that are not screens, the design folder and files outside the project', () => {
  const root = project({ run: {} })
  for (const file of ['src/api.ts', 'README.md', 'design/brief.md', 'node_modules/x/a.tsx', '../elsewhere/App.tsx']) {
    assert.equal(run('pre', root, write(file)).status, 0, file)
  }
  assert.equal(run('pre', root, { tool_name: 'Write', tool_input: {} }).status, 0)
})

test('pre gates a nested folder that happens to be named design', () => {
  const root = project({ run: {} })
  assert.equal(run('pre', root, write('src/design/Button.tsx')).status, 2)
})

test('paused and done keep every gate quiet', () => {
  for (const extra of [{ paused: true }, { step: 'done' }]) {
    const root = project({ run: extra })
    assert.equal(run('pre', root, write('src/App.tsx')).status, 0)
  }
})

test('post records each changed screen once', () => {
  const root = project({ run: { briefApproved: 'x' }, brief: FILLED })
  run('post', root, write('src/App.tsx'))
  run('post', root, write(path.join(root, 'src/App.tsx')))
  run('post', root, write('src/api.ts'))
  const state = JSON.parse(fs.readFileSync(path.join(root, 'design/.harness/state.json'), 'utf8'))
  assert.deepEqual(state.touched, ['src/App.tsx'])
  assert.ok(state.lastUiWriteMs > 0)
  assert.equal(fs.readFileSync(path.join(root, 'design/.harness/.gitignore'), 'utf8'), '*\n')
})

test('stop asks for a review after screens changed, and accepts a fresh verdict', () => {
  const root = project({ run: { briefApproved: 'x' }, brief: FILLED })
  assert.equal(run('stop', root, {}).stdout, '', 'no screens changed yet')
  run('post', root, write('src/App.tsx'))
  let r = run('stop', root, {})
  assert.equal(JSON.parse(r.stdout).decision, 'block')
  const review = path.join(root, 'design/review.md')
  fs.writeFileSync(review, fs.readFileSync(path.join(templates, 'review.md'), 'utf8'))
  assert.equal(JSON.parse(run('stop', root, {}).stdout).decision, 'block', 'the template is no verdict')
  fs.writeFileSync(review, '# Design review\n\n**Verdict: fix**\n')
  r = run('stop', root, {})
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
})

test('stop never blocks twice in a row', () => {
  const root = project({ run: { briefApproved: 'x' }, brief: FILLED })
  run('post', root, write('src/App.tsx'))
  assert.equal(run('stop', root, { stop_hook_active: true }).stdout, '')
})

test('bad input and a bad mode are reported without blocking', () => {
  const root = project({ run: {} })
  const bad = run('pre', root, '{not json')
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /gate:/)
  assert.equal(run('nope', root, {}).status, 1)
  assert.equal(run('pre', root, '').status, 0)
})

test('criteriaFilled and hasVerdict read the templates as empty', () => {
  assert.equal(criteriaFilled(fs.readFileSync(path.join(templates, 'brief.md'), 'utf8')), false)
  assert.equal(criteriaFilled(FILLED), true)
  assert.equal(criteriaFilled('## Success criteria\n\n- Loads in < 2 s on 4G\n'), true)
  assert.equal(hasVerdict(fs.readFileSync(path.join(templates, 'review.md'), 'utf8')), false)
  assert.equal(hasVerdict('**Verdict: decide**'), true)
})
