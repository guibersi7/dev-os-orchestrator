# Standup — design handoff

**Standup · the developer OS.** Connects GitHub, Slack, Linear, Jira, Trello, Notion and Calendar, normalizes everything into one `WorkEvent`, and answers a single question on every screen: **"What should I do now?"**

Dark-only. Fourteen screens, all designed. This package is the source of truth for the UI layer.

---

## 1. How to read this package

| File | What it is |
|---|---|
| `Boards.dc.html` | Index of every board, with live thumbnails. **Open this first.** |
| `Standup-landing-and-onboarding.dc.html` | Landing page + the full activation flow (7 screens) |
| `Standup-dashboard.dc.html` | Today: brief + focus queue + context rail (4 states; opens in the chosen Command nav) |
| `Standup-wave-2.dc.html` | PR detail, issue detail, timeline, weekly summary, chat (5 screens) |
| `Brand.dc.html` | Naming exploration and the mark |

These are **design references written in HTML** — working prototypes showing layout, copy, states and motion. They are **not production code to copy.** They use a custom streaming-template runtime (`<sc-for>`, `<sc-if>`, `{{ }}`, a `Component` logic class) that is an authoring detail of the design tool, not part of the product.

Recreate them in the target stack (Next.js App Router + TypeScript + Tailwind assumed). Read them for structure, exact copy and pixel values; write idiomatic components.

Each prototype has a **rail pinned to the bottom of the viewport** that switches between screens and states. It is a review affordance — do not build it.

**Fidelity is high.** Colors, type, spacing, copy and states are final-intent. Where this README and the HTML disagree, the HTML wins.

---

## 2. Tokens

### Color — dark only

There is no light theme. Do not build one, do not add a toggle.

| Token | Hex | Use |
|---|---|---|
| `accent` | `#1D9C4C` | Primary actions, the mark, progress fill, selection |
| `accent-hover` | `#23B85A` | Primary hover (lightens, never darkens) |
| `accent-text` | `#4FD98C` | The accent **as text or small icon** — never `accent` for type on dark |
| `accent-strong` | `#7FE3A8` | Active nav label, link hover |
| `accent-surface` | `#0E2418` | Accent-tinted fill (chips, callout cards) |
| `accent-surface-2` | `#113022` | Active nav pill |
| `accent-border` | `#1C4A31` | Border on accent surfaces |
| `info-border` | `#2B3B6E` | Border on the "what this unblocks" / recommendation cards |
| `info-surface` | `#0E1420` | Fill for the same |
| `bg-base` | `#080C15` | App background, page base |
| `bg-alt` | `#0B0F1A` | Chrome (top bar, rails), alternating landing bands |
| `surface` | `#121826` | Cards |
| `surface-2` | `#101623` | Mid-depth (orbit middle ring pills) |
| `surface-3` | `#0E1420` | Far depth (orbit outer pills) |
| `surface-hover` | `#141B2A` | Row hover |
| `surface-sunken` | `#0F1421` | Card footers |
| `tile` | `#1A2130` | Neutral icon tiles, avatars, active chips |
| `tile-2` | `#161C2B` | Icon-rail hover, unpressed avatar |
| `line` | `#212938` | Default border |
| `line-soft` | `#1C2432` | Chrome divider |
| `line-softer` | `#1B2230` | Card header divider |
| `line-hair` | `#161C2B` | Row divider inside cards |
| `line-strong` | `#2E3849` | Outline buttons, dashed empty-state borders |
| `line-strongest` | `#39435A` | Hover border, active chip border |
| `text` | `#E9EDF7` | Primary |
| `text-2` | `#9AA4BA` | Body |
| `text-3` | `#8C96AD` | Secondary / reason lines |
| `text-4` | `#79839B` | **Metadata floor** — mono labels, ages, counts |
| `text-disabled` | `#4A5468` | Separators, disconnected-source icon tint. **Never for text.** |
| `danger` | `#FF6B8A` | Priority bar on blocked, error icon |
| `danger-text` | `#FF8FA6` | Error text, blocked lane chip |
| `danger-surface` | `#22141C` | Blocked chip fill |
| `danger-surface-2` | `#150F16` | Cycle-risk card fill |
| `danger-border` | `#3A2130` | Blocked chip border |
| `warn-text` | `#D9B871` | Decision lane, stale sync, risk bullets |
| `warn-surface` | `#231D12` | Decision chip fill |
| `warn-border` | `#3A3220` | Decision chip border |

**Contrast floor.** `#79839B` on `surface` is 4.67:1 and is the lowest color allowed on informational text of any size. `#8C96AD` for anything longer than a label. Earlier drafts used `#545F79`/`#6A7489` for 11px metadata — those failed and were replaced; do not reintroduce them.

### Typography

- **UI:** Geist — 400/500/600. Self-host in production.
- **Mono:** Geist Mono — 400/500.

Mono is **semantic, not decorative**: machine-generated data is mono (ages, counts, repo paths, event types, timestamps, keyboard hints, IDs), human language is sans. Never set a sentence in mono; never set a count in sans.

| Role | Spec |
|---|---|
| Landing hero H1 | 54 / 1.04 / 600 / -0.035em |
| Landing section H2 | 38 / 1.12 / 600 / -0.032em |
| Screen H1 (app) | 24–26 / 1.25 / 600 / -0.028em |
| Weekly synthesis | 19 / 1.5 / 400 / -0.018em |
| Card title | 13.5–14 / 600 / -0.01em |
| Queue row title | 14 / 500 / -0.011em |
| Body | 13–15 / 1.5–1.6 |
| Reason line | 12.5–13 / 1.45 / `text-3` |
| Metadata (mono) | 10.5–12 / `text-4` |
| Eyebrow (mono, upper) | 10–11 / .05–.08em tracking |
| Lane chip | 10.5 / 500 / .03em / uppercase |

Headlines `text-wrap: balance`; paragraphs `text-wrap: pretty`.

### Geometry

- Radius: 5–6 chips · 7–9 buttons, inputs, rows · 11–13 cards · 999 pills.
- Borders are 1px and do the separating. Shadows only on: floating menus `0 18px 44px -20px rgba(0,0,0,.9)`, the command input `0 8px 24px -18px rgba(0,0,0,.9)`, hero/orbit core.
- Card interior padding 13–16px; page padding 26–32px; landing bands 96–108px.
- Content widths: dashboard 1240 (min 900) · PR/issue 1180 (min 880) · timeline 980 · weekly 900 · chat 780 · landing 1180.

### The mark

A **ranked queue**: rounded square in `accent` holding three horizontal bars, stacked and centered, each shorter and more transparent than the one above (`#EEF3FF` at 1 / .62 / .34).

```tsx
export function StandupMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Standup">
      <rect width="24" height="24" rx="7" fill="#1D9C4C" />
      <rect x="5.5" y="7.2"  width="13"  height="2.6" rx="1.3" fill="#EEF3FF" />
      <rect x="5.5" y="10.7" width="9.4" height="2.6" rx="1.3" fill="#EEF3FF" fillOpacity=".62" />
      <rect x="5.5" y="14.2" width="5.8" height="2.6" rx="1.3" fill="#EEF3FF" fillOpacity=".34" />
    </svg>
  );
}
```

`rx = size * 0.29`. Minimum 16px; below that keep only the top bar. Reversed (on accent): square `#0B2E19`. Monochrome: square `text`, bars `bg-base`. Wordmark Geist 600 at -0.03em, cap height = mark height, gap = `size * 0.4`. Favicon/PWA/OG all use the mark.

### Product icons

Every source is shown with its **real brand icon** — GitHub, Slack, Linear, Jira, Trello, Notion, Calendar. A generic glyph standing in for a product (`MessageSquareText` for Slack) is an abstraction the user never asked for: they know the logo, and recognizing it is half the work of scanning a queue row.

**Current repo state — two competing systems, unify them.**

| Where | Today | Should be |
|---|---|---|
| `features/integrations/catalog.ts` | lucide generics (`GitPullRequest`, `MessageSquareText`, `ListTodo`) — this is what the product UI consumes | the real brand icon |
| `components/marketing/orbit-section.tsx` | `simple-icons` (`siGithub`, `siJira`, `siNotion`…) — landing only | the same shared map |

One source of truth, consumed by both:

```
apps/web/src/features/integrations/icons/
  slack.svg     ← from Slack's official brand kit, normalized
  index.ts      ← Record<Service, IconComponent>: six from simple-icons + slack local
```

**Slack is not in simple-icons** — it was removed at Slack's own request, along with a few other brands that restrict redistribution. It is not a packaging bug and it will not come back. Ship Slack's one-color mark from their brand kit as a local asset, normalized to the same contract as the rest: `viewBox="0 0 24 24"`, single path, `fill="currentColor"`. Then it accepts the same depth tint as every other icon with no special case in the component. Do not use the multicolor version — it breaks the palette.

Tint by depth: `accent-text` for the live/primary source, `#9AA4BA` normally, `#8C96AD` at one remove, `#4A5468` when disconnected.

lucide-react stays, but for **UI** icons only — search, settings, plug, users, arrows. Never to represent a product.

---

## 3. Data model

Everything rendered is a normalized `WorkEvent`. **No feature reads a raw provider payload.**

```ts
type Service = "github" | "slack" | "linear" | "jira" | "trello" | "notion" | "calendar";

type WorkEvent = {
  id: string;
  workspaceId: string;
  service: Service;
  type: string;                 // "pull_request.review_requested", "issue.blocked", …
  title: string;
  summary: string;
  actor: string;
  source: string;               // repo, project, channel
  priority: "low" | "medium" | "high";
  occurredAt: string;           // ISO 8601
  externalUrl?: string;
  metadata: Record<string, unknown>;
};
```

Presentation shapes are derived **server-side** and handed to dumb components:

```ts
type Lane = "action" | "waiting" | "blocked";

type QueueItem = {
  id: string; service: Service; title: string;
  reason: string;      // ONE sentence: who is waiting + what is downstream
  age: string;         // pre-formatted: "20m", "2d"
  source: string;
  priority: "low" | "medium" | "high";
  lane: Lane;
  action: { label: string; href: string; primary: boolean };
};
```

**`reason` is the product.** One sentence, ≤110 chars, past-tense facts, names who is blocked and what sits downstream. Never "AI", never "we think", never a confidence score. Good: *"Ana pediu na segunda e não entregou nada desde então. DEV-18 e a release mobile estão atrás desse merge."*

### Copy rule — Portuguese pluralization

**Never singularize programmatically.** No regex, no suffix stripping — `"decisões".replace(/e?s$/,'')` yields `"decisõ"`, and adjectives must agree too. Builders emit explicit pairs:

```ts
{ n: 1, one: ['decisão', 'parada há 4h'], many: ['decisões', 'paradas há 4h'] }
```

### Source catalog

Setup is generic over a catalog. Adding an eighth source must require **zero new screens**.

```ts
type SourceDef = {
  id: Service; tag: string;       // 2-letter fallback: gh, sl, li, ji, tr, no, ca
  name: string; unlocks: string;  // one line, shown in the connection center
  resLabel: string;               // "Repositories" | "Channels" | "Teams and projects" | …
  owner: string; count: number;
  items: { id: string; name: string; meta: string; signal: string; hot: boolean; est: number }[];
};
```

Seed fixtures are in the landing prototype's `catalog` array.

---

## 4. Screens

### A. Landing — `/`

Marketing that sells the product **by showing the product**. Seven bands, alternating `bg-base` / `bg-alt`, each separated by a 1px `line-softer` top border.

1. **Nav** 64px — mark + wordmark, Changelog / Docs, Sign in.
2. **Hero** — badge pill ("Seven tools in, one morning out", pulsing accent dot), H1 in three lines with the third in `text-4`, body, CTAs **"Show me what needs me today"** (primary) + **"Walk through a real morning"**, reassurance line, then the connector strip. Right column is a real product frame showing three ranked rows.
   **Rule: the primary CTA never names a vendor.** It promises the outcome.
3. **Orbit** — see §5.
4. **01 · the primitive** — the `WorkEvent` type in a code card; three counters that count up (1,284 events → 41 involve you → 3 need you).
5. **02 · the first ninety seconds** — three cards, each with a real UI fragment: ranked rows with reasons, the blocked chain, chat with citations.
6. **03 · setup** — the four beats (Authorize 20s · Choose resources 30s · First sync 40s · Value now) in a 1px-gap grid where the gap is the divider.
7. **04 · restraint** — struck-through list of what was cut: velocity charts, leaderboards, notification firehose, dashboards nobody acts on.
8. **Sources** — 7-column honest status grid. **Closing** + footer (`Standup · the developer OS · read-only by design`).

### B. Activation — `/setup/*`

A 60px shell with a centered 4-step indicator (Workspace → Connect → Select → Sync).

- **Workspace** — name + "How do you spend most of your week?" (Writing code / Leading a team / Managing delivery). Role changes **ranking weights only** — never gates features.
- **Connection center** — every source is multi-selectable from day zero; GitHub is the emphasized card, the rest a list. CTA is dynamic: **"Authorize N tools"**.
- **OAuth** — a **queue**, not a single grant: pill strip showing done / current / pending. Success shows account + resource count + read-only scopes, CTA advances to the next source. Failure shows `access_denied`, two likely causes, Try again / Request admin approval, and **"Skip this one and continue"** so one failure never kills the queue. Keep queue position in the URL (`?queue=github,linear,slack&i=1`) — a refresh must resume.
- **Resource selection** — tabs per connected source (repos / channels / projects / calendars / boards), search, "select only the active ones", and a sticky summary that sums resources across sources and estimates total work events.
- **Sync** — **one row per source, running in parallel**, each with its own bar and live count, converging on a single cross-source total and a shared stage line (*Reading history → Resolving references → Normalizing into work events → Ranking your first morning*). Stream over SSE. Partial failure degrades to "3 of 4 sources ready — open anyway", never a dead end.

### C. Today (dashboard) — `/dashboard/[workspaceId]`

**No client components.** Filter lives in the URL (`?lane=blocked`); chips are `<Link>`. If you want state, the answer is a link.

- **Brief** — workspace name, sync badge (green / amber stale / red), then the **headline**: the largest text on screen, two lines max, ending in a recommendation, second half in `text-4`. Below it, metrics as **running text, not cards**: mono accent number + label + consequence, underlined when they link to a filter. Zero-count metrics are **removed entirely** — never render "0 bloqueadores", never a dead link. When the viewer cannot be resolved, a discreet amber line: *"Standup não reconheceu você nas fontes conectadas — mostrando o workspace inteiro."*
- **Queue** — one card, header + chips + `divide-y` rows. **The list arrives ranked by urgency and lanes interleave. Do not group, do not insert section dividers.** Lane lives in the row chip only. `priority === "high"` gets a 2px left bar — `danger` when blocked, `accent` otherwise; medium and low get nothing. That bar is the **only** row emphasis, and it must stay rare (3 of 8 rows in the reference).
- Row: lane chip · brand icon · mono source · mono age · title (truncates) · reason (`line-clamp-2`) · action button right (solid only when `action.primary`). One solid button per urgency cluster — a wall of green kills the hierarchy.
- **Rail (380px)** — Recent signal grouped by service (items without an href are plain text, no hover), Week (three numbers + risks), and "All activity" collapsed in a `<details>`.
- **Sources are not in the nav.** They live in the user dropdown as the first settings item, with the `3/7` count in accent — the only highlighted entry, because it is the only one still asking for something.

### D. Detail — PR and issue

**Standup is not a clone of the source tool. It is a briefing about it.** No diff viewer, no approve, no comment box. You see why it matters, who is behind it, what it unblocks — then you leave through a button.

- **PR** — lane chip + title, the verdict sentence, actions (`Revisar no GitHub`, `Avisar Ana`). *What changed*: the 4 files that carry logic out of 9, labeled, with the omission stated out loud in the footer. *Conversation that matters*: 2 of 14 comments — the blocker and the decision — with the other 12 declared as omitted. Rail: the unblock chain (PR → issue → release) on an `info-surface` card, who is waiting and for how long, checks.
- **Issue** — same skeleton. *Why it stalled* is prose derived from N events, with the derivation stated. Cycle risk is one number in a `danger-surface-2` card ("2d de atraso · sprint fecha sexta") — no chart. Linked work, history, metadata.

Stating what was hidden is a feature. Never silently truncate.

### E. Timeline

The raw record — **the one screen that does not have an opinion.** No ranking, no reasons. Filter chips per source, grouped by day, mono time gutter, brand icon, title + summary, and the raw `type` in a mono chip on the right.

### F. Weekly summary

Narrative first: a 19px synthesis that **names the cause**, not the numbers ("O gargalo não foi capacidade — foi latência de review"). Then four stats where **only the one that explains the week is colored** (`31h latência de review` in danger, was 9h). Then Shipped / Slipped side by side, each slip carrying its why. Closes with three recommendations, each with its justification.

### G. Chat

Answers **cite the work events they came from**, as clickable chips under a divider. Without citations it is confident guessing. Composer + four suggested questions.

---

## 5. The Orbit section (landing)

Seven source pills travel along concentric arcs around a core half-cut by the bottom edge.

- Section `bg-alt`, padding `96px 40px 40px`, `overflow: hidden`. Header block `z-index: 3` — text always paints above the rings. Stage `height: 460px; margin-top: 112px; z-index: 1`.
- Origin: a zero-size anchor at `left: 50%; bottom: 0`. Rings: 620 / 900 / 1060px diameter, borders `#161C2B` / `#141A28` / `#121724`.
- Core: 224px circle at `bottom: -96px`, `accent-surface` + `accent-border`, `box-shadow: 0 0 90px rgba(29,156,76,.22)`, content top-aligned with `padding-top: 30px` so both text lines clear the clip. Re-verify after any height change.

| Tool | Ring (radius) | Start | Period | Direction |
|---|---|---|---|---|
| GitHub | inner 310 | -38° | 74s | cw |
| Linear | inner 310 | 34° | 74s | cw |
| Slack | middle 450 | -64° | 98s | ccw |
| Notion | middle 450 | 12° | 98s | ccw |
| Calendar | middle 450 | 78° | 98s | ccw |
| Jira | outer 530 | -26° | 132s | cw |
| Trello | outer 530 | 48° | 132s | cw |

Motion is two nested rotations, no path math: a zero-size spoke rotates `θ → θ±360°`; the pill inside is offset `translate(-50%,-50%) translateY(-R)`; the pill's inner element counter-rotates so the label never tilts. Linear timing, infinite, start angle is the initial transform — not a delay. Pause via IntersectionObserver when off-screen and on `document.hidden`. Never animate `top`/`left`.

Pill depth by ring: `surface`/`line`/14px label/16px icon → `surface-2`/`line-soft`/13.5px → `surface-3`/`line-softer`/13px.

Assert after build: `outerRing.top > paragraph.bottom` at every viewport ≥768px.

---

## 6. Navigation — decided: Command

**Build the Command direction.** No persistent navigation, no sidebar, no tab bar.

A single row 38px tall, sitting 16px below the top edge (wrapper `padding: 16px 20px 0 20px`):

- **Left** — the mark + workspace name (`text-2`, 12.5px). Not a breadcrumb, not a switcher in v1.
- **Center** — the ⌘K field, `flex: 1`, `max-width: 520px`: `surface` fill, `line` border, radius 9, padding `8px 12px`, `box-shadow: 0 8px 24px -18px rgba(0,0,0,.9)`. Search icon 14px + placeholder *"Ir para, filtrar ou perguntar sobre o trabalho…"* at 13px `text-4`, with a `⌘K` chip on the right in mono inside its own `line` border. Hover: border `line-strongest`, fill `surface-hover`.
- **Right** — the 26px avatar, which opens the user menu (Fontes conectadas `3/7` in accent, Preferências, Membros, Faturamento, Sair).

Content sits at `26px 20px 72px 20px` — the strip is part of the page, not chrome docked above it.

**Why this and not tabs.** A dashboard opened once each morning does not need persistent navigation; it needs a command line. The product's whole claim is that it decides what matters, so a permanent row of destinations quietly contradicts it — and every pixel spent on nav is a pixel not spent on the queue.

**What this obliges you to build.** ⌘K is not a search box, it is the navigation, and it has to be good on day one:

- Opens on `⌘K` / `Ctrl+K` from anywhere, closes on `Esc`, no dead zones.
- Zero-query state lists the destinations (Hoje, Fila, Timeline, Semana, Chat, Fontes, Preferências) — this is what replaces the tab bar, so it must be visible before typing.
- Fuzzy match across destinations, queue items, repos, people and issue keys in one flat ranked list, sectioned by kind.
- Arrow keys + Enter, mouse optional. Recents above everything when the query is empty.
- Free text falls through to Chat as the last row: *"Perguntar: {query}"*.
- Under 100ms to first paint of results; never a spinner.

**Fallback.** If ⌘K cannot ship complete in the first release, ship the **Tabs** variant instead (52px bar, mark + workspace breadcrumb, inline tabs with counts, ⌘K on the right) — it is fully specified in the dashboard prototype. Do not ship Command with a weak ⌘K; that combination leaves the user with no way to move.

A plain 208px labeled sidebar was built and rejected as too generic. The 56px icon rail was built as a middle ground and is available in the prototype, but is not the direction.

---

## 7. Motion

The entire budget: entrance rises, progress widths, the orbit, one pulsing sync dot.

| Trigger | Behavior |
|---|---|
| Screen enter | `opacity 0→1`, `translateY(5–6px)→0`, .35–.5s ease |
| Landing scroll-in | `[data-anim]` rise .7s `power2.out` at `top 88%`, `once`; `[data-anim-group]` staggers children .07s |
| Counters | 0 → target, 1.4s `power2.out`, `en-US` formatted |
| Progress | `width` .5s `cubic-bezier(.4,0,.2,1)` |
| Sync dot | 2.6s opacity pulse, infinite |
| Hovers | Primary `accent → accent-hover`; outline `line-strong → line-strongest`; rows → `surface-hover` |

Only animate elements below the fold — nothing may flash on load. Never author initial `opacity: 0` in markup: if the animation library fails, everything must still be visible. `prefers-reduced-motion` disables all of it, and the static composition must still read as intentional.

No parallax, no scroll-jacking, no spinners longer than the work they represent.

---

## 8. Empty, loading, error

Never an illustration. Never "You're all caught up! 🎉". Every empty state states a **fact**.

- **Queue empty** — "Nada exige sua ação agora." + what exists elsewhere ("11 eventos chegaram desde ontem — reviews concluídas, deploys que passaram e duas threads já respondidas."). The metric line collapses to the one non-actionable entry.
- **Lane empty under a filter** — one line + a link back to the full queue; chips stay visible.
- **No signal / no risks** — "Nenhum risco de alta prioridade na última sync."
- **One source connected** — the brief must say which tools it is blind to.
- **Resource list empty** — "This account has no {resources} we can read", link back to the connection center.
- **Sync partial failure** — per-source `queued / reading / done / failed`, a retry chip on the failure, the rest keep going.
- **Loading** — route-level `loading.tsx`. Do not build skeletons inside these components.

---

## 9. Accessibility — not yet resolved, please implement

- Checkbox rows: real `<input type="checkbox">` (visually hidden) or `role="checkbox"` + `aria-checked`, keyboard reachable, whole row is the target.
- Source tabs: `role="tablist"` + arrow keys. Filter chips are links with `aria-current="page"`.
- Sync: `role="progressbar"` + `aria-valuenow`, plus `aria-live="polite"` announcing stage changes.
- Queue rows: link/button semantics with a visible focus ring — `0 0 0 3px rgba(29,156,76,.32)`.
- User dropdown: focus trap, `Esc` to close, click-outside, `aria-expanded`.
- Verify every color against §2's contrast floor before shipping.

---

## 10. Responsive

Desktop-first, 1440 reference. The dashboard holds a 900px minimum content width and scrolls horizontally below it. Below `xl` the layout is a single column in the order **brief → chips + queue → signal → weekly**.

Mobile is **not designed** — intended scope is Today + queue only. Do not improvise it.

Orbit: ≥1280 as specified; 768–1279 scale the stage from bottom-center (0.8 at 1024, 0.62 at 768) or drop the outer ring; <768 hide the rings and render the seven pills as a static wrapped row above the core. No horizontal scroll at any width.

---

## 11. Build order

1. `WorkEvent` + the GitHub normalizer, with `QueueItem` derivation behind it.
2. Setup shell + connection center + OAuth queue — **generic over `SourceDef` from the first commit**.
3. Resource selection + parallel sync with streamed progress.
4. Today: brief, queue, rail, user dropdown.
5. Detail screens, timeline, weekly, chat.
6. A second source (Linear). **If it needs a new screen, step 2 was built wrong.**

## Do not

- Do not build a light theme, a theme toggle, or introduce a hex outside §2.
- Do not add velocity charts, leaderboards, decorative gradients, glow layers, particles or vanity numbers.
- Do not group the queue by lane or add section dividers to it.
- Do not singularize Portuguese with a regex.
- Do not substitute generic icons for product brands.
- Do not name a single vendor in a primary CTA.
- Do not implement snooze/dismiss — out of scope.
