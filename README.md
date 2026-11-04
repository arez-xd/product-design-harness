# Product Design Harness

A product design team for Claude Code. One request takes a brief, or a Figma frame, to screens in code that were reviewed on the rendered page.

> **Status: 0.4.0.** Tested blind on two fictional products, each against the bare agent and another harness on Sonnet. The harness covered more of each job than the bare agent in every run, and its screens ranked first in both tests; it also cost 10 to 15 times a single prompt, and by the strict rules written before the runs neither test proves it yet. The fixes from the second test are being checked on a third product.

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

## Before it starts

The lead takes the mode from your request (a new screen or feature runs the full path; a small change to a screen that exists runs `quick`), says the plan in one line with the models and roughly how long it takes, and starts. Steer it in words at any point: "quick", "only the brief", "build on Opus", "everything on Sonnet", "decide yourself and show me at the end". It asks first only when the request could be either a small change or a new feature, or when the run is unusually large. As a guide from the blind tests on Sonnet, a new screen on the full path took 25 to 40 minutes and cost 10 to 15 times a single prompt; a quick change is a fraction of that.

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

1. **Frame.** The brief, the success criteria and the principles go to you for approval, with a walk through the data: what each field, each pair of fields that act on each other and each rule in the product's settings asks of the person on the screen.
2. **Explore.** Each decision that shapes the work comes to you as options with trade-offs and a recommendation. You decide; the reason is kept.
3. **Flows and states.** Every state of every screen, the ones the data implies included.
4. **Copy.** Every string and the glossary.
5. **Build.** From the product's system, every state reachable, and the action the screen exists for built up to the step the demo can't take.
6. **Review.** The design reviewer gets the preview and the spec, never the builder's notes: every state, copy against the glossary, values the design system doesn't have, accessibility checked by hand, the markers of generated-looking UI, prototype honesty (with the job's action built up to the step the demo can't take), deceptive patterns. Two reviews at most: the second checks the first one's findings and the page as a whole, and what it leaves goes to the hand-over as debt or a decision. The code review runs once, and again only when it found a Blocker or a Major.
7. **Hand off.** What is final, the design-system changes, the UX debt and a usability test plan.

`/product-design quick` makes a small change to a screen that exists: the UI teammate builds it and both reviewers check what it touched, once, under the project's rules and decisions. It runs only when you ask for it; a small change asked for in passing is an ordinary edit, and after the first run the lead offers a pointer in your CLAUDE.md, so ordinary sessions follow the rules, decisions, design system and glossary too. `/product-design frame`, `build`, `review`, `feedback` (crit notes or test findings into changes), `handoff` and `capture` (a rule for the project) run one part.

## Models

Every teammate runs on your session's model unless the plan says otherwise. On Opus or Fable, flows, copy and a code review of interface-only changes run on Sonnet, where the stronger model adds little; a code review that touches server code, data writes, money or permissions stays on your model. Any of it can be set per teammate in `design/run.json` under `models`. A hook holds the lead to this: no teammate runs above your model unless you asked for it. If `CLAUDE_CODE_SUBAGENT_MODEL` is set in your environment, check that it doesn't override the plan: before Claude Code 2.1.251 it took precedence over everything.

## From a brief alone

With no screens and no design system in the project, the run starts further back: the Brief teammate researches the problem with the sources and tools at hand (web search, a reference library over MCP, the links you give), with a source and a date for every finding and assumptions marked for the test plan. Step 2 brings two or three visual directions, rendered on the same sample, to choose from, and the UI teammate lays the foundations of the one you pick (tokens and core components) before any screen.

## Steering it

- **Sources.** Name what to work from in the request or at any point: MCP servers and what they are for, references, constraints. They go into `design/sources.md`, which every teammate reads; a source added mid-run sends the steps it touches back through the team.
- **Rules.** Correct something and the lead sorts it: what holds on any screen of the product becomes a rule (offered the first time, kept the second), and a judgment about one screen becomes a numbered decision. Rules live in `design/rules.md`, hold over defaults, and are checked by the reviewers where they say how.
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
- **The team does the work.** Only the UI teammate writes screen files (markup, styles and the scripts the page runs on); `flows.md` and `copy.md` belong to their teammates.
- **One step at a time.** A teammate starts once the steps it reads have returned: flows, then copy, then the build, then both reviews side by side, then the fixes. Teammates work in the background; the lead ends its turn and the completion notice wakes it.
- **Models by the plan.** An Agent call can set only the model the plan gives the teammate.
- **No finish without the reviews.** While screens changed after the last design review and verdict in `design/review.md`, or after the last code review when its verdict wasn't ship, the lead is asked to run them before it finishes. Waiting for a teammate still at work is always allowed.

The gates stay quiet without `design/run.json`, while the run is paused, and once a finished run's reviews are fresh.

## Figma

The Brief teammate reads the frames you link through the Figma MCP server and caches what it reads in `design/figma/` for the rest of the team. Figma's Starter plan and View or Collab seats allow 6 MCP calls a month, so a run spends at most 4 unless you allow more.

## License

MIT
