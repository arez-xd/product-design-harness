# Product Design Harness

A product design team for Claude Code. One request takes a brief, or a Figma frame, to screens in code that were reviewed on the rendered page.

> **Status: 0.1.0, a skeleton.** The team, the files and the gates are in place; the blind test that will say what it changes comes before 1.0.

## Install

```text
/plugin marketplace add arez-xd/product-design-harness
/plugin install product-design-harness@arez-xd
```

[Design Taste](https://github.com/arez-xd/ux-ui-design-taste) and [What Breaks in AI Code](https://github.com/arez-xd/what-breaks-in-ai-code) install with it. The hooks need Node 18 or later. To work from Figma, add the official Figma plugin:

```text
/plugin install figma@claude-plugins-official
```

## Use

```text
/design Design the invoices list for accountants who go through hundreds of invoices a day.
```

```text
/design https://www.figma.com/design/… Build this frame in our app, with every state.
```

```text
/design-review http://localhost:3000/settings
```

## The team

| Teammate | What it does |
|---|---|
| Lead (your session) | Plans the run, talks to you, keeps `design/` current |
| Brief | The problem, who uses it and how often, success criteria, principles, the design system, options for the decisions that shape the work |
| Flows | Each task as a flow, the screens, every state of every screen |
| Copy | The copy deck and the glossary |
| UI | The screens in code, every state reachable in a preview |
| Design review | The rendered page, blind to how it was built, with measurements |
| Code review | The code of the run, with What Breaks in AI Code |

## A run

1. **Frame.** The brief, the success criteria and the principles go to you for approval.
2. **Explore.** Each decision that shapes the work comes to you as options with trade-offs and a recommendation. You decide; the reason is kept.
3. **Flows and states.**
4. **Copy.**
5. **Build.**
6. **Review.** The design reviewer gets the preview and the spec, never the builder's notes: every state, copy against the glossary, values the design system doesn't have, accessibility checked by hand, the markers of generated-looking UI, prototype honesty, deceptive patterns. Two rounds of fixes at most.
7. **Hand off.** What is final, the design-system changes, the UX debt and a usability test plan.

`/design frame`, `build`, `review`, `feedback` (crit notes or test findings into changes) and `handoff` run one part.

## What lands in your project

| File | Holds |
|---|---|
| `design/brief.md` | Problem, users, constraints, terms, success criteria, principles |
| `design/decisions.md` | Options, decisions with reasons and who decided, pushbacks, feedback |
| `design/system.md` | Tokens and components the screens are built from, and the gaps |
| `design/flows.md` | Tasks, screens and every state |
| `design/copy.md` | Glossary and strings |
| `design/review.md` | Verdict and findings, each with a measurement and a source |
| `design/handoff.md` | What is final, the design-system change record, the UX debt |
| `design/test-plan.md` | Tasks, participants and findings by who failed which task |
| `design/run.json` | Where the run is |

## Gates

- **No screen before the brief.** Writing a screen file is blocked until `design/brief.md` has success criteria and you have approved them.
- **No finish without a review.** When screens changed after the last `design/review.md`, the lead is asked for a design review before it finishes.

Both stay quiet without `design/run.json`, and while the run is paused or done.

## Figma

The Brief teammate reads the frames you link through the Figma MCP server and caches what it reads in `design/figma/` for the rest of the team. Figma's Starter plan and View or Collab seats allow 6 MCP calls a month, so a run spends at most 4 unless you allow more.

## License

MIT
