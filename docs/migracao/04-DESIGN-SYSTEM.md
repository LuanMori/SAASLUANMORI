# 04 — Design system (manual de reconstrução)

Fase 1 da reconstrução (`docs/migracao/PROMPT-MESTRE.md`, item 1.2: visual idêntico, nada inventado). Fonte única do
visual do sistema antigo: `legacy/web/src/estilos.css` (1588 linhas), mais os ícones desenhados em SVG dentro dos
componentes. A referência para comparar o resultado é a demonstração congelada `legacy/demo/sistema-padrao-demo.html`
(não se regera).

## 0. Como o visual é reconstruído

- `backend/src/main/resources/static/css/app.css` reproduz `legacy/web/src/estilos.css` **regra por regra**: os mesmos
  seletores, os mesmos valores, a mesma ordem e as mesmas media queries. Nada de cor, fonte ou medida nova.
- Os templates Thymeleaf repetem o **markup** que os componentes React geravam (as mesmas tags, classes, atributos
  `role`/`aria-*` e a mesma ordem dos elementos), porque o CSS depende dessa estrutura (ex.: `.navlist, .navsec { display:
  contents }` no celular, `estilos.css:446`). Cada tela tem o componente de origem citado em `01-MAPA-DE-TELAS.md`.
- `legacy/web/src/demo/demo.css` (faixa amarela da demonstração e o aviso de gravação do navegador) **não** vai para o
  sistema novo: é só da demonstração (`demo.css:1`).
- O tema escuro usa as mesmas regras, com as variáveis trocadas pelo atributo `data-tema` do `<html>` (§7).

---

## 1. Cores (variáveis CSS)

Definidas em `:root` (tema claro, `estilos.css:2-50`) e redefinidas em `:root[data-tema='escuro']` (`estilos.css:
1407-1450`). Cor principal: verde `#0b7f55` (branco por cima tem contraste 5:1, `estilos.css:8`); no escuro o verde dos
botões continua `#0b7f55`, e o verde usado como texto fica mais claro (`estilos.css:1407-1408`).

| Variável | Claro | Escuro | Uso |
|---|---|---|---|
| `--fundo` | `#f4f5f7` | `#121413` | fundo da página |
| `--superficie` | `#ffffff` | `#1b1e1c` | cartões, painéis, campos |
| `--superficie-2` | `#f7f8f8` | `#232725` | cabeçalho de tabela, botão de quantidade |
| `--superficie-verde` | `#f5f9f7` | `#19271f` | destaque verde leve (linha, resumo, hover de linha) |
| `--hover` | `#f0f2f5` | `#272b29` | hover de botão comum |
| `--borda` | `#e2e5ea` | `#323834` | bordas |
| `--borda-campo` | `#8b929c` | `#5d655f` | borda de campo de digitação |
| `--borda-campo-forte` | `#5f6670` | `#808883` | borda de campo no hover |
| `--borda-leve` | `#b9c2bd` | `#444b47` | bordas leves |
| `--tecla-borda` | `#c3cac6` | `#4a514d` | teclas/atalhos |
| `--texto` | `#1c2430` | `#e6e9e7` | texto |
| `--texto-forte` | `#2b3038` | `#f2f4f3` | texto forte |
| `--suave` | `#667085` | `#a6ada9` | texto secundário |
| `--placeholder` | `#9aa1aa` | `#7f8682` | placeholder |
| `--icone` | `#4b525c` | `#b7beba` | ícones dos campos |
| `--neutro-fundo` | `#eceeed` | `#2c312e` | fundo neutro |
| `--desativado-fundo` | `#c9cdd2` | `#3b403d` | botão desativado |
| `--desativado-texto` | `#4b4f56` | `#a6ada9` | texto desativado |
| `--desativado-linha` | `#eef0f3` | `#262a28` | linha desativada |
| `--primaria` | `#0b7f55` | `#0b7f55` (não muda) | botão principal, marca |
| `--primaria-escura` | `#065f46` | `#0a6b48` | hover do botão principal |
| `--primaria-clara` | `#e6f4ee` | `#163a2c` | fundo verde claro, alerta comum, selo |
| `--primaria-texto` | `#0b7f55` | `#4cc792` | verde usado como texto e borda |
| `--primaria-texto-forte` | `#065f46` | `#82dcb4` | verde forte como texto |
| `--erro` | `#c4321f` | `#ff8a76` | erro |
| `--erro-fundo` | `#fdeeeb` | `#3b1d18` | fundo de erro |
| `--aviso` | `#8a5a00` | `#f2c76e` | atenção |
| `--aviso-fundo` | `#fff6e0` | `#372c12` | fundo de atenção |
| `--aviso-chip` | `#fff4dc` | `#3d3114` | chip de atenção |
| `--aviso-claro` | `#fffaf0` | `#2b2414` | caixa de autorização |
| `--sucesso-fundo` | `#dff3e9` | `#163628` | sucesso |
| `--sucesso-borda` | `#a9dcc3` | `#2e6d50` | borda de sucesso |
| `--sucesso-linha` | `#f2faf6` | `#182a20` | linha de sucesso |
| `--fundo-pdv` | `#eef2f0` | `#151816` | fundo da Frente de caixa |
| `--fundo-entrada` | `#f2f4f3` | `#121413` | fundo de entrada |
| `--entrada-fundo` | `#f3f8f5` | `#0f1412` | tela de entrada |
| `--entrada-mancha` | `rgba(11, 127, 85, 0.1)` | `rgba(11, 127, 85, 0.16)` | manchas verdes da tela de entrada |
| `--entrada-mancha-forte` | `rgba(11, 127, 85, 0.09)` | `rgba(11, 127, 85, 0.13)` | mancha atrás da ilustração |
| `--entrada-cartao-borda` | `rgba(16, 70, 45, 0.07)` | `#2a302c` | borda do cartão de entrada |
| `--marca-texto` | `#0f3d2e` | `#e9f4ee` | nome da marca e títulos da entrada |
| `--raio` | `10px` | `10px` | raio padrão (painel) |
| `color-scheme` | `light` | `dark` | controles nativos do navegador |

**Barra lateral** (iguais nos dois temas; a barra é escura sempre, cópia da do DaniPets V9.3.3 com o verde no lugar do
laranja) (`estilos.css:342-349`): `--side #1b1c1b`, `--side-ink #d4d8d5`, `--side-muted #989f9a`, `--side-group #8b928d`,
`--side-hover #252826`, `--side-active #2c302e`, `--side-line #313532`, `--side-btn #3a3e3b`, `--side-accent #4cc792`
(ícone do item ativo).

**Cores fixas fora das variáveis** (iguais nos dois temas): visor verde-escuro dos cartões grandes `#0d3a2b` (hover
`#104634`, rótulos e foco `#8fe0bd`, nota `#cde9dc`) (`estilos.css:499-512,688-691,1341-1349`); topo da Frente de caixa
`#1b1c1b`, pílulas `#2c302e`/`#d4d8d5`, borda `#4a4f4b` (`estilos.css:591-604`); caixa aberto `#0b5f40` e caixa ruim
`#9c2617` (`estilos.css:1257-1259`); avatar sem foto `#0b0e12` (`estilos.css:359,1016,1029`); hover do botão de perigo
`#a3291a` (`estilos.css:776`); no escuro, botão de perigo `#b3301e` (hover `#962716`) (`estilos.css:1451-1452`); texto
branco `#fff` sobre o verde.

---

## 2. Tipografia

- Texto: `font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`, com `-webkit-font-smoothing:
  antialiased` (`estilos.css:46-49`).
- Nome da loja na barra lateral: `--font-head: 'Bricolage Grotesque', Bahnschrift, 'Segoe UI Variable Display', 'Segoe
  UI', system-ui, -apple-system, sans-serif`, `700 18px/1.1` (`estilos.css:349,364`). Não há `@font-face` nem fonte
  baixada da internet em `legacy/`: vale a primeira fonte instalada no computador. A reconstrução também não baixa fonte.
- Números e códigos: `.mono` = `font-variant-numeric: tabular-nums; font-family: ui-monospace, 'SF Mono', Menlo,
  monospace; font-size: 0.92em` (`estilos.css:58`); `.numero` alinha à direita com algarismos de mesma largura
  (`estilos.css:127`).
- Escala usada (mais frequentes primeiro): 0.85rem, 0.82rem, 0.92rem, 0.8rem, 0.78rem, 0.9rem, 0.88rem, 1rem, 0.95rem,
  0.75rem, 1.05rem, 1.6rem, 1.1rem, 1.15rem, 1.3rem, 0.86rem, 0.72rem, 1.02rem, 1.5rem, 1.45rem, 1.2rem, 2.6rem; na barra
  lateral, 11px a 18px; na tela de entrada, tamanhos com `clamp()` que acompanham a largura e a altura da tela.
- Títulos: título da tela `1.6rem` com `letter-spacing: -0.02em` (`estilos.css:409,494`); `h2` `1.05rem` (`estilos.css:
  55`); título de cartão `1.02rem` (`estilos.css:460,463`); título de janela `1.2rem` (`estilos.css:765`); cabeçalho de
  tabela `0.8rem`, 600, maiúsculas, `letter-spacing: 0.04em`, cor `--suave` (`estilos.css:121`); rótulo de campo
  `0.85rem` `--suave` (`estilos.css:104`); erro de campo `0.82rem` (`estilos.css:110`).

---

## 3. Medidas, raios, sombras e camadas

- **Raios**: 10px (painel `--raio`, alertas, campos de janela, avisos), 8px (botões, campos), 12px (cartões, caixa de
  campo da entrada), 14px (visores, botões grandes do PDV), 16px (janelas, cartão de login), 24px (cartão de entrada),
  6px (itens da barra lateral), 999px (chips, pílulas, selo), 50% (avatares, bolinhas).
- **Sombras**: cartão de entrada `0 30px 70px rgba(16, 70, 45, 0.12), 0 4px 14px rgba(16, 70, 45, 0.05)`
  (`estilos.css:201`); janela `0 24px 60px rgba(0, 0, 0, 0.25)` (no escuro `rgba(0, 0, 0, 0.6)`) (`estilos.css:762,
  1455`); caixa do Suporte `0 8px 24px rgba(16, 40, 30, 0.14)` (`estilos.css:277`); botões da entrada `0 1px 3px
  rgba(16, 40, 30, 0.08)` (`estilos.css:258,267`); botão Entrar `0 2px 6px color-mix(in srgb, var(--primaria) 30%,
  transparent)` (`estilos.css:239`); foco de campo da entrada `0 0 0 3px color-mix(in srgb, var(--primaria) 22%,
  transparent)` (`estilos.css:223`); anel de seleção `0 0 0 3px var(--fundo), 0 0 0 6px var(--primaria)`; barra lateral
  no escuro `inset -1px 0 0 var(--borda)` (`estilos.css:1454`).
- **Camadas (z-index)**: 1 (topo fixo, cartão de entrada, cabeçalho fixo de tabela), 3 (tema e Suporte da entrada), 6
  (lista de produtos da busca no PDV), 50 (fundo da janela) (`estilos.css:92,199,254,620,650,759`).
- **Transições**: 0.12s em fundo, borda e sombra; 0.15s na rotação das setas (`estilos.css:220,258,267,502,512,528,
  1341`). Não há `@keyframes` nem animação de entrada.
- **Larguras**: barra lateral 232px (`estilos.css:350`); conteúdo da área logada `padding: 28px 32px`
  (`estilos.css:408`); Visão geral e Relatórios até 1240px (`estilos.css:493`); conteúdo antigo `.conteudo` até 1040px
  (`estilos.css:97`); janela 520px, larga 780px (`estilos.css:760-764`); cartão de login 360px (`estilos.css:83`);
  cartão de entrada entre 360px e 440px (`estilos.css:163`).

---

## 4. Breakpoints (media queries)

| Media query | O que muda | Fonte |
|---|---|---|
| `max-width: 760px` | formulários em 2 colunas, conteúdo com 16px | `estilos.css:130-138` |
| `max-width: 520px` | tabela vira lista (sem cabeçalho; produto e preço em grade) | `estilos.css:139-147` |
| `min-width: 1201px` | cartão de entrada no meio da metade direita | `estilos.css:168-170` |
| `min-width: 901px` | medidas da entrada acompanham a altura da tela (`--evh`) | `estilos.css:282-307` |
| `min-width: 901px and max-height: 700px` | tema e Suporte menores na entrada | `estilos.css:308-316` |
| `max-width: 1200px` | entrada sem a ilustração | `estilos.css:318-322` |
| `max-width: 900px` | entrada em uma coluna (logo, ilustração e cartão) | `estilos.css:323-335` |
| `max-width: 640px` | entrada sem ilustração, título menor | `estilos.css:336-340` |
| `min-width: 1001px and max-height: 870px` / `790px` / `650px` | barra lateral compacta (notebook) | `estilos.css:413-438` |
| `max-width: 1000px` | barra lateral vira faixa de botões no topo | `estilos.css:439-456` |
| `max-width: 760px`, `1100px`, `900px` | Relatórios | `estilos.css:833-845` |
| `min-width: 901px and min-height: 540px` (+ `max-width: 1240px`, `max-height: 820px`, `700px`, `620px`) | Frente de caixa na altura da tela | `estilos.css:846-934` |
| `max-width: 560px` | Frente de caixa no celular | `estilos.css:935-976` |
| `max-width: 760px` | Usuários | `estilos.css:997-1008` |
| `max-width: 600px`, `640px` | Meu usuário | `estilos.css:1047-1061` |
| `max-width: 640px` | Adm. Sup e manutenção | `estilos.css:1144-1163` |
| `max-width: 760px` | Compras | `estilos.css:1176-1189` |
| `max-width: 760px` | Caixa do dia | `estilos.css:1261-1277` |
| `max-width: 760px` | Clientes | `estilos.css:1311-1318` |
| `max-width: 900px`, `520px` | Fidelidade | `estilos.css:1396-1405` |
| `max-width: 1180px`, `760px`, `560px` | Financeiro | `estilos.css:1498-1519` |
| `max-width: 1100px`, `480px`, `560px` | Relatórios em abas | `estilos.css:1543-1552` |

---

## 5. Estados

| Estado | Como aparece | Fonte |
|---|---|---|
| hover | botão comum → `--hover`; principal → `--primaria-escura`; perigo → `#a3291a`; item da barra → `--side-hover` e texto branco; chip → borda verde; linha de tabela de vendas → `--superficie-verde`; caixa de campo da entrada → `--borda-campo-forte` | `estilos.css:73,76,776,373,488,473,222` |
| focus (teclado) | contorno `3px solid color-mix(in srgb, var(--primaria) 35%, transparent)`, `outline-offset` 1–2px; campos `30%`; na barra lateral `2px solid var(--side-accent)`; link `2px solid var(--primaria)`; visores `3px solid #8fe0bd` | `estilos.css:74,231-233,483,490,380,467,505` |
| focus-within | caixa de campo da entrada: borda verde e sombra de 3px | `estilos.css:223,227` |
| ativo/selecionado | item da barra `.nav.active` (fundo `--side-active`, texto 600, ícone `--side-accent`); chip `.chip-on`; aba `.cli-aba-on`; Suporte aberto `[aria-expanded='true']` | `estilos.css:374-376,489,1281,269` |
| desativado | principal `opacity: 0.6; cursor: wait` (operação em andamento); perigo com `--desativado-*` e `cursor: not-allowed`; Entrar com o verde misturado a 55% | `estilos.css:77,777,241-244,1453,1456` |
| carregando | "Carregando…" no meio da tela (`.carregando-tela`) ou no lugar da lista (`.vazio`) | `estilos.css:59,117`; `legacy/web/src/App.tsx:77`; `legacy/web/src/painel/TelaCaixaDoDia.tsx:114` |
| erro | campo com borda `--erro` e texto `.campo-erro`; `.alerta-erro`; aviso com ícone vermelho (octógono) | `estilos.css:109-115,1228-1250`; `legacy/web/src/painel/AvisoComIcone.tsx:19-23` |
| vazio | `.vazio`: texto `--suave`, centralizado, 28px em cima e embaixo | `estilos.css:117,464` |
| atenção / ok / informação | `.alerta` (verde claro), `.alerta-aviso` (amarelo); aviso com ícone: atenção (triângulo), ok (círculo com visto), informação (círculo com "i") | `estilos.css:114-116`; `AvisoComIcone.tsx:1-45` |

Sem rede depois da primeira carga, a tela mantém os dados e avisa; 401/403 bloqueia a tela com a mensagem
(`legacy/web/src/painel/usarCarga.ts:1-44`).

---

## 6. Componentes (markup de referência)

O markup abaixo é o que os componentes antigos geravam; os templates repetem as mesmas classes.

**Botões** (`estilos.css:68-78,775-777`)
```html
<button type="button" class="botao">Cancelar</button>
<button type="submit" class="botao botao-primario">Salvar</button>
<button type="button" class="botao botao-perigo">Excluir</button>
<button type="submit" class="botao botao-primario botao-grande">Entrar</button>
```

**Campo com rótulo e erro** (`estilos.css:101-111`)
```html
<div class="campo campo-com-erro">
  <label for="nome">Nome</label>
  <input id="nome" name="nome" aria-invalid="true" aria-describedby="nome-erro">
  <span id="nome-erro" class="campo-erro">Informe o nome do produto.</span>
</div>
```

**Alertas** (`estilos.css:113-117`) e **aviso com ícone** (`legacy/web/src/painel/AvisoComIcone.tsx:15-44`)
```html
<p class="alerta" role="status">Produto salvo.</p>
<p class="alerta alerta-erro" role="alert">Não foi possível concluir. Tente de novo.</p>
<div class="cx-aviso cx-aviso-atencao" role="status">
  <svg class="cx-aviso-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path d="M10.3 4 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>
  </svg>
  <p class="cx-aviso-texto">Abra o caixa de hoje (Caixa do dia) antes de vender.</p>
</div>
```

**Cartão** (`estilos.css:458-479`) — o card Pendências (`legacy/web/src/painel/CardPendencias.tsx:20-60`)
```html
<section class="card card-plano pend-card" aria-labelledby="pend-titulo">
  <div class="card-cabeca"><h2 id="pend-titulo">Pendências<span class="pend-contagem">2</span></h2></div>
  <ul class="pend-lista">
    <li class="pend-item pend-alta">(ícone)<div class="pend-corpo"><p class="pend-texto">…</p></div></li>
  </ul>
</section>
```
Sem pendências: `<p class="pend-vazio pend-ok">(ícone)<span>Nada pendente. Tudo em ordem.<small class="pend-nota">…</small></span></p>`.

**Tabela** (`estilos.css:119-127,139-147`): `<table class="tabela">` com `<th class="numero">` para colunas de número e
`data-rotulo` em cada `<td>` (usado no celular).

**Chip** (`estilos.css:484-490`): `<button type="button" class="chip chip-on" aria-pressed="true">Hoje</button>`.

**Janela** (`estilos.css:758-777`; `legacy/web/src/painel/caixa/Modal.tsx:1-66`)
```html
<div class="modal-fundo">
  <div class="modal-caixa" role="dialog" aria-modal="true" aria-labelledby="t1">
    <h2 id="t1" class="modal-titulo">Desconto no item</h2>
    <p class="modal-sub">…</p>
    <form class="modal-form">…<div class="modal-acoes">…</div></form>
  </div>
</div>
```
Comportamento: o foco vai para o primeiro campo; Tab e Shift+Tab não saem da janela; Esc fecha; clicar no fundo fecha;
ao fechar, o foco volta para onde estava (`Modal.tsx:21-56`). `modal-larga` para a janela de 780px.

**Barra lateral** (`estilos.css:342-406`; `legacy/web/src/painel/BarraLateral.tsx:40-113`; itens em
`legacy/web/src/painel/menu.tsx:44-206`)
```html
<aside class="sidebar" aria-label="Barra lateral">
  <div class="brand">
    <div class="brandmark" aria-hidden="true">LA</div>            <!-- ou <img src="(logo da loja)" alt=""> -->
    <div class="brandcopy"><strong>Loja A</strong><span>Rações, petiscos e acessórios</span></div>
  </div>
  <button type="button" class="nav nav-pos">(ícone)<span>Frente de caixa</span></button>
  <nav class="navlist" aria-label="Menu principal">
    <div class="navsec" role="group" aria-label="Operação">
      <div class="navgroup" aria-hidden="true">Operação</div>
      <button type="button" class="nav active" aria-current="page">(ícone)<span>Visão geral</span></button>
    </div>
  </nav>
  <div class="sideuser">
    <div class="sideuser-id">
      <button type="button" class="sideuser-perfil" aria-label="Meu usuário: Ana, Dono" title="Abrir Meu usuário">
        <span class="sideuser-avatar" aria-hidden="true">A</span>
        <span class="sideuser-name"><b>Ana</b><small>Dono</small></span>
      </button>
      <button type="button" class="sideuser-theme" aria-label="Usar o tema escuro" title="Tema escuro">(ícone)</button>
    </div>
    <div class="sideuser-actions"><button type="button">Sair</button></div>
  </div>
  <div class="sidefoot">V0.1 • Nome da empresa</div>
</aside>
```
Iniciais da loja sem logo: das palavras com mais de 2 letras (ou uma letra maiúscula ou um algarismo sozinho), a
primeira letra da primeira e da última, em maiúsculas ("Pet Shop da Ana" → "PA"; "Loja A" → "LA"); sem nenhuma, a
primeira letra do nome; sem nome, "?" (`BarraLateral.tsx:30-38`). Avatar da pessoa sem foto: a primeira letra do nome
(`BarraLateral.tsx:92-94`).
Grupo sem item visível some (`BarraLateral.tsx:54-56`). O conteúdo fica em `.painel-conteudo`, ao lado, dentro de
`.painel-app` (`estilos.css:345-351,408`).

**Tela de entrada** (`estilos.css:157-340`; `legacy/web/src/telas/LayoutEntrada.tsx`, `legacy/web/src/telas/TelaEntrada.tsx`):
`.entrada` > `.entrada-vitrine` (marca, linha "PDV · Estoque · Financeiro", chamada, traço, descrição, recursos e a
ilustração) + `.entrada-cartao` (logo, selo da loja, título, subtítulo, campos `.entrada-campo`/`.entrada-caixa`, botão
`.entrada-botao`, link "Esqueceu a senha?") + `.entrada-acoes` (tema e Suporte).

---

## 7. Tema claro e escuro

(`legacy/web/src/tema.ts:1-60`; `legacy/web/src/BotaoTema.tsx:1-23`; `legacy/web/src/main.tsx:7-10`)
- O CSS lê `data-tema="claro|escuro"` no `<html>`; `color-scheme` acompanha (`light`/`dark`).
- Sem escolha, segue o claro/escuro do computador e muda junto quando ele muda; o botão troca entre claro e escuro e guarda
  a escolha neste navegador (chave `saas:tema`, valores `claro`/`escuro`; valor estranho = seguir o computador; sem
  armazenamento, vale só na aba). Aplicado antes da primeira tela (`main.tsx:10`).
- O mesmo botão aparece na barra lateral e na tela de entrada: `aria-label="Usar o tema <próximo>"`, `title="Tema
  <próximo>"`, ícone de lua (no claro) ou sol (no escuro) (`BotaoTema.tsx:6-21`).
- Na reconstrução: um script pequeno no `<head>` aplica o tema antes de pintar a página (mesma chave e mesma regra), e o
  botão faz a troca no navegador.

---

## 8. Assets

Não há arquivo de imagem, ícone ou fonte em `legacy/web` (nenhum `.png`, `.jpg`, `.svg`, `.ico`, `.webp` ou `.woff`;
conferido com `find`). Tudo é desenhado em SVG dentro do código:

| Peça | Onde está | Uso | Na reconstrução |
|---|---|---|---|
| Logo provisória (fachada da loja em quadrado verde + nome) | `legacy/web/src/Logo.tsx:5-19` | tela de entrada (grande) e onde aparece a marca | fragmento `templates/fragmentos/marca.html` com o mesmo `<svg viewBox="0 0 48 48">` |
| Ilustração da loja (isométrica, gerada por código) | `legacy/web/src/telas/ilustracaoLoja.ts:1-228`; usada como `data:image/svg+xml` num `<img width="552" height="350">` (`legacy/web/src/telas/LayoutEntrada.tsx:10-12,46-47`) | tela de entrada | o gerador vira código Java que produz o mesmo texto SVG (números formatados como o JavaScript, sem ".0"); servido como `static/img/ilustracao-loja.svg` |
| Ícones da barra lateral (um por item) | `legacy/web/src/painel/menu.tsx:36-206` | barra lateral | fragmento `templates/fragmentos/icones.html` (mesmos `viewBox`, `stroke-width="1.75"` e caminhos) |
| Sol e lua do tema | `legacy/web/src/BotaoTema.tsx:11-20` | botão do tema | idem |
| Ícones dos avisos (atenção, erro, ok, informação) | `legacy/web/src/painel/AvisoComIcone.tsx:18-40` | avisos | idem |
| Ícones das pendências | `legacy/web/src/painel/CardPendencias.tsx:79-109` | card Pendências | idem |
| Ícones da Visão geral | `legacy/web/src/painel/TelaVisaoGeral.tsx:256` | cartões | idem |
| Ícone do Excel | `legacy/web/src/painel/relatorios/TabelaDaPlanilha.tsx:125-134` | botões de exportar | idem |
| Ícones da tela de entrada (recursos, loja do selo, campos usuário/senha/olho, Suporte) | `legacy/web/src/telas/LayoutEntrada.tsx:67-102`; `legacy/web/src/telas/TelaEntrada.tsx:199` | tela de entrada | idem |
| Logo da loja (enviada pela loja) | dado da loja (PNG, JPEG ou WebP em data URL, até 280.000 caracteres) (`03-REGRAS-DE-NEGOCIO.md` §5.2) | `.brandmark img` (`estilos.css:362`) | vem do banco; sem logo, as iniciais |
| Favicon | não existe (`legacy/web/index.html:1-12`) | — | sem favicon, igual |

Textos da marca (provisórios, num lugar só): nome "Nome da empresa", Suporte "Precisa de ajuda? Fale com o suporte do Nome
da empresa." e o e-mail de suporte, a linha "PDV · Estoque · Financeiro", a chamada "Sua loja, / mais organizada / e
lucrativa.", a descrição e os três recursos "PDV e vendas", "Controle de estoque", "Gestão financeira"
(`legacy/web/src/marca.ts:1-24`). O título da aba do navegador é o nome da marca (`legacy/web/index.html:7`). Na
reconstrução, ficam juntos numa configuração da aplicação (um lugar só, como hoje).
