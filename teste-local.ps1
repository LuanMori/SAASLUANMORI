# teste-local.ps1 — sobe o Sistema Padrão no Windows para teste local.
#
# Uso (no PowerShell, na pasta do projeto) — ou dê dois cliques em teste-local.bat:
#   .\teste-local.ps1                         # banco + dependências + migrations + seed + API + web
#   .\teste-local.ps1 -PularInstalacao        # não roda npm install (mais rápido nas próximas vezes)
#   .\teste-local.ps1 -Org org_xxx -Sub "auth0|123" -Papel dono   # também cadastra a pessoa na loja
#   .\teste-local.ps1 -Parar                  # para o banco (feche as janelas da API e da web)
#
# Pré-requisitos: Node 22+ e Docker Desktop aberto. Para o login funcionar, o Auth0
# precisa estar configurado nos .env (ver docs/AUTH0.md).

param(
  [switch]$PularInstalacao,
  [switch]$Parar,
  [string]$Org,
  [string]$Sub,
  [ValidateSet('dono', 'administrador', 'vendedor')][string]$Papel = 'dono'
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Passo([string]$texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }
function Aviso([string]$texto) { Write-Host "AVISO: $texto" -ForegroundColor Yellow }
function Falha([string]$texto) { Write-Host "`nERRO: $texto" -ForegroundColor Red; exit 1 }

# Roda um comando externo e para o script se ele falhar.
function Rodar([string]$descricao, [string]$programa, [string[]]$argumentos) {
  Passo $descricao
  & $programa @argumentos
  if ($LASTEXITCODE -ne 0) { Falha "'$programa $($argumentos -join ' ')' terminou com erro ($LASTEXITCODE)." }
}

function Npm([string]$descricao, [string[]]$argumentos) { Rodar $descricao 'npm' $argumentos }

# Roda um comando externo sem mostrar nada, só para olhar o código de saída ($LASTEXITCODE).
# No Windows PowerShell 5.1, redirecionar o stderr de um programa com 'Stop' ligado
# derruba o script; por isso aqui o 'Stop' fica desligado.
function Silencioso([string]$programa, [string[]]$argumentos) {
  $ErrorActionPreference = 'Continue'
  try { & $programa @argumentos *> $null } catch { $global:LASTEXITCODE = 1 }
}

# ---------------------------------------------------------------- parar
if ($Parar) {
  Rodar 'Parando o banco' 'docker' @('compose', 'stop', 'db')
  Write-Host "`nBanco parado. Feche as janelas da API e da web. Os dados continuam salvos." -ForegroundColor Green
  exit 0
}

# ---------------------------------------------------------------- pré-requisitos
Passo 'Conferindo pré-requisitos'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Falha 'Node.js não encontrado. Instale o Node 22 ou mais novo: https://nodejs.org'
}
$versaoNode = (& node -v).TrimStart('v')
if ([int]($versaoNode.Split('.')[0]) -lt 22) {
  Falha "Node $versaoNode encontrado; o projeto precisa do Node 22 ou mais novo."
}
Write-Host "Node $versaoNode ok"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Falha 'Docker não encontrado. Instale o Docker Desktop: https://www.docker.com/products/docker-desktop'
}
Silencioso 'docker' @('info')
if ($LASTEXITCODE -ne 0) { Falha 'O Docker não está rodando. Abra o Docker Desktop, espere ficar pronto e rode de novo.' }
Write-Host 'Docker ok'

if (($Org -and -not $Sub) -or ($Sub -and -not $Org)) { Falha 'Para cadastrar uma pessoa, informe -Org e -Sub juntos.' }

# ---------------------------------------------------------------- banco
Passo 'Subindo o Postgres (docker compose)'
& docker compose up -d db
if ($LASTEXITCODE -ne 0) {
  Falha 'Não consegui subir o banco. Se a porta 5432 já estiver em uso (outro Postgres instalado), pare esse serviço e rode de novo.'
}

Write-Host -NoNewline 'Esperando o banco ficar pronto'
$pronto = $false
for ($i = 0; $i -lt 60; $i++) {
  Silencioso 'docker' @('compose', 'exec', '-T', 'db', 'pg_isready', '-U', 'postgres')
  if ($LASTEXITCODE -eq 0) { $pronto = $true; break }
  Write-Host -NoNewline '.'
  Start-Sleep -Seconds 1
}
Write-Host ''
if (-not $pronto) { Falha 'O banco não respondeu em 60 segundos. Veja: docker compose logs db' }

# ---------------------------------------------------------------- .env
Passo 'Conferindo arquivos .env'
foreach ($app in 'api', 'web') {
  $destino = "apps/$app/.env"
  if (-not (Test-Path $destino)) {
    Copy-Item "apps/$app/.env.example" $destino
    Write-Host "Criado $destino a partir do .env.example"
  } else {
    Write-Host "$destino já existe (mantido)"
  }
}

$envApi = Get-Content 'apps/api/.env' -Raw
$envWeb = Get-Content 'apps/web/.env' -Raw
$auth0Pendente = ($envApi -match 'seu-tenant') -or ($envWeb -match 'seu-tenant') -or
                 ($envWeb -match '(?m)^VITE_AUTH0_CLIENT_ID=\s*$')
if ($auth0Pendente) {
  Aviso 'O Auth0 ainda não está configurado nos .env. Tudo vai subir, mas o login não vai funcionar.'
  Aviso 'Preencha apps/api/.env e apps/web/.env seguindo docs/AUTH0.md.'
}
if ($envApi -match 'org_xxxxxxxx') {
  Aviso 'SEED_LOJAS em apps/api/.env ainda tem org_ de exemplo. Troque pelos org_id reais das suas Organizations.'
}

# ---------------------------------------------------------------- dependências e banco
if (-not $PularInstalacao) { Npm 'Instalando dependências (npm install)' @('install') }
Npm 'Compilando @saas/core' @('run', 'build:core')
Npm 'Aplicando migrations' @('run', 'db:migrate', '-w', '@saas/api')
Npm 'Ligando o login da role saas_app' @('run', 'db:app-role', '-w', '@saas/api')
Npm 'Cadastrando as lojas (SEED_LOJAS)' @('run', 'db:seed', '-w', '@saas/api')

if ($Org) {
  Npm "Cadastrando $Sub como $Papel na loja $Org" @('run', 'db:usuario', '-w', '@saas/api', '--', '--org', $Org, '--sub', $Sub, '--papel', $Papel)
}

Npm 'Compilando a API' @('run', 'build', '-w', '@saas/api')

# ---------------------------------------------------------------- servidores
Passo 'Abrindo API e web em janelas separadas'
$pasta = $PSScriptRoot.Replace("'", "''")
function NovaJanela([string]$titulo, [string]$comando) {
  $script = "`$Host.UI.RawUI.WindowTitle = '$titulo'; Set-Location '$pasta'; $comando"
  Start-Process powershell -ArgumentList @('-NoExit', '-NoProfile', '-Command', $script) | Out-Null
}
NovaJanela 'SAAS - API (compilação)' 'npm run dev:build -w @saas/api'
NovaJanela 'SAAS - API :3000' 'npm run dev -w @saas/api'
NovaJanela 'SAAS - Web :5173' 'npm run dev -w @saas/web'

Write-Host -NoNewline 'Esperando a web responder'
$webPronta = $false
for ($i = 0; $i -lt 90; $i++) {
  try {
    Invoke-WebRequest -Uri 'http://localhost:5173' -UseBasicParsing -TimeoutSec 2 | Out-Null
    $webPronta = $true; break
  } catch { Write-Host -NoNewline '.'; Start-Sleep -Seconds 1 }
}
Write-Host ''

if ($webPronta) { Start-Process 'http://localhost:5173' }
else { Aviso 'A web ainda não respondeu. Veja a janela "SAAS - Web :5173".' }

Write-Host ''
Write-Host 'Pronto!' -ForegroundColor Green
Write-Host '  Web: http://localhost:5173'
Write-Host '  API: http://localhost:3000'
Write-Host ''
Write-Host 'Só entra quem foi cadastrado na loja. Depois de tentar o primeiro login, pegue o'
Write-Host '"sub" do usuário no painel do Auth0 (User Management > Users) e rode:'
Write-Host '  .\teste-local.ps1 -PularInstalacao -Org org_xxx -Sub "auth0|..." -Papel dono'
Write-Host ''
Write-Host 'Para parar: feche as 3 janelas e rode  .\teste-local.ps1 -Parar'
