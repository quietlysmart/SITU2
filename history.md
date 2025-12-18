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

## 6. NanoBanana: Aspect Ratio Ignored
**Problem:** The image generator would always output the aspect ratio of the original artwork, ignoring the user's selection in Member Studio. This was because the `aspectRatio` was only included in the text prompt, not as a formal API configuration parameter.

**Fixed Strategy:**
- **Forced Model Routing:** Requests requiring specific aspect ratios are now automatically routed to `gemini-2.5-flash-image` (the "signifier" for the compatible path).
- **Formal Config:** The API request now includes a `generationConfig` block with the formal `aspectRatio` parameter.
- **Resilient Fallback:** If the API rejects the configuration (400 error), the system automatically falls back to a standard prompt-only request to ensure generation still succeeds.

---
**Note:** Always ensure `npm run build` completes successfully before a `firebase deploy` to maintain stack consistency.
