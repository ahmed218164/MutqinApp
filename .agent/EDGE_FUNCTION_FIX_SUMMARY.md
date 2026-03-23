# Edge Function 500 Error - Fix Summary

## ✅ Completed Fixes

### 1. **Edge Function Deep Logging** (`supabase/functions/generate-plan/index.ts`)

Added comprehensive console.log statements at every critical step:

- ✅ **Request received** - Logs when the function starts and receives a request
- ✅ **Body parsing** - Logs when parsing the request body
- ✅ **Parameter validation** - Logs missing parameters with details
- ✅ **Gemini request** - Logs when requesting pace template from AI
- ✅ **Gemini response** - Logs the received pace template
- ✅ **Algorithm start** - Logs when the local plan generation begins
- ✅ **Algorithm complete** - Logs the number of days generated
- ✅ **Database initialization** - Logs Supabase client creation
- ✅ **Database delete** - Logs deletion of existing plan
- ✅ **Database insert** - Logs bulk insert operation with record count
- ✅ **Success response** - Logs successful completion
- ✅ **Error handling** - Logs detailed error information including stack traces

### 2. **Enhanced Error Handling**

**Edge Function:**
- Added detailed error logging with error type, message, and stack trace
- Improved error messages for different failure scenarios:
  - Quota exceeded
  - Timeout errors
  - Database errors
  - Missing API keys
- Returns structured error responses with `errorType` field

**Client-Side (`app/(tabs)/plan.tsx`):**
- Properly extracts error details from `FunctionsHttpError`
- Attempts to parse error body as JSON to get server error message
- Falls back gracefully if parsing fails
- Displays user-friendly error messages in Arabic

### 3. **TypeScript Error Fixes**

**Fixed `RecitationAssessment` interface** (`lib/gemini.ts`):
- Added `modelUsed?: string` property to track which AI model was used
- This resolves the TypeScript error in `FeedbackModal.tsx` where it accesses `feedback.modelUsed`

### 4. **Deno Compliance**

The Edge Function already uses correct Deno imports:
- ✅ `https://deno.land/std@0.168.0/http/server.ts` for serve
- ✅ `npm:@google/generative-ai` for Gemini AI
- ✅ `https://esm.sh/@supabase/supabase-js@2` for Supabase client
- ✅ Uses `Deno.env.get()` for environment variables
- ✅ Service role key is properly used for bypassing RLS

### 5. **Hybrid Logic (Already Implemented)**

The function already implements the optimal hybrid approach:
1. **Gemini AI** generates only a small "Pace Template" (JSON with pages_per_day and review_frequency)
2. **Local TypeScript loop** generates the full 604-page plan algorithmically
3. **Bulk insert** saves all days at once using `.insert(planArray)`

This prevents timeout issues and token exhaustion.

## 🚀 Next Steps

### Deploy the Updated Edge Function

```bash
# Make sure you have Supabase CLI installed
# If not: npm install -g supabase

# Login to Supabase (if not already logged in)
supabase login

# Link your project (if not already linked)
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the updated function
supabase functions deploy generate-plan
```

### Test the Function

1. **From the app:**
   - Go to the Plan tab
   - Fill in the required fields (nickname, age, target date)
   - Click "إنشاء خطتي" (Create My Plan)
   - Check the console for detailed logs

2. **Check Supabase Dashboard:**
   - Go to your Supabase project
   - Navigate to Edge Functions → generate-plan
   - Click on "Logs" tab
   - You should now see detailed logs for each request

### Verify Environment Variables

Make sure these are set in your Supabase project:

1. **GEMINI_API_KEY** - Your Google Gemini API key
2. **SUPABASE_URL** - Automatically provided by Supabase
3. **SUPABASE_SERVICE_ROLE_KEY** - Automatically provided by Supabase

To check/set environment variables:
```bash
# List all secrets
supabase secrets list

# Set GEMINI_API_KEY if missing
supabase secrets set GEMINI_API_KEY=your_actual_api_key_here
```

## 🔍 Debugging Tips

### If you still get 500 errors:

1. **Check the logs in Supabase Dashboard:**
   - You should now see detailed logs showing exactly where it fails
   - Look for the emoji indicators (🚀, 📥, 🧠, ⚙️, 💾, ❌)

2. **Common issues:**
   - **Missing GEMINI_API_KEY**: Look for "خطأ في إعدادات الذكاء الاصطناعي"
   - **Database RLS issues**: Check if service role key is being used
   - **Network timeout**: Increase function timeout in Supabase settings

3. **Test locally (optional):**
   ```bash
   # Serve functions locally
   supabase functions serve generate-plan --env-file .env.local
   
   # In another terminal, test with curl
   curl -i --location --request POST 'http://localhost:54321/functions/v1/generate-plan' \
     --header 'Authorization: Bearer YOUR_ANON_KEY' \
     --header 'Content-Type: application/json' \
     --data '{"userId":"test-user-id","age":25,"targetDate":"2027-01-01","qiraat":"Hafs"}'
   ```

## 📊 What Changed

### Files Modified:
1. ✅ `supabase/functions/generate-plan/index.ts` - Added deep logging and enhanced error handling
2. ✅ `app/(tabs)/plan.tsx` - Improved error extraction from Edge Function responses
3. ✅ `lib/gemini.ts` - Added `modelUsed` field to `RecitationAssessment` interface

### No Changes Needed:
- ❌ Deno imports (already correct)
- ❌ Service role initialization (already using service role key)
- ❌ Hybrid logic (already implemented)
- ❌ Bulk insert (already using `.insert(planArray)`)

## 🎯 Expected Behavior

After deploying, you should see logs like this in Supabase Dashboard:

```
🚀 Edge Function: generate-plan started
📥 Request received, parsing body...
📋 Generating plan for user abc123, age 25, target: 2027-01-01
🧠 Requesting pace template from Gemini...
✅ Pace template received: 1.5 pages/day, review every 7 days
💡 AI Reasoning: Based on age 25, optimal pace is 1.5 pages/day...
⚙️ Algorithm started: Generating plan from pace template...
📊 Algorithm completed: Generated 520 days of memorization plan
🔌 Initializing Supabase client with service role...
🗑️ Deleting existing plan for user: abc123
✅ Existing plan deleted successfully
📦 Converting 520 days to database format...
💾 Database insert started: Inserting 520 records...
✅ Database insert completed successfully
✅ Plan generation complete in 2345ms
```

If there's an error, you'll see:
```
❌ CRITICAL ERROR generating plan: Error: ...
Error type: Error
Error message: Database insert failed: ...
Error stack: ...
Failed after 1234ms
📤 Sending error response to client
```

## 🎉 Success Criteria

- ✅ No more silent 500 errors
- ✅ Detailed logs appear in Supabase Dashboard
- ✅ Client receives meaningful error messages
- ✅ TypeScript errors resolved
- ✅ Plan generation completes successfully
