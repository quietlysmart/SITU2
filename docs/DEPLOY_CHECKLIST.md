# Deployment Checklist

Run through these checks before deploying to production.

## 1. Stripe Checkout
- [ ] **Pricing Page**: Click "Start Monthly" ($12). Verify it redirects to Stripe Checkout (test mode).
- [ ] **Plans**: Verify all three buttons (Monthly, 3 Months, 6 Months) open the correct product/price in Stripe.
- [ ] **Completion**: Complete a test payment (use Stripe test card `4242...`). Verify redirect back to `/member/studio`.
- [ ] **Credits**: Verify the user account receives the correct number of credits (e.g., 100 for Monthly).

## 2. Guest Studio
- [ ] **Generation**: Upload artwork and click "Generate". Verify button says "Generating… please wait about a minute".
- [ ] **Results**: Verify 4 mockups appear.
- [ ] **CTA**: Verify the "Sent!" panel shows the new copy ("Want to create unlimited mockups...").
- [ ] **Link**: Click "Create account" and verify it goes to the signup page.

## 3. Email
- [ ] **Receipt**: Verify email is received via Brevo.
- [ ] **Content**: Check the new copy ("Your Situ Mockups are Ready", "Want to create more?").
- [ ] **Images**: Verify images are visible inline and clickable (opening the high-res URL).
- [ ] **Link**: Verify "Create More Mockups" button links to the correct app URL.

## 4. Member Studio
- [ ] **Variations**: Select artwork, set Variations to 2. Click Generate.
- [ ] **Count**: Verify EXACTLY 2 new mockups appear.
- [ ] **Duplicates**: Check browser console for "unique key" warnings (should be none).
- [ ] **Persistence**: Refresh the page. Verify mockups are still there and no duplicates appear.
- [ ] **Credits**: Verify credits are deducted correctly (e.g., -2 for 2 variations).
