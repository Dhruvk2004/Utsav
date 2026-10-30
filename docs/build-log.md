# Utsav build log

Running log of what each build step delivered, the decisions it made and what it left open. Each step appends a section. Sources of truth: `docs/product/spec.md` (v4) and `docs/design/design-system.md`.

---

## Step 1: Data layer (spec 12.5 step 1)

**Status:** done. `npm run lint`, `npm run typecheck`, `npm test` (441 tests), `npm run test:coverage` (99.5% statements, 96.9% branches, 99.3% functions, 99.8% lines) and `npm run build` pass. Property tests run 1,000 times each.

### What was built

All pure TypeScript. No framework imports and no I/O.

- **Doc schemas** (spec 8.2) as Zod schemas with inferred types: `EventDoc` (details with occasion, occasionOther, milestone, traditionOther; summary; budget lines; functions with `startTime`/`endTime`; tasks with signed `daysBefore` and `pinnedDate`; vendors with history and drafts; ideas with `state`/`origin`/`source`; `dismissedIdeaTitles`; guests; honorees; flags; `review`; warnings; share; `stats`), `UserDoc`, and the proposal, decision, history, share and `meta/demoUsage` records. Array caps live in `CAPS`.
- **`PlanOperation`** (spec 12.2): a Zod discriminated union of all 31 op types. Every object is strict, so `origin`, `source` or any other unknown key in a payload fails to parse. Free text is cleaned with `cleanText`. `PROPOSABLE_OP_TYPES` holds the 21 op types from the 6.1 Edit-forms table, and `proposableOperationSchema` is the restricted union the demo `appliedOps` will use.
- **`applyOperations(plan, ops, ctx)`**: one handler per op, grouped by section (`budgetOps`, `functionOps`, `taskOps`, `vendorOps`, `ideaOps`, `eventOps`, `resetOps`). It applies the ops in order on a copy, and each op runs on its own clone. A domain rejection raises `OpError` inside the applier. That op is then skipped and reported as `{ ok: false, reason }` with a user-facing reason, and the remaining ops still run. Any other error is rethrown. After each op, `finalizePlan` re-derives line percents, function amounts (`allocate(total, shares)`, invariant 3), guest flags from counts (invariant 12), `stats` (keeping `pending`) and `warnings`.
  - Provenance comes only from `ctx`: `user` gives `origin: "user"`; an AI proposal gives `ai`; the idea library gives `ai` with `source: "library"`; a code proposal gives `code`; an edited accept gives `user`. A text edit resets the origin.
  - Actor restrictions: with `actor: "ai"`, only proposable op types are accepted. AI cannot set a vendor's label or contact, and cannot remove a booked or paid vendor. With `set_details`, AI may change only the event date. `reset_section` runs only when `proposalOrigin === "code"`.
  - References follow removals. `remove_budget_category` moves the line's amount and its vendors to `moveToLineId` (Contingency by default). `remove_function` nulls the function on its tasks, removes it from vendors and renormalises the remaining shares. Ops that set a reference fail when the target does not exist.
  - Shares are kept in tenths of a percent with `rebalancePinned`, so they always sum to exactly 100.0.
  - `reset_section` (spec 6.2) is implemented for all four sections. It is built from `templateDraft` for the current event.
- **`decideProposal(plan, proposal, decisions, ctx)`**: the rules shared by the future server `decide` handler and the sandbox. It covers accept, edit, decline and restore, edit integrity (`EDITABLE_FIELDS` with `isFaithfulEdit`, rejecting with "Edit must change this suggestion only"), auto-accepting an item's dependencies, cascading a decline to dependent items, and adding or removing titles in `dismissedIdeaTitles` when an idea is declined or restored. It also reports `applied` ops for history and `appliedOps`.
- **Money and view**: `money.ts` holds the 12.2 money definitions (committed, paid, quotedOpen, remaining) for the whole plan and per line. `computeStats(plan)` is independent of today (it uses ideal open due dates). `deriveView(plan, today)` returns due dates clamped to [today, eventDate + 7], rushed and overdue flags, phase, vendor book-by dates, progress, money and warnings.
- **`assertPlanInvariants` / `planInvariantViolations`**: invariants 1-12 from spec 8.4, each violation reported as `"n: description"`.
- **`festivals.ts`**: dates for 13 festivals in 2026-2028, `nearestFestival(date, windowDays = 10)` (ties go to the earlier festival; nothing is guessed outside the table) and `upcomingDates`. `planWarnings` now adds "Vendor demand is high around Diwali; book early." for the nearest festival.
- **`personalisation.ts`** (spec 7) as data: the basis-key table with `filterBasis`, budget tiers, age bands, birthday and anniversary milestones, occasion idea families, contingency percent by budget style, the dietary blocklist with `dietaryWarning`, metro `costBand` and `seasonOf`.
- **"After the event"**: a `PHASES` entry `{ id: "after", minDays: -7 }`, `LIMITS.minDaysBefore = -7`, `dueDateFor` (shared by `scheduleTasks` and `deriveView`), and `aiPlanDraftSchema` tasks now accept -7. The starter template replaces the day-0 "Settle vendor payments" task with three post-event tasks: "Settle vendor balances" (-1), "Return rented items" (-2) and "Send thank-you messages" (-5).
- **Helpers** added to existing modules: `rebalancePinned` (budget), and `resolveWeekday`, `WEEKDAYS` and `isValidTime` (dates).
- **`PlanStore`** interface and **`SandboxPlanStore`** (spec 5.10). The sandbox applies ops in memory with `applyOperations` and `decideProposal`. It keeps `appliedOps` (capped at 20) and an undo stack, keeps the last four `previousTurns`, can `reset()`, and asserts the invariants on every change.
- **Demo fixtures** (spec 5.10): `demoFixture(sample, today)` returns `{ event, profile }` for `wedding`, `birthday` and `community`.
  - `resolveDates.ts`: the wedding is today + 60 days and the birthday today + 35. The community event is the Diwali in the table that is 2 days after the event date, choosing the earliest Diwali where that event date is at least today + 7. When no such Diwali exists, the date is today + 30.
  - The wedding follows design-system state S1: committed ₹11,18,000, paid ₹2,40,000, Photography over by ₹40,000, 12 of 34 tasks done, 10 active vendors plus "Bridal car" marked not needed.
  - The fixtures contain no real names, no vendor labels and no contacts.

### File map

```
src/lib/domain/
  model/enums.ts       closed vocabularies (occasions, dietary, traditions, statuses, origins ...)
  model/event.ts       EventDoc schema and sub-schemas, CAPS
  model/user.ts        UserDoc, PlanProfile
  model/records.ts     Proposal, Decision, History, Share, demo-usage schemas
  ops/schema.ts        PlanOperation union, PROPOSABLE_OP_TYPES
  ops/context.ts       ApplyContext, OpError, provenance, deterministic ids, name keys
  ops/apply.ts         applyOperations, validateOperation, finalizePlan
  ops/{budget,function,task,vendor,idea,event,reset}Ops.ts   one handler per op
  ops/editIntegrity.ts EDITABLE_FIELDS, isFaithfulEdit
  ops/decide.ts        decideProposal
  money.ts, stats.ts, view.ts, invariants.ts, festivals.ts, personalisation.ts, equality.ts
  (changed) budget.ts, dates.ts, timeline.ts, planner.ts, template.ts, schemas.ts
src/lib/plan/PlanStore.ts, SandboxPlanStore.ts
src/lib/demo/build.ts, resolveDates.ts, fixtures.ts, samples/{wedding,birthday,community}.ts
tests/domainFixtures.ts                  shared op-test helpers (invariants checked on every apply)
tests/contracts/planStoreContract.ts     PlanStore contract suite (run for the sandbox now, the server store later)
tests/unit/domain/*.test.ts, tests/unit/plan/*.test.ts, tests/unit/demo/*.test.ts
```

### Deviations from the spec, and why

- **Deterministic ids instead of `crypto.randomUUID()`** (12.3). Ids for new items are readable slugs that are unique within their list (`fn-puja`, `task-send-invitations-2`). Replaying the same ops on the same plan must produce the same ids. Otherwise the demo server's replay of `appliedOps` would break any later op that refers to an item created earlier, and the server and sandbox stores could not produce equal plans.
- **Timestamps are ISO strings in the domain layer.** The Firestore adapter (step 2+) converts them to and from `Timestamp`.
- **`origin` allows `"code"`** on every item, including the summary, for template and code-proposal items. Spec 8.2 lists only `ai | user` for the summary.
- **`ApplyContext` has three optional fields beyond the spec**:
  - `now`: the timestamp for `doneAt`, vendor history and drafts. It defaults to midnight UTC of `today`, which keeps replays deterministic.
  - `edited`: an accepted edit counts as the user's text.
  - `draftOrigin`: the server's lookup of a `generatedDraftId` (spec 8.2). Keeping it in the context keeps `applyOperations` pure.
- **Edit-integrity targets.** The spec's rule treats every `functionId`/`lineId` on an op as a fixed target. But the 6.1 table lets an `add_task` change its function and an `add_vendor` change its budget line. So targets are the ids that identify the existing item an op acts on. Links on items that an op creates stay editable. `adjust_budget_category`'s "category" is not editable, because changing it would change the target.
- **Moving the event date with pinned tasks.** A pin is kept when its date still fits the window for the new event date ([-7, 730] days before the event). Otherwise the task is unpinned and its offset is clamped to that window. This keeps invariant 5 true; the spec's alternative, a "flagged" pin, would break it.
- **Manual-only `remove_vendor` of booked or paid vendors is allowed.** The spec only blocks this for AI.
- **Where `PlanStore` lives.** It is in `src/lib/plan/` rather than `components/plan/`, because it is framework-free and the coverage gate covers `src/lib`.
- **Demo wedding date.** The wedding uses the spec's +60 days. The design mockups show the S1 numbers at +47 days. All the S1 amounts and statuses match.
- **Coverage thresholds** in `vitest.config.mts` were raised to the spec's 95/95/95/90. The spec's named exclude list (page shells, firebase adapters, `src/proxy.ts`) and its architecture test arrive with the steps that create those files.

### Known gaps (later steps)

- `describeOperation`, `announceChange`, `invertSections`, `toolCallToOperation` and `whatifToOperation` are not built yet (steps 5 and 6).
- `planToEventDoc`, the extended `eventInputSchema`, and signed `dayOffset` in `aiPlanDraftSchema` and `planFunctions` are step 3.
- The recorded demo proposals (`src/lib/demo/recorded/*.json`) are steps 5b and 6b.
- In the sandbox, declining an idea updates `dismissedIdeaTitles` locally only, because a decline is not an op in `appliedOps`. The demo ideas route (step 6b) should accept the visitor's dismissed titles or rebuild them from `previousTurns`.
- Only the sandbox store runs the `PlanStore` contract suite. `ServerPlanStore` joins it in step 4.
- Lunar festival dates follow the published 2026-2028 holiday calendars and should be checked once a year.

---

## Step 2: UI, part 1 (design system in code and the non-workspace pages)

**Status:** done. `npm run lint`, `npm run typecheck`, `npm test` (47 files, 689 tests), `npm run test:coverage` (99.6% statements, 97.4% branches, 99.6% functions, 99.9% lines) and `npm run build` pass. Playwright + axe (`e2e/pages.spec.ts`, 39 tests on desktop and Pixel 7): **0 axe violations on every page in light and dark**, plus the skip link, 404 status, the wizard's browser-Back step flow and the security headers.

### What was built

- **Tokens** (`src/app/globals.css`): the approved design-system 2.5 block verbatim (eight colours, light, `prefers-color-scheme` dark and the explicit `data-theme="dark"` toggle, `.hero` focus rescope), exposed through `@theme inline` with the default Tailwind palette removed (`--color-*: initial`) so only semantic names exist. Type scale, radii, shadows (borders in dark), easing. Motion classes for M1, M5, M6, M7, M9, M10, M12 and M14 and the reduced-motion rule from section 7 (opacity fades stay, transforms, shimmer and spinners stop). Toran and rangoli motifs as classes.
- **Contrast test** (`tests/unit/design/contrast.test.ts`): parses globals.css, resolves `var()` and `color-mix()` per theme and asserts every 2.3 pairing (text 4.5:1, non-text 3:1), the hero focus rescope, the dark logo ring, documented derived hex values, and that the media-query and toggle dark blocks match.
- **Fonts** (`src/app/layout.tsx`): Plus Jakarta Sans (variable, Latin, preloaded), Fraunces 600 (Latin, preloaded, no axes), Noto Sans Devanagari (`preload: false`, used only via `:lang(hi)`). **Measured preloaded woff2: 2 files, 45.4 KB total** (budget 60 KB); Devanagari is not preloaded.
- **Brand**: `<Logo variant="full | mark | mono">` (`role="img"`, `aria-label="Utsav"`, colours only from the logo tokens, mono uses a per-instance mask id); `src/app/icon.svg` is `logo-mark.svg`; flame, diya and Google glyphs in `ui/icons.tsx`; Lucide (`lucide-react` pinned at 1.56.0) at stroke 1.75 via CSS.
- **Primitives** (`src/components/ui`): Button (+ `ButtonLink`, `buttonClasses`; primary, accent, secondary, ghost, danger, danger-outline, inverse, google, hero, hero-outline; sm/md/lg; icon-only; loading with spinner and `aria-busy`), Field/TextField/SelectField (label, hint, "why we ask", helper and error wired through `aria-describedby`/`aria-invalid`), TextareaField with a counter announced only at 90% and 100%, MoneyField (₹ prefix, Indian grouping as you type), Combobox (ARIA 1.2, free text), Checkbox, RadioGroup, RadioCards, Toggle (switch), ChoiceChip, ChipGroup (cap disables extra chips), ChipRadioGroup, Tag, OriginTag (incl. "AI suggestion" with the flame), AiSurface (Marigold or brand edge), Card, Alert, ErrorSummary (focusable, links focus their field), ProgressBar, StepIndicator, StagedProgress (generating card on the rangoli grid), Skeleton/SkeletonRegion, EmptyState, Toran, LinkTabs, SegmentedControl, Dialog/Sheet (native `<dialog>`, focus returns to the opener), MenuButton (arrow keys, Home/End, Escape returns focus, Tab and outside click close), Toast with Undo (10 s, pauses on hover and focus, Escape dismisses, never takes focus, timer line paused with it) and the shared polite Announcer.
- **Shell**: skip link (first Tab stop, targets `<main id="main" tabindex="-1">`), signed-out header (also on the brand band), signed-in header with the avatar account menu (My events, Settings, Privacy and AI, Sign out), footer with the trust statement and "How Utsav uses AI" in the same place on every page, 404 and error boundary (shows only a short digest reference).
- **Pages**: landing `/` (hero with the decorative preview link to `/demo/wedding?tab=budget&ai=…`, how it works, feature strip, trust alert), `/signin`, `/onboarding` (4 steps + Done, `?rerun=1`), `/dashboard` (Upcoming/Past link tabs, cards, empty with "Try:" prefills, loading, error), `/events/new` (3-step wizard with `?step=`, `?type=` and `?occasion=` prefills, error summary, generating card with cancel, template-fallback stage and retry), `/settings` (profile defaults, AI usage today, run onboarding again, sign out), `/privacy` (P0 deletion wording), `/events` redirects to `/dashboard`.
- **Shared logic, unit-tested** (pure, in `src/lib`):
  - `lib/config.ts`: the one place for deployment config: `firebaseWebConfig`, `isSignInConfigured`, `firebaseProjectId` (FIREBASE_PROJECT_ID → GOOGLE_CLOUD_PROJECT → NEXT_PUBLIC_FIREBASE_PROJECT_ID), `firebaseEmulators`, `appOrigin`. AI config stays in `lib/ai/model.ts`.
  - `domain/model/createEvent.ts`: `createEventSchema` (the `POST /api/events` body for spec 5.1, with people-facing messages), `createEventRuleIssues` (milestone range by type, occasion only for community/other, shares ≤ 100%), `createEventDateIssues` and `functionDateWindow` (today-dependent rules). Client and server use the same rules.
  - `domain/model/user.ts`: `profilePatchSchema` (strict partial patch for `PUT /api/profile`, with `markOnboarded`), `applyProfilePatch` (sets `onboardedAt` once, never clears it), `AI_DAILY_QUOTA`, `aiUsedToday`.
  - `domain/labels.ts` (labels for every enum, `ordinal`, `defaultEventTitle` for placeholders and the share page's type title), `domain/cities.ts` (40 cities, `suggestCities`), `domain/dates.ts` (`weekdayName`, `formatWeekdayDate`).
  - `lib/client`: `eventWizard.ts` (form model, `toCreateEventInput`, step-scoped `wizardIssues` with summary labels and field ids, `festivalNote`, `eventDateHelper`), `eventCard.ts` (dashboard card view, `splitEvents`), `profileForm.ts` (tradition rules: "Prefer not to say" exclusive, max 6), `money.ts`, `navigation.ts` (`safeNextPath` for `?next=`, `afterSignInPath`).

### STUBS (replace in the backend step; UI needs no change)

All data goes through three interfaces in `src/lib/data`, supplied by `<ServicesProvider>` (`src/components/data/ServicesProvider.tsx`, mounted in the root layout). Pages never import an implementation.

| Interface | Stub now | Backend step replaces it with |
|---|---|---|
| `AuthClient` (`signIn`, `signInWithRedirect`, `signOut`) | `StubAuthClient`: every sign-in succeeds as the stub profile | Firebase web SDK (popup first, redirect if blocked) + `POST/DELETE /api/session` |
| `ProfileStore` (`load`, `save(patch)`) | `InMemoryProfileStore` seeded with `STUB_PROFILE` (persona "Ananya Kulkarni", not onboarded) | `GET/PUT /api/profile` (validate with `profilePatchSchema`, merge with `applyProfilePatch`) |
| `EventsRepository` (`list`, `create(request)`) | `InMemoryEventsRepository` with `stubEventSummaries(today)` (wedding, birthday, template anniversary, past housewarming) and 400 ms latency | `/api/events` (dashboard projection; create validates with `createEventSchema` + `createEventDateIssues`) |

Swap point: `createStubServices()` in `src/lib/data/stubs.ts` (or pass `services` to `ServicesProvider`). Stub state lives for one page load; a full reload resets it. Route guards (spec 3.3) are not applied yet: `(app)/layout.tsx` is where the server guard goes.

### File map

```
src/app/globals.css, layout.tsx, icon.svg, not-found.tsx, error.tsx
src/app/(marketing)/{layout,page}.tsx, privacy/page.tsx
src/app/(auth)/layout.tsx, signin/page.tsx, onboarding/page.tsx
src/app/(app)/layout.tsx, dashboard/page.tsx, events/page.tsx (redirect), events/new/page.tsx, settings/page.tsx
src/components/ui/*            primitives (see above)
src/components/brand/Logo.tsx
src/components/shell/          SkipLink, SiteHeader, AppHeader (+AccountMenu), Avatar, SiteFooter, Main/PageColumn
src/components/system/         NotFound, ErrorPanel
src/components/data/           ServicesProvider, useAsync, useToday
src/components/{landing,auth,onboarding,profile,dashboard,events,privacy}/   page components
src/lib/config.ts, src/lib/site.ts
src/lib/data/                  authClient, profileStore, eventsRepository, stubs, wait
src/lib/client/                eventWizard, eventCard, profileForm, money, navigation
src/lib/domain/                labels.ts, cities.ts, model/createEvent.ts (new); model/user.ts, dates.ts (extended)
tests/helpers/                 navigation mock state, renderApp/testServices
tests/unit/{config,architecture}.test.ts, unit/design, unit/client, unit/data, unit/domain/{labels,cities,createEvent,profile}
tests/components/{ui,shell,pages}
e2e/pages.spec.ts              axe on every page (light and dark), skip link, 404, wizard Back, headers
```

Removed (intentionally replaced): the v1 single-form UI (`src/components/{EventForm,PlanView,Planner,BudgetSection,ChecklistSections,Field,Section}.tsx`), its client helpers (`src/lib/client/{api,download,formState,storage}.ts`), their tests, `e2e/planner.spec.ts` and `src/app/favicon.ico` (replaced by `icon.svg`). `/api/plan` and `planHandler` are untouched.

### Deviations from the spec, and why

- **Dashboard lives at `/dashboard`** (spec 3.1); the task named `/events`, so `/events` redirects there.
- **`EventSummary` adds `guests` and `source`** to the spec 9.3 projection (`details, status, budget.total, stats`): the card's meta line shows the guest count and the design shows a "Starter template" tag. Both are cheap fields.
- **Function rows are name + date + start/end + share + Remove** for every type; the wedding table's separate "include" checkbox in the mockup is replaced by Remove, which does the same job with one control.
- **Validation copy**: the empty-name message is "Add a name." for both functions and parts. Inline messages stay live once a step was submitted; the error summary is a snapshot from the last submit (it is `role="alert"`, so live updates would re-announce on every keystroke).
- **Per-row labels**: repeated row labels carry a visually hidden suffix ("Name, part 2", "Age, person 1") so every control has a unique accessible name (spec 9.2).
- **`useToday()`** reads the clock only after hydration (Cache Components forbids clock reads while prerendering), so date helpers and countdowns appear on the client.
- **Coverage excludes** now follow the spec 12.4 shell list (`page/layout/loading/error/global-error/not-found.tsx`, `route.ts`, icons), guarded by `tests/architecture.test.ts` (shells ≤ 60 lines, no data branching, imports only from `next`, `react`, `@/components/*` or `@/lib/config`). The spec's `route.ts` rule (≤ 15 lines, re-exports from `@/lib/server/handlers`) is not asserted yet because the existing `/api/plan` route predates it.
- **`playwright.config.ts`** reads `E2E_PORT` (default 3100) so checks can run on another port.
- **`next.config.ts`** allows `lh3.googleusercontent.com` for Google profile photos through `next/image`; the Dockerfile accepts the four `NEXT_PUBLIC_FIREBASE_*` values as build args.

### Known gaps (later steps)

- `/demo` and `/demo/[sample]` (linked from the landing hero and header) and the workspace `/events/[id]` (where the wizard navigates after creating) are not built yet, so those links 404 until UI part 2 / step 4.
- Guards, session cookie, Firebase clients, `src/proxy.ts` and the nonce CSP are the backend step. `PRIVACY_CONTACT` in `src/lib/site.ts` is a placeholder address for the owner to set.
- The footer has no GitHub link yet (repo URL unknown). `npm run check:fonts` (font budget script) is not written; the measured numbers are above.
- Not built because nothing uses them yet: the AI suggestion card states, diff view, vendor status pills and workspace tabs bar (workspace step, using the primitives here).

---

## Step 3: UI, part 2 (event workspace, AI mode UI and the public demo)

**Status:** done. `npm run lint`, `npm run typecheck`, `npm test` (65 files, 854 tests), `npm run test:coverage` (98.3% statements, 93.3% branches, 97.8% functions, 99.2% lines) and `npm run build` pass. `npm run test:e2e` (run with `E2E_PORT=3300`): 137 passed on desktop and Pixel 7, **0 axe violations in light and dark** on every page including the three demo samples, four demo tabs, every workspace tab and the share page; plus the demo AI flow, birthday and community flows and a 375 px no-horizontal-scroll check on 14 pages.

### What was built

- **Workspace** at `/events/[id]` with real tab routes (`/budget`, `/timeline`, `/vendors`, `/ideas`, `/guests`; spec 3.1). One client `EventWorkspace` in the `[id]` layout loads the event through a new `WorkspaceRepository` and renders the header (Fraunces title, type and AI plan / Starter template chips, date · countdown · festival proximity, city, guests, budget), the scrolling tab bar (`aria-current`, "Vendors, 10 active"), the AI mode button (flame, "Ctrl K"/"⌘K" hint `aria-hidden`, `aria-keyshortcuts`, pending badge as hidden text) and the event menu. Ctrl/Cmd+K opens AI mode. Every page shell is one line (`<WorkspaceTabView />`).
  - **Overview**: plan warnings, inline summary edit (`set_summary`), Budget health (deriveView money, committed bar), This week with checkboxes, Functions table linking to `Budget?view=functions`, vendor status counts, saved ideas / "N ideas from your new plan to review", and the **Review your new plan** banner (Looks good, Save all ideas via `save_idea`, Reset section → inline "Suggested by Utsav" `reset_section` card focused on arrival, Start from the starter template while the version is unchanged, Dismiss and reopen from the event menu).
  - **Budget**: per-cell `aria-label`s ("Decor, allocated amount", "Decor, percent", "Sangeet, share percent"), save on blur/Enter, keep-total vs change-total mode, Adjusted tags + "Edited by you" + M11 highlight, the `announceChange` sentence in the shared live region, Over by text, row menu (Edit note, Rename, Delete with move-to select and "2 vendors will move to Contingency"; Contingency has no rename/delete), Add category (the `add_budget_category` edit form), By function view.
  - **What-if sheet**: Simple rescale and Smart re-plan option cards, protect chips, editable After per row (pins and rebalances with `rebalancePinned`, announced), Include toggles, totals, Apply disabled with "Adjust one more row so the total is …", committed-below warning, ignored-category note, model notes, trade-off cards, function amounts at the new total. Smart re-plan failure falls back to Simple.
  - **Timeline**: progress, All/To do/Done/Overdue + function filter, phase groups with function milestones (event day and the day after grouped as "Event days", DR2-05), "After the event", Rushed pill, AI origin tag, add/edit task editor with days before/after or a date and a live computed date, row menu (Edit, Mark as done, Delete with Undo toast), empty state with Ask AI.
  - **Vendors**: totals bar (quoted awaiting / committed / paid / remaining), pipeline columns from 900 px content width (container query) with a status filter below, collapsed Not needed, status select with the inline Booked/Paid amount prompt (focus to the amount, Escape/Cancel reverts and announces "Status not changed"), Paid more than quoted, pipeline bar with hidden "Step 3 of 5", vendor drawer (label, contact, budget line, quoted/paid, notes, questions, history, Mark not needed, delete confirm or the blocked booked/paid explanation) and the **enquiry draft** (channel, language, tone, budget toggle; editable draft with "Draft - review before sending", Template draft / Edited by you chips, Copy, Open in WhatsApp / Open email, Save draft (max 3), saved drafts View/Delete).
  - **Ideas**: "Ideas use:" line, personalisation panel (theme, vibe, dietary, mobility; kids/elderly shown from Guests), Suggest more (focus chips + ask) → New suggestions strip of cards with Save/Edit/Dismiss and Save all, "From your new plan" Save/Dismiss, saved ideas with Add to plan (inline code-proposal cards), Edit, Delete, Add your own idea, dismissed count + Clear list. Every idea shows "≈ … (estimate)", flags ("Above your budget", "May not suit Jain guests") and a code-built "Why this idea".
  - **Guests**: counts only, inline messages on blur, error summary focused on save, adults + kids = total, plates estimate with buffer.
- **AI mode UI**: `AiSessionProvider` keeps the conversation (instruct, ideas, what-if and inline code turns) and which batch each accepted card belongs to. Panel: 400 px `aside` from 1024 px, full-screen modal sheet below; instruction box (500, sample 300) with Ctrl/Cmd+Enter, four tab chips (fill, never submit), staged progress with Cancel, error states (unavailable + Retry + "Edit … manually", rate limited, `SANDBOX_STATE_INVALID` + Reset sample), earlier turns as disclosures, current batch.
  - **Cards** (`SuggestionCard`): origin chip, Valid / Not valid / No longer applies (live re-check against the plan on screen), code-built title and `DiffView`, "Also adds …" for dependencies, "Why:", Accept / Edit / Decline with target-specific names, collapsed Applied + Undo (or "Undo unavailable: the plan changed after this.") and Declined + Restore, follow-up "Replaces your earlier change" with net-effect title and two rows ("Change Decor cut from 20% to 15%"). Edit opens the 6.1 form in place with "Edited by you" and a live Preview; edits that would not apply are refused before deciding.
  - **Focus (R2-11)**: batch `h2` focused on arrival unless focus moved elsewhere, "N suggestions, M valid" announced; Undo after Accept, Restore after Decline, Accept after Restore, first field on Edit, Edit after Cancel, Undo after Save and accept, the summary line after Accept all, the AI mode button after close.
- **Public demo (F-23a)**: `/demo` chooser (three cards, list items with h2) and `/demo/[sample]` (`generateStaticParams` for the three, unknown sample → 404) with `?tab=` and `?ai=`, the sticky "Sample plan - not saved" note, the same tab components read-only, AI cards and the sample What-if (simple rescale, "Apply to sample") over `SandboxPlanStore`, and "Reset sample" in the event menu. Birthday and community open on Ideas.
- **Share page** `/s/[token]` (noindex): token format check (404 without lookup), code-built heading, budget lines table in `<details open>`, money summary, timeline progress and next tasks, vendor status pills, Not needed count, saved ideas. **Stub data**: every well-formed token shows the sample wedding with amounts on.
- **Recorded proposals** (`src/lib/demo/recorded/*.json`): wedding `instruct-cut-decor-20`, `instruct-follow-up-15`, `ideas`, `whatif`; birthday `instruct-add-painting-station`, `ideas`; community `instruct-add-volunteer-tasks`, `ideas`. Validated by `recordingSchema` (strict, proposable ops only) and in `tests/unit/demo/recordings.test.ts` against each pristine fixture with `applyOperations` (every op applies, invariants hold).
- **Pure logic** (unit-tested):
  - `domain/describe.ts` `describeOperation(before, after, op, today)` for every op type + `summaryOf`, `estimateText`, `taskDue`, `functionWhen`; `domain/announce.ts` `announceChange`, `adjustedIds`; `domain/enquiry.ts` template drafts (4 channel × language variants, `[Vendor name]`) and `shareLink`.
  - `plan/proposals.ts` (`buildProposal` with per-item dry runs, `previewItem` with dependencies, Accept-all decisions/summary, `skippedReasons`); `plan/LocalPlanStore.ts`; `ReviewControls` in `PlanStore.ts`.
  - `client/opForms.ts`: the 6.1 Edit forms as data (fields, starting values, `build` back to an op with per-field errors). The same forms are the tab editors (add/edit task, add/edit idea, add vendor, add category), so a card edit is the tab edit. A test proves every proposable op's untouched form rebuilds a faithful op (`isFaithfulEdit`).
  - `client/whatif.ts` (simple rows, `smartRows` = `whatifToOperation` line mapping with exact/prefix name resolution, protect and committed clamps; `editAfter`, `setIncluded`, gap message; property test that edits always sum to the new total), `followUp.ts`, `budgetTable.ts`, `timelineView.ts`, `vendorsView.ts`, `ideasView.ts` ("Ideas use:", "Why this idea", flags, Add to plan draft), `guestsForm.ts`, `review.ts`, `shareView.ts` (`toSharedView`, `isShareToken`), `workspace.ts` (tabs, hrefs, chips per tab and per sample, header meta).
  - `data/aiClient.ts`: the `AiClient` interface (instruct, ideas, whatif, enquiry), `AiRequestError` kinds, and `RecordedAiClient` (the fake). `data/workspaces.ts`: `Workspace`, `WorkspaceRepository`, `StubWorkspaceRepository`; `data/stubPlans.ts`; `demo/session.ts` (`demoWorkspace`).

### STUBS (replace in the backend and AI steps; UI needs no change)

| Interface | Stub now | Replaced by |
|---|---|---|
| `WorkspaceRepository.open(id)` (new `Services.workspaces`) | `StubWorkspaceRepository`: the dashboard's stub events; the wedding and birthday reuse the demo samples on their own dates (the birthday is "fresh", under review), anything else (incl. wizard-created events) gets the starter template via `starterPlan` | `GET /api/events/[id]` + `ServerPlanStore` |
| `PlanStore` for the workspace | `LocalPlanStore` (in memory, bumps `version`, undo stack of plans) | `ServerPlanStore` (PATCH / decide / undo with `baseVersion`) |
| `ReviewControls` | `LocalPlanStore.markReviewed` / `startFromTemplate` (four `reset_section` ops as one change) | `PUT /review`; Undo of the creation history entry |
| `Workspace.createProposal` | `localProposals` (built in the browser) | `POST /api/events/[id]/proposals` |
| `AiClient` | `RecordedAiClient` (recordings by keyword, dry-run against the visible plan, 900 ms) for both the workspace (by event type) and the demo | `/api/events/[id]/ai/*` and `/api/demo/[sample]/ai/*` (the demo client should send `appliedOps` / `previousTurns`, already kept by `SandboxPlanStore` and the session) |
| Share page data | sample wedding for every well-formed token | share doc lookup + `toSharedView` |

### File map

```
src/app/(app)/events/[id]/layout.tsx, page.tsx, {budget,timeline,vendors,ideas,guests}/page.tsx
src/app/(marketing)/demo/page.tsx, demo/[sample]/page.tsx
src/app/s/[token]/page.tsx
src/components/workspace/   WorkspaceContext, EventWorkspace, WorkspaceFrame, WorkspaceHeader, WorkspaceTabView, WorkspaceSkeleton
src/components/workspace/tabs/  Overview, Budget, Timeline, Vendors, Ideas, Guests
src/components/ai/          AiSession, AiPanel (+ AiProgress, AiRequestAlert), ProposalBatch, SuggestionCard
src/components/plan/        DiffView, StatusPill (+ PipelineBar), OpEditor (+ OpFields), CellInput, TaskCheck, IdeaFacts,
                            ReviewBanner, WhatIfSheet, VendorDrawer, EnquiryDraft
src/components/demo/        DemoChooser, DemoWorkspace (+ SampleBanner), DemoSamplePage
src/components/share/       SharedPlan (+ SharedHeader, SharedPlanView), SharedPlanPage
src/components/data/useMediaQuery.ts
src/lib/domain/describe.ts, announce.ts, enquiry.ts; labels.ts (+ vendor status, idea category, review section labels); dates.ts (+ formatShortDate, formatTime, offsetLabel)
src/lib/plan/proposals.ts, LocalPlanStore.ts; PlanStore.ts (+ ReviewControls)
src/lib/client/workspace.ts, opForms.ts, whatif.ts, followUp.ts, budgetTable.ts, timelineView.ts, vendorsView.ts, ideasView.ts, guestsForm.ts, review.ts, shareView.ts
src/lib/data/aiClient.ts, workspaces.ts, stubPlans.ts
src/lib/demo/recordings.ts, session.ts, recorded/*.json; fixtures.ts (+ sampleEvent)
tests/helpers/workspace.tsx, media.ts; tests/unit/{domain,plan,client,data,demo}/…; tests/components/workspace/*, pages/demoShare
e2e/axe.ts (shared helper), e2e/pages.spec.ts (route list extended), e2e/demo.spec.ts
```

Changed shared pieces: `Dialog` takes `labelledBy` (content draws its own heading) and ignores a nested dialog's close event (React passes it up the tree, which closed the vendor drawer when its delete dialog closed); `MoneyField` takes `inputRef`; `AppHeader` split into `AppHeader` + `AppHeaderBar` so the `(app)` layout can suspend it on dynamic routes; globals.css adds M4 `motion-fade-up` and M11 `motion-highlight` (both off under reduced motion); tests/setup.ts adds a `matchMedia` stub and `notFound` to the navigation mock. The v1 Planner UI was already removed in step 2; nothing else was obsolete.

### Deviations from the spec, and why

- **Demo dates and the share page render on the client** (`useToday`, skeleton first). Cache Components removes `export const revalidate`, and reading the clock while prerendering is forbidden, so instead of ISR the static demo shell fills in after hydration. No Firestore or auth either way.
- **Smart re-plan applies the table as a manual `set_budget_lines`** after the user reviewed every row (editable After); its trade-offs are ordinary cards decided one by one. The spec's single proposal with item 1 = the table is for the server step.
- **Follow-up cards** are detected on the client: a budget change on a line that an earlier turn in this conversation already changed. Accepting applies the new op (for `change_total` this equals undo + redo); a one-history-entry replace is the server's job.
- **Rushed vs Overdue**: `deriveView` sets `overdue = rushed && !done`, so the UI shows one "Rushed" pill; the Overdue filter uses `overdue`.
- **Budget percent cell** converts to an amount (`set_amount`) rather than a percent op.
- **Event menu** holds only what exists now: "Review your new plan" (when dismissed) in the workspace and "Reset sample" in the demo. Event settings, Share link and Add to calendar arrive with step 7; the menu is hidden when empty.
- **Personalisation panel** edits theme, vibe, dietary and mobility; honoree rows and traditions stay as created (the wizard has them) until the event-settings step.
- **Community ideas recording**: the fixture already saves "Rangoli competition by age group", so the recording carries a companion "Kids' rangoli workshop before the competition" (the same title would be refused as a duplicate).
- **Stale-card title**: a card that no longer applies keeps its proposal `summary` as its title, since the item it named may be gone.

### Known gaps (later steps)

- Server stores and routes (see STUBS); the demo AI routes with `appliedOps` replay, rate limits and the 429 "tries used up" state (the panel already renders `rate_limited`).
- "Waiting for you" list in the AI panel, proposal expiry text, Suggest questions (P1), outstation and per-function headcounts (P1), catering proposal (P1), Event settings page, `.ics` export, history list (P1).
- `/s/[token]` with a malformed token renders the not-found page inside a streamed response, so the HTTP status may be 200; the backend share step should validate in a route segment that can still set 404.
- The design's container-query degrade for the Budget table (priority columns into a Details expander at 640-899 px) is a scrollable region instead; the region is focusable and named.

---

## Step 4: Backend, part 1 (Firebase Auth, Firestore, plan API; spec 12.5 steps 2-4 backend)

**Status:** done. `npm run lint`, `npm run typecheck`, `npm test` (80 files, 1,044 tests), `npm run test:coverage` (98.4% statements, 93.7% branches, 97.9% functions, 99.3% lines; every new server module at 100% lines) and `npm run build` pass. `npm run test:e2e -- --project=desktop` (port 3457): 41 passed, 0 axe violations. Smoke test of the production build with **no Firebase and no Gemini env**: landing, `/demo` and its samples, `/privacy` and 404 render; `/signin` says "Sign-in isn't configured on this deployment."; signed-in pages redirect to `/signin?next=…`; `/api/events` answers 503 `not_configured`; `/api/health` reports `firestore: "not_configured"`.

### What was built

- **Firebase, lazily and by env contract.** `src/lib/server/firebase/admin.ts` initialises `firebase-admin` once per instance with ADC and `firebaseProjectId` (FIREBASE_PROJECT_ID → GOOGLE_CLOUD_PROJECT → NEXT_PUBLIC_FIREBASE_PROJECT_ID; the SDK honours the emulator hosts), Firestore over REST (`preferRest`, smaller cold starts). `src/lib/firebase/client.ts` dynamic-imports `firebase/app` + `firebase/auth` only when someone signs in. `src/lib/config.ts` (step 2) stays the one config module.
- **`Db` interface** (`server/db/types.ts`): the slice of Firestore the repositories use, by document path (`get`, `query` with where/orderBy/select, `newId`, `transaction` with reads-before-writes, `deleteTree`). `server/firebase/firestoreDb.ts` adapts the Admin SDK in ~40 lines; `server/db/timestamps.ts` converts ISO strings ⇄ `Timestamp` **by field name** (`createdAt`, `updatedAt`, `expireAt`, `onboardedAt`, `revokedAt`, `doneAt`, `at`) and drops `undefined` fields. `tests/helpers/memoryDb.ts` implements the same interface in memory and enforces Firestore's reads-before-writes rule (it caught a real ordering bug in decide).
- **Repositories** (`server/repos`): `UserRepo` (create on first sign-in, `savePatch` with `applyProfilePatch`, transactional daily AI quota `consumeAi`, delete) and `EventRepo` (`summaries` projection query `select(details, status, source, budget.total, guests.total, stats)` ordered by date; `owned` → null for anyone else; `create` with the creation history entry; `withEvent(id, uid, fn)` = one transaction that checks ownership first and hands `fn` an `EventTx` for history, proposals, `private/share` and `shares/{hash}`; hard `delete` incl. share docs; `ownedIds`, `findShare`).
- **Session** (`server/auth`): `__session` cookie (httpOnly, SameSite=Lax, Secure except on a plain-http origin, 5 days). `SessionVerifier.verify(cookie, kind)`: reads call `verifySessionCookie(c, false)` only; writes add the revocation check (`auth_time` vs `tokensValidAfterTime`) cached per uid for 60 s in `TtlCache` (deleted account = revoked); `forget(uid)` on sign-out. `authorize(request, deps, kind)` is the top of every signed-in handler: 503 without Firebase, Origin must equal APP_ORIGIN (or the request's own origin when unset) on writes, 401 (clearing a cookie that no longer verifies), 60 writes/min per uid.
- **Plan commands** (`src/lib/plan/commands.ts`, pure): `applyManual` (PATCH, all or nothing, `baseVersion` conflict), `undoEntry` (only while `version === versionAfter`), `decide` (accepted ops → new version + `user_via_ai` history; decline keeps the version), `markReviewed` (no bump), `pendingStats`, `historyEntry`/`changedSections` (snapshot only touched sections; `invertSections` of spec 12.2), `historyLabel`, invariants asserted on every result. `CREATION_HISTORY_ID = "creation"`, `CREATED_VERSION = 1`.
- **Event creation** (`src/lib/plan/newEvent.ts`): `planInputOf`, `planContextOf` (occasion, milestone, theme, traditions, dietary, honorees by role/age/gender/interests, flags, budget style, profile role; **no title, names or notes**), `functionShares` (typed shares kept, the rest split by the plan's weights, exactly 100.0 in tenths), `planToEventDoc` (vendors linked to budget lines by `budgetCategory` or name, a Contingency line added by budget style when missing, T1 ideas `suggested`, review pending for AI plans), `templateEventDoc` and `creationHistory` (the starter template as `before`, review all `reset`, version 0 → 1). AI draft schema: functions take signed `dayOffset` −14..+1 (legacy `daysBeforeEvent` mapped), ideas gain `category` + `basis` (filtered by `filterBasis`), vendors gain `budgetCategory`. `planFunctions` dates by signed offset (reception at +1). `buildPlanPrompt(input, today, context)` sends the context as fenced JSON plus festival proximity; the title is no longer sent.
- **Route handlers** (`server/handlers/*`, each exporting testable `fn(request, deps, params)` plus the bound `GET/POST/...`; every `src/app/api/**/route.ts` is one `export { … } from "@/lib/server/handlers/…"` line, asserted by `tests/architecture.test.ts`):

  | Route | Notes |
  |---|---|
  | `POST/DELETE /api/session` | ID token → session cookie (sign-in must be < 5 min old), creates `users/{uid}`, returns `{ onboarded }`; 10/min per IP (rightmost `X-Forwarded-For`). DELETE revokes refresh tokens, forgets the uid, clears the cookie |
  | `GET/PUT /api/profile` | strict `profilePatchSchema` merge |
  | `DELETE /api/account` | `{ confirm: "DELETE" }`: events (+subcollections, shares), profile, Auth user |
  | `GET/POST /api/events` | dashboard projection; create validates `createEventSchema` + `createEventDateIssues`, AI mode: per-user plan cache (1 h, key without title) → 6/min + daily quota 60 → `generatePlan` (retry + template fallback), blank mode: template, then one transaction (event + creation entry) |
  | `GET/PATCH/DELETE /api/events/[id]` | 404 for non-owners; PATCH 409 with the latest event, 422 with per-op results, 16 KB limit; DELETE needs the title typed |
  | `POST …/undo`, `PUT …/review` | undo 409 "Undo unavailable: the plan changed after this."; review keeps the version |
  | `POST …/proposals` | code proposals: origin always `code`, proposable ops only, server dry-run, dependency ids checked, `stats.pending` recounted |
  | `POST …/proposals/[pid]/decide` | 409 stale, 410 expired, 404 unknown |
  | `POST/DELETE …/share` | 32-byte token, only its SHA-256 names `shares/{hash}`, raw token in `events/{id}/private/share`; options update reuses the token; soft revoke |
  | `GET /api/health` | `{ status, firestore: ok/error/not_configured, model: { id, location, reachable } }` via `countTokens`, cached 60 s |

- **Guards** (`src/lib/guards.ts`): the 3.3 table as `guardRedirect(route, viewer, request)` and the proxy's cookie-presence `proxyRedirect`. **`src/proxy.ts`** (Next 16 proxy, matcher limited to guarded pages and `/s/*`): signed-out → `/signin?next=…`, cookie present on `/` → `/dashboard`, sets `x-utsav-path` for the server guard's `?next=`, and rewrites malformed `/s/<token>` to a real 404 before rendering. **Server guards** (`server/loaders/viewer.ts`: memoised `getSession(kind)`, `guardTarget`) run in `components/auth/RouteGuard.tsx` inside Suspense: `(app)/layout.tsx` (dashboard, events, settings), `/signin` (onboarded → `?next`), `/onboarding` (`?rerun=1`).
- **Share page**: `server/loaders/share.ts` (format check → per-IP 30/min → hash → 60 s projection cache → share doc (revoked = 404) → event with matching owner → `toSharedView`); `SharedPlanPage` renders it; `SharedPlan.tsx` is now a server component (no stub data).
- **Client data over HTTP** (UI unchanged): `data/api.ts` (`Api.request(path, schema)` validates every response with the domain Zod schemas; `ApiRequestError` keeps the error body), `HttpProfileStore`, `HttpEventsRepository`, `HttpPlanApi`, **`ServerPlanStore`** (PATCH/decide/undo with `baseVersion`; on 409 swaps in the server's latest plan, drops its undo stack and returns "This plan changed in another tab. Reloaded the latest version."; undo pops this tab's history ids; `startFromTemplate` = undo of `creation`; network failure → "Couldn't save. Check your connection and try again."), `HttpWorkspaceRepository`, **`FirebaseAuthClient`** (popup first; `auth/popup-blocked` → the existing "Continue in this tab" redirect, finished by `completeRedirect()` on the next load via a sessionStorage flag; the SDK is warmed with `preload()` on the sign-in page so the popup opens from the click; token → `/api/session`, then the SDK signs out). `createHttpServices` is the `ServicesProvider` default; the in-memory implementations stay as test fixtures.
- **Config files**: `firestore.rules` (deny-all for clients, owner-only rules as commented intent, spec 8.3), `firestore.indexes.json` (events by owner/status/date asc+desc, proposals touchpoint/createdAt, TTL on `history.expireAt` and `proposals.expireAt`), `firebase.json` (rules, indexes, auth/firestore emulators). `next.config.ts`: `/__/auth/:path*` and `/__/firebase/init.json` rewrites to `<project>.firebaseapp.com` (only when a project id is set), CSP adds `apis.google.com`, Identity Toolkit/Secure Token, Google avatars and `frame-src` for sign-in, and the proxied `/__/*` helper pages get `frame-ancestors 'self'` instead of the app CSP. `.env.example` documents the authorised-domain/redirect-URI setup and asia-south1; `.gitignore`/`.dockerignore` refuse `*service-account*.json`. Dockerfile unchanged (it already takes the four `NEXT_PUBLIC_FIREBASE_*` build args). `@grpc/grpc-js` is overridden to `^1.14.6` (the client SDK pinned a version with a high advisory); `npm audit --omit=dev` is clean.

### File map

```
src/proxy.ts                         cookie-presence redirects, guard path header, share-token 404
src/lib/guards.ts                    guard table (spec 3.3), proxyRedirect
src/lib/firebase/client.ts           web SDK loader (excluded from coverage, spec 12.4)
src/lib/data/api.ts, httpStores.ts, planApi.ts, firebaseAuthClient.ts, services.ts; workspaces.ts (+HttpWorkspaceRepository)
src/lib/plan/commands.ts, newEvent.ts, ServerPlanStore.ts
src/lib/server/deps.ts, runtime.ts, http.ts, shareTokens.ts
src/lib/server/auth/cookies.ts, session.ts, guard.ts
src/lib/server/db/types.ts, timestamps.ts
src/lib/server/firebase/admin.ts, firestoreDb.ts      (excluded from coverage, spec 12.4)
src/lib/server/repos/users.ts, events.ts
src/lib/server/handlers/session, profile, account, events, event, undo, review, proposals, decide, share, health
src/lib/server/loaders/viewer.ts, share.ts
src/components/auth/RouteGuard.tsx
src/app/api/**/route.ts              one-line re-exports
firestore.rules, firestore.indexes.json, firebase.json
tests/helpers/memoryDb.ts, server.ts (FakeAuth, testDeps, request builders), inProcessFetch.ts
tests/unit/guards.test.ts; tests/unit/server/{session,http,repos,accountRoutes,eventRoutes,proposalShareRoutes,loaders,runtime,routeBindings}.test.ts
tests/unit/plan/{commands,newEvent,ServerPlanStore}.test.ts (ServerPlanStore runs the PlanStore contract through the real handlers); tests/unit/data/http.test.ts
tests/components/auth/routeGuard.test.tsx
```

Removed (intentionally replaced): `/api/plan` and `server/planHandler.ts` (a public, unauthenticated AI endpoint from v1; `POST /api/events` replaces it) with their tests; `clientKey` (leftmost hop) became `clientIp` (rightmost hop, spec 9.1); `createStubServices` is no longer the app default.

### Deviations from the spec, and why

- **`POST /api/session` returns `200 { onboarded }`** instead of 204, so the sign-in card can route straight to onboarding or `?next=` without a second request.
- **Proposals created in the browser are stored before deciding.** Until the AI routes (step 5) store their own proposals, the signed-in workspace still answers AI requests with `RecordedAiClient`; `ServerPlanStore.decide` sends such a proposal (with its item ids) to `POST /proposals` first, so it is re-validated server-side and labelled origin `code`, then decides by id. `POST /proposals` therefore accepts every touchpoint (origin is always `code`) and optional item ids. Step 5 removes the need once AI proposals arrive with ids.
- **Declining an idea writes `dismissedIdeaTitles` without a version bump** (no plan op was applied), matching `LocalPlanStore`.
- **The proxy also 404s malformed share tokens** (a rewrite to `/404`), which fixes the step-3 gap where `/s/demo` answered 200. A well-formed but unknown or revoked token still streams the not-found page with status 200 (the page is dynamic behind Suspense under Cache Components).
- **Guards for `/`** are the proxy's cookie-presence redirect only, so the landing page stays static; a visitor with an expired cookie is sent `/` → `/dashboard` → `/signin?next=/dashboard`.
- **Coverage excludes** now list `src/lib/server/firebase/**`, `src/lib/firebase/client.ts` and `src/proxy.ts`, exactly the spec 12.4 list; the proxy's decisions (`proxyRedirect`, `isShareToken`) and the proxy itself are still unit-tested.
- **Firestore-side timestamps** are converted by field name (including embedded `doneAt`, `at`, draft `createdAt`), not only for TTL fields.
- **CSP stays the static policy** (with Firebase sources added); the nonce CSP for dynamic pages is step 8 as planned.

### Known gaps (later steps)

- **Signed-in E2E**: the guarded pages now need a session, so `e2e/pages.spec.ts` covers them as redirects only; axe on dashboard, wizard, settings and workspace tabs needs the spec's test-only session route (P0) or the Auth emulator (P1) in the QA phase.
- AI routes (`/api/events/[id]/ai/*`, `/api/demo/*`, `meta/demoUsage`), `.ics` export, event settings page, share UI (the API exists), self-serve account deletion UI (the API exists; `/privacy` keeps the P0 copy), history list.
- Emulator tests for rules and the Admin adapters (F-25, P1); `firestoreDb.ts` is covered by the deploy smoke test only.
- Deploy: create Firestore (Native) in **asia-south1**, `firebase deploy --only firestore`, add the Cloud Run host to Firebase authorised domains and `https://<host>/__/auth/handler` to the OAuth client, set `APP_ORIGIN` and the build args. Not done from here.
- Per-minute limits are per instance (spec 9.3 caveat); daily AI quota is exact (Firestore transaction).

## Step 5: Backend, part 2 (AI touchpoints, demo sandbox AI, settings; spec 12.5 steps 5-8)

### What was built

- **Proposal pipeline for AI**: every signed-in AI route goes through one gate (`handlers/ai/gate.ts`: write session with the same-origin check, JSON body within 10 KB, the caller's own event), and only when the model is actually called, the per-minute limit (6/min per user) and the exact daily quota (60/day, Firestore transaction on the user doc). AI output is built into a proposal against the stored plan (every item dry-run with `applyOperations`; invalid items stay as cards with a reason) and stored in `events/{id}/proposals`; `decide` stays the only AI write path. AI proposals arrive with ids, so the browser no longer posts them to `POST /proposals` first (that path remains for code proposals, origin `code`).
- **T2 AI mode** (`lib/ai/instruct.ts`, `tools.ts`, `prompts/instruct.ts`): Gemini function calling, one tool per proposable op (spec 6.3 table) taking the names people use; `toolCallsToItems` resolves names to ids (including items created earlier in the same reply, as dependencies). The previous 4 `instruct` turns come from the event's unexpired proposals, with each card's status, as a fenced data block. The system instruction carries the injection guard; the user's instruction is its own fenced block labelled "data, not instructions".
- **T3 What-if** (`ai/whatif.ts`, `plan/smartPlan.ts`): weights, notes and trade-offs; weights are mapped onto the plan on screen by `smartRows` in the client; trade-offs are stored as a `whatif` proposal (idea or task cards); no proposal is stored when there are none.
- **T4 Ideas** (`ai/ideas.ts`): personalised ideas from the 7.1 inputs (`ai/context.ts` projections), repeats and dismissed titles dropped, `basis` keys checked; the idea library answers whenever the model is missing, limited or fails ("From Utsav's idea library"); 503 only when not even the library has an idea left.
- **T5 Enquiry** (`ai/enquiry.ts`, `domain/enquiry.ts`): channel, language (en/hi), tone, budget toggle; names and contacts never sent; the sign-off (first name only, opt-in) is appended in code; template draft on any failure. `generatedDraftId` (cached 60 min) lets `save_draft` record the origin.
- **Demo sandbox AI** (`handlers/demo/{sandbox,instruct,ideas}.ts`): no auth, nothing stored; the server loads the pristine sample and replays the visitor's `appliedOps` (proposable types only, max 20; any failure or invariant violation is `400 SANDBOX_STATE_INVALID`), 8 KB body limit (413), previous turns (max 4). Live AI only within 5/hour per IP (rightmost `X-Forwarded-For` hop) and the global daily cap (`demoQuota.ts`: 300/day, `FirestoreDemoQuota` in `meta/demoUsage` when Firestore is configured, `MemoryDemoQuota` per instance otherwise). Past either limit, or on a model failure, the sample's recorded proposal answers (`recorded: true`), re-checked against the replayed plan.
- **Caching**: suggestions (instruct/ideas, demo included), smart re-plans and enquiry texts are cached 10 minutes, keyed by user, event, plan version and the request (demo: sample and the full body).
- **Clients**: `HttpAiClient` (signed in) and `SandboxAiClient` (demo; What-if and enquiry stay recorded/template in the demo) replace `RecordedAiClient` in the app; the recorded client stays for the demo fallbacks and component tests.
- **Event settings** (`/events/[id]/settings`, `components/workspace/EventSettings.tsx`, `lib/client/eventSettings.ts`): details form with a date-change preview computed by dry-running the same `set_details` op the save applies, budget via What-if, share link (create, options, copy, turn off), `.ics` download, delete with typed-title confirmation.
- **`.ics` export** (`GET /api/events/[id]/calendar.ics`, `domain/ics.ts`): the event, each function (timed when times are set), open tasks and booking deadlines; owner only, `private, no-store`.
- **CSP split** (`lib/server/csp.ts`, applied in `next.config.ts`): see deviations.
- **README** rewritten: feature map starting with `/demo` and the three samples, GenAI table, API table, run/test/deploy.

### File map

```
src/lib/ai/context.ts, tools.ts, instruct.ts, ideas.ts, whatif.ts, enquiry.ts, reply.ts, outputFilter.ts, prompts/*
src/lib/server/handlers/ai/gate.ts, instruct.ts, ideas.ts, whatif.ts, enquiry.ts
src/lib/server/handlers/demo/sandbox.ts, instruct.ts, ideas.ts
src/lib/server/handlers/calendar.ts, demoQuota.ts, csp.ts
src/lib/data/httpAiClient.ts (HttpAiClient, SandboxAiClient, aiError); src/lib/demo/session.ts
src/lib/client/eventSettings.ts; src/components/workspace/EventSettings.tsx
src/app/api/events/[id]/ai/*/route.ts, calendar.ics/route.ts; src/app/api/demo/[sample]/ai/*/route.ts
tests/unit/server/aiRoutes.test.ts      gate, limits, quota, cache, fallbacks, stored proposals, injection, previous turns (T2-T5)
tests/unit/server/demoRoutes.test.ts    replay, 413, largest realistic body, SANDBOX_STATE_INVALID, 5/hour per IP, daily cap,
                                        recorded fallback, cache, "accept then second instruction", Memory/FirestoreDemoQuota
tests/unit/server/calendarCsp.test.ts   .ics route, CSP policies and route patterns
tests/unit/data/httpAiClient.test.ts    both clients over the real handlers, error mapping
tests/unit/ai/context.test.ts, tests/unit/client/eventSettings.test.ts, tests/components/workspace/settings.test.tsx
tests/unit/ai/eval.test.ts + tests/fixtures/aiEval.ts   T2/T4/T5 evals with the fake model, personalisation personas
```

### Deviations from the spec, and why

- **CSP: no per-request nonce with `'strict-dynamic'` (spec 9.1).** With Cache Components every route is prerendered to a static shell at build time, and the shell's script tags cannot carry a request's nonce (Next documents nonces as incompatible with Partial Prerendering; in a production build Chrome blocked the `/signin` shell's scripts under `'strict-dynamic'`). Built instead: two static header policies by route group. Public pages (landing, `/demo`, `/privacy`, 404, the API) get a same-origin-only policy (`connect-src 'self'`, `frame-src 'none'`); sign-in, signed-in and share pages add exactly what Google sign-in needs (apis.google.com script, Identity Toolkit/Secure Token, accounts.google.com and the Firebase host frames, Google avatars). Both keep `script-src 'self' 'unsafe-inline'` for Next's bootstrap scripts (`'unsafe-eval'` only in `next dev`), `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`. Accepted because these pages render no user-supplied HTML (React escapes all text). `src/proxy.ts` therefore sets no CSP; it keeps the guard redirects and the share-token 404.
- **The instruct cache only hits for an identical history.** The previous turns are part of the cache key, and a successful answer stores a proposal that becomes the next turn, so a repeated instruction is normally a new request. The cache serves retries after a failed save and requests whose earlier proposals have expired; ideas, What-if and enquiry caches hit as usual.
- **Daily AI quota counts model calls only.** Cache hits, library and template fallbacks are free, so the quota message appears only when a real call would be made.
- **Demo What-if and enquiry drafts stay recorded/template.** Spec 5.10 lists only AI mode and ideas as sandbox AI; the demo's What-if uses the wedding's recorded smart re-plan and samples without one show the unavailable state.

### Build gate fixes (rerun)

- Added the missing route-handler tests listed above (they import the handlers directly), the route bindings for the new routes, and tests for `csp.ts`, `eventSettings.ts`, `ai/context.ts`, `httpAiClient.ts` and `EventSettings.tsx`.
- `tests/components/pages/newEvent.test.tsx`: the error summary takes focus on the next animation frame; the test now waits for that before clicking a summary link, so a slow frame can no longer steal focus back (it failed once on a loaded host).
- `vitest.config.mts`: `testTimeout` 15 s (from 5 s); the two gate timeouts (`routeGuard` skeleton, `eventRoutes` oversized body) were host-load timeouts, not hangs.
- `tests/unit/ai.test.ts`: the Gemini wrapper's `callTools` (function-calling config, empty reply) is now tested.
- Stale comments removed (`aiClient.ts`, `recordings.ts` still said the AI routes did not exist).
- Results on a quiet host (load ~3-8): lint, typecheck and build clean; `npm run test:coverage` 92 files / 1,185 tests passed, lines 99.2%, statements 98.3%, functions 97.5%, branches 93.6%; `npm run test:e2e` on port 3471 (desktop and mobile) 81 passed, 1 skipped (the keyboard-only skip-link test on mobile, by design), server stopped afterwards.

### Known gaps (later steps)

- The CSP keeps `'unsafe-inline'` scripts (above); revisit if Next ships nonce support for prerendered shells.
- Live Gemini is exercised by the fake model only in CI; the nightly real-model eval (spec 12.4) is not wired.
- Signed-in E2E (axe on workspace tabs and settings) still needs the test-only session route or the Auth emulator (QA phase).
- Per-minute and per-IP limits are per instance (spec 9.3); the demo daily cap is exact only with Firestore configured.

## Build summary (final integration check, 2026-10-29)

### Checks

- `npm run lint`, `npm run typecheck`: clean.
- `npm run test:coverage`: 92 files, 1,185 tests passed. Coverage (all of `src`): lines 99.16% (5005/5047), statements 98.3% (6198/6305), functions 97.47% (2048/2101), branches 93.56% (4568/4882).
- `npm run build`: clean (standalone output; public pages static, workspace and signed-in pages partially prerendered, API routes dynamic).
- `npm run test:e2e` (port 3471, desktop and mobile): 81 passed, 1 skipped (keyboard-only skip-link test on mobile, by design).
- Unconfigured production server (`next start -p 3300` with an empty environment: no Firebase, no Gemini, no APP_ORIGIN): `/`, `/demo`, `/demo/wedding`, `/demo/birthday`, `/demo/community`, `/privacy`, `/signin` return 200; `/api/health` returns `{"status":"ok","firestore":"not_configured","model":{"id":"gemini-flash-latest","location":"none","reachable":false}}`; an unknown path returns 404; `/dashboard` redirects to `/signin?next=%2Fdashboard`; `/signin` carries the "Sign-in isn't configured on this deployment" state. Demo sandbox AI (`POST /api/demo/{wedding,birthday,community}/ai/{instruct,ideas}`) returns each sample's recorded cards with `recorded: true`. The public CSP header is sent. No errors in the server log; server stopped afterwards.
- Repo hygiene: no TODO/FIXME or `any` in `src`, `tests`, `e2e`; tracked and unignored files total about 4 MB, SVG only (the PNGs under `coverage/` are generated and ignored).
- No fixes were needed in this pass.

### What works

- Public: landing, `/demo` with three samples (wedding, birthday, community) including the sandbox AI with recorded fallbacks, `/privacy`, 404, health check, all axe-clean in light and dark on desktop and mobile.
- Signed in (with Firebase configured): Google sign-in with session cookies, onboarding and profile, dashboard and event list, new event (template or Gemini plan), the workspace tabs (overview, budget, timeline, guests, vendors, ideas) with proposal cards, undo and review, AI mode (T2), What-if (T3), ideas (T4), enquiry drafts (T5), event settings, share links (`/s/[token]`), `.ics` export, account deletion.
- Guards: proxy redirects for signed-in pages, same-origin checks on writes, rate limits, daily AI quota, demo per-IP and daily caps, template/library fallbacks whenever the model is missing or fails.

### Known gaps for QA

- Signed-in E2E (axe on workspace tabs and settings, full sign-in flow) is not covered; needs the Auth and Firestore emulators or a test-only session route.
- Live Gemini is exercised only by the fake model; the nightly real-model eval (spec 12.4) is not wired.
- CSP keeps `'unsafe-inline'` for scripts (no nonce under Cache Components prerendering; see Step 5).
- Per-minute and per-IP limits are per instance; the demo daily cap is exact only with Firestore configured.
- Branch coverage (93.6%) is the lowest metric; remaining misses are mostly defensive branches in UI components and handlers.
- Not verified here: the Docker image build and a Cloud Run deploy in asia-south1 with real Firebase/Vertex credentials.

## QA fixes (Senior Software Engineer, 2026-10-29)

**Status:** done. Fixed QA-01 to QA-04, QA-06 to QA-14 and QA-16 at the root cause, each with a regression test; documented QA-15 (always run behind a trusted proxy) and QA-05 (no 404 status for someone else's event page: it would need a Firestore read in `proxy.ts` on every workspace navigation). Details and the per-finding table are in `docs/qa-report.md`, "Senior Software Engineer".

- Gates: lint, typecheck, `test:coverage` (1,545 tests, branches 95.32%, thresholds unchanged), build, `test:e2e` (81 passed, 1 skipped) green. `test:emulator` (23) and `test:e2e:emulators` (95; only the QA-05 marker is an expected failure) green as well, with no faked credentials.
- Behaviour changes worth knowing: a failed manual edit now always says so (a toast, or the form's own error); the signed-in workspace has an offline banner and disables the tab's controls while offline; caches and rate limits are per process (shared by pages and route handlers through `globalThis`), so a revoked or changed share link updates at once on that instance; `.ics` UIDs include the event id; the starter template puts the ceremony on the event date and the reception the day after; money fields keep a typed decimal point and drop paise; guest counts use Indian grouping everywhere; server components `await io()` before reading the clock, so production logs no prerender errors; Firestore uses gRPC under the emulator.
- Updated: the known gap "Signed-in E2E ... not covered" is closed (QA phase). Still open: QA-05 (above), live Gemini evals, the CSP's `'unsafe-inline'`, and per-instance limits across Cloud Run instances.

## QA fixes, round 2 (Senior Software Engineer, 2026-10-29)

**Status:** done. Fixed QA-03 (reopened: AI card decisions offline), QA-17 (silent Undo failures) and QA-18 (first E2E click before hydration), each with regression tests. QA-05 stays a documented trade-off. Details are in `docs/qa-report.md`, "Senior Software Engineer: fixes for QA-03, QA-05, QA-17, QA-18".

- Gates: lint, typecheck, `test:coverage` (1,560 tests, branches 95.47%, thresholds unchanged), build, `test:e2e` (81 passed, 1 skipped) green. The emulator suites were not run (Java 17 here; the Firestore emulator needs Java 21).
- Behaviour changes worth knowing: AI card and batch controls are disabled offline, and `decide()` refuses offline; a decision request that fails as a whole shows a toast. Every failed Undo says why. A network or server failure keeps the change undoable for a retry. The workspace's Undo buttons follow the store's history through `PlanStore.undoDepth()`, so after a conflict or a refused undo they disappear instead of reverting a different change. The server workspace's "Start from the starter template" is now undoable, as the review banner already promised.


## Penetration-test fixes (Senior Software Engineer, 2026-10-29)

**Status:** done. Fixed SEC-01 to SEC-13 and SEC-16 at the root cause, each with regression tests. SEC-14 is fixed for the cross-site case, and the forged-XFF case stays the trusted-proxy rule. SEC-15 is the accepted spec 9.1 trade-off, now documented in the README. The per-finding table is in `docs/qa-report.md`, "Senior Software Engineer: fixes for SEC-01 to SEC-16".

- Gates: lint, typecheck, `test:coverage` (1,820 tests, 0 known-bug markers, branches 95.52%, thresholds unchanged), build, `test:e2e` (117 passed, 3 skipped by design), `test:emulator` and `test:e2e:emulators` (111 passed; only the QA-05 marker is an expected failure), all green.
- Behaviour changes worth knowing:
  - `GET /api/profile` no longer creates the profile (only `POST /api/session` does). A verified session without a profile counts as signed out.
  - Route ids must match `^[A-Za-z0-9-]{1,40}$` (`isDocId` in `EventRepo`) or the route answers 404.
  - JSON bodies need the MIME type `application/json` exactly (parameters allowed).
  - `cleanText` drops bidi controls, and AI instructions and draft bodies are cleaned too (drafts keep their line breaks).
  - Caps: 100 events per account (409 `event_limit`, and the wizard shows the server's reason for a 4xx) and 50 stored proposals per event (the oldest are deleted).
  - Live demo AI needs the app's own `Origin`.
  - `script-src-attr 'none'` is in both CSPs.
  - The server refuses to start on Cloud Run (`K_SERVICE`) when an emulator host or Gemini/Vertex base-URL override is set (`src/instrumentation.ts`).
  - The runtime image keeps the app files root-owned, and the base image and CI actions are pinned by digest and SHA.
- Deviation from spec 9.1: the same-origin Firebase auth helper (`/__/auth/*`, `/__/firebase/init.json`) is now rewritten by `src/proxy.ts`, not by `next.config.ts` `rewrites()`. Next.js drops all routing headers from a config external rewrite, so that was the only way to give the helper `frame-ancestors 'self'` and `nosniff` (SEC-02). The step-4 claim that it had `frame-ancestors 'self'` is now true.
- Still open: QA-05, the CSP's `'unsafe-inline'` for Next's bootstrap scripts (now without the inline-handler sink), `report-to` (would need a collecting endpoint), per-instance rate limits across Cloud Run instances, and refreshing the pinned base-image digest for security updates.

## Penetration-test fixes, round 2 (Senior Software Engineer, 2026-10-29)

**Status:** done. SEC-17 is fixed: `safeNextPath` returns the fallback when `new URL` refuses a `?next=` value (a tab or newline that strips to an empty-host `//`), so the signed-in `/signin` guard and the post-Google-sign-in redirect no longer throw. There are regression tests in `webConfig.test.ts`, `guards.test.ts` and E2E `signed-in/security.spec.ts`. SEC-14's forged-XFF residual stays the trusted-proxy deployment rule, and SEC-15 stays the accepted spec 9.1 trade-off. Neither needed a code change. Gates: lint, typecheck, `test:coverage` (1,830 tests, thresholds unchanged), build, `test:e2e` (117 passed, 3 skipped by design) and `test:e2e:emulators` (Java 21; only the QA-05 marker fails, as expected) were all green. The details are in `docs/qa-report.md`.


## Manual QA fixes (Senior Software Engineer, 2026-10-29)

**Status:** done. Fixed all 23 assigned manual-QA findings at the root cause, each with regression tests: CO-01 to CO-08, MQW-01 to MQW-09 and BP-01 to BP-06. BP-07 is the same as CO-05, so it is fixed too. The per-finding table is in `docs/qa-report.md`, "Senior Software Engineer: fixes for the manual QA findings".

- Gates: lint, typecheck, `test:coverage` (1,882 tests; branches 95.31%; thresholds unchanged), build, `test:e2e` (port 3471: 119 passed, 3 skipped) and `test:e2e:emulators` (Java 21: 112 passed; only the QA-05 marker fails, as expected) are all green.
- Behaviour changes worth knowing:
  - **Starter template:**
    - Every starter vendor is linked to a budget line.
    - Function shares are weighted by kind: ceremony 45, reception 20, sangeet 15, others 10.
    - The wedding plan has Tent & lighting, Mehndi & makeup and Pandit & rituals lines, 9 vendors and 17 tasks.
    - Community plans have Decor & lighting and Activities & prizes.
    - `templateDraft(input, occasion)` adds festival notes and tasks (Diwali: diyas, rangoli, a crackers area), and the summary names the occasion.
  - **What-if:** Protect applies to Simple rescale and to every rebalance after a pinned row (`spreadWithFloors`), so a protected line never decreases. The before/after table keeps its full height in the sheet.
  - **Waiting suggestions:** the new `GET /api/events/[id]/proposals` lists unexpired proposals that still have undecided items. The workspace loads them into AI mode (and the Ideas strip) and counts them on the AI mode button.
  - **No AI configured:**
    - `GET /api/events/[id]` returns `ai.available`.
    - AI mode and What-if say AI isn't available and turn off the AI-only controls.
    - With no model, the routes answer `503 ai_not_configured` (a model failure is still `ai_unavailable`), and the client shows no Retry for it.
  - **Follow-ups:** "make that 15% instead" is re-measured in code from the amount before the earlier accepted change (`src/lib/plan/replaceEarlier.ts`), for signed-in and demo requests. An edited card's stored summary and its Undo name what was applied.
  - **Demo:** an instruction no recording covers gets a reply naming the covered examples, not unrelated cards. Recorded answers say "live AI is off in this demo" when there is no model, and recorded cards are labelled "Recorded".
  - **Focus:**
    - A busy `Button` uses `aria-disabled`, so focus stays on it.
    - A `Dialog` returns focus to its opener when its parent removes it.
    - Replaced controls move focus explicitly (`src/components/ui/focus.ts`), and Suggest ideas, Draft enquiry, Create link and Smart re-plan announce their result.
  - **Budget:** phones (below 640 px) get per-category cards with a Details expander. A refused cell edit reverts and shows its reason inline (`aria-invalid`).
  - **Money:** the spec 12.2 definitions are unchanged. Money paid above quotes is shown next to Remaining (Overview, Vendors) and on the share page, where it is also flagged per line.
  - **Onboarding:** the step is in `?step=`, so the browser's Back moves between steps.
  - **AI mode example chips** are built from the event's type, occasion, functions, lines, vendors and guests.
- Deviation from spec 12.2 wording: none in the definitions. "Paid above quotes" is an addition for treasurers (CO-07).

## Manual QA re-test fixes (Senior Software Engineer, 2026-10-29)

**Status:** done. MQR-01 to MQR-04 are fixed at the root cause, each with regression tests. Details are in `docs/qa-report.md`, "Senior Software Engineer: fixes for MQR-01 to MQR-04".

- Gates: lint, typecheck, `test:coverage` (1,903 tests; branches 95.34%; thresholds unchanged), build and `test:e2e` (port 3471: 121 passed, 3 skipped) are green. The emulator suites were not run, because only Java 17 is installed here. The new Smart re-plan layout assertion in `e2e/signed-in/journey.spec.ts` still needs a Java 21 run.
- Behaviour changes worth knowing:
  - **Sheets:** the sheet body's grid rows size to their content (`auto-rows-max content-start`), so nothing is drawn over the What-if table.
  - **"Instead" follow-ups:** they are measured from the history entry's amounts, not from proposal items. Undone changes don't count. A follow-up is rewritten only while the line still holds the earlier change's amount. A second "instead" keeps the original base. "rather" and "instead of" no longer trigger a rewrite.
  - **History:** entries record the `proposalId` they were decided on. `QueryOptions` has a `limit`.
  - **Demo status route:** the new public `GET /api/demo/[sample]/ai` returns `{ live }`. With no live AI, the demo offers only its recorded chips and says so up front.
  - **Replies with no cards:** they show no Recorded tag and no "0 valid", and they are announced as "Answer ready".
  - **What-if trade-offs:** they store "New total ₹X[: ask]" as their instruction and are headed "N trade-offs from What-if: …", also when restored in AI mode.
- Deviation: spec 12.1 gains one public, read-only route, `GET /api/demo/[sample]/ai`.


## Open QA findings closed (Senior Software Engineer, 2026-10-29)

**Status:** done. QA-19, QA-20, QA-17 (retry), QA-05, MQR-02 (d), MQR-05 and MQR-06 are fixed, each with regression tests. SEC-14 is an accepted, documented risk. Details are in `docs/qa-report.md`, "Senior Software Engineer: fixes for QA-19, QA-20, QA-17, QA-05 and MQR-02, MQR-05, MQR-06".

- Gates, all green:
  - `npm run lint`, `npm run typecheck` and `npm run build`.
  - `npm run test:coverage`: 1,924 tests. Branches 95.38%, lines 99.36%. Thresholds unchanged.
  - `npm run test:e2e`: 121 passed, 3 skipped.
  - `npm run test:emulator`: 23 passed.
  - `npm run test:e2e:emulators`: 114 passed, with no known-bug markers left.
- Behaviour changes worth knowing:
  - **One request at a time per tab:** `ServerPlanStore` serialises its requests, so each carries the version the previous answer left. `WorkspaceContext` (edit, decide, undo) and `AiSession` (card decisions) queue too, so batches and turns are built from current state.
  - **Undo:** a second click while an undo is in flight is ignored, and Undo buttons show busy. A failed Undo from the Saved toast offers "Try again" while the change can still be undone.
  - **Someone else's event is a real 404 on a full page load.** `src/proxy.ts` asks `eventPageMissing`, which costs one event read per hard load of `/events/{id}[/tab]`. RSC tab switches are not checked.
  - **Demo "instead":** the instruct route accepts `replacingOps` (indexes of applied ops that came from an "instead" answer), so a second "instead" keeps the original base.
  - **"Replaces your earlier change":** shown only by the server's rule (an "instead" instruction, and the line still holds the earlier change).
- Deviation: spec 12.1's demo instruct body gains the optional `replacingOps` field (default `[]`).


## Project audit fixes (Senior Software Engineer, 2026-10-29)

**Status:** done. Every blocker and every improvement from the Project Auditor's report is addressed; nothing was skipped. Two items were done in a narrower or different form than suggested, with the reason given below.

- Gates, all green (ports 3510, 3561-3562 and 3580-3584, all stopped afterwards; scratch output deleted; `.next` rebuilt at the end as the only build directory):
  - `npm run lint`, `npm run format:check` (new), `npm run typecheck` (also from a state with no `.next`, `next-env.d.ts` or `tsconfig.tsbuildinfo`) and `npm run build`.
  - `npm run test:coverage`: 109 files, 1,931 tests. Statements 98.59%, branches 95.36%, functions 97.59%, lines 99.33%. Thresholds unchanged.
  - `npm run test:e2e` (`E2E_PORT=3510`): 123 passed, 3 skipped by design.
  - `npm run test:emulator`: 23 passed. `npm run test:e2e:emulators` (`E2E_PORT=3561 FAKE_GOOGLE_PORT=3562`): 114 passed. Both ran with Java 21 and a scratch copy of `firebase.e2e.json` on ports 3580-3584 (the repo file is unchanged).
- Blockers:
  - **Typecheck on a fresh checkout:** `"typecheck": "next typegen && tsc --noEmit"`, as in the Next CLI docs. `next typegen` writes `.next/types` and `next-env.d.ts`, so `LayoutProps`/`PageProps` exist without a build.
  - **Sign-in on Cloud Run:** option (a). A committed `.env.production` holds the four `NEXT_PUBLIC_FIREBASE_*` keys with empty values for the owner to fill (no values were invented). `.gitignore` and `.dockerignore` un-ignore it with `!.env.production`. The Dockerfile's `ARG`s lost their `""` defaults and the `ENV` copy: `@next/env` never overrides a variable that is already set, even to an empty string, so the old empty `ENV` would have hidden the file. A real `--build-arg` still overrides it. Both Playwright configs set the four values to `""` for their builds (`NO_FIREBASE_WEB_CONFIG`), so the suites keep testing the "not configured" build after the owner fills the file. README "Deploy" now documents this flow, including the redeploy once the host is known.
  - **README top:** a live-demo line, demo-video and LinkedIn placeholders (marked for the owner in an HTML comment; the service is not deployed yet).
  - **LICENSE:** MIT, plus `"license": "MIT"` in `package.json`.
- Improvements:
  - **Efficiency:** `ServicesProvider` moved from the root layout into the `(app)` and `(auth)` layouts, the only places `useServices` is called (the demo and share pages build their own workspace). First-load JS on `/`, `/privacy` and `/demo` is now 178 KB gzip, down from the audited 246 KB.
  - **Test doubles out of `src`:** `stubs.ts`, `stubPlans.ts`, `StubWorkspaceRepository`, `RECORDING_SAMPLE`, `StubAuthClient`, `InMemoryEventsRepository` and `InMemoryProfileStore` were only used by tests, so they moved to `tests/helpers/stubServices.ts` rather than being renamed to `demoPlans.ts`. `workspaces.ts` no longer imports `LocalPlanStore`, `RecordedAiClient` or the demo fixtures.
  - **Prettier:** `prettier@3.9.10` (exact), `.prettierrc.json` (`printWidth` 140, the house style), `.prettierignore` (docs, Markdown, HTML, recorded model outputs, generated files), `format` and `format:check` scripts, `format:check` in `npm run check` and CI. A one-time format pass touched 255 files. Lines over 140 characters in `src`, `tests` and `e2e` went from 538 to 67; the rest are long strings and comments that Prettier does not break. `tests/unit/e2eIsolation.test.ts` strips the formatted multi-line `TEST_ONLY_ENV` array with an equally strict pattern.
  - **Splits:** `BudgetTab.tsx` (463 lines) is now `BudgetTab.tsx` (tab, add category), `BudgetTable.tsx` (category table and phone cards), `FunctionShares.tsx` (by-function table) and `BudgetRowDialogs.tsx` (row menu and rename, note and delete dialogs). The idea library's data is `src/lib/domain/ideaLibrary.json`, parsed once with a Zod schema at module load, so a bad category, cost basis, effort, event type or occasion fails loudly instead of losing the compile-time check the `idea(...)` calls had.
  - **README:** real test counts, "How this meets the brief" (budgets, timelines, vendor checklists and ideas against wedding, birthday and community, taken from the demo samples), "Google Cloud services used", a Mermaid architecture diagram, `format:check`, and a License section. `docs/README.md` explains the spec, design system, mockups, build log and QA report.
  - **Repo hygiene:** `docs/setup-steps.html`, `docs/master-plan.html` (internal process pages; the first held a personal path) and `docs/product/spec.html` (a copy of `spec.md`) were moved out of the repo to a private folder outside the repo, not deleted, so the owner keeps them. No personal absolute path remains in the repo.
  - **`.dockerignore`:** also excludes `docs`, `e2e`, `tests`, `coverage`, `playwright-report-emulators`, `.github`, `*.log` and `.DS_Store`. No root config imports from these folders, and `next build` still type-checks the app.
  - **Cloud Run settings:** documented, not in code: `--min-instances=1 --max-instances=3 --cpu-boost` and `GEMINI_MODEL=gemini-2.5-flash` with the `/api/health` `model.reachable` check. The code default (`gemini-flash-latest`) is unchanged, because changing it would also change local development with a Gemini API key, and the right Vertex id should be confirmed against the live project.
  - **Stale-cookie lockout:** fixed in the proxy, not the server guard: Next does not let a layout or page set cookies, so a guard could not clear one. On `/` and `/signin`, a request with a `__session` cookie now gets a local check (`sessionCookieStale`, signature and expiry only, no network call). A cookie that does not verify, or any cookie on a deployment without Firebase, is cleared with `Set-Cookie: __session=; Max-Age=0` and the page renders instead of redirecting. A valid cookie still skips the landing page. If the check itself fails, the old behaviour stays. New unit tests in `tests/unit/guards.test.ts` and a public E2E test in `e2e/pages.spec.ts`.
  - **Demo copy:** the Ideas tab tag now reads "Sample: try it, changes are not saved" with an info icon instead of a lock.
