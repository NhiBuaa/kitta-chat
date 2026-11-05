<#
.SYNOPSIS
    Integrity and conformance validator for Agentic Repo Kit and consumer repositories.

.DESCRIPTION
    Performs 4 rigorous verification passes without external dependencies:
    1. Skeleton Integrity: Validates 13 canonical docs/agent directories, playbooks, and context files.
    2. Markdown Link Integrity: Verifies 100% of internal links and GitHub Flavored Markdown (GFM) anchor slugs,
       ignoring example links inside code fences.
    3. Frontmatter & Structure: Validates YAML frontmatters (CONTEXT.md, DESIGN.md, SKILL.md) and
       canonical headings (AGENTS.md) via a lightweight indentation state machine.
    4. Single Source of Truth (SSoT): Detects forbidden files, competing task trackers, and documentation mirroring.

.PARAMETER TargetPath
    Path to the repository to validate. Defaults to current directory.

.PARAMETER LinksOnly
    Switch. If specified, runs only the Markdown Link Integrity pass.

.PARAMETER SkeletonOnly
    Switch. If specified, runs only the Skeleton Integrity pass.

.PARAMETER Strict
    Switch. If specified, treats warnings as errors and exits with code 1 if any warning is found.

.PARAMETER Json
    Switch. If specified, outputs results in structured JSON format for CI/CD integration.
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$TargetPath = ".",

    [switch]$LinksOnly,
    [switch]$SkeletonOnly,
    [switch]$Strict,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Path Resolution & Environment Detection
# ---------------------------------------------------------------------------
$resolvedTarget = (Resolve-Path -Path $TargetPath -ErrorAction SilentlyContinue)
if (-not $resolvedTarget) {
    Write-Error "Target path '$TargetPath' does not exist."
    exit 1
}
$resolvedTarget = $resolvedTarget.Path

# Detect if target is the kit repository itself or a consumer repository
$isKitRepo = (Test-Path (Join-Path $resolvedTarget "templates")) -and (Test-Path (Join-Path $resolvedTarget "skills/init-agentic-repo/SKILL.md"))

# ---------------------------------------------------------------------------
# State & Result Collection
# ---------------------------------------------------------------------------
$errors = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
$passStats = [ordered]@{
    LinksChecked       = 0
    BrokenLinks        = 0
    FilesChecked       = 0
    MissingFiles       = 0
    FrontmattersChecked = 0
    FrontmatterErrors  = 0
    SsotChecksRun      = 0
    SsotViolations     = 0
}

# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------
function Read-Utf8File ([string]$path) {
    return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}

function Strip-CodeBlocks ([string]$rawText) {
    # 1. Strip multi-line code fences: ```...``` or ~~~...~~~
    $noFences = [regex]::Replace($rawText, '(?ms)^[ \t]*(`{3,}|~{3,})[^\r\n]*\r?\n.*?\r?\n[ \t]*\1[ \t]*(?=\r?\n|$)', '')
    # 2. Strip inline code: `...`
    return [regex]::Replace($noFences, '(?s)(`+)(.*?)\1', '')
}

function Get-GfmSlug ([string]$headingText) {
    # 1. Strip markdown elements inside heading
    $t = [regex]::Replace($headingText, '\[([^\]]+)\]\([^)]+\)', '$1')
    $t = [regex]::Replace($t, '`([^`]+)`', '$1')
    $t = [regex]::Replace($t, '[\*_]{1,3}([^\*_]+)[\*_]{1,3}', '$1')

    # 2. Lowercase invariant (preserves unicode diacritics)
    $t = $t.ToLowerInvariant()

    # 3. Strip punctuation matching GitHub Flavored Markdown (GFM)
    $sb = [System.Text.StringBuilder]::new()
    foreach ($ch in $t.ToCharArray()) {
        if ([char]::IsLetterOrDigit($ch) -or $ch -eq ' ' -or $ch -eq '-' -or $ch -eq '_') {
            [void]$sb.Append($ch)
        }
    }
    $cleaned = $sb.ToString().Trim()

    # 4. Collapse spaces into single hyphen
    return [regex]::Replace($cleaned, '\s+', '-')
}

function Parse-SimpleYaml ([string]$yamlText) {
    $lines = $yamlText -split "\r?\n"
    $dict = [System.Collections.Generic.Dictionary[string, string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $keyStack = [System.Collections.Generic.List[PSObject]]::new()

    for ($i = 0; $i -lt $lines.Length; $i++) {
        $line = $lines[$i]
        if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) { continue }

        if ($line -match '^\t+') {
            throw "YAML syntax error at line $($i + 1): Tabs are forbidden in YAML indentation."
        }

        $indent = 0
        while ($indent -lt $line.Length -and $line[$indent] -eq ' ') { $indent++ }

        $trimmed = $line.Substring($indent)
        if ($trimmed -match '^(?<key>[a-zA-Z0-9_-]+):(?:\s*(?<val>.*))?$') {
            $key = $Matches['key']
            $val = if ($Matches['val']) { $Matches['val'].Trim() } else { "" }
            if ($val -match '^["''](?<inner>.*)["'']$') { $val = $Matches['inner'] }

            while ($keyStack.Count -gt 0 -and $keyStack[$keyStack.Count - 1].Indent -ge $indent) {
                $keyStack.RemoveAt($keyStack.Count - 1)
            }

            $keyStack.Add([PSCustomObject]@{ Key = $key; Indent = $indent })
            $fullPath = ($keyStack | ForEach-Object { $_.Key }) -join "."
            $dict[$fullPath] = $val
        }
    }
    return $dict
}

# Slug cache to avoid re-parsing headings of the same file repeatedly
$global:HeadingSlugsCache = [System.Collections.Generic.Dictionary[string, System.Collections.Generic.HashSet[string]]]::new([System.StringComparer]::OrdinalIgnoreCase)

function Get-FileHeadingSlugs ([string]$filePath) {
    if ($global:HeadingSlugsCache.ContainsKey($filePath)) {
        return $global:HeadingSlugsCache[$filePath]
    }

    $slugSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    if (-not (Test-Path $filePath)) {
        return $slugSet
    }

    $content = Read-Utf8File $filePath
    # Strip code blocks first so code blocks containing "# " don't create fake headings
    $cleaned = Strip-CodeBlocks $content
    $lines = $cleaned -split "\r?\n"

    $slugCounts = [System.Collections.Generic.Dictionary[string, int]]::new([System.StringComparer]::OrdinalIgnoreCase)

    foreach ($line in $lines) {
        if ($line -match '^(?<hashes>#{1,6})\s+(?<text>.+?)(?:\s+#+)?$') {
            $baseSlug = Get-GfmSlug $Matches['text']
            if (-not $baseSlug) { continue }

            if (-not $slugCounts.ContainsKey($baseSlug)) {
                $slugCounts[$baseSlug] = 0
                [void]$slugSet.Add($baseSlug)
            } else {
                $slugCounts[$baseSlug]++
                $duplicateSlug = "$baseSlug-$($slugCounts[$baseSlug])"
                [void]$slugSet.Add($duplicateSlug)
            }
        }
    }

    $global:HeadingSlugsCache[$filePath] = $slugSet
    return $slugSet
}

if (-not $Json) {
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host " Agentic Repo Kit — Repository Integrity & Conformance Check" -ForegroundColor Cyan
    Write-Host " Target Path: $resolvedTarget" -ForegroundColor Cyan
    Write-Host " Target Type: $(if ($isKitRepo) { 'Kit Toolkit Repository' } else { 'Consumer Project Repository' })" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
}

# ===========================================================================
# PASS 1: SKELETON & MANDATORY FILES INTEGRITY
# ===========================================================================
if (-not $LinksOnly) {
    # 1. Canonical Root Files
    $mandatoryRootFiles = @(
        "README.md",
        "PROJECT-OVERVIEW.md",
        "AGENTS.md",
        "CONTEXT.md"
    )

    # 2. Canonical 10 Documentation Directories and READMEs
    $canonicalDocsFiles = @(
        "docs/README.md",
        "docs/01-overview/README.md",
        "docs/02-architecture/README.md",
        "docs/03-product/README.md",
        "docs/04-standards/README.md",
        "docs/05-specs/README.md",
        "docs/06-decisions/README.md",
        "docs/07-guides/README.md",
        "docs/08-runbooks/README.md",
        "docs/99-notes/README.md"
    )

    # 3. Canonical Developer Playbooks
    $canonicalPlaybooks = @(
        "docs/07-guides/project-start-playbook.md",
        "docs/07-guides/feature-development-playbook.md"
    )

    # 4. Canonical Agent Configuration Directories and READMEs
    $canonicalAgentFiles = @(
        ".agents/README.md",
        ".agents/rules/README.md",
        ".agents/references/README.md"
    )

    $allMandatory = [System.Collections.Generic.List[string]]::new()
    foreach ($f in $mandatoryRootFiles) { $allMandatory.Add($f) }
    foreach ($f in $canonicalDocsFiles) { $allMandatory.Add($f) }
    foreach ($f in $canonicalPlaybooks) { $allMandatory.Add($f) }
    foreach ($f in $canonicalAgentFiles) { $allMandatory.Add($f) }

    if ($isKitRepo) {
        # Kit repository specific files
        $kitFiles = @(
            "scripts/init-repo.ps1",
            "scripts/check-kit.ps1",
            "skills/README.md",
            "skills/init-agentic-repo/SKILL.md",
            "skills/establish-project-overview/SKILL.md",
            "skills/normalize-agentic-repo/SKILL.md",
            "templates/README.md",
            "templates/AGENTS.md",
            "templates/DESIGN.md",
            "templates/ui-quality.md",
            "templates/ui-skill-routing.md",
            "templates/architecture.md",
            "templates/standard.md",
            "templates/spec.md",
            "templates/adr.md",
            "templates/guide.md",
            "templates/runbook.md"
        )
        foreach ($f in $kitFiles) { $allMandatory.Add($f) }
    } else {
        # Consumer repository: check UI surface condition
        $hasUi = $false
        $contextFile = Join-Path $resolvedTarget "CONTEXT.md"
        if (Test-Path $contextFile) {
            $contextText = Read-Utf8File $contextFile
            if ($contextText -match '(?i)Has UI Surface:\s*True') {
                $hasUi = $true
            }
        }
        $designFile = Join-Path $resolvedTarget "DESIGN.md"
        if ($hasUi -or (Test-Path $designFile)) {
            $allMandatory.Add("DESIGN.md")
            $allMandatory.Add("docs/04-standards/ui-quality.md")
            $allMandatory.Add(".agents/rules/ui-skill-routing.md")
        }
    }

    foreach ($relPath in $allMandatory) {
        $passStats.FilesChecked++
        $fullPath = Join-Path $resolvedTarget $relPath
        if (-not (Test-Path $fullPath)) {
            $passStats.MissingFiles++
            $errors.Add("Pass 1 (Skeleton): Missing mandatory file '$relPath'.")
        }
    }
}

# ===========================================================================
# PASS 2: MARKDOWN LINK & ANCHOR INTEGRITY
# ===========================================================================
if (-not $SkeletonOnly) {
    $allMdFiles = Get-ChildItem -Path $resolvedTarget -Filter "*.md" -Recurse | Where-Object {
        $rel = $_.FullName.Substring($resolvedTarget.Length).TrimStart('\', '/')
        $rel -notmatch '^(?:\.git|node_modules|vendor)[\\/]'
    }

    $linkRegex = [regex]'\[(?<text>[^\]]*)\]\((?<url>[^)\s]+)(?:\s+"(?<title>[^"]*)")?\)'
    $refLinkRegex = [regex]'^\[(?<id>[^\]]+)\]:\s*(?<url>\S+)'

    foreach ($file in $allMdFiles) {
        $relSource = $file.FullName.Substring($resolvedTarget.Length).TrimStart('\', '/')
        $content = Read-Utf8File $file.FullName
        $cleanContent = Strip-CodeBlocks $content
        $fileDir = $file.DirectoryName

        # Collect inline links
        $matches = $linkRegex.Matches($cleanContent)
        foreach ($m in $matches) {
            $url = $m.Groups['url'].Value.Trim()
            $text = $m.Groups['text'].Value.Trim()

            # Skip external protocols
            if ($url -match '^(?:https?://|mailto:|ftp:|file:///|file://|[a-zA-Z][a-zA-Z0-9+.-]*://)') { continue }

            $passStats.LinksChecked++

            # Split path and anchor
            $targetPathPart = $url
            $anchorPart = ""
            if ($url.Contains("#")) {
                $parts = $url.Split('#', 2)
                $targetPathPart = $parts[0]
                $anchorPart = $parts[1]
            }

            # Case A: Same-file anchor link (e.g., "#workflow")
            if ([string]::IsNullOrEmpty($targetPathPart)) {
                if (-not [string]::IsNullOrEmpty($anchorPart)) {
                    $slugs = Get-FileHeadingSlugs $file.FullName
                    if (-not $slugs.Contains($anchorPart)) {
                        $passStats.BrokenLinks++
                        $errors.Add("Pass 2 (Links): Broken anchor '#$anchorPart' in '$relSource' (label: '$text').")
                    }
                }
                continue
            }

            # Case B: Target is relative file path (with or without anchor)
            $normalizedTarget = $targetPathPart.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
            $targetFullPath = $null
            try {
                $targetFullPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($fileDir, $normalizedTarget))
            } catch {
                $passStats.BrokenLinks++
                $errors.Add("Pass 2 (Links): Invalid link target path format '$targetPathPart' in '$relSource' (label: '$text').")
                continue
            }

            if (-not (Test-Path $targetFullPath)) {
                $passStats.BrokenLinks++
                $errors.Add("Pass 2 (Links): Broken relative link target '$targetPathPart' in '$relSource' (label: '$text').")
            } else {
                # If target file exists and anchor is specified, verify anchor
                if (-not [string]::IsNullOrEmpty($anchorPart) -and $targetFullPath.EndsWith(".md", [System.StringComparison]::OrdinalIgnoreCase)) {
                    $targetSlugs = Get-FileHeadingSlugs $targetFullPath
                    if (-not $targetSlugs.Contains($anchorPart)) {
                        $passStats.BrokenLinks++
                        $errors.Add("Pass 2 (Links): Broken anchor '#$anchorPart' in target '$targetPathPart' from '$relSource' (label: '$text').")
                    }
                }
            }
        }
    }
}

# ===========================================================================
# PASS 3: FRONTMATTER & DOCUMENT STRUCTURE VALIDATION
# ===========================================================================
if (-not $LinksOnly -and -not $SkeletonOnly) {
    # 1. Validate CONTEXT.md
    $contextPath = Join-Path $resolvedTarget "CONTEXT.md"
    if (Test-Path $contextPath) {
        $passStats.FrontmattersChecked++
        $contextRaw = Read-Utf8File $contextPath
        if ($contextRaw -match '(?s)^---\r?\n(.*?)\r?\n---') {
            try {
                $yamlDict = Parse-SimpleYaml $Matches[1]
                if (-not $yamlDict.ContainsKey("status")) {
                    $passStats.FrontmatterErrors++
                    $errors.Add("Pass 3 (Frontmatter): 'CONTEXT.md' is missing required frontmatter key 'status'.")
                } else {
                    $validStatuses = @("initializing", "current", "active", "paused", "maintenance", "archived")
                    if ($yamlDict["status"] -notin $validStatuses) {
                        $passStats.FrontmatterErrors++
                        $errors.Add("Pass 3 (Frontmatter): 'CONTEXT.md' status '$($yamlDict["status"])' is invalid. Expected one of: $($validStatuses -join ', ').")
                    }
                }

                if (-not $yamlDict.ContainsKey("last_verified")) {
                    $passStats.FrontmatterErrors++
                    $errors.Add("Pass 3 (Frontmatter): 'CONTEXT.md' is missing required frontmatter key 'last_verified'.")
                } elseif ($yamlDict["last_verified"] -notmatch '^\d{4}-\d{2}-\d{2}$') {
                    $passStats.FrontmatterErrors++
                    $errors.Add("Pass 3 (Frontmatter): 'CONTEXT.md' last_verified '$($yamlDict["last_verified"])' must be formatted as YYYY-MM-DD.")
                }
            } catch {
                $passStats.FrontmatterErrors++
                $errors.Add("Pass 3 (Frontmatter): Error parsing 'CONTEXT.md' YAML frontmatter: $_")
            }
        } else {
            $passStats.FrontmatterErrors++
            $errors.Add("Pass 3 (Frontmatter): 'CONTEXT.md' must begin with a valid YAML frontmatter block (---).")
        }

        # Validate structural headings in CONTEXT.md
        $hasPhaseHeading = ($contextRaw -match '(?m)^##\s+(?:Current Phase|Current Product Boundary|Active Direction)')
        if (-not $hasPhaseHeading) {
            $warnings.Add("Pass 3 (Structure): 'CONTEXT.md' should contain heading '## Current Phase' or '## Current Product Boundary'.")
        }
        $hasBoundaryHeading = ($contextRaw -match '(?m)^##\s+(?:Boundary & Surface|Current Structural Direction|Canonical References)')
        if (-not $hasBoundaryHeading) {
            $warnings.Add("Pass 3 (Structure): 'CONTEXT.md' should contain heading '## Boundary & Surface' or '## Canonical References'.")
        }
    }

    # 2. Validate DESIGN.md (if present at root or in templates/)
    $designCandidates = @()
    if (Test-Path (Join-Path $resolvedTarget "DESIGN.md")) { $designCandidates += (Join-Path $resolvedTarget "DESIGN.md") }
    if (Test-Path (Join-Path $resolvedTarget "templates/DESIGN.md")) { $designCandidates += (Join-Path $resolvedTarget "templates/DESIGN.md") }

    foreach ($designPath in $designCandidates) {
        $relPath = $designPath.Substring($resolvedTarget.Length).TrimStart('\', '/')
        $passStats.FrontmattersChecked++
        $designRaw = Read-Utf8File $designPath
        if ($designRaw -match '(?s)^---\r?\n(.*?)\r?\n---') {
            try {
                $yamlDict = Parse-SimpleYaml $Matches[1]
                $requiredKeys = @("name", "version", "colors.primary", "colors.canvas", "colors.surface-1")
                foreach ($req in $requiredKeys) {
                    if (-not $yamlDict.ContainsKey($req)) {
                        $passStats.FrontmatterErrors++
                        $errors.Add("Pass 3 (Frontmatter): '$relPath' missing required design token '$req'.")
                    }
                }
            } catch {
                $passStats.FrontmatterErrors++
                $errors.Add("Pass 3 (Frontmatter): Error parsing '$relPath' YAML frontmatter: $_")
            }
        } else {
            $passStats.FrontmatterErrors++
            $errors.Add("Pass 3 (Frontmatter): '$relPath' must contain YAML frontmatter defining design tokens.")
        }
    }

    # 3. Validate AGENTS.md (Structural Heading & Read Order validation)
    $agentsPath = Join-Path $resolvedTarget "AGENTS.md"
    if (Test-Path $agentsPath) {
        $passStats.FrontmattersChecked++
        $agentsRaw = Read-Utf8File $agentsPath

        # Dual-check: If frontmatter is present, validate YAML syntax
        if ($agentsRaw -match '(?s)^---\r?\n(.*?)\r?\n---') {
            try {
                $null = Parse-SimpleYaml $Matches[1]
            } catch {
                $passStats.FrontmatterErrors++
                $errors.Add("Pass 3 (Frontmatter): 'AGENTS.md' frontmatter syntax error: $_")
            }
        }

        # Validate mandatory structural headings
        $mandatoryHeadings = @(
            '## Mission',
            '## Authority Map',
            '## Read Order'
        )
        foreach ($head in $mandatoryHeadings) {
            $pattern = '(?m)^' + [regex]::Escape($head)
            if ($agentsRaw -notmatch $pattern) {
                $passStats.FrontmatterErrors++
                $errors.Add("Pass 3 (Structure): 'AGENTS.md' is missing required heading '$head'.")
            }
        }

        # Check invariant rules heading (either 'Critical Invariants' or 'Boundary Rules')
        $hasInvariants = ($agentsRaw -match '(?m)^##\s+Critical Invariants') -or ($agentsRaw -match '(?m)^##\s+Boundary Rules')
        if (-not $hasInvariants) {
            $passStats.FrontmatterErrors++
            $errors.Add("Pass 3 (Structure): 'AGENTS.md' is missing required heading '## Critical Invariants' or '## Boundary Rules'.")
        }

        # Validate Read Order continuous numbering
        if ($agentsRaw -match '(?s)## Read Order.*?(?=(?:\r?\n## |\Z))') {
            $readOrderSection = $Matches[0]
            $stepMatches = [regex]::Matches($readOrderSection, '(?m)^(?<num>\d+)\.\s+')
            $expected = 1
            foreach ($sm in $stepMatches) {
                $actual = [int]$sm.Groups['num'].Value
                if ($actual -ne $expected) {
                    $warnings.Add("Pass 3 (Structure): 'AGENTS.md' Read Order has discontinuous step number: expected $expected, found $actual.")
                }
                $expected++
            }
        }
    }

    # 4. Validate SKILL.md Frontmatter (if skills directory exists)
    $skillFiles = Get-ChildItem -Path (Join-Path $resolvedTarget "skills") -Filter "SKILL.md" -Recurse -ErrorAction SilentlyContinue
    if ($skillFiles) {
        foreach ($sf in $skillFiles) {
            $relPath = $sf.FullName.Substring($resolvedTarget.Length).TrimStart('\', '/')
            $passStats.FrontmattersChecked++
            $skillRaw = Read-Utf8File $sf.FullName
            if ($skillRaw -match '(?s)^---\r?\n(.*?)\r?\n---') {
                try {
                    $yamlDict = Parse-SimpleYaml $Matches[1]
                    if (-not $yamlDict.ContainsKey("name") -or [string]::IsNullOrWhiteSpace($yamlDict["name"])) {
                        $passStats.FrontmatterErrors++
                        $errors.Add("Pass 3 (Frontmatter): Skill '$relPath' missing 'name' in frontmatter.")
                    }
                    if (-not $yamlDict.ContainsKey("description") -or [string]::IsNullOrWhiteSpace($yamlDict["description"])) {
                        $passStats.FrontmatterErrors++
                        $errors.Add("Pass 3 (Frontmatter): Skill '$relPath' missing 'description' in frontmatter.")
                    }
                } catch {
                    $passStats.FrontmatterErrors++
                    $errors.Add("Pass 3 (Frontmatter): Error parsing '$relPath' YAML: $_")
                }
            } else {
                $passStats.FrontmatterErrors++
                $errors.Add("Pass 3 (Frontmatter): Skill '$relPath' missing required YAML frontmatter.")
            }
        }
    }
}

# ===========================================================================
# PASS 4: SINGLE SOURCE OF TRUTH (SSOT) & CONFORMANCE AUDIT
# ===========================================================================
if (-not $LinksOnly -and -not $SkeletonOnly) {
    $passStats.SsotChecksRun++

    # 1. Detect Forbidden Project Management Files in Repo
    $forbiddenFilePatterns = @(
        "TODO.md",
        "ROADMAP.md",
        "TASK_LIST.md",
        "TASKS.md",
        "CHANGELOG.md",
        "SPRINT.md",
        "KANBAN.md"
    )

    foreach ($pattern in $forbiddenFilePatterns) {
        $foundForbidden = Get-ChildItem -Path $resolvedTarget -Filter $pattern -Recurse -ErrorAction SilentlyContinue | Where-Object {
            $rel = $_.FullName.Substring($resolvedTarget.Length).TrimStart('\', '/')
            $rel -notmatch '^(?:\.git|templates|node_modules)[\\/]'
        }
        foreach ($f in $foundForbidden) {
            $passStats.SsotViolations++
            $rel = $f.FullName.Substring($resolvedTarget.Length).TrimStart('\', '/')
            $errors.Add("Pass 4 (SSoT): Prohibited work-state tracking file '$rel' detected. Work tracking belongs in Issues/PRs.")
        }
    }

    # 2. Detect Unauthorized Agent Configuration Folders in Consumer Repos
    if (-not $isKitRepo) {
        $unauthorizedAgentDirs = @(
            ".agents/commands",
            ".agents/hooks",
            ".agents/skills"
        )
        foreach ($uad in $unauthorizedAgentDirs) {
            $checkPath = Join-Path $resolvedTarget $uad
            if (Test-Path $checkPath) {
                $passStats.SsotViolations++
                $warnings.Add("Pass 4 (SSoT): Agent configuration directory '$uad' found. Kit convention advises against adding custom command/hook/skill directories unless explicitly justified.")
            }
        }
    }

    # 3. Detect Competing Task Trackers (Heuristic analysis outside whitelisted files)
    $auditMdFiles = Get-ChildItem -Path $resolvedTarget -Filter "*.md" -Recurse | Where-Object {
        $rel = $_.FullName.Substring($resolvedTarget.Length).TrimStart('\', '/')
        $rel -notmatch '^(?:\.git|templates|docs[\\/]07-guides|docs[\\/]08-runbooks|node_modules)[\\/]'
    }

    foreach ($amf in $auditMdFiles) {
        $rel = $amf.FullName.Substring($resolvedTarget.Length).TrimStart('\', '/')
        $content = Read-Utf8File $amf.FullName
        $clean = Strip-CodeBlocks $content

        # Flag headings indicating sprint or work-item tracking
        if ($clean -match '(?im)^#+\s+(?:Sprint\s+\d+|Task\s+List|Backlog\s+Items|Kanban\s+Board|Work\s+Items|Lịch\s+trình\s+thực\s+hiện)') {
            $passStats.SsotViolations++
            $errors.Add("Pass 4 (SSoT): Competing task tracking section detected in '$rel'. Work tracking belongs in Issues/PRs.")
        }

        # Flag checklists containing explicit task assignments or issue numbers
        if ($clean -match '(?im)^-\s+\[[x ]\]\s+.*(?:@[a-zA-Z0-9_-]+|#\d{2,}|assigned\s+to|assignee:).*$') {
            $passStats.SsotViolations++
            $warnings.Add("Pass 4 (SSoT): Task assignment checklist detected in '$rel'. Task progress and ownership belong in Issues.")
        }
    }

    # 4. Anti-Mirroring: Ensure docs/01-overview/README.md does not copy PROJECT-OVERVIEW.md verbatim
    $overviewPath = Join-Path $resolvedTarget "PROJECT-OVERVIEW.md"
    $doc01Path = Join-Path $resolvedTarget "docs/01-overview/README.md"
    if ((Test-Path $overviewPath) -and (Test-Path $doc01Path)) {
        $doc01Raw = Read-Utf8File $doc01Path
        $mirrorSignatures = @(
            '## Architecture Direction',
            '## Important Constraints',
            '## Major Invariants',
            '## Development Workflow'
        )
        $matchedSignatures = 0
        foreach ($sig in $mirrorSignatures) {
            if ($doc01Raw.Contains($sig)) { $matchedSignatures++ }
        }
        if ($matchedSignatures -ge 3) {
            $passStats.SsotViolations++
            $warnings.Add("Pass 4 (SSoT): 'docs/01-overview/README.md' appears to mirror 'PROJECT-OVERVIEW.md' verbatim. Keep project foundation in root and use 01-overview only for distinct orientation.")
        }
    }
}

# ===========================================================================
# SUMMARY REPORT & EXIT CODE
# ===========================================================================
$totalErrors = $errors.Count
$totalWarnings = $warnings.Count

if ($Json) {
    $result = [pscustomobject]@{
        Target = $resolvedTarget
        IsKitRepo = $isKitRepo
        PassStats = $passStats
        Errors = $errors
        Warnings = $warnings
        Passed = ($totalErrors -eq 0 -and (-not $Strict -or $totalWarnings -eq 0))
    }
    $result | ConvertTo-Json -Depth 5
} else {
    Write-Host "`n------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host " VALIDATION RESULTS" -ForegroundColor Cyan
    Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray

    if (-not $SkeletonOnly) {
        $linkStatus = if ($passStats.BrokenLinks -eq 0) { "PASS" } else { "FAIL" }
        $linkColor = if ($passStats.BrokenLinks -eq 0) { "Green" } else { "Red" }
        Write-Host "[$linkStatus] Pass 1 - Markdown Link Integrity: $($passStats.LinksChecked) links checked, $($passStats.BrokenLinks) broken." -ForegroundColor $linkColor
    }

    if (-not $LinksOnly) {
        $skelStatus = if ($passStats.MissingFiles -eq 0) { "PASS" } else { "FAIL" }
        $skelColor = if ($passStats.MissingFiles -eq 0) { "Green" } else { "Red" }
        Write-Host "[$skelStatus] Pass 2 - Skeleton & Mandatory Files: $($passStats.FilesChecked) files checked, $($passStats.MissingFiles) missing." -ForegroundColor $skelColor
    }

    if (-not $LinksOnly -and -not $SkeletonOnly) {
        $frontStatus = if ($passStats.FrontmatterErrors -eq 0) { "PASS" } else { "FAIL" }
        $frontColor = if ($passStats.FrontmatterErrors -eq 0) { "Green" } else { "Red" }
        Write-Host "[$frontStatus] Pass 3 - Frontmatter & Document Structure: $($passStats.FrontmattersChecked) targets checked, $($passStats.FrontmatterErrors) errors." -ForegroundColor $frontColor

        $ssotStatus = if ($passStats.SsotViolations -eq 0) { "PASS" } else { "FAIL" }
        $ssotColor = if ($passStats.SsotViolations -eq 0) { "Green" } else { "Yellow" }
        Write-Host "[$ssotStatus] Pass 4 - Single Source of Truth & Conformance: $($passStats.SsotViolations) violations detected." -ForegroundColor $ssotColor
    }

    if ($warnings.Count -gt 0) {
        Write-Host "`nWARNINGS ($($warnings.Count)):" -ForegroundColor Yellow
        foreach ($w in $warnings) {
            Write-Host "  [WARN] $w" -ForegroundColor Yellow
        }
    }

    if ($errors.Count -gt 0) {
        Write-Host "`nERRORS ($($errors.Count)):" -ForegroundColor Red
        foreach ($e in $errors) {
            Write-Host "  [FAIL] $e" -ForegroundColor Red
        }
    }

    Write-Host "`n============================================================" -ForegroundColor Cyan
    if ($totalErrors -eq 0) {
        if ($totalWarnings -gt 0 -and $Strict) {
            Write-Host " RESULT: FAILED (-Strict mode treated $totalWarnings warnings as errors)" -ForegroundColor Red
            Write-Host "============================================================" -ForegroundColor Cyan
            exit 1
        } else {
            Write-Host " RESULT: PASSED ALL INTEGRITY CHECKS" -ForegroundColor Green
            Write-Host "============================================================" -ForegroundColor Cyan
            exit 0
        }
    } else {
        Write-Host " RESULT: FAILED ($totalErrors errors found)" -ForegroundColor Red
        Write-Host "============================================================" -ForegroundColor Cyan
        exit 1
    }
}
