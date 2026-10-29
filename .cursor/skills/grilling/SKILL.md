---
name: gr
description: >-
  Grills a feature idea with clarifying questions grounded in the current
  project's code, patterns, and constraints. Use when the user invokes /gr,
  asks for гриллинг, grilling, or wants a pre-implementation Q&A before coding.
disable-model-invocation: true
---

# /gr — Гриллинг фичи

Socratic pre-design: clarify the idea before any implementation. Do **not** write code, scaffolds, or "how I'd build it" unless the user explicitly asks after grilling.

## Input

Expect (any subset; ask only for what's missing if the rest is clear):

- **Feature** — name / short description
- **Context** — why now, who cares, related flows
- **Constraints** — deadlines, must/must-not, tech limits

Optional depth hint in the same message:

- `/gr light …` — core only
- `/gr` or `/gr medium …` — default
- `/gr deep …` — adversarial / thorough

If depth omitted → **medium**.

## Depth

| Level | Max questions / round | Focus across rounds |
|-------|----------------------|---------------------|
| light | 2–3 | goal, scope boundary, success signal |
| medium | 3–5 | + edge cases, failure modes, fit to existing patterns |
| deep | 4–6 | + adversarial cases, ops, rollout, rollback, abuse, data lifecycle |

**Gradual grilling (hard rule):** never dump the full questionnaire in one message. Ask only the next small batch, **stop and wait** for answers, then ask the next round based on what was said (gaps, contradictions, new branches). Depth is total thoroughness over the session, not one wall of questions.

## Workflow

1. **Orient on the project** (quick, before questions):
   - Scan structure, relevant modules, existing patterns near the feature area
   - Note conventions that should shape the questions (not a lecture)
   - If the repo is opaque, say what you couldn't find and grill with that uncertainty

2. **Mirror** in 1–3 sentences: what you understood + which project surfaces seem involved. No solution design yet.

3. **Grill** with project-grounded questions (one round at a time):
   - Prefer questions that reference real files, APIs, types, UX flows, or patterns in *this* repo
   - Avoid generic checklists that ignore the codebase
   - One concern per question; numbered list; stay within the round cap for the chosen depth
   - End the message after the batch — no “ещё на потом” list, no coding, no plan
   - Mark assumptions explicitly ("кажется, X уже делает Y — верно?")
   - Next round only after the user replies; rewrite or drop questions that answers already covered

4. **Stop condition** — when answers are coherent enough for a thin vertical slice:
   - Brief **decision summary**: in scope / out of scope / open risks
   - Offer next step (pick recommendation, always leave both open):
     1. **Сделать план** (Plan mode) — default if scope is wide, several modules, unclear sequencing, or remaining risks matter
     2. **Выполнить** — default if the slice is thin, answers close the gaps, and path is obvious
   - If recommending **план**: in the **same turn**, call `SwitchMode` with `target_mode_id: "plan"` (and a short `explanation`) so the user gets the switch-to-Plan control immediately — do not only mention Plan in text
   - If you can start implementation right away: in the **same turn**, call `AskQuestion` so the user gets a clickable control and does not have to type. Option label must be exactly **Выполнить** (put it first); second option **Сделать план**. Short prompt, e.g. «Могу сразу перейти к выполнению». Do not only mention it in prose
   - Wait for the click or mode approval; do not start coding until the user chooses **Выполнить** (Plan switch still needs their approval). On **Выполнить**, implement in the next turn

## Question angles (pick what fits; don't dump all)

- Problem & user: who hurts, what changes after ship
- Scope: MVP vs later; what is explicitly out
- UX / API contract: inputs, outputs, empty/error states
- Data: source of truth, migrations, idempotency, retention
- Fit: reuse vs new; conflicts with current patterns
- Failure: timeouts, partial success, retries, permissions
- Ops: flags, rollout, observability, rollback
- Constraints: given limits vs hidden new ones

## Tone

- Direct, curious, not theatrical
- Challenge vague answers once; if still vague, record as open risk and move on
- Follow the user's language and address rules from the session

## Anti-patterns

- Dumping all angles / the whole depth budget in one message
- Jumping to implementation or architecture essays mid-grill
- Interrogation without reading the project
- Asking the next round before the user answered the current one
- Rewarding hand-waving without noting the risk
