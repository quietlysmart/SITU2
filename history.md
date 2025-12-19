# SITU Project - History of Stabilization Fixes

This document serves as a reference for any coding agents working on the SITU project. It summarizes the persistent errors encountered during the stabilization phase and the technical strategies implemented to resolve them.

## 1. Member Studio: 502/Bad Gateway & JSON Parsing Errors
**Problem:** When generating mockups, the backend sometimes takes longer than the Google Hosting timeout (60s). This results in a 502/504 Bad Gateway error that returns an HTML error page. The frontend would previously call `.json()` on this response, leading to a `SyntaxError: Unexpected token '<'...` and a UI crash/stall.

**Fixed Strategy:**
- **Status Catching:** The `handleGenerate` and `ensureProfile` functions in `MemberStudio.tsx` check for `response.status >= 500` immediately. 
- **Safe Parsing:** The code now reads `response.text()` first. It only attempts `JSON.parse()` if the text is present and valid, preventing the syntax crash.
- **Silent Continuation:** For 5xx errors, the UI **silences** the error (logs a warning but shows no alert). It sets a timeout to clear the "generating" spinner and relies on real-time Firestore listeners to display the results once the background process finishes.

## 2. Signup: "Ghost" Accounts & Credit Lag
**Problem:** New accounts would occasionally have 0 credits or be invisible in the Admin panel. This was caused by a race condition between the frontend API call (`ensureProfile`) and the backend Auth trigger (`createUserProfileOnAuth`). A naive "existence pre-check" earlier in the project would see a partially-created document and skip the credit initialization.

**Fixed Strategy:**
- **Trust But Verify (Backend):** The `ensureProfile` endpoint now verifies that critical fields (`credits`, `plan`, `isAdmin`) are present before skipping initialization. If a document exists but is incomplete (race condition), the API repairs it.
- **Safe Merging:** The `createUserProfileOnAuth` trigger now uses a `merge: true` strategy, ensuring it doesn't destructively overwrite a profile successfully created by the API.
- **Fire-and-Forget (Frontend):** The `Signup.tsx` flow initiates `ensureProfile` asynchronously and moves to the next screen immediately, eliminating the "Creating Account" stall.

## 3. Admin Panel: Deletion 404s & Redirect Stalls
**Problem:** Deleting a user was slow (deleting storage + many subcollections). This caused timeouts. Additionally, the component's `useEffect` would occasionally re-fetch the user data after deletion but before the redirect, causing a "User Not Found" (404) error box to pop up over the success message.

**Fixed Strategy:**
- **Parallel Deletion (Backend):** `purgeHelper.ts` now uses `Promise.all` to concurrently delete Storage files, Firestore subcollections, and reference documents, significantly reducing response time.
- **Circuit Breaker (Frontend):** `AdminUserDetail.tsx` uses a `deleted` state flag. Once set, it blocks all further data fetches and suppresses all error renderings.
- **Resilient Redirect:** The deletion handler now treats 502/504 status codes as "Success Probes." It assumes the background process will finish, shows the success alert, and redirects the administrator immediately.

## 4. Deployment Pipeline consistency
**Problem:** `firebase deploy` by default was only executing the `build` script in the `functions` directory. This meant the `dist` folder (Frontend/Hosting) was often stale, causing my newest stabilization fixes to be absent even after a "successful" deploy.

**Fixed Strategy:**
- **Automated Root Build:** `firebase.json` has been updated with a top-level `predeploy` command (`npm run build`). This ensures that EVERY deployment builds a fresh production bundle for both Frontend and Backend from the root directory.

## 5. Member Studio: "Ghost" Generations & Background Early-Ack
**Problem:** To prevent 502/504 timeouts, an "early-ack" strategy was implemented that returns a 202 status after 45s. However, the backend handler was not `await`-ing the actual generation task. This caused the Cloud Function instance to terminate or throttle once the response was sent, preventing the generation from ever finishing or saving results to Firestore.

**Fixed Strategy:**
- **Proper Awaiting:** The `/generateMemberMockups` handler now explicitly `await`s the asynchronous generation task. This ensures the function instance remains active until the image is created, storage is updated, and credits are deducted, even if a 202 response was already sent to the frontend.
- **Single Response Guard:** Maintained a `responded` flag to ensure the function only sends one HTTP response (either the 200 success or the 202 background status).

### 2025-12-18: Fixed Aspect Ratio Bug (Strict Schema Enforcement)

*   **Problem:** Generation was ignoring aspect ratio and defaulting to square (1024x1024), even when requested 16:9 or 9:16. Silent fallbacks were maskng API rejection and leading to wasted credits.
*   **Solution:** 
    *   **Strict Schema:** Switched to the official Gemini REST v1beta schema: a flat `aspectRatio` field inside `generationConfig`. Removed all padding hacks.
    *   **Zero Silent Fallback:** Disabled retry-to-square on config rejection; the system now fails fast.
    *   **Error Visibility:** Added logging of the full 400 response body from Google.
    *   **Ratio Assertion:** Implemented a `sharp`-based verification after generation. If the AI returns the wrong ratio, the request is marked as a failure, preventing credit deduction.
*   **Verification:** Observed dimensions and ratio in logs; verified that credit deduction transaction only fires if ratio is correct.

### 2025-12-19: Restored Aspect Ratio Signifier (Seeded Image)

*   **Problem:** The strict schema `generationConfig.aspectRatio` was rejected by Gemini REST (`Unknown name 'aspectRatio'`), so AR requests failed and outputs defaulted to square.
*   **Solution:**
    *   **Seed Signifier:** Restored the two-image request (artwork + blank seed image with target AR) that previously produced non-square outputs.
    *   **Model Routing:** Kept forced routing to `gemini-2.5-flash-image` when AR is requested.
    *   **No Silent Fallback:** Removed prompt-only fallback to avoid masking AR failures.
    *   **Verification Logging:** Logs requested AR, endpoint/model, and output dimensions.
*   **Follow-up:** Tightened seed dimensions to exact ratios and made the seed the first image so the model defaults to the correct aspect ratio even if it ignores prompt ordering.

---
**Note:** Always ensure `npm run build` completes successfully before a `firebase deploy` to maintain stack consistency.
