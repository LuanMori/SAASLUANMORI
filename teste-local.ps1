# teste-local.ps1 — sobe o Sistema Padrão no Windows para teste local (login próprio: usuário e senha).
#
# Uso (no PowerShell, na pasta do projeto) — ou dê dois cliques em teste-local.bat:
#   .\teste-local.ps1                       # banco + dependências + migrations + lojas + 1º Dono + API + web
#   .\teste-local.ps1 -PularInstalacao      # não roda npm install (mais rápido nas próximas vezes)
#   .\teste-local.ps1 -RedefinirSenha       # nova senha provisória para o Dono (esqueceu a senha)
#   .\teste-local.ps1 -Usuario maria -Nome "Maria Souza" -Loja lojab   # outro Dono, em outra loja
#   .\teste-local.ps1 -Parar                # para o banco (feche as janelas da API e da web)
#
# Pré-requisitos: Node 22+ e Docker Desktop aberto.
# Os outros usuários (vendedores, administradores) o Dono cadastra na tela, aba Usuários.

param(
  [switch]$PularInstalacao,
  [switch]$Parar,
  [switch]$RedefinirSenha,
  [string]$Loja = 'lojaa',
  [string]$Usuario = 'dono',
  [string]$Nome = 'Dono da Loja'
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

# Lê e grava arquivos em UTF-8 sem BOM (o Node lê o .env assim).
$utf8 = New-Object System.Text.UTF8Encoding($false)
function LerTexto([string]$caminho) { [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot $caminho), $utf8) }
function GravarTexto([string]$caminho, [string]$texto) { [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot $caminho), $texto, $utf8) }

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

if ($Loja -notmatch '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$') { Falha "-Loja '$Loja' inválida: use o endereço da loja (letras minúsculas, números e hífen), ex.: lojaa" }
if ($Usuario -notmatch '^[a-z0-9][a-z0-9._-]{1,39}$') { Falha "-Usuario '$Usuario' inválido: letras minúsculas e números, sem espaço (pode ponto, hífen e _)." }

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

# .env da época do Auth0 (antes de 18/11/2026): acerta o que mudou, guardando uma cópia do antigo.
$envApi = LerTexto 'apps/api/.env'
if ($envApi -match 'AUTH0_DOMAIN' -or $envApi -match 'org_[A-Za-z0-9]') {
  Copy-Item 'apps/api/.env' 'apps/api/.env.antes-login-proprio' -Force
  $envApi = [regex]::Replace($envApi, '(?m)^AUTH0_[A-Z_]*=.*\r?\n?', '')
  $envApi = [regex]::Replace($envApi, '(?m)^SEED_LOJAS=.*$', 'SEED_LOJAS=Loja A=lojaa;Loja B=lojab')
  Aviso 'apps/api/.env era do Auth0: tirei as linhas AUTH0_* e troquei SEED_LOJAS (cópia em apps/api/.env.antes-login-proprio).'
}
if ($envApi -notmatch '(?m)^COOKIE_SEGURO=') { $envApi = $envApi.TrimEnd() + "`nCOOKIE_SEGURO=false`n" }
if ($envApi -notmatch '(?m)^SAAS_BACKUP_DB_PASSWORD=') { $envApi = $envApi.TrimEnd() + "`nSAAS_BACKUP_DB_PASSWORD=troque-por-outra-senha-longa`n" }
GravarTexto 'apps/api/.env' $envApi

$envWeb = LerTexto 'apps/web/.env'
if ($envWeb -match 'VITE_AUTH0' -or $envWeb -match '(?m)^VITE_API_URL=http') {
  Copy-Item 'apps/web/.env' 'apps/web/.env.antes-login-proprio' -Force
  Copy-Item 'apps/web/.env.example' 'apps/web/.env' -Force
  Aviso 'apps/web/.env era do Auth0: recriei a partir do .env.example (cópia em apps/web/.env.antes-login-proprio).'
}

# ---------------------------------------------------------------- dependências e banco
if (-not $PularInstalacao) { Npm 'Instalando dependências (npm install)' @('install') }
Npm 'Compilando @saas/core' @('run', 'build:core')
Npm 'Aplicando migrations' @('run', 'db:migrate', '-w', '@saas/api')
Npm 'Ligando o login da role saas_app' @('run', 'db:app-role', '-w', '@saas/api')
Npm 'Preparando a role do backup (só leitura)' @('run', 'db:backup-role', '-w', '@saas/api')
Npm 'Cadastrando as lojas (SEED_LOJAS)' @('run', 'db:seed', '-w', '@saas/api')

if ($RedefinirSenha) {
  Npm "Nova senha provisória para $Usuario ($Loja)" @('run', 'db:usuario', '-w', '@saas/api', '--', '--loja', $Loja, '--usuario', $Usuario, '--redefinir-senha')
} else {
  Npm "Cadastrando o Dono $Usuario na loja $Loja" @('run', 'db:usuario', '-w', '@saas/api', '--', '--loja', $Loja, '--usuario', $Usuario, '--nome', $Nome, '--papel', 'dono')
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

$endereco = "http://localhost:5173/?loja=$Loja"
Write-Host -NoNewline 'Esperando a web responder'
$webPronta = $false
for ($i = 0; $i -lt 90; $i++) {
  try {
    Invoke-WebRequest -Uri 'http://localhost:5173' -UseBasicParsing -TimeoutSec 2 | Out-Null
    $webPronta = $true; break
  } catch { Write-Host -NoNewline '.'; Start-Sleep -Seconds 1 }
}
Write-Host ''

if ($webPronta) { Start-Process $endereco }
else { Aviso 'A web ainda não respondeu. Veja a janela "SAAS - Web :5173".' }

Write-Host ''
Write-Host 'Pronto!' -ForegroundColor Green
Write-Host "  Web: $endereco"
Write-Host '  API: http://localhost:3000/saude'
Write-Host ''
Write-Host "Entre com o usuário '$Usuario' e a senha provisória mostrada acima (ela só aparece na primeira vez)."
Write-Host 'No primeiro acesso o sistema pede para criar a sua senha. A equipe você cadastra na aba Usuários.'
Write-Host 'Esqueceu a senha?  .\teste-local.ps1 -PularInstalacao -RedefinirSenha'
Write-Host ''
Write-Host 'Para parar: feche as 3 janelas e rode  .\teste-local.ps1 -Parar'
