$DopplerProject = if ($env:DOPPLER_PROJECT) { $env:DOPPLER_PROJECT } else { "all" }
$DopplerConfig = if ($env:DOPPLER_CONFIG) { $env:DOPPLER_CONFIG } else { "main" }

if (!(Test-Path ".doppler/secrets.txt")) {
    Write-Error ".doppler/secrets.txt not found."
    exit 1
}

$missing = @()
Get-Content ".doppler/secrets.txt" | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line -like "#*") { return }

    $val = & doppler secrets get $line --plain --project $DopplerProject --config $DopplerConfig 2>$null
    if ($LASTEXITCODE -ne 0) {
        $missing += $line
    }
}

if ($missing.Count -gt 0) {
    Write-Host "Missing Doppler secrets in $DopplerProject/$DopplerConfig`:" -ForegroundColor Red
    foreach ($m in $missing) {
        Write-Host "  - $m" -ForegroundColor Red
    }
    exit 1
}

Write-Host "All Doppler secrets are present in $DopplerProject/$DopplerConfig."
