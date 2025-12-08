# Changes - Dec 7, 2025

Resolved critical issues for Stripe, Member Studio, Guest Studio, and Email.

## 1. Stripe Integration
- **Fixed**: replaced deprecated `stripe.redirectToCheckout` with server-side session creation and direct URL redirect (`window.location.href = data.url`).
- **Updated**: Wiring for Monthly, 3-Month, and 6-Month plans in `Pricing.tsx` using environment variables.

## 2. Member Studio
- **Fixed**: Removed "Optimistic UI" updates in `handleGenerate` that caused duplicate keys and disappearing items.
- **Improved**: Logic now relies 100% on real-time Firestore listeners (`onSnapshot`) for both mockups and credits, ensuring data consistency.

## 3. Guest Studio
- **UX**: Updated "Generating" button text to set better expectations ("please wait about a minute").
- **Copy**: Improved "Sent!" panel text to be more persuasive and conversion-focused.

## 4. Email
- **Copy**: Updated `emailService.ts` with friendlier, cleaner copy.
- **Functionality**: Images are now clickable links to the high-res versions.
- **Fix**: "Create More Mockups" button now dynamically uses `APP_URL` env var (defaults to `https://situ.app`).
