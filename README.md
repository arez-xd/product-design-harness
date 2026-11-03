# Product Design Harness

A product design team for Claude Code. One request takes a brief, or a Figma frame, to screens in code that were reviewed on the rendered page.

> **Status: 0.3.0.** The team, the files and the gates are in place, and two quick blind tests have run on a fictional product; the full test that will say what it changes comes before 1.0.

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
/product-design Design the invoices list for accountants who go through hundreds of invoices a day.
```

```text
/product-design https://www.figma.com/design/… Build this frame in our app, with every state.
```

```text
/product-design A booking app for small yoga studios: the class schedule and sign-up. Use Mobbin for references.
```

```text
/design-review http://localhost:3000/settings
```

```text
/product-design capture Buttons come from the design system, never custom ones.
```

## The team

| Teammate | What it does |
|---|---|
| Lead (your session) | Plans the run, talks to you, keeps `design/` current |
| Brief | The problem and its research, who uses it and how often, success criteria, principles, the design system, options for the decisions that shape the work |
| Flows | Each task as a flow, the screens, every state of every screen |
| Copy | The copy deck and the glossary |
| UI | The foundations when there are none, then the screens in code, every state reachable in a preview |
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

`/product-design frame`, `build`, `review`, `feedback` (crit notes or test findings into changes) and `handoff` run one part.

## From a brief alone

With no screens and no design system in the project, the run starts further back: the Brief teammate researches the problem with the sources and tools at hand (web search, a reference library over MCP, the links you give), with a source and a date for every finding and assumptions marked for the test plan. Step 2 brings two or three visual directions to choose from, and the UI teammate lays the foundations of the one you pick (tokens and core components) before any screen.

## Steering it

- **Sources.** Name what to work from in the request or at any point: MCP servers and what they are for, references, constraints. They go into `design/sources.md`, which every teammate reads; a source added mid-run sends the steps it touches back through the team.
- **Rules.** Correct something and the lead offers to keep it as a rule; the same correction twice becomes one. Rules live in `design/rules.md`, hold over defaults, and are checked by the reviewers where they say how.
- **Decisions.** Every decision is numbered, with its reason, the options turned down and what was learned. A change that would undo one comes to you with its number.

## What lands in your project

| File | Holds |
|---|---|
| `design/brief.md` | Problem, users, constraints, terms, success criteria, principles |
| `design/decisions.md` | Numbered decisions with reasons, options turned down and lessons; pushbacks; feedback |
| `design/system.md` | Tokens and components the screens are built from, and the gaps |
| `design/flows.md` | Tasks, screens and every state |
| `design/copy.md` | Glossary and strings |
| `design/review.md` | Verdict and findings, each with a measurement and a source |
| `design/handoff.md` | What is final, the design-system change record, the UX debt |
| `design/test-plan.md` | Tasks, participants and findings by who failed which task |
| `design/run.json` | Where the run is |
| `design/rules.md` | The project's standing rules, kept between runs |
| `design/sources.md` | MCP servers, references and constraints to work from, kept between runs |
| `design/history/` | Finished runs' files, moved there when the next run starts |

`rules.md`, `sources.md`, `decisions.md` and `system.md` outlive a run; the rest belongs to one.

## Gates

- **No screen before the brief, the states and the copy.** Writing a screen file is blocked until `design/brief.md` has success criteria you approved and `design/flows.md` and `design/copy.md` are filled.
- **The team does the work.** Only the UI teammate writes screen files; `flows.md` and `copy.md` belong to their teammates.
- **No finish without the reviews.** While screens changed after the last design review, code review and verdict in `design/review.md`, the lead is asked to run them before it finishes.

The gates stay quiet without `design/run.json`, while the run is paused, and once a finished run's reviews are fresh.

## Figma

The Brief teammate reads the frames you link through the Figma MCP server and caches what it reads in `design/figma/` for the rest of the team. Figma's Starter plan and View or Collab seats allow 6 MCP calls a month, so a run spends at most 4 unless you allow more.

## License

MIT
