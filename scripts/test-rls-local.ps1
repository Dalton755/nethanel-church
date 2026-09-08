$ErrorActionPreference = "Stop"

Write-Host "`n=== NETHANEL CHURCH - TESTE RLS MULTI-TENANT ===" -ForegroundColor Cyan

# ------------------------------------------------------------
# 1. Ler configuração do Supabase local
# ------------------------------------------------------------

$statusLines = & cmd.exe /d /c 'npx supabase status -o env 2>nul'

if ($LASTEXITCODE -ne 0) {
    throw "Falha ao consultar as credenciais do Supabase local."
}

$envMap = @{}

foreach ($line in $statusLines) {
    if ($line -match '^\s*([A-Z0-9_]+)=(.*)$') {
        $key = $Matches[1]
        $value = $Matches[2].Trim()

        if (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        $envMap[$key] = $value
    }
}

$apiUrl = $envMap["API_URL"]

if (-not $apiUrl) {
    $apiUrl = "http://127.0.0.1:54321"
}

$anonKey = $envMap["ANON_KEY"]

if (-not $anonKey) {
    $anonKey = $envMap["PUBLISHABLE_KEY"]
}

$serviceKey = $envMap["SERVICE_ROLE_KEY"]

if (-not $serviceKey) {
    $serviceKey = $envMap["SECRET_KEY"]
}

if (-not $anonKey) {
    throw "Não foi possível localizar ANON_KEY/PUBLISHABLE_KEY."
}

if (-not $serviceKey) {
    throw "Não foi possível localizar SERVICE_ROLE_KEY/SECRET_KEY."
}

Write-Host "Supabase local: $apiUrl" -ForegroundColor DarkGray

# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------

function ConvertTo-JsonBody {
    param([hashtable]$Data)

    return ($Data | ConvertTo-Json -Depth 10 -Compress)
}

function New-TestUser {
    param(
        [string]$Email,
        [string]$Password,
        [string]$Name
    )

    $headers = @{
        apikey        = $serviceKey
        Authorization = "Bearer $serviceKey"
        "Content-Type" = "application/json"
    }

    $body = ConvertTo-JsonBody @{
        email         = $Email
        password      = $Password
        email_confirm = $true
        user_metadata = @{
            full_name = $Name
        }
    }

    return Invoke-RestMethod `
        -Method Post `
        -Uri "$apiUrl/auth/v1/admin/users" `
        -Headers $headers `
        -Body $body
}

function Get-AccessToken {
    param(
        [string]$Email,
        [string]$Password
    )

    $headers = @{
        apikey         = $anonKey
        "Content-Type" = "application/json"
    }

    $body = ConvertTo-JsonBody @{
        email    = $Email
        password = $Password
    }

    $response = Invoke-RestMethod `
        -Method Post `
        -Uri "$apiUrl/auth/v1/token?grant_type=password" `
        -Headers $headers `
        -Body $body

    return $response.access_token
}

function New-Organization {
    param(
        [string]$Token,
        [string]$Name,
        [string]$Slug
    )

    $headers = @{
        apikey         = $anonKey
        Authorization  = "Bearer $Token"
        "Content-Type" = "application/json"
    }

    $body = ConvertTo-JsonBody @{
        p_name      = $Name
        p_unit_name = $Name
        p_slug      = $Slug
    }

    return Invoke-RestMethod `
        -Method Post `
        -Uri "$apiUrl/rest/v1/rpc/create_organization" `
        -Headers $headers `
        -Body $body
}

function Get-Organizations {
    param([string]$Token)

    $headers = @{
        apikey        = $anonKey
        Authorization = "Bearer $Token"
    }

    return @(
        Invoke-RestMethod `
            -Method Get `
            -Uri "$apiUrl/rest/v1/organizations?select=id,name,slug&order=name" `
            -Headers $headers
    )
}

function Test-ForbiddenPersonInsert {
    param(
        [string]$Token,
        [string]$OrganizationId
    )

    $headers = @{
        apikey         = $anonKey
        Authorization  = "Bearer $Token"
        "Content-Type" = "application/json"
        Prefer         = "return=representation"
    }

    $body = ConvertTo-JsonBody @{
        organization_id = $OrganizationId
        full_name        = "Tentativa Cross Tenant"
    }

    try {
        Invoke-RestMethod `
            -Method Post `
            -Uri "$apiUrl/rest/v1/people" `
            -Headers $headers `
            -Body $body | Out-Null

        return $false
    }
    catch {
        return $true
    }
}

function New-PersonInOwnOrganization {
    param(
        [string]$Token,
        [string]$OrganizationId,
        [string]$Name
    )

    $headers = @{
        apikey         = $anonKey
        Authorization  = "Bearer $Token"
        "Content-Type" = "application/json"
        Prefer         = "return=representation"
    }

    $body = ConvertTo-JsonBody @{
        organization_id = $OrganizationId
        full_name        = $Name
    }

    return @(
        Invoke-RestMethod `
            -Method Post `
            -Uri "$apiUrl/rest/v1/people" `
            -Headers $headers `
            -Body $body
    )
}

function Remove-TestAudit {
    param([string]$OrganizationId)

    if (-not $OrganizationId) {
        return
    }

    $headers = @{
        apikey        = $serviceKey
        Authorization = "Bearer $serviceKey"
    }

    try {
        Invoke-RestMethod `
            -Method Delete `
            -Uri "$apiUrl/rest/v1/audit_log?organization_id=eq.$OrganizationId" `
            -Headers $headers | Out-Null
    }
    catch {
        Write-Host "Aviso: auditoria temporária não removida." -ForegroundColor Yellow
    }
}

function Remove-TestOrganization {
    param([string]$OrganizationId)

    if (-not $OrganizationId) {
        return
    }

    $headers = @{
        apikey        = $serviceKey
        Authorization = "Bearer $serviceKey"
    }

    try {
        Invoke-RestMethod `
            -Method Delete `
            -Uri "$apiUrl/rest/v1/organizations?id=eq.$OrganizationId" `
            -Headers $headers | Out-Null
    }
    catch {
        Write-Host "Aviso: organização de teste não removida." -ForegroundColor Yellow
    }
}

function Remove-TestUser {
    param([string]$UserId)

    if (-not $UserId) {
        return
    }

    $headers = @{
        apikey        = $serviceKey
        Authorization = "Bearer $serviceKey"
    }

    try {
        Invoke-RestMethod `
            -Method Delete `
            -Uri "$apiUrl/auth/v1/admin/users/$UserId" `
            -Headers $headers | Out-Null
    }
    catch {
        Write-Host "Aviso: usuário de teste não removido." -ForegroundColor Yellow
    }
}

function Assert-Test {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        throw "FALHOU: $Message"
    }

    Write-Host "PASSOU: $Message" -ForegroundColor Green
}

# ------------------------------------------------------------
# Dados temporários
# ------------------------------------------------------------

$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

$emailA = "rls-a-$suffix@example.com"
$emailB = "rls-b-$suffix@example.com"

$password = "Nethanel-Teste-2026!"

$userA = $null
$userB = $null

$orgA = $null
$orgB = $null

try {

    Write-Host "`n1. Criando usuários..." -ForegroundColor Cyan

    $userA = New-TestUser `
        -Email $emailA `
        -Password $password `
        -Name "Usuário Teste A"

    $userB = New-TestUser `
        -Email $emailB `
        -Password $password `
        -Name "Usuário Teste B"

    Assert-Test ($null -ne $userA.id) "Usuário A criado"
    Assert-Test ($null -ne $userB.id) "Usuário B criado"

    # --------------------------------------------------------

    Write-Host "`n2. Validando profiles automáticos..." -ForegroundColor Cyan

    $profileCountA = docker exec supabase_db_nethanel-church `
        psql -U postgres -d postgres -t -A `
        -c "select count(*) from public.profiles where user_id = '$($userA.id)';"

    $profileCountB = docker exec supabase_db_nethanel-church `
        psql -U postgres -d postgres -t -A `
        -c "select count(*) from public.profiles where user_id = '$($userB.id)';"

    Assert-Test ($profileCountA.Trim() -eq "1") "Profile automático do usuário A"
    Assert-Test ($profileCountB.Trim() -eq "1") "Profile automático do usuário B"

    # --------------------------------------------------------

    Write-Host "`n3. Fazendo login..." -ForegroundColor Cyan

    $tokenA = Get-AccessToken `
        -Email $emailA `
        -Password $password

    $tokenB = Get-AccessToken `
        -Email $emailB `
        -Password $password

    Assert-Test (-not [string]::IsNullOrWhiteSpace($tokenA)) "Token do usuário A"
    Assert-Test (-not [string]::IsNullOrWhiteSpace($tokenB)) "Token do usuário B"

    # --------------------------------------------------------

    Write-Host "`n4. Criando duas organizações..." -ForegroundColor Cyan

    $orgA = New-Organization `
        -Token $tokenA `
        -Name "Igreja Teste A" `
        -Slug "igreja-teste-a-$suffix"

    $orgB = New-Organization `
        -Token $tokenB `
        -Name "Igreja Teste B" `
        -Slug "igreja-teste-b-$suffix"

    Assert-Test ($null -ne $orgA.organization_id) "Organização A criada"
    Assert-Test ($null -ne $orgB.organization_id) "Organização B criada"

    # --------------------------------------------------------

    Write-Host "`n5. Testando isolamento de leitura..." -ForegroundColor Cyan

    $orgsA = Get-Organizations -Token $tokenA
    $orgsB = Get-Organizations -Token $tokenB

    $aVeA = @(
        $orgsA |
        Where-Object {
            $_.id -eq $orgA.organization_id
        }
    ).Count -eq 1

    $aVeB = @(
        $orgsA |
        Where-Object {
            $_.id -eq $orgB.organization_id
        }
    ).Count -gt 0

    $bVeB = @(
        $orgsB |
        Where-Object {
            $_.id -eq $orgB.organization_id
        }
    ).Count -eq 1

    $bVeA = @(
        $orgsB |
        Where-Object {
            $_.id -eq $orgA.organization_id
        }
    ).Count -gt 0

    Assert-Test $aVeA "Usuário A enxerga sua organização"
    Assert-Test (-not $aVeB) "Usuário A NÃO enxerga organização B"

    Assert-Test $bVeB "Usuário B enxerga sua organização"
    Assert-Test (-not $bVeA) "Usuário B NÃO enxerga organização A"

    # --------------------------------------------------------

    Write-Host "`n6. Testando permissões do proprietário..." -ForegroundColor Cyan

    $ownPerson = New-PersonInOwnOrganization `
        -Token $tokenA `
        -OrganizationId $orgA.organization_id `
        -Name "Pessoa da Igreja A"

    Assert-Test (
        $ownPerson.Count -eq 1
    ) "Owner A consegue cadastrar pessoa na própria organização"

    # --------------------------------------------------------

    Write-Host "`n7. Testando bloqueio de escrita cross-tenant..." -ForegroundColor Cyan

    $aBloqueado = Test-ForbiddenPersonInsert `
        -Token $tokenA `
        -OrganizationId $orgB.organization_id

    $bBloqueado = Test-ForbiddenPersonInsert `
        -Token $tokenB `
        -OrganizationId $orgA.organization_id

    Assert-Test $aBloqueado "Usuário A NÃO consegue inserir pessoa na organização B"
    Assert-Test $bBloqueado "Usuário B NÃO consegue inserir pessoa na organização A"

    # --------------------------------------------------------

    Write-Host "`n==============================================" -ForegroundColor Green
    Write-Host "RLS MULTI-TENANT: TODOS OS TESTES PASSARAM" -ForegroundColor Green
    Write-Host "==============================================" -ForegroundColor Green
}
finally {

    Write-Host "`nLimpando dados temporários..." -ForegroundColor DarkGray

    if ($orgA) {
    Remove-TestAudit `
        -OrganizationId $orgA.organization_id

    Remove-TestOrganization `
        -OrganizationId $orgA.organization_id
}

if ($orgB) {
    Remove-TestAudit `
        -OrganizationId $orgB.organization_id

    Remove-TestOrganization `
        -OrganizationId $orgB.organization_id
}

    if ($userA) {
        Remove-TestUser `
            -UserId $userA.id
    }

    if ($userB) {
        Remove-TestUser `
            -UserId $userB.id
    }
}