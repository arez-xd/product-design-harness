---
name: design-review
description: "Reviews a screen, page or flow that already exists on the rendered page, blind to how it was built: every state the spec lists, copy against the glossary, values the design system doesn't have, accessibility checked by hand, the markers of generated-looking UI, prototype honesty and deceptive patterns, with a verdict and findings that each carry a measurement and a source. Use when someone asks to review a design, a screen or a page in code, asks whether a UI is ready to hand off, or wants a second opinion on AI-built UI."
argument-hint: "[a URL or a route, and the brief if there is one]"
---

# Design review

A review on its own, outside a full run of the `product-design` skill.

1. **The spec.** Use `design/brief.md`, `design/flows.md`, `design/copy.md` and `design/system.md` when they exist. Otherwise write a short brief from the request (who uses the screen, for what, the one to three things it must get right), mark it as assumed, and list the states you will check. Show the assumed brief with the review.
2. **The preview and the way to see it.** A URL, a route on the running dev server or a file, and what renders it: a screenshot or render command from the request or the project, a browser tool, Playwright in the project. If nothing is running, ask how to start it, or use `design/run.json` under `preview`.
3. **Delegate** to `product-design-harness:design-reviewer` with the Agent tool (called Task in some versions): the preview, the way to see it and the paths to the spec. Pass nothing about how the screens were built.
4. **Write** its report to `design/review.md`, then tell the user the verdict, the three most serious findings and what wasn't reviewed.

To review the code as well, delegate to `product-design-harness:code-reviewer` in parallel.
