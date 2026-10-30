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

| Level | Recommended / round | Focus across rounds |
|-------|---------------------|---------------------|
| light | 2–3 | goal, scope boundary, success signal |
| medium | 3–5 | + edge cases, failure modes, fit to existing patterns |
| deep | 4–6 | + adversarial cases, ops, rollout, rollback, abuse, data lifecycle |

About **5 questions in a round** is a comfortable size, not a hard cap. There is no minimum number of rounds.

**Gradual grilling (hard rule):** never dump the full questionnaire in one round. Ask only the next small batch, **stop and wait** for answers, then ask the next round based on what was said (gaps, contradictions, new branches). Depth is total thoroughness over the session, not one wall of questions.

## Workflow

1. **Orient on the project** (quick, before questions):
   - Scan structure, relevant modules, existing patterns near the feature area
   - Note conventions that should shape the questions (not a lecture)
   - If the repo is opaque, say what you couldn't find and grill with that uncertainty

2. **Mirror** in 1–3 sentences: what you understood + which project surfaces seem involved. No solution design yet.

3. **Grill** with project-grounded questions (one round at a time):
   - Prefer questions that reference real files, APIs, types, UX flows, or patterns in *this* repo
   - Avoid generic checklists that ignore the codebase
   - One concern per question
   - **Write the questions in the message first**, as a numbered list, after the mirror. Then one `AskQuestion` call. Chat text cannot show a button
   - That list is what the user sees while the form is still being produced. Write it before the tool call. Do not add a fake skeleton, gray bars, or placeholders: the product has no temporary skeleton, and leftover blocks stay in the transcript after the form appears
   - The form holds the answer options for those questions, in the same order, one form question per list item. `prompt` is that question, so the options sit under it. No extra commentary in the form
   - Each question needs at least two options (`id` + `label`). The form always adds a free-text choice besides those options — that is the normal path for a caveat or a clarification
   - Options follow the question. A natural pair may use any short labels («Да» / «Нет», «Верно» / «Неверно», «Сейчас» / «Потом», and so on). Do not rewrite a complex question into a yes/no pair; write the real options and leave the nuance to the free-text choice
   - If unsure whether a question is binary, still put it in the form
   - An assumption that needs a confirmation is one of these questions, written in the list and in the form. Do not hide it inside the mirror
   - End the turn after the mirror, the numbered questions, and the form — no “ещё на потом” list, no coding, no plan
   - Next round only after the user replies; rewrite or drop questions that answers already covered

4. **Stop condition** — when answers are coherent enough for a thin vertical slice:
   - Brief **decision summary** in the message: in scope / out of scope / open risks. No recommendation in the message. Do not write «Дальше», «1. Дальше», or «Сделать план»
   - **Plan is the system switch, in that same turn.** Call `SwitchMode` with `target_mode_id: "plan"`. That card replaces the old «Сделать план» option: one approval, no second switch on a later turn. `explanation` is the recommendation:
     - `Рекомендую сделать план` — the slice is wide, touches several modules, sequencing is unclear, or an open fork has to be decided first
     - `Рекомендую выполнить` — the slice is thin, the answers close the gaps, and the path is obvious. Plan stays available through the same card
   - **Execute stays a form button in that same turn.** Call `AskQuestion`. One question. `prompt` is that same recommendation, not «Дальше», and do not number it yourself. The form cannot host the system switch inside an option, so do not add «Сделать план» or «Switch to Plan». Options, in order: `{ id: "execute", label: "Выполнить" }`, `{ id: "hold", label: "Не выполнять" }`
   - The prompt does not ask them to type «выполняй», «скажи», «если хочешь», or «переключись в Plan»
   - Wait for the click. If the switch is approved, the next turn does nothing else until Plan mode is on. On `execute`, implement in the next turn and do not call `SwitchMode` again. On `hold`, stop: no code, no second switch

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

- Dumping all angles / the whole depth budget in one round
- Leaving the questions only inside the form, or only in the message without `AskQuestion`
- Inserting a fake skeleton or placeholder that stays in the message after the form appears
- Rewriting a complex question into «Да/Нет» or «Верно/Неверно» so it fits two buttons
- Jumping to implementation or architecture essays mid-grill
- Interrogation without reading the project
- Asking the next round before the user answered the current one
- Rewarding hand-waving without noting the risk
- A stop form whose prompt is «Дальше», or a recommendation written in the message instead of the switch explanation and the form prompt
- Offering «Сделать план» in the form and calling `SwitchMode` only after that click
- Ending the stop turn with a sentence that asks the user to type «выполняй», «скажи» or «переключись в Plan» instead of `SwitchMode` and `AskQuestion`
- Leaving the stop turn without the Plan switch card, or without «Выполнить»
