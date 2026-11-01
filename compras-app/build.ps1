# Compila o APK do app Compras (sem Gradle). Uso: powershell -ExecutionPolicy Bypass -File build.ps1
# Le as chaves publicas do Supabase de ..\.env.local e gera assets\config.js (fora do git).
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$proj = Split-Path $root -Parent
$u8 = New-Object System.Text.UTF8Encoding($false)

# ferramentas Android (SDK enxuto do projeto tv-monitor) e JDK
$sdk = "C:\Users\alan_\Downloads\tv-monitor\android-sdk"
$bt = "$sdk\build-tools\34.0.0"
$jar = "$sdk\platforms\android-34\android.jar"
$jdk = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot\bin"
$ks = "C:\Users\alan_\Downloads\tv-monitor\crunchy-button\debug.keystore"
$env:JAVA_HOME = Split-Path $jdk
$out = "$root\build"
$assets = "$root\assets"

# 1) config.js: URL e chave ANON (publica por desenho) de cada ambiente
$kv = @{}
$envf = "$proj\.env.local"
if (Test-Path $envf) {
    Get-Content $envf -Encoding UTF8 | ForEach-Object {
        $l = $_.Trim()
        if ($l -and -not $l.StartsWith('#')) {
            $i = $l.IndexOf('=')
            if ($i -gt 0) { $kv[$l.Substring(0, $i).Trim()] = $l.Substring($i + 1).Trim().Trim('"').Trim("'") }
        }
    }
} else { Write-Warning ".env.local nao encontrado em $proj" }
$prodUrl = $kv['NEXT_PUBLIC_SUPABASE_URL']
$prodKey = $kv['NEXT_PUBLIC_SUPABASE_ANON_KEY']
$devUrl = if ($kv['DEV_SUPABASE_URL']) { $kv['DEV_SUPABASE_URL'] } else { 'http://192.168.1.50:8000' }
$devKey = $kv['DEV_SUPABASE_ANON_KEY']
if (-not $devKey) { Write-Warning "DEV_SUPABASE_ANON_KEY ausente no .env.local: o ambiente DEV do app nao vai conseguir entrar." }
if (-not $prodKey) { Write-Warning "NEXT_PUBLIC_SUPABASE_ANON_KEY ausente: o ambiente PRODUCAO do app nao vai conseguir entrar." }
function Js($s) { "'" + ([string]$s).Replace('\', '\\').Replace("'", "\'") + "'" }

# 2) assets = web\ com o CSS do Font Awesome embutido (o WebView nao carrega fonte de CSS externo em file://)
Remove-Item $assets -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $assets | Out-Null
Copy-Item "$root\web\core.js" $assets
Copy-Item "$root\web\fonts" "$assets\fonts" -Recurse
$fa = [IO.File]::ReadAllText("$root\web\fa\css\all.min.css", $u8)
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$root\web\fa\webfonts\fa-solid-900.woff2"))
$fa = $fa.Replace('../webfonts/fa-solid-900.woff2', 'data:font/woff2;base64,' + $b64)
$html = [IO.File]::ReadAllText("$root\web\index.html", $u8)
if (-not $html.Contains('<!--FA_CSS-->')) { throw "marcador <!--FA_CSS--> ausente em web\index.html" }
[IO.File]::WriteAllText("$assets\index.html", $html.Replace('<!--FA_CSS-->', '<style>' + $fa + '</style>'), $u8)
$cfg = "window.CONFIG={dev:{url:" + (Js $devUrl) + ",key:" + (Js $devKey) + "},prod:{url:" + (Js $prodUrl) + ",key:" + (Js $prodKey) + "}};"
[IO.File]::WriteAllText("$assets\config.js", $cfg, $u8)

# 3) recursos (icone, rede) + manifesto + assets
Remove-Item $out -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory "$out\classes", "$out\dex" | Out-Null
& "$bt\aapt2.exe" compile --dir "$root\res" -o "$out\res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile falhou" }
& "$bt\aapt2.exe" link -o "$out\base.apk" -I $jar --manifest "$root\AndroidManifest.xml" -A $assets --min-sdk-version 23 --target-sdk-version 33 "$out\res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 link falhou" }

# 4) codigo Java -> dex -> apk assinado
$src = Get-ChildItem "$root\src" -Recurse -Filter *.java | ForEach-Object FullName
$ErrorActionPreference = "Continue"
& "$jdk\javac.exe" -Xlint:-options -source 8 -target 8 -cp $jar -d "$out\classes" $src 2>&1 | Where-Object { $_ -notmatch 'warning|Note:|deprecated|Xlint' }
$javacExit = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($javacExit -ne 0) { throw "javac falhou (codigo $javacExit)" }
$cls = Get-ChildItem "$out\classes" -Recurse -Filter *.class | ForEach-Object FullName
& "$bt\d8.bat" --lib $jar --min-api 23 --output "$out\dex" $cls
Push-Location "$out\dex"; & "$jdk\jar.exe" uf "$out\base.apk" classes.dex; Pop-Location
& "$bt\zipalign.exe" -f 4 "$out\base.apk" "$out\aligned.apk"
& "$bt\apksigner.bat" sign --ks $ks --ks-pass pass:android --key-pass pass:android --out "$root\compras.apk" "$out\aligned.apk"
"OK: $root\compras.apk"
