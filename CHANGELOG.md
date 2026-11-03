# Changelog

## 0.3.0 (unreleased)

- **What the project keeps.** `design/rules.md` (standing rules), `design/sources.md` (MCP servers, references, constraints) and numbered decisions in `design/decisions.md` (reason, options turned down, lessons) outlive a run, with `system.md`; a finished run's other files move to `design/history/` when the next one starts.
- **Corrections become rules.** The lead offers to keep a correction as a rule, keeps a repeated one, and `capture` adds one directly. The reviewers check every rule that says how, and flag a screen that undoes a decision.
- **From a brief alone.** Research with sources and dates (web, reference libraries over MCP, the user's links), visual directions to choose from, and foundations (tokens and core components) laid before any screen.
- **Steering.** Sources named in the request or mid-run reach every teammate, and a new one sends the steps it touches back through the team.
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
