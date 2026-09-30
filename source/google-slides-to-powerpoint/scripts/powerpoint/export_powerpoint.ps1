# Run on Windows with desktop PowerPoint; saves only new PNG files.
param([Parameter(Mandatory=$true)][string]$Pptx,
      [Parameter(Mandatory=$true)][string]$Out,
      [ValidateRange(48,7680)][int]$Width = 1920)
$ErrorActionPreference = 'Stop'
$inputDeck = (Resolve-Path -LiteralPath $Pptx).Path
if (Test-Path -LiteralPath $Out) { throw 'Choose a new render folder; output already exists.' }
$renderDir = [System.IO.Path]::GetFullPath($Out)
$hash = (Get-FileHash -LiteralPath $inputDeck -Algorithm SHA1).Hash.ToLowerInvariant()
$app = New-Object -ComObject PowerPoint.Application
$deck = $null
try {
    # Refuse a duplicate open document so we never close a user's presentation.
    foreach ($existing in $app.Presentations) {
        if ($existing.FullName -eq $inputDeck) { throw 'Close this presentation first, or test a new copy.' }
    }
    $deck = $app.Presentations.Open($inputDeck, -1, 0, 0)
    $height = [int][Math]::Round($Width * $deck.PageSetup.SlideHeight / $deck.PageSetup.SlideWidth)
    New-Item -ItemType Directory -Path $renderDir | Out-Null
    for ($i = 1; $i -le $deck.Slides.Count; $i++) {
        $file = Join-Path $renderDir ('s{0:D2}.png' -f $i)
        $deck.Slides.Item($i).Export($file, 'PNG', $Width, $height)
        if (!(Test-Path -LiteralPath $file)) { throw "No native render for slide $i" }
    }
    $manifest = @{ renderer = 'PowerPoint'; version = [string]$app.Version; platform = 'Windows';
       pptx_sha1 = $hash; slides = [int]$deck.Slides.Count; width = $Width; height = $height
     } | ConvertTo-Json
    [System.IO.File]::WriteAllText((Join-Path $renderDir 'render-manifest.json'), $manifest, (New-Object System.Text.UTF8Encoding($false)))
} finally {
    if ($null -ne $deck) { $deck.Close() }
    # Never quit PowerPoint or close other presentations.
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app)
}
