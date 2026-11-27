# Instruções para o Claude neste projeto

- Converse em português.
- **Reconstrução em Java (desde 26/11/2026).** O sistema novo fica em `backend/` (Java 21, Spring Boot,
  Thymeleaf e HTMX): todo arquivo novo vai para lá. O sistema antigo foi movido para `legacy/` (`legacy/web`,
  `legacy/api`, `legacy/core`, `legacy/demo` e `legacy/raiz`) e é **somente leitura**: consulte para reconstruir,
  nunca modifique nem execute. O último commit antes da mudança é o `a7979e3` (tag `pre-demolicao`).
- No começo de cada sessão, leia `docs/migracao/PROMPT-MESTRE.md` (o contrato da reconstrução) e
  `docs/migracao/07-STATUS-MODULOS.md` (o andamento), depois deste arquivo, que tem precedência sobre os dois.
- Toda mudança vai para o git: `mvn -f backend/pom.xml verify` verde antes de qualquer commit, commit e push numa
  branch `migration/*` que sai do `teste-local-windows`, e pull request de volta para o `teste-local-windows`.
  O `main` só quando o Luan pedir.
- A demonstração `legacy/demo/sistema-padrao-demo.html` é a referência congelada para comparar o visual: não se regera.
  **Exceção autorizada pelo Luan (27/11/2026):** ela pode ser aberta no navegador só para olhar e tirar fotos de tela ao
  lado do sistema novo (a comparação lado a lado de cada módulo). Nada nela é alterado, e o resto do `legacy/` continua
  sem ser executado.
- Cor principal: verde `#0b7f55`. A barra lateral é cópia da do DaniPets V9.3.3. Abas que ainda não
  foram trabalhadas ficam em branco até chegar a vez delas. Hoje é o caso da aba Suporte, e a reconstrução a mantém
  igual, em branco (vale sobre a regra "nenhuma tela em branco" do prompt mestre).

## Lembrete pedido pelo Luan (13/11/2026)

As **pendências da Visão geral ainda não foram definidas**. Enquanto `docs/PENDENCIAS.md` disser
"Status: A DEFINIR", **termine cada resposta lembrando disso e sugerindo pendências** (a lista está no
arquivo), de preferência as ligadas à aba que estiver sendo trabalhada no momento.
