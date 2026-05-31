# Deploy Edge Function extract-document su Supabase (progetto gestione-spese-condominiali)
# Prerequisiti: account Supabase, OPENAI_API_KEY già nei Secrets (Dashboard o CLI)

$ErrorActionPreference = "Stop"
$ProjectRef = "cwvwfrrknmjwdpcnqvhv"

Write-Host "Login Supabase (browser)..." -ForegroundColor Cyan
npx --yes supabase@latest login

Write-Host "Link progetto $ProjectRef..." -ForegroundColor Cyan
npx --yes supabase@latest link --project-ref $ProjectRef

Write-Host "Deploy extract-document..." -ForegroundColor Cyan
npx --yes supabase@latest functions deploy extract-document --project-ref $ProjectRef

Write-Host ""
Write-Host "Verifica OPTIONS (atteso HTTP 204):" -ForegroundColor Cyan
curl.exe -s -o NUL -w "HTTP %{http_code}`n" -X OPTIONS `
  "https://$ProjectRef.supabase.co/functions/v1/extract-document" `
  -H "Origin: https://gestione-spese-condominiali.vercel.app" `
  -H "Access-Control-Request-Method: POST" `
  -H "Access-Control-Request-Headers: authorization,apikey,content-type"

Write-Host ""
Write-Host "Secrets richiesti (almeno uno):" -ForegroundColor Cyan
Write-Host "  OPENAI_API_KEY=sk-...   oppure   ANTHROPIC_API_KEY=sk-ant-..."
Write-Host "  Opzionale: AI_PROVIDER=openai | anthropic (default: auto)"
Write-Host ""
Write-Host "Fatto. Riprova l'import documento dall'app." -ForegroundColor Green
