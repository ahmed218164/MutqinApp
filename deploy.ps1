# 🚀 Final Deployment Script
# Run this after completing all manual steps

Write-Host "🎯 Mutqin Intelligent Memorization Architecture - Deployment" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check Supabase CLI
Write-Host "📋 Step 1: Checking Supabase CLI..." -ForegroundColor Yellow
if (!(Get-Command supabase -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Supabase CLI not found. Installing..." -ForegroundColor Red
    npm install -g supabase
} else {
    Write-Host "✅ Supabase CLI found" -ForegroundColor Green
}

# Step 2: Login to Supabase
Write-Host ""
Write-Host "📋 Step 2: Logging in to Supabase..." -ForegroundColor Yellow
supabase login

# Step 3: Link Project
Write-Host ""
Write-Host "📋 Step 3: Linking Supabase project..." -ForegroundColor Yellow
$projectRef = Read-Host "Enter your Supabase project ref"
supabase link --project-ref $projectRef

# Step 4: Set Secrets
Write-Host ""
Write-Host "📋 Step 4: Setting environment secrets..." -ForegroundColor Yellow
$geminiKey = Read-Host "Enter your Gemini API key" -AsSecureString
$geminiKeyPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($geminiKey))
supabase secrets set GEMINI_API_KEY=$geminiKeyPlain

# Step 5: Deploy Edge Functions
Write-Host ""
Write-Host "📋 Step 5: Deploying Edge Functions..." -ForegroundColor Yellow
Write-Host "Deploying generate-plan function..." -ForegroundColor Cyan
supabase functions deploy generate-plan

Write-Host ""
Write-Host "Deploying check-recitation function..." -ForegroundColor Cyan
supabase functions deploy check-recitation

# Step 6: Verify Deployment
Write-Host ""
Write-Host "📋 Step 6: Verifying deployment..." -ForegroundColor Yellow
supabase functions list
supabase secrets list

# Step 7: Test Functions
Write-Host ""
Write-Host "📋 Step 7: Testing functions..." -ForegroundColor Yellow
Write-Host "Run the following in Supabase SQL Editor to verify schema:" -ForegroundColor Cyan
Write-Host "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('user_plans', 'progress_logs', 'error_logs', 'ward_locks');" -ForegroundColor White

# Done
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "✅ Deployment Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Test plan generation in the app" -ForegroundColor White
Write-Host "2. Complete a ward and verify unlocking" -ForegroundColor White
Write-Host "3. Test 5-ward limit protocol" -ForegroundColor White
Write-Host "4. Review error logging system" -ForegroundColor White
Write-Host ""
Write-Host "📚 Documentation:" -ForegroundColor Yellow
Write-Host "- Deployment Guide: DEPLOYMENT_GUIDE.md" -ForegroundColor White
Write-Host "- Walkthrough: .gemini/antigravity/brain/.../walkthrough.md" -ForegroundColor White
Write-Host ""
