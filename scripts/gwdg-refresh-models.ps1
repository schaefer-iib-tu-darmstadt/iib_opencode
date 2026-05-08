#requires -Version 5.1
<#
  gwdg-refresh-models.ps1

  Re-grounds the `provider.gwdg.models` block of opencode.json against the
  live GWDG ChatAI API.

    1. GET https://chat-ai.academiccloud.de/v1/models      -> live model catalog
    2. POST /v1/chat/completions per model with a tool def -> tool_call: true/false
    3. Build a fresh `provider.gwdg.models` JSON object with capability tags
    4. Print to stdout. Never modifies opencode.json directly.

  Run via:  bun run gwdg:refresh > new-models.json
       or:  powershell -File scripts/gwdg-refresh-models.ps1
       or:  pwsh       -File scripts/gwdg-refresh-models.ps1

  Compatible with Windows PowerShell 5.1 and PowerShell 7+.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrEmpty($env:GWDG_API_KEY)) {
  Write-Error "GWDG_API_KEY env var is not set. See IIBCODE_QUICKSTART.md for setup."
  exit 1
}

$BaseUrl  = "https://chat-ai.academiccloud.de/v1"
$Headers  = @{ Authorization = "Bearer $env:GWDG_API_KEY"; "Content-Type" = "application/json" }
$ProbeGap = 4100   # ms between probes; KISSKI Basic tier = 15 req/min (= 4s gap, +100ms safety)

# ---------- 1. Read existing opencode.json (if any) to preserve user overrides ----

$repoRoot   = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $repoRoot "opencode.json"
$existingModels = @{}

if (Test-Path $configPath) {
  try {
    $existing = Get-Content $configPath -Raw | ConvertFrom-Json
    if ($existing.provider -and $existing.provider.gwdg -and $existing.provider.gwdg.models) {
      foreach ($prop in $existing.provider.gwdg.models.PSObject.Properties) {
        $existingModels[$prop.Name] = $prop.Value
      }
    }
  } catch {
    Write-Warning "Could not parse existing opencode.json (continuing with defaults): $($_.Exception.Message)"
  }
}

# ---------- 2. List live models -------------------------------------------------

[Console]::Error.WriteLine("Fetching /v1/models...")
$catalog = Invoke-RestMethod -Uri "$BaseUrl/models" -Method Get -Headers $Headers -TimeoutSec 30

# ---------- 3. Probe each for tool-call support ---------------------------------

$probeBody = {
  param($mid)
  @{
    model = $mid
    messages = @(
      @{ role = "system"; content = "You are a helpful assistant. When asked about weather, you MUST call get_weather. Do not answer in prose." },
      @{ role = "user";   content = "What is the weather in Berlin?" }
    )
    tools = @(@{
      type = "function"
      function = @{
        name = "get_weather"
        description = "Get the current weather for a city"
        parameters = @{ type = "object"; properties = @{ city = @{ type = "string" } }; required = @("city") }
      }
    })
    tool_choice = "auto"; stream = $false; max_tokens = 200; temperature = 0.0
  } | ConvertTo-Json -Depth 10
}

$probeResults = @{}
$total = $catalog.data.Count
$i = 0

foreach ($m in $catalog.data) {
  $i++
  $mid = $m.id
  [Console]::Error.WriteLine(("[{0,2}/{1}] probing {2}" -f $i, $total, $mid))
  $entry = @{ tool_call = $false; error = $null; brokenHint = $null }
  try {
    $r = Invoke-RestMethod -Uri "$BaseUrl/chat/completions" -Method Post -Headers $Headers -Body (& $probeBody $mid) -TimeoutSec 90
    $tc = $r.choices[0].message.tool_calls
    if ($tc -and @($tc).Count -gt 0 -and $r.choices[0].finish_reason -eq "tool_calls") {
      $entry.tool_call = $true
    }
  } catch {
    $msg = $_.Exception.Message
    $resp = $_.Exception.Response
    if ($resp) {
      try {
        $stream = $resp.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $bodyText = $reader.ReadToEnd()
        $msg = "HTTP $([int]$resp.StatusCode): $bodyText"
      } catch {}
    }
    $entry.error = $msg
    if ($msg -match "enable-auto-tool-choice") {
      $entry.brokenHint = "no tool calling on GWDG"
    } else {
      $short = $msg
      if ($short.Length -gt 60) { $short = $short.Substring(0, 60) + "..." }
      $entry.brokenHint = "broken: $short"
    }
  }
  $probeResults[$mid] = $entry
  Start-Sleep -Milliseconds $ProbeGap
}

# ---------- 4. Build new models block ------------------------------------------

# Use an ordered hashtable so JSON output keeps a stable order: tool-capable first,
# then non-tool-capable, alphabetical inside each group.

$ordered = [ordered]@{}
$capable    = @($catalog.data | Where-Object { $probeResults[$_.id].tool_call } | Sort-Object id)
$notCapable = @($catalog.data | Where-Object { -not $probeResults[$_.id].tool_call } | Sort-Object id)

foreach ($m in @($capable + $notCapable)) {
  $mid = $m.id
  $probe = $probeResults[$mid]
  $hasImage   = $m.input  -contains "image"
  $hasThought = $m.output -contains "thought"

  # Display name: API name + parenthetical hints
  $hints = New-Object System.Collections.Generic.List[string]
  if ($probe.brokenHint) { $hints.Add($probe.brokenHint) }
  if ($hasThought)       { $hints.Add("thinking") }
  $displayName = $m.name
  if ($hints.Count -gt 0) { $displayName = "$displayName ($($hints -join '; '))" }

  $entry = [ordered]@{
    name = $displayName
    tool_call = $probe.tool_call
  }
  if ($hasThought) { $entry.reasoning = $true }
  if ($hasImage)   { $entry.attachment = $true }

  # Preserve existing limit overrides; otherwise default 128000 / 8192
  $ctx = 128000
  $out = 8192
  if ($existingModels.ContainsKey($mid) -and $existingModels[$mid].limit) {
    if ($existingModels[$mid].limit.context) { $ctx = [int]$existingModels[$mid].limit.context }
    if ($existingModels[$mid].limit.output)  { $out = [int]$existingModels[$mid].limit.output }
  }
  $entry.limit = [ordered]@{ context = $ctx; output = $out }

  $ordered[$mid] = $entry
}

# ---------- 5. Print to stdout --------------------------------------------------

$wrapper = [ordered]@{ provider = [ordered]@{ gwdg = [ordered]@{ models = $ordered } } }
$json = $wrapper | ConvertTo-Json -Depth 10

[Console]::Error.WriteLine("")
[Console]::Error.WriteLine("Probe summary:")
[Console]::Error.WriteLine(("  tool-capable: {0}" -f $capable.Count))
[Console]::Error.WriteLine(("  no tool call: {0}" -f $notCapable.Count))
[Console]::Error.WriteLine("")
[Console]::Error.WriteLine("Refreshed provider.gwdg.models block follows on stdout.")
[Console]::Error.WriteLine("Diff against the corresponding section of opencode.json and merge by hand.")
[Console]::Error.WriteLine("")

# Final JSON to stdout (only this goes through pipelines)
[Console]::Out.Write($json)
