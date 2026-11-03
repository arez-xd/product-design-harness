# Changelog

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
