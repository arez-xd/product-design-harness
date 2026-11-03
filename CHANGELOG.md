# Changelog

## 0.3.0 (unreleased)

- **What the project keeps.** `design/rules.md` (standing rules), `design/sources.md` (MCP servers, references, constraints) and numbered decisions in `design/decisions.md` (reason, options turned down, lessons) outlive a run, with `system.md`; a finished run's other files move to `design/history/` when the next one starts.
- **Corrections become rules or decisions.** A correction that holds on any screen of the product becomes a rule in `rules.md` (offered the first time, kept when it repeats, or added with `capture`); a judgment about one screen becomes a numbered decision. The reviewers check every rule that says how, and flag a screen that undoes a decision.
- **From a brief alone.** Research with sources and dates (web, reference libraries over MCP, the user's links), visual directions to choose from, and foundations (tokens and core components) laid before any screen.
- **Steering.** Sources named in the request or mid-run reach every teammate, and a new one sends the steps it touches back through the team.
- **The plan in one line.** The lead takes the mode from the request, says the plan with the models and the expected time, and starts; the user steers in words at any point. It asks first only when the request could be a small change or a new feature, or when the run is unusually large.
- **Models by role.** On Opus, flows, copy and interface-only code review run on Sonnet; the brief, the build and the design review stay on the session's model. `models` in `run.json` sets any of it.
- **Quick changes.** `quick` builds a small change to a screen that exists and reviews what it touched, once; the screen waits only for its short brief, and the review gate still applies. It runs only when the user asks for the harness by name; a small change the lead picked the skill up for on its own is made as an ordinary edit.
- **The design memory reaches ordinary sessions.** After the first run, the lead offers a pointer in the project's CLAUDE.md to the rules, decisions, design system and glossary.
- **After the quick smoke run on Haiku**, where the lead started the reviews while the build was still changing, raised teammates above its own model and spent most of its turns polling: a teammate starts only once the steps it reads have returned (a new SubagentStart hook records who is working, and a message that resumes a teammate counts too); the lead ends its turn while a teammate works, and the finish gate lets it wait; an Agent call can set only the model the plan gives; the scripts a page runs on (`.js`, `.mjs`, `.cjs`, `.ts`) count as screen code, written by the UI teammate and reviewed.
- **After the second quick smoke run**, where the fixed team ran in order, stayed on the session's model and stopped polling (about a fifth of the earlier cost), and the build waited on a quick brief's "Success criterion" written as a line: the gate reads a criterion under either heading, as a bullet, a number or a plain line, and says where it looks; who starts and stops is recorded after a run closes too.
- **After the smoke run from a brief alone**, where the build waited on criteria written as a numbered list, one visual direction was taken without a choice, and a reviewer stopped at a refused command: numbered criteria count; step 2 always runs from a brief alone, and the Brief teammate shows two or three directions on the same sample in `design/directions.html`, renders it and judges them there; the Brief teammate leaves decisions open for the lead to record; the reviewer and the builder keep render commands plain, and a reviewer that can't render names the refused command.
- **After the second blind test:** the reviewers render the many-items and long-content states with data of that size; the screen keeps the model screen's primary action; rows stay calm, with secondary details in a quieter line and repeated actions as icons or one menu; Figma frames are compared with the render in values.

## 0.2.0 (unreleased)

After the first quick blind test on Haiku, where the lead built the screen itself in one run and its only reviewer couldn't render the page in the other:

- Screen files can be written only by the UI teammate; `design/flows.md` and `design/copy.md` only by theirs; screens also wait for filled flows and copy.
- Finishing waits for both the design review and the code review after the last screen change (recorded by a new SubagentStop hook), and `done` closes the run only then. The gate reminds three times, then lets the lead stop.
- The lead's skill is `product-design` (Claude Code has a built-in `design`), with the exact call for each step and the way to see the page passed to every teammate who needs it.
- The design reviewer judges the page as a whole first and keeps looking for an allowed way to render when a command is refused; the UI teammate matches the product's existing screens and renders every state before handing back.

## 0.1.0 (unreleased)

- The `design` skill: the lead's path from a brief to reviewed screens in seven steps, with modes for framing, building, reviewing, feedback and the hand-off.
- Six teammates: Brief, Flows, Copy, UI, Design review (blind, with measurements) and Code review (What Breaks in AI Code).
- Templates for `design/`: brief, decisions, system, flows, copy, review, hand-off, test plan and the run file.
- Gates: no screen before the brief is approved; a design review before finishing when screens changed.
- Figma through the Figma MCP server, within a call budget, cached for the team.
- The `design-review` skill: a blind review of screens that already exist.
