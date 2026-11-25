#!/usr/bin/env node
// scripts/varrer-segredos.mjs — procura segredo esquecido no código (item 2.4 da revisão de 18/11/2026).
//
//   node scripts/varrer-segredos.mjs              os arquivos do git (o que vai para o repositório)
//   node scripts/varrer-segredos.mjs --historico  também TODOS os commits de todos os branches (o que já foi)
//
// Sai com erro (código 1) se achar algo: o CI para. O valor achado aparece mascarado.
// Achou um segredo de verdade? Trocar o segredo (no provedor) é o que resolve: apagar do código
// não basta, porque ele continua no histórico do git. Ver docs/SEGURANCA.md.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Valores de exemplo e de teste que aparecem no repositório de propósito (não são segredos). */
const PERMITIDOS = new Set([
  'postgres',
  'senha-de-teste-nao-usar-em-producao',
  'troque-por-uma-senha-longa',
  'senha-de-teste-vigilancia-123',
  'senha-do-backup-de-teste-123',
  // banco descartável da CI no workflow validar-migracao.yml (PR #2 no main, 25/11/2026); liberado pelo Luan
  'postgres-ci',
  'senha-local-do-teste',
]);

const ehExemplo = (v) =>
  PERMITIDOS.has(v) ||
  // referência a variável (${POSTGRES_PASSWORD} no compose): o valor não está no código
  /\$\{[A-Za-z_]/.test(v) ||
  /^\$|^\$\{|^<|^\*+$|^x+$|^(process\.env|env\.|import\.meta)|^troque|^sua?-|^seu-|^exemplo|^fake|^teste/i.test(v);

/** Regras fortes (formato inconfundível): valem em todo arquivo. */
const FORTES = [
  { nome: 'chave de acesso da AWS', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { nome: 'chave privada', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g },
  { nome: 'token do GitHub', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/g },
  { nome: 'token do Slack', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { nome: 'chave do Google', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { nome: 'chave do Stripe', re: /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}/g },
  { nome: 'chave de API de IA', re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{40,}/g },
  {
    nome: 'senha dentro de endereço de banco',
    re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^:\s/@'"`]+:([^@\s'"`]+)@/g,
    valor: (m) => m[1],
  },
];

/** Atribuição com nome de segredo (SENHA=..., API_KEY: "..."): só fora de testes (lá a senha é de mentira). */
const ATRIBUICAO = /\b([A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|SENHA|TOKEN|API_?KEY|PRIVATE_?KEY|CLIENT_?SECRET)[A-Z0-9_]*)\s*[=:]\s*['"]?([^\s'"`#,;)]{12,})/g;
const EH_TESTE = /(^|\/)(test|tests|testes|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const IGNORAR = /(^|\/)(package-lock\.json|sistema-padrao-demo\.html)$|\.(png|jpe?g|gif|ico|pdf|woff2?|ttf|zip|gz|dump)$/i;

const mascarar = (v) => (v.length <= 8 ? '****' : `${v.slice(0, 4)}…${v.slice(-2)} (${v.length} caracteres)`);

function examinarLinha(arquivo, linha) {
  const achados = [];
  for (const regra of FORTES) {
    for (const m of linha.matchAll(regra.re)) {
      const valor = regra.valor ? regra.valor(m) : m[0];
      if (!ehExemplo(valor)) achados.push({ regra: regra.nome, valor });
    }
  }
  if (!EH_TESTE.test(arquivo)) {
    for (const m of linha.matchAll(ATRIBUICAO)) {
      if (!ehExemplo(m[2])) achados.push({ regra: `valor em ${m[1]}`, valor: m[2] });
    }
  }
  return achados;
}

const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 512 });
const problemas = [];

for (const arquivo of git(['ls-files', '-z']).split('\0').filter(Boolean)) {
  if (IGNORAR.test(arquivo)) continue;
  let texto;
  try {
    texto = readFileSync(arquivo, 'utf8');
  } catch {
    continue; // apagado do disco, mas ainda no índice
  }
  texto.split('\n').forEach((linha, i) => {
    for (const a of examinarLinha(arquivo, linha)) problemas.push(`${arquivo}:${i + 1}  ${a.regra}: ${mascarar(a.valor)}`);
  });
}

let commits = 0;
if (process.argv.includes('--historico')) {
  let commit = '';
  let arquivo = '';
  for (const linha of git(['log', '--all', '-p', '--no-color', '--unified=0', '--format=commit %H']).split('\n')) {
    if (linha.startsWith('commit ')) {
      commit = linha.slice(7, 19);
      commits += 1;
    } else if (linha.startsWith('+++ ')) {
      arquivo = linha.replace(/^\+\+\+ (b\/)?/, '');
    } else if (linha.startsWith('+') && !IGNORAR.test(arquivo)) {
      for (const a of examinarLinha(arquivo, linha.slice(1))) problemas.push(`commit ${commit} ${arquivo}  ${a.regra}: ${mascarar(a.valor)}`);
    }
  }
}

const unicos = [...new Set(problemas)];
if (unicos.length > 0) {
  console.error(`Possíveis segredos encontrados (${unicos.length}):`);
  for (const p of unicos) console.error(`  ${p}`);
  console.error('\nSe for segredo de verdade: troque-o no provedor (apagar do código não basta). Se for exemplo, use um valor que comece com "troque-" ou "exemplo".');
  process.exit(1);
}
console.log(`Nenhum segredo encontrado${commits ? ` (arquivos atuais e ${commits} commits)` : ' nos arquivos atuais'}.`);
