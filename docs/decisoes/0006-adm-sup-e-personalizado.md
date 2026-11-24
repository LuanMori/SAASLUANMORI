# 0006 — O suporte (Adm. Sup) e o papel Personalizado

- **Data:** 23/11/2026 · **Origem:** pedido do Luan (4ª imagem, aba Usuários) e respostas dele às dúvidas ·
  **Situação:** adotado na demonstração e no servidor, com testes

## O pedido

> "Quero que na opção de criar usuários desapareça o perfil Dono e Adm. O perfil Dono vai ser criado apenas
> na implantação, e só pode ser criado pelo Adm. Sup. O perfil Adm. Sup é o perfil que deve estar presente em
> tudo e ter acesso a tudo, mas de forma invisível."

Respostas do Luan às dúvidas: o Adm. Sup é um **usuário mestre presente em todos os sistemas e em todas as
vendas**; o Dono cria usuários com as opções **Vendedor** e **Personalizado** ("que edita as funções do
usuário"); o Adm. Sup aparece como **"Suporte"**; fazer na **demonstração e no servidor** agora.

## Decisão

| Papel | Quem cadastra | O que pode |
|---|---|---|
| **Adm. Sup** (`super_admin`) | só pelo script `db:suporte`, no servidor (uma vez por servidor) | tudo, em **qualquer loja**; não aparece na lista de usuários; no histórico e nas vendas aparece como "Suporte" |
| **Dono** | só o Adm. Sup (na implantação: pela aba Usuários, entrando na loja, ou pelo script `db:usuario`) | tudo na loja |
| **Administrador** | só o Adm. Sup | tudo, menos o que é só do Dono |
| **Vendedor** | Dono ou Administrador (e o Adm. Sup) | vender, caixa, clientes, cadastrar produto (como no DaniPets) |
| **Personalizado** | Dono ou Administrador (e o Adm. Sup) | **só as funções marcadas** para ele (pelo menos uma) |

- **Personalizado:** a lista de funções é a mesma das permissões do sistema (`LISTA_PERMISSOES`), menos as
  que são só do Dono (brinde, mexer em Dono, excluir dados, ciência do caixa, baixa do cartão, liberar dia
  fechado e fiado) e menos "cadastrar usuários". Quem cadastra só dá as funções que ele mesmo tem. As funções
  ficam no usuário (`permissoes`); trocar o papel para outro apaga as funções.
- **Tela por tela** (24/11/2026, "Personalizado você escolhe o que a pessoa tem acesso"): as funções aparecem
  agrupadas pelas telas do menu (`TELAS_DO_PERSONALIZADO`). Marcar a tela dá o acesso a ela; os extras de uma tela
  (ex.: o CPF completo, em Clientes) só valem com ela, e o servidor recusa um extra sem a tela. Produtos e estoque
  (consulta de todos) e Regras da loja (em várias telas) só têm extras. Na criação, o papel se escolhe em cartões:
  Vendedor ou Personalizado (Dono e Administrador, à parte, só para o suporte).
- **O menu segue as funções:** "Frente de caixa" pede Vender e "Clientes" pede Clientes (Dono, Administrador e
  Vendedor têm as duas, então nada muda para eles). Visão geral, Produtos e estoque (consulta) e Suporte ficam
  para todos.
- **Ninguém muda o próprio papel nem as próprias funções** (como já era com o papel).
- **O Dono continua podendo tirar o papel de Administrador** (passar para Vendedor ou Personalizado) e
  desativar; **dar** o papel de Dono ou de Administrador é só do Adm. Sup.
- **A senha do Adm. Sup** é sorteada pelo script (20 caracteres), não é provisória e só muda pelo script
  (`--redefinir-senha`), que também encerra as sessões abertas dele em todas as lojas.
- **Na demonstração:** o login `suporte` (senha `demo1234`) entra em qualquer loja.

## Como ficou no servidor (e por que assim)

A linha do Adm. Sup já existia no banco desde o esqueleto: `papel = 'super_admin'` com `loja_id` **nulo**
(CHECK do banco). Como todo o isolamento entre lojas depende do RLS por `loja_id`, a API (`saas_app`) **não
enxerga** essa linha. Em vez de abrir uma exceção no RLS para a API, o banco ganhou três funções
`SECURITY DEFINER` estreitas (migration `20261123210000_adm_sup_e_personalizado`):

- `app_suporte_para_login(login)`: o que o login precisa (hash, situação, tentativas);
- `app_suporte_por_id(id)`: nome e situação (a sessão confere a cada pedido; o histórico mostra "Suporte");
- `app_suporte_registrar(...)`: senhas erradas, bloqueio e último acesso.

Nenhuma lista suportes nem muda nome, papel ou senha. A sessão do suporte é criada **na loja do endereço**:
tudo o que ele faz fica naquela loja, pelo RLS de sempre. A trava do banco (`usuarios_trava_api`) reconhece o
suporte pela função e é ela que garante, mesmo com um erro na API, que Dono e Administrador só nascem pelas
mãos dele. A única policy fora do padrão (`usuarios_suporte_dono_do_schema`) é para a **dona do schema**
(num banco gerenciado, como o RDS, ela não é superusuário e também passa pelo RLS forçado): nunca para a API.

## Alternativas descartadas

- **Um Adm. Sup cadastrado em cada loja** (uma linha por loja): o suporte teria uma senha por loja e
  apareceria na lista de cada uma; cada loja nova pediria um cadastro a mais. Descartado.
- **Dar à API acesso à linha sem loja por uma policy**: abriria o RLS da API justamente na tabela de
  usuários. As funções dão só o necessário.
- **Personalizado com "perfis" prontos** (ex.: "Caixa", "Estoquista"): fica para quando o Luan quiser; hoje o
  Dono marca as funções de cada pessoa.

## Consequências

- Implantação: `db:suporte` uma vez por servidor; em cada loja, o suporte cadastra o Dono (pela tela ou pelo
  `db:usuario`). Ver [`../LOGIN.md`](../LOGIN.md) e [`../deploy.md`](../deploy.md).
- A senha do suporte abre todas as lojas: cofre de senhas, um login por pessoa da equipe de suporte
  (`suporte.joao`), `--desativar` para quem sair. Tudo o que ele faz fica no histórico da loja como "Suporte"
  (o id de quem foi fica guardado).
- Testes: `apps/api/test/adm-sup.spec.ts`, `usuarios.spec.ts` (regras e trava do banco), `vigilancia.spec.ts`
  (a policy da dona do schema é a única exceção), `migracoes.spec.ts`, `scripts.spec.ts`;
  `packages/core/test/usuario.test.ts`; na tela, `TelaUsuarios.test.tsx` e `usuariosDemo.test.ts`.
