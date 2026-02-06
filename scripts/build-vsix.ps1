# Build a VSIX package for nUIget extension
param(
    [string]$Output = "nuiget.vsix"
)

Write-Host "==> Ensuring dependencies are installed"

# Install local dev dependency for vsce if missing
$packageJson = Join-Path $PSScriptRoot "..\package.json"
$pkg = Get-Content $packageJson -Raw | ConvertFrom-Json

if (-not $pkg.devDependencies.PSObject.Properties.Name.Contains("@vscode/vsce")) {
    Write-Host "Installing @vscode/vsce as dev dependency..."
    npm install --save-dev @vscode/vsce | Out-Null
}

Write-Host "==> Compiling extension (webpack)"
# Use compile to build extension and webview bundles
npm run compile | Out-Null

Write-Host "==> Packaging with vsce"
# Use npx to run local vsce
npx vsce package --out $Output

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ VSIX created: $Output"
} else {
    Write-Error "❌ Packaging failed"
    exit 1
}
