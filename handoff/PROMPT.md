# Prompt para o agente de implementação

Cole tudo abaixo da linha. Ele assume que a pasta `handoff/` está disponível no repo ou anexada.

---

Você vai implementar a UI do **Standup** a partir de um design aprovado. Leia o handoff inteiro antes de escrever qualquer linha de código.

## Material

`handoff/README.md` é a **fonte da verdade**. Ele traz tokens, modelo de dados, todas as telas, motion, estados vazios, acessibilidade e ordem de build. Nada nele é sugestão.

`handoff/Boards.dc.html` é o índice — abra primeiro, ele linka os quatro boards navegáveis:

- `Standup-landing-and-onboarding.dc.html` — landing + ativação (7 telas)
- `Standup-dashboard.dc.html` — Today: brief + fila + rail (4 estados)
- `Standup-wave-2.dc.html` — PR detail, issue detail, timeline, semana, chat (5 telas)
- `Brand.dc.html` — naming e a marca

Os boards são **protótipos de referência escritos em HTML**, não código de produção. Eles rodam sobre um runtime de template próprio da ferramenta de design (`<sc-for>`, `<sc-if>`, `{{ }}`, uma classe `Component`) que **não faz parte do produto**. Leia estrutura, copy exata e valores de pixel; escreva componentes idiomáticos no stack real.

Cada protótipo tem uma **barra fixa no rodapé** que troca de tela e de estado. É recurso de revisão — não implemente.

Onde o README e o HTML divergirem, **o HTML vence**.

## Produto, em uma frase

Standup conecta GitHub, Slack, Linear, Jira, Trello, Notion e Calendar, normaliza tudo em um `WorkEvent` e responde uma única pergunta em toda tela: **"o que eu faço agora?"**

Se um card não souber dizer por que está na tela, ele não fica na tela.

## Antes de começar — leia o repo

Não presuma nada sobre o código existente. Localize e reporte, antes de implementar:

1. Onde vivem os tokens de tema hoje e em que formato.
2. `apps/web/src/features/integrations/catalog.ts` — hoje usa lucide genéricos para representar produtos. Isso muda (ver §2 do README).
3. `apps/web/src/components/marketing/orbit-section.tsx` — hoje usa simple-icons só na landing.
4. Quais primitivos de UI já existem e devem ser reusados em vez de recriados.
5. O que já existe de dashboard e o que será substituído.

## Decisões já tomadas — não reabra

- **Dark only.** Sem tema claro, sem toggle, sem hex fora da tabela do §2.
- **Navegação: Command.** Sem sidebar, sem tab bar. A especificação está no §6, inclusive o que o ⌘K precisa entregar. Se o ⌘K não puder sair completo no primeiro release, suba a variante **Tabs** — nunca Command com ⌘K fraco.
- **Fila única ranqueada.** As lanes se intercalam. Não agrupe, não insira divisores de seção.
- **A tela do dashboard não tem client component.** O filtro vive na URL; os chips são `<Link>`.
- **Detalhe é briefing, não clone.** PR e issue não têm diff, aprovação nem caixa de comentário.
- **Ícones de marca reais** para todo produto; lucide só para UI. O Slack não está no simple-icons e não vai voltar — asset local, normalizado.
- **Snooze/dismiss está fora de escopo.**

## Regras que quebram silenciosamente se ignoradas

- **Contraste:** `#79839B` é o piso para qualquer texto informativo. `#8C96AD` para frases. `#4A5468` nunca em texto.
- **Mono é semântico:** dado gerado por máquina em mono, linguagem humana em sans. Nunca uma frase em mono, nunca um contador em sans.
- **Português não se singulariza com regex.** `"decisões".replace(/e?s$/,'')` produz `"decisõ"`, e o adjetivo também precisa concordar. Os builders emitem pares explícitos `one`/`many`.
- **Métrica com valor zero não renderiza.** Nada de "0 bloqueadores", nada de link que leve a uma lane vazia.
- **Nunca `opacity: 0` inicial no markup.** Se a lib de animação falhar, tudo tem que continuar visível.
- **Só anime o que está abaixo da dobra.** Nada pode piscar no load.
- **Diga o que foi omitido.** "12 comentários de nit foram omitidos" é feature; truncar em silêncio não é.

## Ordem de build

1. `WorkEvent` + normalizador do GitHub, com a derivação de `QueueItem` atrás dele.
2. Shell de setup + connection center + fila de OAuth — **genérico sobre `SourceDef` desde o primeiro commit**.
3. Seleção de recursos + sync paralelo com progresso em stream.
4. Today: brief, fila, rail, dropdown do usuário.
5. Telas de detalhe, timeline, semana, chat.
6. Uma segunda fonte (Linear). **Se precisar de tela nova, o passo 2 foi feito errado.**

## Entrega e validação

- Rode lint, build e os testes na raiz. **Reporte o resultado real, incluindo falhas** — não resuma como sucesso o que não passou.
- Valide visualmente em desktop e, onde o README define, nos breakpoints intermediários.
- Confira contra os critérios do README: contraste, estados vazios, `prefers-reduced-motion`, nenhuma requisição de rede quebrada.

## Se algo travar

Pare e pergunte quando o design colidir com o código real, quando um contrato de prop não couber no que a API entrega, ou quando uma decisão do §6 não for implementável como está. Não improvise uma terceira via nem amplie o escopo por conta própria.
