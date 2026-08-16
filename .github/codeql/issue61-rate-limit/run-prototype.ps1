param(
  [Parameter(Mandatory = $true)]
  [string]$CodeQL
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $CodeQL)) {
  throw "CodeQL executable was not found: $CodeQL"
}

$prototypeRoot = $PSScriptRoot
$repoRoot = [IO.Path]::GetFullPath((Join-Path $prototypeRoot "..\..\.."))
$fixtureRoot = Join-Path $prototypeRoot "tests\fixtures"
$codeqlRoot = Split-Path -Parent $CodeQL
$stockQuery = Get-ChildItem (Join-Path $codeqlRoot "qlpacks\codeql\javascript-queries") -Recurse -Filter "MissingRateLimiting.ql" |
  Where-Object { $_.FullName -match "Security[\\/]CWE-770[\\/]MissingRateLimiting\.ql$" } |
  Sort-Object FullName |
  Select-Object -Last 1

if ($null -eq $stockQuery) {
  throw "The bundled js/missing-rate-limiting query was not found under $codeqlRoot"
}

$customQuery = Join-Path $prototypeRoot "queries\KittaChatMissingRateLimiting.ql"
$runRoot = Join-Path $env:TEMP ("issue61-codeql-prototype-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
$database = Join-Path $runRoot "fixture-db"
$stockSarif = Join-Path $runRoot "stock.sarif"
$customSarif = Join-Path $runRoot "custom.sarif"

& $CodeQL database create $database --language=javascript --source-root $fixtureRoot --quiet
if ($LASTEXITCODE -ne 0) { throw "CodeQL database creation failed with exit code $LASTEXITCODE" }

& $CodeQL database analyze $database $stockQuery.FullName --search-path $codeqlRoot --additional-packs $codeqlRoot --format=sarif-latest --output=$stockSarif
if ($LASTEXITCODE -ne 0) { throw "Stock CodeQL analysis failed with exit code $LASTEXITCODE" }

& $CodeQL database analyze $database $customQuery --search-path $codeqlRoot --additional-packs $codeqlRoot --format=sarif-latest --output=$customSarif
if ($LASTEXITCODE -ne 0) { throw "Custom CodeQL analysis failed with exit code $LASTEXITCODE" }

function Get-ResultKey($result) {
  $location = $result.locations[0].physicalLocation
  return "$($location.artifactLocation.uri):$($location.region.startLine):$($location.region.startColumn)"
}

$stock = Get-Content $stockSarif -Raw | ConvertFrom-Json
$custom = Get-Content $customSarif -Raw | ConvertFrom-Json
$stockResults = @($stock.runs[0].results)
$customResults = @($custom.runs[0].results)
$customKeys = @{}
foreach ($result in $customResults) {
  $customKeys[(Get-ResultKey $result)] = $true
}
$stockKeys = @{}
foreach ($result in $stockResults) {
  $stockKeys[(Get-ResultKey $result)] = $true
}

$protectedLines = @(19, 20)
$negativeControlLines = @(21, 22, 23, 24)
$customLocations = @($customResults | ForEach-Object {
    $location = $_.locations[0].physicalLocation
    [PSCustomObject]@{
      path = $location.artifactLocation.uri
      line = $location.region.startLine
    }
  })

$protectedReported = @($customLocations | Where-Object { $_.line -in $protectedLines })
$missingNegativeControls = @($negativeControlLines | Where-Object {
    $line = $_
    -not [bool]($customLocations | Where-Object { $_.line -eq $line })
  })
$customOnly = @($customResults | Where-Object { -not $stockKeys.ContainsKey((Get-ResultKey $_)) })

if ($stockResults.Count -ne 6) { throw "Expected 6 stock fixture results; observed $($stockResults.Count)" }
if ($customResults.Count -ne 4) { throw "Expected 4 custom fixture results; observed $($customResults.Count)" }
if ($protectedReported.Count -ne 0) { throw "Canonical protected route(s) were reported" }
if ($missingNegativeControls.Count -ne 0) { throw "A required negative control was not reported: $($missingNegativeControls -join ', ')" }
if ($customOnly.Count -ne 0) { throw "Custom modeling introduced result(s) absent from stock query" }

@{
  verdict = "PASS"
  question = "Does the narrow canonical middleware model preserve negative coverage without treating canonical protected routes as missing?"
  codeqlCli = (& $CodeQL version | Select-String "release" | ForEach-Object { $_.ToString().Trim() })
  stockResultCount = $stockResults.Count
  customResultCount = $customResults.Count
  canonicalProtectedLines = $protectedLines
  negativeControlLines = $negativeControlLines
  customLocations = $customLocations
  outputDirectory = $runRoot
  ciIntegration = "NOT_RUN"
} | ConvertTo-Json -Depth 8
