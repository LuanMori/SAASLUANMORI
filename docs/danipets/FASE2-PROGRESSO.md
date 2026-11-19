# Fase 2 — andamento da migração do DaniPets (módulo a módulo)

Referência: `docs/danipets/FASE1-DIAGNOSTICO.md` (IDs, classes e plano) e as decisões P1 a P12 aprovadas
pelo Luan em 19/11/2026. Cada módulo: regras no `packages/core` com testes → API da demonstração (mesmo
contrato que o servidor vai implementar) → telas → testes → demonstração gerada e conferida no navegador →
commit no `teste-local-windows`. **Pendências da Visão geral: continuam A DEFINIR** (P6).

| Módulo | Situação |
|---|---|
| 1. Base | **Concluído** (19/11/2026) |
| 2. Produtos e estoque | a fazer |
| 3. Fornecedores | a fazer |
| 4. Compras e contas a pagar | a fazer |
| 5. Caixa do dia | a fazer |
| 6. Clientes | a fazer |
| 7. Fidelidade | a fazer |
| 8. Vale-troca | a fazer |
| 9. Financeiro | a fazer |
| 10. Relatórios | a fazer |
| 11 a 14. Visão geral, Usuários, Dados e backup, Suporte | a fazer |
| 15. Consolidação (Fase 3) | a fazer |

---

## Módulo 1 — Base

### O que veio do DaniPets

| ID | No DaniPets | No sistema novo | Como ficou |
|---|---|---|---|
| ESP-01 | Nome "Dani Pet’s", descrição e logo fixos no código | **Dados da loja** (Dados e backup): nome, descrição e logo de cada loja. Aparecem na barra lateral, na tela de entrada e na Frente de caixa. O logo (PNG, JPEG ou WebP) é reduzido no próprio navegador | Adaptado |
| ESP-07 | Números fixos (desconto 10%, tolerância R$ 10, fiado 30 dias, cashback 3,5%/31 dias, cupom 5%/7 dias, aviso 7 dias, retorno 30 dias) | **Regras da loja** com esses valores como padrão e os mesmos limites (`REGRAS_LIMITES`). Já valem: o **desconto sem senha** (tela em Dados e backup → Regras gerais; a Frente de caixa e a regra da venda usam o valor da loja) e o **prazo do fiado** (vencimento das vendas no fiado). As outras valem com o padrão e ganham tela no módulo de cada uma | Adaptado |
| ESP-05 | Nome da loja fixo nas mensagens e no regulamento | Mensagens do DaniPets com `{loja}` no lugar do nome e `preencherModelo` (usados no módulo 7) | Adaptado (uso no M7) |
| ESP-06 | Campo "Pet" no cliente | Regra `clientes.campoExtra` (desligada, rótulo "Pet") — tela no módulo 6 (decisão P12) | Preparado |
| ESP-08 | Categorias de despesa e motivos de ajuste fixos | Listas por loja com as do DaniPets como padrão — telas nos módulos 2 e 9 | Preparado |
| ESP-10 | Unidade "kg" pensada para ração a granel | Regra `produtos.unidades` (un e kg) — tela no módulo 2 | Preparado |
| ACE-12 | Só uma aba aberta (trava) | **Substituído**: várias abas ao mesmo tempo, **uma operação por vez** entre elas (Web Locks), e as outras abas **recarregam sozinhas**. Quem foi desativado ou teve a senha redefinida em outra aba sai; papel mudado vale na hora (como no servidor) | Substituído |
| ACE-13 | Falha ao gravar: aviso vermelho fixo e nenhuma operação nova | **Tudo ou nada**: as gravações de uma operação vão juntas; se o navegador recusar uma, as outras são desfeitas e a tela recebe o motivo. Aviso vermelho fixo no alto, com "Tentar gravar de novo", que some quando volta a gravar. Como nada fica pela metade, as operações seguintes podem ser tentadas | Adaptado (melhor) |
| ACE-14 | Aviso quando aberto em visualização, celular ou Firefox | Aviso na demonstração quando aberta dentro de outra página/aplicativo (e-mail, Drive), no Firefox com o arquivo, ou num navegador que não guarda nada; pede ao navegador para não apagar os dados (armazenamento persistente). O aviso do celular não foi trazido: o sistema novo é feito também para o celular | Adaptado (só na demonstração) |
| ACE-15 | Tema claro/escuro, guardado no computador | Igual: sem escolha segue o computador; o botão da barra lateral troca; a escolha fica neste navegador. Todas as cores viraram variáveis (`estilos.css`) | Criado |
| ACE-17 | Auditoria de tudo (quem, quando, ação, detalhe) | 21 ações novas no histórico, com os nomes do DaniPets e um resumo pronto ("venda nº 00012 • R$ 5,00 de desconto • autorizado por Ana"), sem dado pessoal guardado (nome buscado na hora). Ver `docs/decisoes/0001-auditoria.md` | Adaptado |

### O que ficou para outro módulo (e por quê)

- **ACE-16** (cabeçalho com a situação do caixa) e **dias travados** (CX-08): dependem do caixa do dia →
  módulo 5.
- **ACE-10** (liberação do Dono com motivo): entra junto com cada caso (fiado acima do limite no 6,
  lançamento em dia fechado no 5).
- **"Baixar backup agora"** no aviso de falha: entra com a exportação dos dados da loja (módulo 13).

### Servidor

Nada novo de tabela (decisão P3: agora só a demonstração). O contrato `ApiLoja` (`lerConfiguracao`,
`salvarDadosDaLoja`, `salvarRegrasDaLoja`) responde 501 no sistema real até o servidor ganhar essa parte;
enquanto isso, a barra lateral usa o nome da sessão e as regras padrão. O `GET /auditoria` do servidor já
devolve o mesmo `resumo` da demonstração.

### Testes e conferência

- Testes automáticos: núcleo 261 (+23: regras da loja, auditoria, limite de desconto), servidor 134, tela
  227 (+44: gravação tudo ou nada, trava entre abas, API da demonstração, Dados e backup, tema, avisos).
- Navegador (Chromium, arquivo aberto com dois cliques): tema escuro e claro; nome e logo novos na barra;
  desconto sem senha de 15% valendo na Frente de caixa; duas abas — a desativação do Bruno numa aba tira o
  acesso dele na outra e a barra lateral da outra atualiza sozinha; armazenamento cheio → aviso vermelho,
  nada gravado pela metade, aviso some ao liberar espaço; histórico com as ações novas; celular (390 px)
  sem rolagem para o lado; console sem erros nem avisos.
