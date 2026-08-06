# Dashboard e Fluxo Inicial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a jornada única **login → conexões (se necessário) → dashboard por ação**: autenticação Google via Supabase Auth, gate por conexão GitHub no `middleware.ts`, consolidação de `/onboarding` + `/setup/*` em um só `/setup`, e um dashboard "Foco + seções empilhadas" (hero "Agora", MetricStrip clicável, seções colapsáveis Revisar/Resolver/Responder/Desbloquear) alimentado por um payload já priorizado pelo backend (`actionGroup` + `urgencyScore`), com atualização por polling atrás de uma interface `subscribeDashboard`.

**Architecture:** Monorepo. `apps/web` (Next.js App Router, TypeScript, RSC + Client Components) fala direto com a Go API via `apps/web/src/lib/api-client.ts` (não há gateway BFF; os diretórios `apps/web/src/app/api/gateway/*` estão vazios). `apps/api` (Go 1.22) normaliza providers em `domain.WorkEvent` e monta o payload em `internal/intelligence/dashboard.go`, servido em `GET /v1/dashboard`. A derivação de prioridade e agrupamento por ação vive no backend; o front apenas ordena/renderiza pelo `urgencyScore` e mapeia `actionGroup`.

**Tech Stack:** Next.js (App Router) + React + TypeScript + Tailwind; `@supabase/supabase-js` + `@supabase/ssr` para Auth (Google provider) e sessão em cookie; Go 1.22 (`std net/http`) no backend. Testes web: **Vitest** (novo — ainda não existe test runner em `apps/web/package.json`) + Testing Library para view-model/estados/middleware; **Playwright** para E2E. Testes Go: `go test` (já existe `internal/intelligence/dashboard_test.go`).

---

## File Structure

### apps/api (Go)

- **Modify** `apps/api/internal/domain/types.go` — adicionar campos de apresentação `ActionGroup` e `UrgencyScore` ao struct `WorkEvent` (json `actionGroup`, `urgencyScore`).
- **Create** `apps/api/internal/intelligence/action.go` — funções puras `deriveActionGroup(event) domain.ActionGroup` e `deriveUrgencyScore(event, now) float64`; constantes dos grupos.
- **Create** `apps/api/internal/intelligence/action_test.go` — unit tests da derivação de `actionGroup` e `urgencyScore`.
- **Modify** `apps/api/internal/intelligence/dashboard.go` — em `BuildDashboard`, anotar cada evento com `ActionGroup`/`UrgencyScore` antes de retornar; ordenar `Events` por `UrgencyScore` desc.
- **Modify** `apps/api/internal/intelligence/dashboard_test.go` — assertar que os eventos do payload vêm anotados e ordenados por score.

### apps/web — Auth & Gate

- **Modify** `apps/web/package.json` — adicionar deps `@supabase/supabase-js`, `@supabase/ssr`; devDeps `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `@playwright/test`; scripts `test`, `test:e2e`.
- **Create** `apps/web/vitest.config.ts` — config Vitest (jsdom, alias `@`, setup file).
- **Create** `apps/web/vitest.setup.ts` — importa `@testing-library/jest-dom/vitest`.
- **Create** `apps/web/src/lib/supabase/server.ts` — `createServerSupabase()` (cookies do request, `@supabase/ssr`).
- **Create** `apps/web/src/lib/supabase/client.ts` — `createBrowserSupabase()` (browser client).
- **Create** `apps/web/src/lib/supabase/middleware.ts` — `updateSession(request)` que revalida a sessão e devolve `{ response, user }`.
- **Create** `apps/web/src/lib/gate.ts` — `hasActiveGithub(connections)` puro (decide destino do gate) + `type GateDecision`.
- **Create** `apps/web/src/lib/gate.test.ts` — testes puros de `hasActiveGithub`.
- **Create** `apps/web/middleware.ts` — intercepta rotas de workspace/setup, aplica auth (redirect `/login?redirect=`) e gate GitHub (sem GitHub → `/setup`; com GitHub → segue/`/dashboard`).
- **Create** `apps/web/middleware.test.ts` — testa o gate (com/sem GitHub → destino correto; auth expirada → `/login?redirect=`).
- **Create** `apps/web/src/app/login/page.tsx` — CTA "Entrar com Google" (Server Component + Client button que chama Supabase OAuth).
- **Create** `apps/web/src/app/auth/callback/route.ts` — troca o `code` OAuth por sessão (cookie) e redireciona ao `redirect` ou `/dashboard`.

### apps/web — Landing & Setup consolidado

- **Modify** `apps/web/src/app/page.tsx` — CTA da landing passa a "Entrar com Google" apontando `/login`; remover ênfase textual/links diretos a GitHub no topo do funil.
- **Modify** `apps/web/src/app/setup/page.tsx` — passa a ser a tela única de conexão: GitHub em destaque (CTA "Conectar GitHub") + integrações opcionais; estado "GitHub conectado" mostra "Ir para o dashboard".
- **Modify** `apps/web/src/app/api/integrations/[id]/connect/route.ts` — trocar redirects de erro de `/onboarding` para `/setup`.
- **Delete** `apps/web/src/app/onboarding/page.tsx` — aposentado; substituir por redirect permanente para `/setup`.

### apps/web — Dashboard por ação

- **Modify** `apps/web/src/lib/api-client.ts` — `WorkEvent` ganha `actionGroup?: ActionGroup` e `urgencyScore?: number`; exportar `type ActionGroup`.
- **Modify** `apps/web/src/lib/dashboard-view-model.ts` — adicionar `ActionSectionKey`, `buildActionSections(events)`, `pickNowItem(events)`, `sourcesConnectedCount`, e estender os builders existentes para ordenar por `urgencyScore`.
- **Modify** `apps/web/src/lib/dashboard-view-model.test.ts` — (Create) testes de `buildActionSections`, `pickNowItem`, empty/near-empty.
- **Create** `apps/web/src/components/workspace/now-block.tsx` — hero "Agora" (item nº1).
- **Create** `apps/web/src/components/workspace/action-section.tsx` — seção colapsável por ação (contador, esconde quando vazia).
- **Create** `apps/web/src/components/workspace/dashboard-header.tsx` — saudação + last-sync + botão Sync + sino de notificações (delta).
- **Create** `apps/web/src/lib/subscribe-dashboard.ts` — interface `subscribeDashboard` + `pollingSource` (implementação por polling).
- **Create** `apps/web/src/lib/use-polling.ts` — hook `usePolling` (intervalo ~60s + refetch on focus) atrás de `subscribeDashboard`.
- **Create** `apps/web/src/components/workspace/dashboard-live.tsx` — Client Component que recebe payload inicial (RSC), assina `subscribeDashboard`, calcula delta do sino e renderiza header + now + metric strip + seções + estados.
- **Modify** `apps/web/src/app/(workspace)/dashboard/page.tsx` — RSC busca payload inicial e renderiza `<DashboardLive initial={...} />`; banner não-bloqueante quando gateway offline (mantém último payload).
- **Create** `apps/web/src/app/api/dashboard/route.ts` — endpoint interno consumido pelo `usePolling` no browser (server-side chama `getDashboardState`, evita expor segredos do gateway ao cliente).

### apps/web — E2E

- **Create** `apps/web/playwright.config.ts` — config Playwright.
- **Create** `apps/web/e2e/happy-path.spec.ts` — login Google (mock) → sem GitHub → `/setup` → conecta → dashboard com itens.

---

## Task 1: Backend — derivar `actionGroup` e `urgencyScore` no WorkEvent

**Files:**
- Modify: `apps/api/internal/domain/types.go`
- Create: `apps/api/internal/intelligence/action.go`
- Test: `apps/api/internal/intelligence/action_test.go`

- [ ] **Step 1: Adicionar campos de apresentação ao domínio.** Em `apps/api/internal/domain/types.go`, dentro do struct `WorkEvent` (linha ~102, após `Raw`), adicionar:
  ```go
  	Raw          map[string]any `json:"raw,omitempty"`
  	ActionGroup  ActionGroup    `json:"actionGroup,omitempty"`
  	UrgencyScore float64        `json:"urgencyScore"`
  ```
  E acima do struct `WorkEvent` declarar o tipo e as constantes:
  ```go
  type ActionGroup string

  const (
  	ActionReview   ActionGroup = "review"
  	ActionResolve  ActionGroup = "resolve"
  	ActionRespond  ActionGroup = "respond"
  	ActionUnblock  ActionGroup = "unblock"
  	ActionNone     ActionGroup = ""
  )
  ```

- [ ] **Step 2: Escrever o teste de derivação (FAIL).** Criar `apps/api/internal/intelligence/action_test.go`:
  ```go
  package intelligence

  import (
  	"testing"
  	"time"

  	"github.com/developer-os/api/internal/domain"
  )

  func TestDeriveActionGroup(t *testing.T) {
  	now := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
  	cases := []struct {
  		name  string
  		event domain.WorkEvent
  		want  domain.ActionGroup
  	}{
  		{"review requested", event("a", domain.ServiceGitHub, "pull_request.review_requested", "Review auth", "medium", now), domain.ActionReview},
  		{"assigned issue", event("b", domain.ServiceLinear, "issue.assigned", "Fix bug", "high", now), domain.ActionResolve},
  		{"mention", event("c", domain.ServiceSlack, "slack.mention", "You were mentioned", "low", now), domain.ActionRespond},
  		{"blocked", event("d", domain.ServiceLinear, "linear.issue.blocked", "Release blocked", "high", now), domain.ActionUnblock},
  	}
  	for _, tc := range cases {
  		if got := deriveActionGroup(tc.event); got != tc.want {
  			t.Fatalf("%s: expected %q, got %q", tc.name, tc.want, got)
  		}
  	}
  }

  func TestDeriveUrgencyScoreRanksBlockerAboveLowPriority(t *testing.T) {
  	now := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
  	blocker := event("blk", domain.ServiceLinear, "linear.issue.blocked", "Release blocked", "high", now.Add(-30*time.Hour))
  	chore := event("chore", domain.ServiceNotion, "notion.page.updated", "Docs tweak", "low", now.Add(-1*time.Minute))
  	if deriveUrgencyScore(blocker, now) <= deriveUrgencyScore(chore, now) {
  		t.Fatalf("expected blocker to outrank low-priority chore")
  	}
  }
  ```
  Nota: a helper `event(...)` já existe em `dashboard_test.go` no mesmo package `intelligence`.

- [ ] **Step 3: Rodar o teste (espera FAIL).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/api && go test ./internal/intelligence/ -run 'TestDeriveActionGroup|TestDeriveUrgencyScore'
  ```
  Esperado: falha de compilação (`undefined: deriveActionGroup`, `undefined: deriveUrgencyScore`).

- [ ] **Step 4: Implementar a derivação (mínima).** Criar `apps/api/internal/intelligence/action.go`:
  ```go
  package intelligence

  import (
  	"strings"
  	"time"

  	"github.com/developer-os/api/internal/domain"
  )

  func deriveActionGroup(event domain.WorkEvent) domain.ActionGroup {
  	if isBlocked(event) || isReleaseRisk(event) {
  		return domain.ActionUnblock
  	}
  	if isReviewWaiting(event) || isFailedCheck(event) {
  		return domain.ActionReview
  	}
  	if isAssignedIssue(event) {
  		return domain.ActionResolve
  	}
  	lowered := strings.ToLower(event.Type)
  	if strings.Contains(lowered, "mention") || strings.Contains(lowered, "comment") || strings.Contains(lowered, "thread") {
  		return domain.ActionRespond
  	}
  	return domain.ActionNone
  }

  func deriveUrgencyScore(event domain.WorkEvent, now time.Time) float64 {
  	score := float64(priorityRank(event.Priority)) * 100
  	switch deriveActionGroup(event) {
  	case domain.ActionUnblock:
  		score += 400
  	case domain.ActionReview:
  		score += 300
  	case domain.ActionResolve:
  		score += 200
  	case domain.ActionRespond:
  		score += 100
  	}
  	ageHours := now.Sub(event.OccurredAt).Hours()
  	if ageHours > 0 {
  		if ageHours > 72 {
  			ageHours = 72
  		}
  		score += ageHours
  	}
  	return score
  }
  ```
  Reusa `isBlocked`, `isReleaseRisk`, `isReviewWaiting`, `isFailedCheck`, `isAssignedIssue`, `priorityRank` já definidos em `dashboard.go`.

- [ ] **Step 5: Rodar o teste (espera PASS).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/api && go test ./internal/intelligence/ -run 'TestDeriveActionGroup|TestDeriveUrgencyScore'
  ```
  Esperado: `ok  github.com/developer-os/api/internal/intelligence`.

- [ ] **Step 6: Commit.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator && git add apps/api/internal/domain/types.go apps/api/internal/intelligence/action.go apps/api/internal/intelligence/action_test.go && git commit -m "Add actionGroup and urgencyScore derivation to WorkEvent"
  ```

## Task 2: Backend — anotar e ordenar eventos em BuildDashboard

**Files:**
- Modify: `apps/api/internal/intelligence/dashboard.go`
- Test: `apps/api/internal/intelligence/dashboard_test.go`

- [ ] **Step 1: Escrever teste que exige anotação e ordenação (FAIL).** Em `apps/api/internal/intelligence/dashboard_test.go`, adicionar:
  ```go
  func TestBuildDashboardAnnotatesAndSortsByUrgency(t *testing.T) {
  	now := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
  	ctx := domain.GatewayContext{WorkspaceID: "workspace"}
  	events := []domain.WorkEvent{
  		event("chore", domain.ServiceNotion, "notion.page.updated", "Docs tweak", "low", now.Add(-1*time.Minute)),
  		event("blocker", domain.ServiceLinear, "linear.issue.blocked", "Release blocked", "high", now.Add(-30*time.Hour)),
  	}
  	payload := BuildDashboard(ctx, events, nil, now)
  	if len(payload.Events) != 2 {
  		t.Fatalf("expected 2 events, got %d", len(payload.Events))
  	}
  	if payload.Events[0].ID != "blocker" {
  		t.Fatalf("expected blocker ranked first, got %q", payload.Events[0].ID)
  	}
  	if payload.Events[0].ActionGroup != domain.ActionUnblock {
  		t.Fatalf("expected unblock actionGroup, got %q", payload.Events[0].ActionGroup)
  	}
  	if payload.Events[0].UrgencyScore <= payload.Events[1].UrgencyScore {
  		t.Fatalf("expected descending urgencyScore ordering")
  	}
  }
  ```

- [ ] **Step 2: Rodar o teste (espera FAIL).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/api && go test ./internal/intelligence/ -run TestBuildDashboardAnnotatesAndSortsByUrgency
  ```
  Esperado: falha (eventos sem `ActionGroup`/`UrgencyScore` e ordenados por `OccurredAt`, então `Events[0].ID == "chore"`).

- [ ] **Step 3: Anotar + reordenar em BuildDashboard.** Em `apps/api/internal/intelligence/dashboard.go`, dentro de `BuildDashboard`, logo após `events = sortedEvents(events)` (linha ~18), inserir:
  ```go
  	events = sortedEvents(events)
  	events = annotateEvents(events, now)
  ```
  E adicionar a função (pode ficar no fim do arquivo ou em `action.go`; mantenha em `dashboard.go` junto do `BuildDashboard`):
  ```go
  func annotateEvents(events []domain.WorkEvent, now time.Time) []domain.WorkEvent {
  	annotated := append([]domain.WorkEvent(nil), events...)
  	for i := range annotated {
  		annotated[i].ActionGroup = deriveActionGroup(annotated[i])
  		annotated[i].UrgencyScore = deriveUrgencyScore(annotated[i], now)
  	}
  	sort.SliceStable(annotated, func(i, j int) bool {
  		return annotated[i].UrgencyScore > annotated[j].UrgencyScore
  	})
  	return annotated
  }
  ```
  (`sort` já está importado no arquivo.)

- [ ] **Step 4: Rodar toda a suíte de intelligence (espera PASS).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/api && go test ./internal/intelligence/
  ```
  Esperado: `ok`. Se `TestBuildDashboardComputesTodayFocusAndWeeklySummary` quebrar por ordenação, confirme que ele só assere sobre `Today`/`Focus`/`WeeklySummary` (não sobre a ordem de `Events`) — não altere as asserções existentes; se necessário ajuste apenas o novo teste.

- [ ] **Step 5: Rodar toda a suíte Go (regressão).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/api && go test ./...
  ```
  Esperado: `ok` em todos os pacotes.

- [ ] **Step 6: Commit.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator && git add apps/api/internal/intelligence/dashboard.go apps/api/internal/intelligence/dashboard_test.go && git commit -m "Annotate and sort dashboard events by urgencyScore"
  ```

## Task 3: Web — instalar Vitest e tipos de apresentação

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/vitest.setup.ts`
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Adicionar deps e scripts.** Em `apps/web/package.json`, adicionar em `dependencies`:
  ```json
      "@supabase/ssr": "^0.5.2",
      "@supabase/supabase-js": "^2.45.0",
  ```
  e em `devDependencies`:
  ```json
      "@playwright/test": "^1.47.0",
      "@testing-library/jest-dom": "^6.5.0",
      "@testing-library/react": "^16.0.1",
      "@vitejs/plugin-react": "^4.3.1",
      "jsdom": "^25.0.0",
      "vitest": "^2.1.0",
  ```
  e em `scripts`:
  ```json
      "test": "vitest run",
      "test:watch": "vitest",
      "test:e2e": "playwright test",
  ```

- [ ] **Step 2: Instalar.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npm install
  ```
  Esperado: instalação sem erros.

- [ ] **Step 3: Config do Vitest.** Criar `apps/web/vitest.config.ts`:
  ```ts
  import { defineConfig } from "vitest/config";
  import react from "@vitejs/plugin-react";
  import { fileURLToPath } from "node:url";

  export default defineConfig({
    plugins: [react()],
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./vitest.setup.ts"],
      include: ["src/**/*.test.{ts,tsx}", "middleware.test.ts"],
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  });
  ```
  E `apps/web/vitest.setup.ts`:
  ```ts
  import "@testing-library/jest-dom/vitest";
  ```

- [ ] **Step 4: Escrever teste sentinela do tipo (FAIL).** Criar `apps/web/src/lib/action-group.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import type { ActionGroup, WorkEvent } from "@/lib/api-client";

  describe("presentation fields", () => {
    it("WorkEvent carries actionGroup and urgencyScore", () => {
      const group: ActionGroup = "review";
      const event: Pick<WorkEvent, "actionGroup" | "urgencyScore"> = {
        actionGroup: group,
        urgencyScore: 420,
      };
      expect(event.actionGroup).toBe("review");
      expect(event.urgencyScore).toBe(420);
    });
  });
  ```

- [ ] **Step 5: Rodar (espera FAIL).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx vitest run src/lib/action-group.test.ts
  ```
  Esperado: erro de tipos (`ActionGroup`, `actionGroup`, `urgencyScore` não existem em `api-client`).

- [ ] **Step 6: Estender os tipos.** Em `apps/web/src/lib/api-client.ts`, acima de `export type WorkEvent`, adicionar:
  ```ts
  export type ActionGroup = "review" | "resolve" | "respond" | "unblock";
  ```
  e dentro de `WorkEvent`, após `raw?: Record<string, unknown>;`:
  ```ts
    actionGroup?: ActionGroup;
    urgencyScore?: number;
  ```

- [ ] **Step 7: Rodar (espera PASS).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx vitest run src/lib/action-group.test.ts
  ```
  Esperado: `1 passed`.

- [ ] **Step 8: Commit.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator && git add apps/web/package.json apps/web/package-lock.json apps/web/vitest.config.ts apps/web/vitest.setup.ts apps/web/src/lib/api-client.ts apps/web/src/lib/action-group.test.ts && git commit -m "Add Vitest and presentation fields to WorkEvent type"
  ```

## Task 4: Web — view-model de agrupamento por ação

**Files:**
- Modify: `apps/web/src/lib/dashboard-view-model.ts`
- Test: `apps/web/src/lib/dashboard-view-model.test.ts`

- [ ] **Step 1: Escrever testes (FAIL).** Criar `apps/web/src/lib/dashboard-view-model.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import type { WorkEvent } from "@/lib/api-client";
  import { buildActionSections, pickNowItem, sourcesConnectedCount } from "@/lib/dashboard-view-model";

  function ev(partial: Partial<WorkEvent>): WorkEvent {
    return {
      id: "id",
      service: "github",
      type: "pull_request.review_requested",
      title: "Title",
      source: "repo",
      actor: "you",
      priority: "medium",
      summary: "summary",
      occurredAt: "2026-08-01T10:00:00Z",
      ...partial,
    };
  }

  describe("buildActionSections", () => {
    it("groups events by actionGroup and sorts each by urgencyScore desc", () => {
      const events: WorkEvent[] = [
        ev({ id: "r1", actionGroup: "review", urgencyScore: 300 }),
        ev({ id: "r2", actionGroup: "review", urgencyScore: 420 }),
        ev({ id: "u1", actionGroup: "unblock", urgencyScore: 500 }),
      ];
      const sections = buildActionSections(events);
      expect(sections.review.map((e) => e.id)).toEqual(["r2", "r1"]);
      expect(sections.unblock.map((e) => e.id)).toEqual(["u1"]);
      expect(sections.resolve).toEqual([]);
      expect(sections.respond).toEqual([]);
    });

    it("returns all-empty sections for no events", () => {
      const sections = buildActionSections([]);
      expect(sections.review).toEqual([]);
      expect(sections.resolve).toEqual([]);
      expect(sections.respond).toEqual([]);
      expect(sections.unblock).toEqual([]);
    });
  });

  describe("pickNowItem", () => {
    it("returns the single highest urgencyScore event", () => {
      const events: WorkEvent[] = [
        ev({ id: "a", urgencyScore: 100 }),
        ev({ id: "b", urgencyScore: 900 }),
      ];
      expect(pickNowItem(events)?.id).toBe("b");
    });
    it("returns null when there are no events", () => {
      expect(pickNowItem([])).toBeNull();
    });
  });

  describe("sourcesConnectedCount", () => {
    it("counts sourceHealth entries that are connected or syncing", () => {
      expect(
        sourcesConnectedCount([
          { service: "github", status: "connected" },
          { service: "slack", status: "syncing" },
          { service: "linear", status: "available" },
        ]),
      ).toBe(2);
    });
  });
  ```

- [ ] **Step 2: Rodar (espera FAIL).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx vitest run src/lib/dashboard-view-model.test.ts
  ```
  Esperado: falha (`buildActionSections`, `pickNowItem`, `sourcesConnectedCount` não existem).

- [ ] **Step 3: Implementar as funções.** Em `apps/web/src/lib/dashboard-view-model.ts`, no topo importar o tipo `ActionGroup` (ajustar o import existente):
  ```ts
  import type { ActionGroup, DashboardPayload, Service, SourceHealth, WorkEvent } from "@/lib/api-client";
  ```
  E no fim do arquivo adicionar:
  ```ts
  export type ActionSections = Record<ActionGroup, WorkEvent[]>;

  export function buildActionSections(events: WorkEvent[]): ActionSections {
    const sections: ActionSections = { review: [], resolve: [], respond: [], unblock: [] };
    for (const event of events) {
      if (event.actionGroup && event.actionGroup in sections) {
        sections[event.actionGroup].push(event);
      }
    }
    for (const key of Object.keys(sections) as ActionGroup[]) {
      sections[key].sort((a, b) => (b.urgencyScore ?? 0) - (a.urgencyScore ?? 0));
    }
    return sections;
  }

  export function pickNowItem(events: WorkEvent[]): WorkEvent | null {
    if (events.length === 0) return null;
    return [...events].sort((a, b) => (b.urgencyScore ?? 0) - (a.urgencyScore ?? 0))[0];
  }

  export function sourcesConnectedCount(sourceHealth: SourceHealth[]): number {
    return sourceHealth.filter((s) => s.status === "connected" || s.status === "syncing").length;
  }
  ```

- [ ] **Step 4: Rodar (espera PASS).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx vitest run src/lib/dashboard-view-model.test.ts
  ```
  Esperado: `3 passed` (describes) / todos os `it` verdes.

- [ ] **Step 5: Commit.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator && git add apps/web/src/lib/dashboard-view-model.ts apps/web/src/lib/dashboard-view-model.test.ts && git commit -m "Add action grouping helpers to dashboard view-model"
  ```

## Task 5: Web — regra pura do gate GitHub

**Files:**
- Create: `apps/web/src/lib/gate.ts`
- Test: `apps/web/src/lib/gate.test.ts`

- [ ] **Step 1: Escrever teste (FAIL).** Criar `apps/web/src/lib/gate.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import type { ConnectionStatus } from "@/lib/api-client";
  import { hasActiveGithub } from "@/lib/gate";

  function conn(partial: Partial<ConnectionStatus>): ConnectionStatus {
    return {
      service: "github",
      status: "available",
      providerConfigured: true,
      hasToken: false,
      hasRefreshToken: false,
      selectionStatus: "pending",
      selectedResourceCount: 0,
      scopes: [],
      lastSyncRecordsScanned: 0,
      lastSyncEventsCreated: 0,
      ...partial,
    };
  }

  describe("hasActiveGithub", () => {
    it("is true when github connection has a token and connected status", () => {
      expect(hasActiveGithub([conn({ service: "github", status: "connected", hasToken: true })])).toBe(true);
    });
    it("is false when github is present but has no token", () => {
      expect(hasActiveGithub([conn({ service: "github", status: "available", hasToken: false })])).toBe(false);
    });
    it("is false when github is absent", () => {
      expect(hasActiveGithub([conn({ service: "slack", status: "connected", hasToken: true })])).toBe(false);
    });
    it("is false for an empty list", () => {
      expect(hasActiveGithub([])).toBe(false);
    });
  });
  ```

- [ ] **Step 2: Rodar (espera FAIL).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx vitest run src/lib/gate.test.ts
  ```
  Esperado: falha (`@/lib/gate` inexistente).

- [ ] **Step 3: Implementar.** Criar `apps/web/src/lib/gate.ts`:
  ```ts
  import type { ConnectionStatus } from "@/lib/api-client";

  export type GateDecision = "dashboard" | "setup";

  export function hasActiveGithub(connections: ConnectionStatus[]): boolean {
    const github = connections.find((c) => c.service === "github");
    if (!github) return false;
    return github.hasToken && github.status === "connected";
  }

  export function gateDecision(connections: ConnectionStatus[]): GateDecision {
    return hasActiveGithub(connections) ? "dashboard" : "setup";
  }
  ```

- [ ] **Step 4: Rodar (espera PASS).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx vitest run src/lib/gate.test.ts
  ```
  Esperado: `4 passed`.

- [ ] **Step 5: Commit.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator && git add apps/web/src/lib/gate.ts apps/web/src/lib/gate.test.ts && git commit -m "Add pure github gate decision helper"
  ```

## Task 6: Web — clients Supabase (server, browser, middleware helper)

**Files:**
- Create: `apps/web/src/lib/supabase/server.ts`
- Create: `apps/web/src/lib/supabase/client.ts`
- Create: `apps/web/src/lib/supabase/middleware.ts`

- [ ] **Step 1: Server client.** Criar `apps/web/src/lib/supabase/server.ts`:
  ```ts
  import { createServerClient } from "@supabase/ssr";
  import { cookies } from "next/headers";

  export async function createServerSupabase() {
    const cookieStore = await cookies();
    return createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          },
        },
      },
    );
  }
  ```

- [ ] **Step 2: Browser client.** Criar `apps/web/src/lib/supabase/client.ts`:
  ```ts
  import { createBrowserClient } from "@supabase/ssr";

  export function createBrowserSupabase() {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  ```

- [ ] **Step 3: Middleware session helper.** Criar `apps/web/src/lib/supabase/middleware.ts`:
  ```ts
  import { createServerClient } from "@supabase/ssr";
  import { NextResponse, type NextRequest } from "next/server";

  export async function updateSession(request: NextRequest) {
    const response = NextResponse.next({ request });
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(name, value, options);
            }
          },
        },
      },
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return { response, user };
  }
  ```

- [ ] **Step 4: Typecheck.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx tsc --noEmit
  ```
  Esperado: sem erros (as chaves de env são opcionais em build; o `!` assume presença em runtime).

- [ ] **Step 5: Commit.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator && git add apps/web/src/lib/supabase/ && git commit -m "Add Supabase server, browser, and middleware clients"
  ```

## Task 7: Web — middleware.ts (auth + gate GitHub)

**Files:**
- Create: `apps/web/middleware.ts`
- Test: `apps/web/middleware.test.ts`

- [ ] **Step 1: Escrever teste do gate (FAIL).** Criar `apps/web/middleware.test.ts`. Mockamos `updateSession`, `getConnectionsState` e capturamos o destino do redirect:
  ```ts
  import { describe, expect, it, vi, beforeEach } from "vitest";
  import { NextRequest } from "next/server";

  const updateSession = vi.fn();
  const getConnectionsState = vi.fn();

  vi.mock("@/lib/supabase/middleware", () => ({ updateSession }));
  vi.mock("@/lib/api-client", () => ({ getConnectionsState }));

  import { middleware } from "./middleware";

  function req(path: string) {
    return new NextRequest(new URL(`https://app.test${path}`));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    updateSession.mockResolvedValue({ response: undefined, user: { id: "u1" } });
  });

  describe("middleware gate", () => {
    it("redirects to /login?redirect= when not authenticated", async () => {
      updateSession.mockResolvedValue({ response: undefined, user: null });
      const res = await middleware(req("/dashboard"));
      expect(res.headers.get("location")).toContain("/login?redirect=%2Fdashboard");
    });

    it("redirects to /setup when authenticated without active GitHub", async () => {
      getConnectionsState.mockResolvedValue({ data: { connections: [] }, error: null });
      const res = await middleware(req("/dashboard"));
      expect(res.headers.get("location")).toContain("/setup");
    });

    it("allows /dashboard when GitHub is connected", async () => {
      getConnectionsState.mockResolvedValue({
        data: { connections: [{ service: "github", status: "connected", hasToken: true }] },
        error: null,
      });
      const res = await middleware(req("/dashboard"));
      expect(res.headers.get("location")).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Rodar (espera FAIL).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx vitest run middleware.test.ts
  ```
  Esperado: falha (`./middleware` inexistente).

- [ ] **Step 3: Implementar o middleware.** Criar `apps/web/middleware.ts`:
  ```ts
  import { NextResponse, type NextRequest } from "next/server";
  import { updateSession } from "@/lib/supabase/middleware";
  import { getConnectionsState } from "@/lib/api-client";
  import { hasActiveGithub } from "@/lib/gate";

  const PROTECTED_PREFIXES = ["/dashboard", "/chat", "/settings", "/integrations", "/issues", "/pull-requests", "/repositories", "/setup"];

  function isProtected(pathname: string): boolean {
    return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  }

  export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    if (!isProtected(pathname)) {
      return NextResponse.next();
    }

    const { response, user } = await updateSession(request);
    if (!user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // /setup é acessível para quem ainda não tem GitHub; não re-gatekeep aqui.
    if (pathname === "/setup" || pathname.startsWith("/setup/")) {
      return response ?? NextResponse.next();
    }

    const connections = await getConnectionsState();
    if (!hasActiveGithub(connections.data?.connections ?? [])) {
      return NextResponse.redirect(new URL("/setup", request.url));
    }

    return response ?? NextResponse.next();
  }

  export const config = {
    matcher: ["/dashboard/:path*", "/chat/:path*", "/settings/:path*", "/integrations/:path*", "/issues/:path*", "/pull-requests/:path*", "/repositories/:path*", "/setup/:path*"],
  };
  ```

- [ ] **Step 4: Rodar (espera PASS).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx vitest run middleware.test.ts
  ```
  Esperado: `3 passed`.

- [ ] **Step 5: Commit.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator && git add apps/web/middleware.ts apps/web/middleware.test.ts && git commit -m "Add auth + github gate middleware"
  ```

## Task 8: Web — login com Google e callback OAuth

**Files:**
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/app/auth/callback/route.ts`

- [ ] **Step 1: Página de login (Client).** Criar `apps/web/src/app/login/page.tsx`:
  ```tsx
  "use client";

  import { useSearchParams } from "next/navigation";
  import { Button } from "@/components/ui/button";
  import { Card } from "@/components/ui/card";
  import { BrandMark } from "@/components/brand/brand-mark";
  import { createBrowserSupabase } from "@/lib/supabase/client";

  export default function LoginPage() {
    const searchParams = useSearchParams();
    const redirect = searchParams.get("redirect") ?? "/dashboard";

    async function signInWithGoogle() {
      const supabase = createBrowserSupabase();
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("redirect", redirect);
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callback.toString() },
      });
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080C15] px-5 text-[#E9EDF7]">
        <Card className="w-full max-w-[400px] border-[#212938] bg-[#121826] p-8 text-center">
          <div className="mb-6 flex justify-center">
            <BrandMark />
          </div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Entrar no Standup</h1>
          <p className="mt-2 text-[14px] text-[#9AA4BA]">Todos os seus insumos de dev num lugar só.</p>
          <Button className="mt-8 w-full" size="lg" onClick={signInWithGoogle}>
            Entrar com Google
          </Button>
        </Card>
      </main>
    );
  }
  ```

- [ ] **Step 2: Route de callback.** Criar `apps/web/src/app/auth/callback/route.ts`:
  ```ts
  import { NextResponse } from "next/server";
  import { createServerSupabase } from "@/lib/supabase/server";

  export async function GET(request: Request) {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const redirect = url.searchParams.get("redirect") ?? "/dashboard";

    if (code) {
      const supabase = await createServerSupabase();
      await supabase.auth.exchangeCodeForSession(code);
    }

    return NextResponse.redirect(new URL(redirect, url.origin));
  }
  ```

- [ ] **Step 3: Typecheck + lint.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx tsc --noEmit && npm run lint
  ```
  Esperado: sem erros.

- [ ] **Step 4: Commit.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator && git add apps/web/src/app/login apps/web/src/app/auth && git commit -m "Add Google login page and OAuth callback route"
  ```

## Task 9: Web — landing value-generic e retirar /onboarding

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/api/integrations/[id]/connect/route.ts`
- Delete/Modify: `apps/web/src/app/onboarding/page.tsx`

- [ ] **Step 1: Trocar CTAs da landing para login value-generic.** Em `apps/web/src/app/page.tsx`, substituir o link "Sign in" e os CTAs principais que apontam `/setup`/`/today` por `/login` com rótulo genérico. Alterações exatas:
  - Botão do header:
    ```tsx
            <Button asChild variant="outline" size="sm">
              <Link href="/login">Entrar</Link>
            </Button>
    ```
  - CTA primário do hero:
    ```tsx
              <Button asChild size="lg">
                <Link href="/login">
                  Entrar com Google
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
    ```
  - CTA final (seção "Tomorrow morning"):
    ```tsx
              <Button asChild size="lg">
                <Link href="/login">Entrar com Google</Link>
              </Button>
    ```
  Manter o restante da narrativa (valor genérico já presente); nenhuma menção a GitHub no topo do funil precisa ser adicionada.

- [ ] **Step 2: Corrigir redirects de erro do connect route.** Em `apps/web/src/app/api/integrations/[id]/connect/route.ts`, trocar as duas ocorrências de `/onboarding` por `/setup`:
  ```ts
      return NextResponse.redirect(appUrl(request, "/setup?connectionError=unknown_service"));
  ```
  e
  ```ts
    const nextUrl = appUrl(
      request,
      `/setup?connectionError=${error}&service=${integration.id}&missing=${encodeURIComponent(missing)}`,
    );
  ```

- [ ] **Step 3: Aposentar /onboarding com redirect permanente.** Substituir todo o conteúdo de `apps/web/src/app/onboarding/page.tsx` por:
  ```tsx
  import { redirect } from "next/navigation";

  export default function OnboardingPage() {
    redirect("/setup");
  }
  ```

- [ ] **Step 4: Typecheck + build parcial.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx tsc --noEmit
  ```
  Esperado: sem erros. Se `syncConnectionAction` import ficar órfão, ele foi removido junto com o corpo do onboarding — confirme que o novo arquivo não importa nada além de `redirect`.

- [ ] **Step 5: Commit.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator && git add apps/web/src/app/page.tsx apps/web/src/app/api/integrations/[id]/connect/route.ts apps/web/src/app/onboarding/page.tsx && git commit -m "Make landing value-generic and retire /onboarding into /setup"
  ```

## Task 10: Web — /setup como tela única de conexão com gate visível

**Files:**
- Modify: `apps/web/src/app/setup/page.tsx`

- [ ] **Step 1: Reescrever `/setup` como conexão GitHub-first (Server Component).** Substituir `apps/web/src/app/setup/page.tsx` por uma tela que lê conexões e mostra os dois estados do spec. Conteúdo:
  ```tsx
  import Link from "next/link";
  import { ArrowRight, Check, Github } from "lucide-react";
  import { SetupShell } from "@/components/setup/setup-shell";
  import { Button } from "@/components/ui/button";
  import { Card } from "@/components/ui/card";
  import { Badge } from "@/components/ui/badge";
  import { integrationCatalog } from "@/features/integrations/catalog";
  import { getConnectionsState } from "@/lib/api-client";
  import { hasActiveGithub } from "@/lib/gate";

  export default async function SetupPage() {
    const connectionsState = await getConnectionsState();
    const connections = connectionsState.data?.connections ?? [];
    const githubReady = hasActiveGithub(connections);
    const optional = integrationCatalog.filter((integration) => integration.id !== "github");

    return (
      <SetupShell currentStep={1}>
        <section className="mx-auto w-full max-w-[720px] px-5 py-16">
          <h1 className="text-balance text-[30px] font-semibold leading-[1.15] tracking-[-0.03em]">Conecte o GitHub para começar</h1>
          <p className="mt-3 text-[15px] leading-normal text-[#9AA4BA]">
            O GitHub é o que dá conteúdo ao seu dashboard. As demais fontes são opcionais e você pode adicionar depois.
          </p>

          <Card className="mt-8 border-[var(--standup-accent)] bg-gradient-to-b from-[#1A2130] to-[#121826] p-5">
            <div className="flex items-center justify-between gap-5">
              <div className="flex items-center gap-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#1A2130] text-[#E9EDF7]">
                  <Github className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">GitHub</h2>
                  <p className="mt-1 text-[13px] text-[#9AA4BA]">PRs, reviews, checks e issues normalizados em WorkEvents.</p>
                </div>
              </div>
              {githubReady ? (
                <Badge tone="green">
                  <Check className="mr-1 h-3 w-3" /> Conectado
                </Badge>
              ) : (
                <Button asChild>
                  <Link href="/api/integrations/github/connect">Conectar GitHub</Link>
                </Button>
              )}
            </div>
          </Card>

          {githubReady ? (
            <div className="mt-6 flex items-center gap-4">
              <Button asChild size="lg">
                <Link href="/dashboard">
                  Ir para o dashboard
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <span className="text-[12.5px] text-[#6A7489]">A primeira sync roda automaticamente.</span>
            </div>
          ) : null}

          <div className="mt-10">
            <p className="text-sm font-medium text-[#9AA4BA]">Fontes opcionais</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {optional.map((integration) => (
                <Link
                  key={integration.id}
                  href={`/api/integrations/${integration.id}/connect`}
                  className="flex items-center justify-between rounded-md border border-[#212938] bg-[#121826] p-4 text-sm transition-colors hover:border-[#2A3345]"
                >
                  <span>{integration.name}</span>
                  <Badge tone="neutral">Adicionar</Badge>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </SetupShell>
    );
  }
  ```
  Nota: usa `integrationCatalog` (já usado em `dashboard/page.tsx` e no antigo onboarding) e `Badge`/`Button`/`Card` existentes. Confirme que `Badge` aceita `tone` (usado assim no dashboard) e `Button` aceita `asChild`.

- [ ] **Step 2: Typecheck.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx tsc --noEmit
  ```
  Esperado: sem erros.

- [ ] **Step 3: Commit.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator && git add apps/web/src/app/setup/page.tsx && git commit -m "Consolidate /setup into single github-first connection screen"
  ```

## Task 11: Web — interface subscribeDashboard + usePolling + endpoint interno

**Files:**
- Create: `apps/web/src/lib/subscribe-dashboard.ts`
- Create: `apps/web/src/lib/use-polling.ts`
- Create: `apps/web/src/app/api/dashboard/route.ts`
- Test: `apps/web/src/lib/subscribe-dashboard.test.ts`

- [ ] **Step 1: Escrever teste da interface de polling (FAIL).** Criar `apps/web/src/lib/subscribe-dashboard.test.ts`:
  ```ts
  import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
  import type { DashboardPayload } from "@/lib/api-client";
  import { pollingSource } from "@/lib/subscribe-dashboard";

  const payload = { workspaceId: "w", events: [] } as unknown as DashboardPayload;

  describe("pollingSource", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ dashboard: payload }) }));
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it("emits a payload on each interval tick and stops after unsubscribe", async () => {
      const onData = vi.fn();
      const unsubscribe = pollingSource({ intervalMs: 1000, onData });
      await vi.advanceTimersByTimeAsync(1000);
      expect(onData).toHaveBeenCalledTimes(1);
      expect(onData).toHaveBeenCalledWith(payload);
      unsubscribe();
      await vi.advanceTimersByTimeAsync(2000);
      expect(onData).toHaveBeenCalledTimes(1);
    });
  });
  ```

- [ ] **Step 2: Rodar (espera FAIL).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx vitest run src/lib/subscribe-dashboard.test.ts
  ```
  Esperado: falha (`@/lib/subscribe-dashboard` inexistente).

- [ ] **Step 3: Implementar a interface + polling source.** Criar `apps/web/src/lib/subscribe-dashboard.ts`:
  ```ts
  import type { DashboardPayload } from "@/lib/api-client";

  export type DashboardSourceOptions = {
    intervalMs: number;
    onData: (payload: DashboardPayload) => void;
    onError?: (message: string) => void;
  };

  export type Unsubscribe = () => void;

  export type SubscribeDashboard = (options: DashboardSourceOptions) => Unsubscribe;

  async function fetchDashboard(): Promise<DashboardPayload | null> {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { dashboard?: DashboardPayload };
    return body.dashboard ?? null;
  }

  export const pollingSource: SubscribeDashboard = ({ intervalMs, onData, onError }) => {
    let stopped = false;

    async function tick() {
      try {
        const payload = await fetchDashboard();
        if (!stopped && payload) onData(payload);
      } catch {
        if (!stopped) onError?.("Unable to refresh the dashboard.");
      }
    }

    const timer = setInterval(tick, intervalMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  };
  ```

- [ ] **Step 4: Rodar (espera PASS).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx vitest run src/lib/subscribe-dashboard.test.ts
  ```
  Esperado: `1 passed`.

- [ ] **Step 5: Endpoint interno de dashboard.** Criar `apps/web/src/app/api/dashboard/route.ts` (server-side chama o gateway, não expõe segredos ao browser):
  ```ts
  import { NextResponse } from "next/server";
  import { getDashboardState } from "@/lib/api-client";

  export async function GET() {
    const state = await getDashboardState();
    if (state.error || !state.data) {
      return NextResponse.json({ error: state.error ?? "unavailable" }, { status: 502 });
    }
    return NextResponse.json({ dashboard: state.data.dashboard });
  }
  ```

- [ ] **Step 6: Hook usePolling.** Criar `apps/web/src/lib/use-polling.ts`:
  ```ts
  "use client";

  import { useEffect, useState } from "react";
  import type { DashboardPayload } from "@/lib/api-client";
  import { pollingSource, type SubscribeDashboard } from "@/lib/subscribe-dashboard";

  export function usePolling(
    initial: DashboardPayload,
    intervalMs = 60_000,
    source: SubscribeDashboard = pollingSource,
  ) {
    const [payload, setPayload] = useState<DashboardPayload>(initial);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      const unsubscribe = source({
        intervalMs,
        onData: (next) => {
          setPayload(next);
          setError(null);
        },
        onError: (message) => setError(message),
      });

      function onFocus() {
        void fetch("/api/dashboard", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((body) => {
            if (body?.dashboard) {
              setPayload(body.dashboard as DashboardPayload);
              setError(null);
            }
          })
          .catch(() => setError("Unable to refresh the dashboard."));
      }

      window.addEventListener("focus", onFocus);
      return () => {
        unsubscribe();
        window.removeEventListener("focus", onFocus);
      };
    }, [intervalMs, source]);

    return { payload, error };
  }
  ```

- [ ] **Step 7: Typecheck.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx tsc --noEmit
  ```
  Esperado: sem erros.

- [ ] **Step 8: Commit.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator && git add apps/web/src/lib/subscribe-dashboard.ts apps/web/src/lib/subscribe-dashboard.test.ts apps/web/src/lib/use-polling.ts apps/web/src/app/api/dashboard/route.ts && git commit -m "Add subscribeDashboard interface, usePolling hook, and internal dashboard endpoint"
  ```

## Task 12: Web — cálculo do delta do sino de notificações

**Files:**
- Modify: `apps/web/src/lib/dashboard-view-model.ts`
- Test: `apps/web/src/lib/dashboard-view-model.test.ts`

- [ ] **Step 1: Escrever teste do delta (FAIL).** Em `apps/web/src/lib/dashboard-view-model.test.ts`, adicionar:
  ```ts
  import { countNewItems } from "@/lib/dashboard-view-model";

  describe("countNewItems", () => {
    it("counts events not present in the previously seen set", () => {
      const prev = new Set<string>(["a", "b"]);
      const next = [
        ev({ id: "a", occurredAt: "2026-08-01T10:00:00Z" }),
        ev({ id: "b", occurredAt: "2026-08-01T10:00:00Z" }),
        ev({ id: "c", occurredAt: "2026-08-01T11:00:00Z" }),
      ];
      expect(countNewItems(next, prev)).toBe(1);
    });
    it("counts an item whose occurredAt changed as new", () => {
      const prev = new Set<string>(["a@2026-08-01T10:00:00Z"]);
      const next = [ev({ id: "a", occurredAt: "2026-08-01T12:00:00Z" })];
      expect(countNewItems(next, prev)).toBe(1);
    });
  });
  ```

- [ ] **Step 2: Rodar (espera FAIL).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx vitest run src/lib/dashboard-view-model.test.ts
  ```
  Esperado: falha (`countNewItems` inexistente).

- [ ] **Step 3: Implementar `countNewItems` + chave.** Em `apps/web/src/lib/dashboard-view-model.ts`, adicionar:
  ```ts
  export function eventKey(event: WorkEvent): string {
    return `${event.id}@${event.occurredAt}`;
  }

  export function countNewItems(events: WorkEvent[], seen: Set<string>): number {
    return events.filter((event) => !seen.has(event.id) && !seen.has(eventKey(event))).length;
  }
  ```
  Nota: o sino compara por `id` e por `id@occurredAt` — o conjunto `seen` pode conter qualquer das duas formas (id puro para "já visto por id", ou `id@occurredAt` para detectar mudança de `occurredAt`).

- [ ] **Step 4: Rodar (espera PASS).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx vitest run src/lib/dashboard-view-model.test.ts
  ```
  Esperado: todos verdes.

- [ ] **Step 5: Commit.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator && git add apps/web/src/lib/dashboard-view-model.ts apps/web/src/lib/dashboard-view-model.test.ts && git commit -m "Add notification delta counter to view-model"
  ```

## Task 13: Web — componentes NowBlock, ActionSection, DashboardHeader, MetricStrip clicável

**Files:**
- Create: `apps/web/src/components/workspace/now-block.tsx`
- Create: `apps/web/src/components/workspace/action-section.tsx`
- Create: `apps/web/src/components/workspace/dashboard-header.tsx`
- Modify: `apps/web/src/components/workspace/metric-strip.tsx`
- Test: `apps/web/src/components/workspace/action-section.test.tsx`

- [ ] **Step 0: MetricStrip com contadores clicáveis (âncora até a seção).** Em `apps/web/src/components/workspace/metric-strip.tsx`, adicionar `href?: string` ao `MetricItem` e, quando presente, envolver o `Card` num `<a>` que rola até a seção. Substituir o corpo do arquivo por:
  ```tsx
  import type { LucideIcon } from "lucide-react";
  import { AnimeStagger } from "@/components/motion/anime-stagger";
  import { Card } from "@/components/ui/card";

  export type MetricItem = {
    label: string;
    value: string;
    icon: LucideIcon;
    href?: string;
  };

  export function MetricStrip({ metrics }: { metrics: MetricItem[] }) {
    return (
      <AnimeStagger className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => {
          const body = (
            <Card className="p-4 transition-colors hover:border-[var(--standup-accent)]">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{metric.label}</span>
                <metric.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight">{metric.value}</p>
            </Card>
          );
          return metric.href ? (
            <a key={metric.label} href={metric.href} className="block">
              {body}
            </a>
          ) : (
            <div key={metric.label}>{body}</div>
          );
        })}
      </AnimeStagger>
    );
  }
  ```
  Nota: o grid passa a `xl:grid-cols-5` para acomodar os 5 contadores (Revisar/Resolver/Responder/Desbloquear + Fontes conectadas). Verifique se outros consumidores de `MetricStrip` (nenhum além do dashboard, após a Task 15) dependem de 4 colunas.

- [ ] **Step 1: NowBlock (hero "Agora").** Criar `apps/web/src/components/workspace/now-block.tsx`:
  ```tsx
  import Link from "next/link";
  import { Zap } from "lucide-react";
  import { Card } from "@/components/ui/card";
  import { Button } from "@/components/ui/button";
  import { Badge } from "@/components/ui/badge";
  import type { WorkEvent } from "@/lib/api-client";
  import { formatRelativeTime } from "@/lib/dashboard-view-model";

  const actionLabels: Record<string, string> = {
    review: "Revisar",
    resolve: "Resolver",
    respond: "Responder",
    unblock: "Desbloquear",
  };

  export function NowBlock({ item }: { item: WorkEvent | null }) {
    if (!item) return null;
    const label = actionLabels[item.actionGroup ?? ""] ?? "Abrir";
    const href = item.type.includes("pull_request") ? `/pull-requests/${item.id}` : `/issues/${item.id}`;

    return (
      <Card className="border-[var(--standup-accent)] bg-gradient-to-b from-[#1A2130] to-[#121826] p-5">
        <div className="flex items-center gap-2 text-[var(--standup-accent-text)]">
          <Zap className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-[0.06em]">Agora</span>
        </div>
        <h2 className="mt-3 text-lg font-semibold">{item.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {item.source} · {item.actor} · {formatRelativeTime(item.occurredAt)}
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Button asChild>
            <Link href={href}>{label}</Link>
          </Button>
          <Badge tone="amber">{item.priority}</Badge>
        </div>
      </Card>
    );
  }
  ```

- [ ] **Step 2: Escrever teste da ActionSection (FAIL).** Criar `apps/web/src/components/workspace/action-section.test.tsx`:
  ```tsx
  import { describe, expect, it } from "vitest";
  import { render, screen } from "@testing-library/react";
  import type { WorkEvent } from "@/lib/api-client";
  import { ActionSection } from "@/components/workspace/action-section";

  function ev(id: string): WorkEvent {
    return {
      id,
      service: "github",
      type: "pull_request.review_requested",
      title: `PR ${id}`,
      source: "repo",
      actor: "you",
      priority: "medium",
      summary: "s",
      occurredAt: "2026-08-01T10:00:00Z",
      actionGroup: "review",
      urgencyScore: 300,
    };
  }

  describe("ActionSection", () => {
    it("renders nothing when there are no items", () => {
      const { container } = render(<ActionSection id="review" title="Revisar" items={[]} />);
      expect(container.firstChild).toBeNull();
    });

    it("renders the title, count, and one card per item", () => {
      render(<ActionSection id="review" title="Revisar" items={[ev("1"), ev("2")]} />);
      expect(screen.getByText("Revisar")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("PR 1")).toBeInTheDocument();
      expect(screen.getByText("PR 2")).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 3: Rodar (espera FAIL).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx vitest run src/components/workspace/action-section.test.tsx
  ```
  Esperado: falha (`@/components/workspace/action-section` inexistente).

- [ ] **Step 4: ActionSection (colapsável, esconde quando vazia).** Criar `apps/web/src/components/workspace/action-section.tsx`:
  ```tsx
  "use client";

  import { useState } from "react";
  import Link from "next/link";
  import { ChevronDown } from "lucide-react";
  import { Card } from "@/components/ui/card";
  import { Badge } from "@/components/ui/badge";
  import { cn } from "@/lib/utils";
  import type { ActionGroup, WorkEvent } from "@/lib/api-client";
  import { formatRelativeTime } from "@/lib/dashboard-view-model";

  export function ActionSection({ id, title, items }: { id: ActionGroup; title: string; items: WorkEvent[] }) {
    const [open, setOpen] = useState(true);
    if (items.length === 0) return null;

    return (
      <Card id={id} className="p-5">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between">
          <span className="flex items-center gap-3">
            <h2 className="text-base font-semibold">{title}</h2>
            <Badge tone="neutral">{items.length}</Badge>
          </span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} />
        </button>
        {open ? (
          <div className="mt-4 divide-y divide-border">
            {items.map((item) => {
              const href = item.type.includes("pull_request") ? `/pull-requests/${item.id}` : `/issues/${item.id}`;
              return (
                <Link key={item.id} href={href} className="block py-3 first:pt-0 last:pb-0">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.source} · {item.actor} · {formatRelativeTime(item.occurredAt)}
                  </p>
                </Link>
              );
            })}
          </div>
        ) : null}
      </Card>
    );
  }
  ```

- [ ] **Step 5: Rodar (espera PASS).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx vitest run src/components/workspace/action-section.test.tsx
  ```
  Esperado: `2 passed`.

- [ ] **Step 6: DashboardHeader (saudação + sync + sino).** Criar `apps/web/src/components/workspace/dashboard-header.tsx`:
  ```tsx
  "use client";

  import { Bell, RefreshCw } from "lucide-react";
  import { Button } from "@/components/ui/button";
  import { Badge } from "@/components/ui/badge";

  export function DashboardHeader({
    syncLabel,
    newCount,
    offline,
    onSync,
  }: {
    syncLabel: string;
    newCount: number;
    offline: boolean;
    onSync: () => void;
  }) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bom te ver de volta</h1>
          <p className="text-sm text-muted-foreground">{syncLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onSync}>
            <RefreshCw className="h-4 w-4" /> Sincronizar
          </Button>
          <span className="relative inline-flex">
            <Bell className="h-5 w-5 text-muted-foreground" />
            {newCount > 0 ? (
              <Badge tone="red" className="absolute -right-3 -top-2">
                {newCount}
              </Badge>
            ) : null}
          </span>
          <Badge tone={offline ? "red" : "green"}>{offline ? "Gateway offline" : "Ao vivo"}</Badge>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 7: Typecheck.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx tsc --noEmit
  ```
  Esperado: sem erros. Confirme que `Badge` aceita `className` (usado no header/sino); se não aceitar, o passo de implementação do Badge precisa expor `className` — verifique `apps/web/src/components/ui/badge.tsx`.

- [ ] **Step 8: Commit.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator && git add apps/web/src/components/workspace/now-block.tsx apps/web/src/components/workspace/action-section.tsx apps/web/src/components/workspace/action-section.test.tsx apps/web/src/components/workspace/dashboard-header.tsx apps/web/src/components/workspace/metric-strip.tsx && git commit -m "Add NowBlock, ActionSection, DashboardHeader, and clickable MetricStrip"
  ```

## Task 14: Web — DashboardLive (client) cobrindo todos os estados

**Files:**
- Create: `apps/web/src/components/workspace/dashboard-live.tsx`
- Test: `apps/web/src/components/workspace/dashboard-live.test.tsx`

- [ ] **Step 1: Escrever teste dos estados (FAIL).** Criar `apps/web/src/components/workspace/dashboard-live.test.tsx`. Injetamos um `source` fake para evitar timers/fetch:
  ```tsx
  import { describe, expect, it, vi } from "vitest";
  import { render, screen } from "@testing-library/react";
  import type { DashboardPayload, WorkEvent } from "@/lib/api-client";
  import { normalizeDashboardPayload } from "@/lib/dashboard-view-model";
  import { DashboardLive } from "@/components/workspace/dashboard-live";

  const noopSource = () => () => {};

  function payloadWith(events: WorkEvent[]): DashboardPayload {
    return normalizeDashboardPayload({ events } as DashboardPayload);
  }

  function review(id: string): WorkEvent {
    return {
      id, service: "github", type: "pull_request.review_requested", title: `Review ${id}`,
      source: "repo", actor: "you", priority: "high", summary: "s",
      occurredAt: "2026-08-01T10:00:00Z", actionGroup: "review", urgencyScore: 400,
    };
  }

  describe("DashboardLive", () => {
    it("shows the positive empty state when there are zero pendências", () => {
      render(<DashboardLive initial={payloadWith([])} offline={false} source={noopSource} />);
      expect(screen.getByText(/Tudo em dia/i)).toBeInTheDocument();
    });

    it("renders the Revisar section and the connect invite when only GitHub has items", () => {
      render(<DashboardLive initial={payloadWith([review("1")])} offline={false} source={noopSource} />);
      expect(screen.getByText("Revisar")).toBeInTheDocument();
      expect(screen.getByText(/Conecte Linear\/Slack/i)).toBeInTheDocument();
      expect(screen.queryByText("Resolver")).not.toBeInTheDocument();
    });

    it("shows a non-blocking offline banner while keeping cached content", () => {
      render(<DashboardLive initial={payloadWith([review("1")])} offline source={noopSource} />);
      expect(screen.getByText(/Gateway offline/i)).toBeInTheDocument();
      expect(screen.getByText("Review 1")).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Rodar (espera FAIL).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx vitest run src/components/workspace/dashboard-live.test.tsx
  ```
  Esperado: falha (`@/components/workspace/dashboard-live` inexistente).

- [ ] **Step 3: Implementar DashboardLive.** Criar `apps/web/src/components/workspace/dashboard-live.tsx`:
  ```tsx
  "use client";

  import { useEffect, useMemo, useRef, useState } from "react";
  import { AlertTriangle, CheckCircle2, GitPullRequest, MessagesSquare, Workflow } from "lucide-react";
  import { Card } from "@/components/ui/card";
  import { MetricStrip } from "@/components/workspace/metric-strip";
  import { NowBlock } from "@/components/workspace/now-block";
  import { ActionSection } from "@/components/workspace/action-section";
  import { DashboardHeader } from "@/components/workspace/dashboard-header";
  import type { DashboardPayload } from "@/lib/api-client";
  import { pollingSource, type SubscribeDashboard } from "@/lib/subscribe-dashboard";
  import {
    buildActionSections,
    countNewItems,
    eventKey,
    latestSyncLabel,
    pickNowItem,
    sourcesConnectedCount,
  } from "@/lib/dashboard-view-model";

  export function DashboardLive({
    initial,
    offline,
    source = pollingSource,
  }: {
    initial: DashboardPayload;
    offline: boolean;
    source?: SubscribeDashboard;
  }) {
    const [payload, setPayload] = useState<DashboardPayload>(initial);
    const [isOffline, setIsOffline] = useState(offline);
    const [newCount, setNewCount] = useState(0);
    const seenRef = useRef<Set<string>>(new Set(initial.events.map(eventKey)));

    useEffect(() => {
      const unsubscribe = source({
        intervalMs: 60_000,
        onData: (next) => {
          setNewCount(countNewItems(next.events, seenRef.current));
          setPayload(next);
          setIsOffline(false);
        },
        onError: () => setIsOffline(true),
      });
      return unsubscribe;
    }, [source]);

    const sections = useMemo(() => buildActionSections(payload.events), [payload.events]);
    const nowItem = useMemo(() => pickNowItem(payload.events), [payload.events]);
    const connectedSources = sourcesConnectedCount(payload.sourceHealth);
    const onlyGithub =
      payload.events.length > 0 && payload.events.every((event) => event.service === "github");
    const isEmpty = payload.events.length === 0;

    function markSeen() {
      seenRef.current = new Set(payload.events.map(eventKey));
      setNewCount(0);
    }

    const metrics = [
      { label: "Revisar", value: sections.review.length.toString(), icon: GitPullRequest, href: "#review" },
      { label: "Resolver", value: sections.resolve.length.toString(), icon: AlertTriangle, href: "#resolve" },
      { label: "Responder", value: sections.respond.length.toString(), icon: MessagesSquare, href: "#respond" },
      { label: "Desbloquear", value: sections.unblock.length.toString(), icon: AlertTriangle, href: "#unblock" },
      { label: "Fontes conectadas", value: connectedSources.toString(), icon: Workflow },
    ];

    return (
      <div className="mx-auto max-w-5xl space-y-6" onClick={markSeen}>
        <DashboardHeader
          syncLabel={latestSyncLabel(payload)}
          newCount={newCount}
          offline={isOffline}
          onSync={markSeen}
        />
        {isOffline ? (
          <Card className="border-[#4A2230] bg-[#22141C] p-4 text-sm text-[#FF9CAF]">
            Gateway offline. Mostrando o último dado sincronizado.
          </Card>
        ) : null}

        {isEmpty ? (
          <Card className="flex items-center gap-3 p-6">
            <CheckCircle2 className="h-6 w-6 text-[var(--standup-accent)]" />
            <div>
              <p className="text-base font-semibold">Tudo em dia</p>
              <p className="text-sm text-muted-foreground">Nenhuma pendência precisa de você agora.</p>
            </div>
          </Card>
        ) : (
          <>
            <NowBlock item={nowItem} />
            <MetricStrip metrics={metrics} />
            <div className="space-y-4">
              <ActionSection id="review" title="Revisar" items={sections.review} />
              <ActionSection id="resolve" title="Resolver" items={sections.resolve} />
              <ActionSection id="respond" title="Responder" items={sections.respond} />
              <ActionSection id="unblock" title="Desbloquear" items={sections.unblock} />
            </div>
            {onlyGithub ? (
              <Card className="p-4 text-sm text-muted-foreground">
                Conecte Linear/Slack para ver bugs e respostas aqui também.
              </Card>
            ) : null}
          </>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 4: Rodar (espera PASS).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx vitest run src/components/workspace/dashboard-live.test.tsx
  ```
  Esperado: `3 passed`.

- [ ] **Step 5: Commit.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator && git add apps/web/src/components/workspace/dashboard-live.tsx apps/web/src/components/workspace/dashboard-live.test.tsx && git commit -m "Add DashboardLive covering empty, near-empty, and offline states"
  ```

## Task 15: Web — RSC do dashboard renderiza DashboardLive

**Files:**
- Modify: `apps/web/src/app/(workspace)/dashboard/page.tsx`

- [ ] **Step 1: Reescrever o RSC para delegar ao DashboardLive.** Substituir `apps/web/src/app/(workspace)/dashboard/page.tsx` por:
  ```tsx
  import { DashboardLive } from "@/components/workspace/dashboard-live";
  import { getDashboardState } from "@/lib/api-client";
  import { normalizeDashboardPayload } from "@/lib/dashboard-view-model";

  export default async function DashboardPage() {
    const dashboardState = await getDashboardState();
    const payload = normalizeDashboardPayload(dashboardState.data?.dashboard);
    return <DashboardLive initial={payload} offline={Boolean(dashboardState.error)} />;
  }
  ```
  Nota: o skeleton "sync em andamento" é coberto por `app/(workspace)/dashboard/loading.tsx` no próximo passo.

- [ ] **Step 2: Skeleton de carregamento.** Criar `apps/web/src/app/(workspace)/dashboard/loading.tsx`:
  ```tsx
  import { Card } from "@/components/ui/card";

  export default function DashboardLoading() {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="h-10 w-64 animate-pulse rounded-md bg-muted" />
        <Card className="h-32 animate-pulse bg-muted" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="h-24 animate-pulse bg-muted" />
          ))}
        </div>
        <Card className="h-40 animate-pulse bg-muted" />
      </div>
    );
  }
  ```

- [ ] **Step 3: Typecheck + build.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx tsc --noEmit && npm run build
  ```
  Esperado: build de produção sem erros. (Se `NEXT_PUBLIC_SUPABASE_URL` for exigido em build, defina placeholders em `.env` local ou variáveis de ambiente antes do build.)

- [ ] **Step 4: Rodar toda a suíte web (regressão).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npm run test
  ```
  Esperado: todos os testes verdes.

- [ ] **Step 5: Commit.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator && git add "apps/web/src/app/(workspace)/dashboard/page.tsx" "apps/web/src/app/(workspace)/dashboard/loading.tsx" && git commit -m "Wire dashboard RSC to DashboardLive with loading skeleton"
  ```

## Task 16: E2E — happy path (login mock → sem GitHub → /setup → conecta → dashboard)

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/happy-path.spec.ts`

- [ ] **Step 1: Config do Playwright.** Criar `apps/web/playwright.config.ts`:
  ```ts
  import { defineConfig } from "@playwright/test";

  export default defineConfig({
    testDir: "./e2e",
    use: { baseURL: "http://localhost:3000" },
    webServer: {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  });
  ```

- [ ] **Step 2: Instalar browsers.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npx playwright install chromium
  ```
  Esperado: download do Chromium concluído.

- [ ] **Step 3: Escrever o E2E (mock de rede).** Criar `apps/web/e2e/happy-path.spec.ts`. Interceptamos a sessão do Supabase e o gateway para não depender de credenciais reais:
  ```ts
  import { test, expect, type Route } from "@playwright/test";

  const noGithub = { data: { connections: [] } };
  const withGithub = {
    data: { connections: [{ service: "github", status: "connected", hasToken: true }] },
  };
  const dashboard = {
    dashboard: {
      workspaceId: "w",
      generatedAt: "2026-08-01T12:00:00Z",
      metrics: { connectedSources: 1, waitingReview: 1, crossToolBlockers: 0, decisionsFound: 0 },
      today: { prsWaitingForReview: [], blockedPrs: [], failedChecks: [], assignedIssues: [], recentImportantChanges: [] },
      focus: [],
      weeklySummary: { completedWork: [], mergedPrs: [], closedIssues: [], activeWork: [], risks: [], blockers: [], summaryStrategy: "test" },
      events: [
        {
          id: "pr1", service: "github", type: "pull_request.review_requested", title: "Review auth flow",
          source: "repo", actor: "you", priority: "high", summary: "s", occurredAt: "2026-08-01T10:00:00Z",
          actionGroup: "review", urgencyScore: 420,
        },
      ],
      sourceHealth: [{ service: "github", status: "connected" }],
    },
  };

  test("login → sem GitHub → /setup → conecta → dashboard com itens", async ({ page }) => {
    let connected = false;

    // Simula usuário autenticado no middleware/RSC (Supabase getUser).
    await page.route("**/auth/v1/user*", (route: Route) =>
      route.fulfill({ json: { id: "user-1", aud: "authenticated" } }),
    );
    // Gateway: conexões (muda após "conectar") e dashboard.
    await page.route("**/v1/connections", (route: Route) =>
      route.fulfill({ json: connected ? withGithub.data : noGithub.data }),
    );
    await page.route("**/api/dashboard", (route: Route) => route.fulfill({ json: dashboard }));
    await page.route("**/api/integrations/github/connect", async (route: Route) => {
      connected = true;
      await route.fulfill({ status: 302, headers: { location: "/setup" } });
    });

    // Sem GitHub: middleware manda /dashboard → /setup.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/setup/);
    await expect(page.getByText(/Conectar GitHub/i)).toBeVisible();

    // Conecta GitHub.
    await page.getByRole("link", { name: /Conectar GitHub/i }).click();
    await expect(page.getByRole("link", { name: /Ir para o dashboard/i })).toBeVisible();

    // Vai ao dashboard e vê a seção Revisar com o item.
    await page.getByRole("link", { name: /Ir para o dashboard/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText("Revisar")).toBeVisible();
    await expect(page.getByText("Review auth flow")).toBeVisible();
  });
  ```
  Nota: se o middleware exigir a sessão via cookie do Supabase e o mock de rede não bastar, ajuste o teste para setar o cookie de sessão diretamente (`context.addCookies`) ou defina `E2E_BYPASS_AUTH` lido pelo `middleware.ts` apenas quando `process.env.NODE_ENV !== "production"`. Documente a escolha no PR.

- [ ] **Step 4: Rodar o E2E (espera PASS).**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npm run test:e2e
  ```
  Esperado: `1 passed`.

- [ ] **Step 5: Commit.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator && git add apps/web/playwright.config.ts apps/web/e2e/happy-path.spec.ts && git commit -m "Add E2E happy path for login gate and dashboard"
  ```

## Task 17: Verificação final e limpeza

**Files:** (nenhum novo)

- [ ] **Step 1: Suíte Go completa.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/api && go test ./...
  ```
  Esperado: `ok` em todos os pacotes.

- [ ] **Step 2: Suíte web completa + typecheck + lint.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator/apps/web && npm run test && npx tsc --noEmit && npm run lint
  ```
  Esperado: tudo verde.

- [ ] **Step 3: Confirmar que `/onboarding` só redireciona e que nenhuma referência a `/onboarding` restou.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator && grep -rn "/onboarding" apps/web/src || echo "no onboarding references"
  ```
  Esperado: apenas o redirect em `onboarding/page.tsx` (ou "no onboarding references" se você mover o redirect para o middleware).

- [ ] **Step 4: Commit final se houver ajustes.**
  ```bash
  cd /Users/guilhermebersi/Documents/dev-orchestrator && git add -A && git commit -m "Finalize dashboard and initial-flow verification" || echo "nothing to commit"
  ```

---

## Self-Review Checklist

- [ ] `go test ./...` passa em `apps/api`; `npm run test` passa em `apps/web`.
- [ ] `apps/web/middleware.ts` redireciona: não-logado → `/login?redirect=<destino>`; logado sem GitHub → `/setup`; logado com GitHub → segue (coberto por `middleware.test.ts`).
- [ ] Landing (`/`) só oferece "Entrar com Google" / "Entrar" apontando `/login`; sem menção a GitHub no topo.
- [ ] `/setup` é a única tela de conexão; `/onboarding` só redireciona; `connect/route.ts` não referencia mais `/onboarding`.
- [ ] Backend anota `actionGroup`/`urgencyScore` em cada `WorkEvent` e ordena `Events` por score desc (coberto por `action_test.go` + `dashboard_test.go`).
- [ ] `WorkEvent` (TS) tem `actionGroup?`/`urgencyScore?`; view-model expõe `buildActionSections`, `pickNowItem`, `sourcesConnectedCount`, `countNewItems`, `eventKey`.
- [ ] Dashboard cobre: skeleton (`loading.tsx`), zero pendências ("Tudo em dia"), near-empty (só GitHub → só seções com itens + convite), offline (banner não-bloqueante + payload em cache).
- [ ] Polling atrás de `subscribeDashboard`/`pollingSource`; sino diffa novos por `id`/`id@occurredAt`.
- [ ] E2E happy path passa: login mock → sem GitHub → `/setup` → conecta → `/dashboard` com item na seção Revisar.
- [ ] Nenhum tipo/função referenciado antes de ser definido; caminhos de arquivo absolutos e reais.
