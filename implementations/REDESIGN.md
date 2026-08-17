# PayPro — frontend redesign

Response to `project.md`. This is the record of what was decided and why; the
implementation is in `client/src`. Rationale that belongs next to code lives in
the code — every file carries a header explaining what it replaced and what was
wrong with it.

---

## 1. Executive summary

PayPro's backend is in better shape than its frontend. Several capabilities are
fully built server-side and have **no user interface at all**: session listing,
device revocation, login history, sign-out-everywhere, and notification
categorisation. The single highest-value change in this redesign was not a
design decision — it was noticing that `/api/security/*` had never been called.

The frontend had three structural problems.

**It was unusable on a phone.** The sidebar was `fixed w-64` at every
breakpoint, with a permanent `ml-64` on the content column. On a 390px screen
the navigation covered two-thirds of the viewport and pushed the content off the
right edge. There was no mobile navigation of any kind. For a payments product,
this is close to disqualifying.

**It asked users to trust numbers it presented carelessly.** Money direction was
communicated by colour alone. Amounts were formatted seven different ways in
seven different components. The dashboard flashed `₹0` while loading. There were
two separate transaction histories describing the same money, and nothing said
which was authoritative.

**It had no confirmation step on transfers.** One click on a screen where the
recipient was collapsed into a dropdown moved real money irreversibly to a real
person.

Alongside these, one live bug was found and fixed during browser testing:
**every hard refresh signed the user out**, because the bootstrap called a
protected endpoint before refreshing the token and the resulting `NO_TOKEN` 401
was — correctly — treated as unrecoverable. See §13.

The redesign keeps every backend contract unchanged. One backend addition is
recommended, not made (§14).

---

## 2. Product audit

| Feature | Verdict | Reasoning |
|---|---|---|
| Authentication | **Simplify** | Logic was sound. The screens were split-panel marketing layouts wrapped around two inputs — persuasion aimed at someone who has already decided. Rebuilt as a single 380px column. |
| JWT + refresh rotation | **Keep** (bug fixed) | Correct design, memory-only token. The *bootstrap* was broken — see §13. |
| Wallet balance | **Redesign** | Was one of four equal-weight stat tiles, competing with lifetime aggregates nobody opens a wallet to check. Now the page's headline, with a privacy toggle. |
| Razorpay top-up | **Keep, reframe states** | Integration untouched. Success and failure were toasts that vanished in four seconds; a failed payment now persists and answers *"was I charged?"* in its first sentence. |
| P2P transfer | **Redesign** | No confirmation step. Now recipient → amount → **review** → result. |
| Recipient picker | **Redesign** (bug fixed) | Fetched `/users/all` once and filtered client-side. That endpoint paginates at 25, so searching for anyone outside the first 25 alphabetically returned "no results" for a user who existed. Search is now server-side. |
| Transaction history | **Merge** | Merged with payment history into one Activity ledger. Grouped by day, filters and search in the URL. |
| Payment history | **Merge** → Activity | Two ledgers for the same money, with different columns and date formats. Top-ups are a *filter*, not a second history. |
| Manual "Add transaction" | **Remove** (demoted) | Writes a ledger row corresponding to no movement of money, so history and balance can disagree with no way to tell which is lying. Unlinked from navigation, kept routable, labelled honestly. Recommendation: remove or add a `source` flag. |
| AI categorisation | **Keep** | Server-side, invisible, useful. The best AI here is the AI nobody sees. |
| AI fraud detection | **Keep, reshape** | Valuable — but must never *present* as AI. A risk warning framed as a model's opinion teaches people to ignore risk warnings. |
| AI insights | **Keep, relocate** | The strongest AI case in the product. Moved to Insights and made opt-in: each call is a rate-limited, billed Gemini request. |
| AI chat assistant | **Keep, demote** | Was a pulsing gradient button pinned above the navigation on every screen, and its history request fired on every page load. Now a sheet on Insights. |
| Push notifications | **Keep, prioritise** | The backend has always written a `type` (Security/Transfer/Payment/Reminder/System); the frontend ignored it and rendered five identical grey cards sorted only by recency. Now sorted by urgency — security outranks recency. |
| OTP verification | **Simplify** | Added a resend cooldown (the button was always live, so an anxious user could invalidate their own codes into a rate-limit lockout) and made the screen show *what is being authorised*. |
| Security centre | **Build** | Did not exist on the frontend. Fully backed by existing endpoints. |
| Profile & settings | **Split** | 481 lines mixing display-name editing with the 2FA toggle that guards your money, at equal visual weight. Split by risk. |

---

## 3. Core product philosophy

1. **The user's money is the content. Everything else is chrome.** The old
   topbar spent ~180px on every screen greeting someone who had already read the
   greeting.
2. **Never signal with colour alone.** Every amount carries an explicit `+`/`−`.
   Every status carries a word.
3. **Say what happened, then say what to do.** Error states answer *is my money
   safe?* before *what went wrong?*
4. **Irreversible actions get a review step.** Always.
5. **AI is labelled, opt-in, and never the last word on a warning.**
6. **A control that pretends to store something must store it.** (This is why
   the transfer "note" field was removed — see §14.)

---

## 4. Information architecture

Four primary destinations — the most that fit a mobile tab bar without
truncating, and every extra one makes the others harder to find.

```
Home        how much do I have, and what just happened?
Money       move some            → Send · Add money
Activity    what happened before? (one ledger)
Account     is this safe, set up how I want? → Security
```

Secondary (desktop sidebar / linked from Home): **Insights**, **Security**.

Desktop and mobile expose the *same four destinations in the same order*, so a
user who learns the product on a phone does not relearn it on a laptop. The
extra vertical space on desktop is spent on secondary entries and the primary
action, not on flattening more destinations into the top level.

Legacy paths redirect rather than 404 (`LEGACY_REDIRECTS` in
`constants/routes.js`) — bookmarks and push-notification deep links still work.

---

## 5–6. Journeys and screens

Each screen's purpose, prior problems, and reasoning are documented in the file
header of its implementation. The map:

| Screen | File |
|---|---|
| Landing | `pages/Landing.jsx` |
| Sign in / up / verify | `pages/auth/` |
| Home | `pages/Home.jsx` |
| Money hub | `pages/money/MoneyHub.jsx` |
| Send (4 steps) | `pages/money/SendMoney.jsx` |
| Add money | `pages/money/AddMoney.jsx` |
| Transfer verification | `pages/money/TransferVerify.jsx` |
| Activity | `pages/Activity.jsx` |
| Transaction receipt | `features/transactions/TransactionDetailSheet.jsx` |
| Insights + AI | `pages/Insights.jsx` |
| Account | `pages/account/Account.jsx` |
| Security centre | `pages/account/Security.jsx` |

Two are worth calling out.

**Send money.** The review step is the centrepiece. It answers *who*, *how
much*, and *what will I have left* before anything is irreversible, and states
plainly that transfers cannot be reversed. Verified end-to-end in a browser:
the overspend guard blocks the Review button with a field-level error, the
balance-after arithmetic is correct, and the transfer posts with an idempotency
key.

**Transaction receipt.** Did not exist. A row was a dead end — no reference
number, no way to copy it, nothing to quote to support. "Can you prove this
payment happened?" is a question a finance product must be able to answer.

---

## 7. Design system

`client/src/styles/tokens.css`. Two layers, and the split is what makes light
mode possible without touching a component:

- **Palette** — raw ramps (`--pp-blue-500`). Never used directly.
- **Semantic** — `--color-surface`, `--color-positive`, `--color-text-muted`.
  The only layer components may use. `[data-theme]` re-points these and the
  whole product follows.

Highlights:

- **Light is the default.** This is a product about ledgers, and long columns of
  numbers are easier to scan on a light surface. Dark is a first-class equal,
  not the house style. Applied before first paint by an inline script, so
  dark-mode users get no white flash.
- **Money tokens are named by meaning** (`positive`/`negative`, not
  green/red), so a component says what it means and the theme decides how that
  looks. Dark mode uses lighter ramp entries because the light-mode 700s fail
  contrast on a dark surface.
- **Three elevation levels.** The old UI had six hand-written shadows plus
  `backdrop-blur-xl` on every panel — expensive, and translucency means the
  contrast of text depends on whatever is behind it, so no ratio can be
  guaranteed.
- **One focus treatment** for the whole product. Several controls previously had
  `focus:outline-none` with no replacement, making parts of the app unusable by
  keyboard.
- **Motion tokens**, with a blanket `prefers-reduced-motion` kill (reduced to
  1ms, not 0, so `transitionend` handlers still fire).

---

## 8. Component library

`components/ui/` — imported through the barrel, never by path.

`Button`/`IconButton`, `Card`/`CardHeader`, `Amount`/`LedgerAmount`, `Badge`,
`Avatar`, `Field`/`Input`/`AmountInput`/`Select`, `Sheet`/`ConfirmSheet`,
`SegmentedControl`, `Switch`, `List`/`ListRow`/`ListGroupHeader`/`DetailRow`,
`Skeleton`/`SkeletonRows`, `Spinner`, `EmptyState`, `ErrorState`.

Three that carry unusual weight:

**`Amount`** — every rendered sum of money goes through it. That is a rule. It
guarantees the `+`/`−` sign, tabular figures, optically-sized fractions, and a
screen-reader string that reads "500 rupees received" rather than "plus rupee
five hundred".

**`Sheet`** — bottom sheet on mobile, dialog on desktop, one implementation.
Portalled, focus-trapped in both Tab directions, restores focus on close, locks
body scroll with scrollbar compensation.

**`AmountInput`** — `inputMode="decimal"`, not `type="number"`. The latter shows
the *telephone* keypad on iOS and attaches a scroll-wheel handler on desktop, so
scrolling the page with the cursor over the field silently changed the amount
about to be sent.

`EmptyState` distinguishes `first-run` from `no-results`. Conflating them means
telling a user "you have no transactions" when they have plenty and a filter
matched none — false, and alarming when it is your own money.

---

## 9. Frontend architecture

```
app/          config, theme provider, navigation model
components/   ui/ (primitives) · shell/ (chrome) · layout/ · feedback/ · forms/
features/     domain slices: transactions, transfer, wallet, ai, insights,
              security, account
pages/        routed screens, grouped by section
services/     api/ (client, interceptors, endpoints) · auth/ · firebase/
hooks/        useQuery, useDebouncedValue, useDisclosure
constants/    routes, transactions, wallet, notifications, audit, app
utils/        pure helpers — formatters, validation, password, errors
lib/          DOM adapters — cn, downloadBlob, loadExternalScript, idempotency
```

**State.** Context holds only what is genuinely global: token, profile, balance,
recent transactions. It previously also held `allTransactions` — the full result
of an unbounded history fetch — alive for the session and re-rendering every
consumer on change. Page data belongs to pages, via `useQuery`.

**`hooks/useQuery`** is deliberately not a caching library. It provides the four
things every screen needs done consistently: a real `error` value (not a toast
that vanishes and leaves an empty list reading as "you have no transactions"),
`retry`, request cancellation with stale-response discarding, and `refreshing`
distinguished from `loading` so a background refresh does not blank readable
data.

**Code splitting.** Only Landing and Login are eager. Recharts loads on Insights
alone.

---

## 10. Motion

Durations 80–380ms; entrances ease-out, confirmations spring. Motion explains
what changed — a balance update pops, a sheet rises from the edge it will
dismiss to, list rows stagger by 40ms. The notification badge is a **count, not
a pulsing dot**: the old `animate-ping` was permanent peripheral motion that
conveyed "something" without conveying how much, and could not be switched off.

---

## 11. Accessibility

Targeting WCAG 2.2 AA.

- One `<h1>` per page — verified in-browser across all six authenticated routes.
  Several screens previously rendered an `<h1>` *underneath* the topbar's
  `<h1>`.
- Skip link as the first tab stop.
- `Field` wires `htmlFor`, `aria-describedby` and `aria-invalid` from one place;
  errors are `role="alert"`. Labels were previously sibling `<p>` tags, so taps
  did nothing and screen readers announced "edit text, blank".
- Sheets: focus trapped both directions, focus restored, `aria-modal`.
- `SegmentedControl` is a tablist with roving tabindex — the old filter chips
  made keyboard users Tab through all six filters to reach the list beneath.
- All interactive rows are `<button>`/`<a>`, never `<div onClick>`.
- Controls ≥44px on touch surfaces; sized by height, not padding, so it is
  verifiable.
- Colour is never the only signal: amounts carry signs, statuses carry words,
  selection carries a check, the security bar is restated in words.
- `prefers-reduced-motion` honoured globally.

---

## 12. Performance

| | Before | After |
|---|---|---|
| Entry chunk | 261 kB (contained react-dom) | **74 kB** |
| Recharts on first paint | yes, on the dashboard | no — Insights only |
| Fonts | 2 families, full variable range + 18 static cuts | 1 family, 4 weights |
| Icons | tree-shaking defeated by a namespace import (~500 kB) | named imports |

`manualChunks` was rewritten to match by path rather than by package name: the
list form matched `react-dom` but `main.jsx` imports `react-dom/client`, a
different module id, so ~130 kB of react-dom sat in the one chunk invalidated by
every deploy.

Also: Activity uses load-more rather than prev/next (the old pager discarded the
previous page, so scrolling back was a round trip); search is debounced and
written to the URL with `replace` so Back does not walk through the user's
typing one letter at a time.

---

## 13. Bug found and fixed during verification

**Every hard refresh signed the user out.**

The access token is memory-only (correct — not readable by an XSS payload), so
after a reload there is no token, only the httpOnly refresh cookie. The provider
called `/users/profile` first and relied on the interceptor to notice the 401
and refresh. It never worked: with no token the request carries no
`Authorization` header, so the server answers `code: 'NO_TOKEN'` — not
`TOKEN_EXPIRED` — and the interceptor correctly treats an unrecognised code as
unrecoverable and ends the session. The guard's "Restoring your session…"
described something that could never succeed.

Fixed by refreshing explicitly before any authenticated request
(`services/auth/refreshSession.js`), shared with the interceptor so there is one
implementation. The interceptor's stricter rule is left intact — once the app is
running, a request carrying no token is a bug, not a session to restore.

Also fixed in passing: currency dropped trailing zeros (`₹48,250.5`), sessions
rendered every device as a laptop, and the theme control was clipped on mobile.

---

## 14. Recommended backend change (not made)

**Add an optional `note` to `POST /transactions/transfer`.** Currently the
endpoint accepts only `recipientId`, `amount` and `idempotencyKey`, and writes
its own description. A note field was built, then removed: it would have
collected text, echoed it on the review step, and silently dropped it. A control
that pretends to store something is worse than no control.

Roughly: sanitise a ≤80-char string, persist it on both ledger rows, return it
in history. The UI is ready for it.

**Second, lower priority:** if manual transaction entry stays, add
`source: 'manual' | 'ledger'` so those rows can be visually separated and
excluded from balance reconciliation.

---

## 15. Roadmap

Phases 1–4 (architecture, design system, navigation, core screens), 5 (AI),
6 (security) and 8 (accessibility) are **implemented**.

Remaining, in priority order:

| # | Item | Value | Complexity | Risk |
|---|---|---|---|---|
| 1 | Transfer notes (backend, §14) | High — most-requested affordance in P2P | Low | Low |
| 2 | Passkeys | High — phishing-resistant; already surfaced as "coming soon" | High | Medium |
| 3 | Saved recipients / recents | High — most transfers are repeats | Medium | Low |
| 4 | Scheduled + recurring transfers | Medium | Medium | Medium |
| 5 | Spend-by-category over time | Medium — categories exist and are unused analytically | Medium | Low |
| 6 | List virtualisation in Activity | Low until users exceed ~500 rows | Low | Low |
| 7 | Offline queue for reads | Low | High | Medium |

Deliberately **not** recommended: gamification, social feeds, crypto,
budgeting-as-a-second-app, or any further AI surface. The AI here already sits
where it creates value.

---

## Verification

`npm run build` passes. `npx eslint src` reports 0 errors (6 warnings, all the
standard "context file also exports a hook" fast-refresh notice).

Driven in a real browser via Playwright: all six authenticated routes render and
each has exactly one `<h1>`; session restore works; light and dark both render
correctly at 390px and 1280px; and the full send flow was exercised end to end —
overspend blocked with a field error, balance-after correct, transfer posted
with an idempotency key, success screen shown.
