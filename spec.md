# Project: Situ – AI mockups for artists

Situ is a web app that lets artists upload artwork and see it on realistic product mockups. It has:

1. A “Guest Studio” that anyone can use once, no login.
2. A paid “Member Studio” for ongoing use with more control.
3. Backend running on Firebase, image generation via NanoBanana / NanoBanana Pro (Google GenAI), and billing via Stripe.

The code must be clean, TypeScript-first, and easy to restyle.

---

## Tech stack

- Frontend
  - React + Vite + TypeScript.
  - TailwindCSS + shadcn/ui (or similar component library).
  - React Router for routing.
  - Focus on a modular, themeable design:
    - Centralised theme tokens (colors, typography, spacing) via Tailwind config and/or CSS variables.
    - Layout and presentation isolated in UI components so we can easily redesign later.

- Backend
  - Firebase:
    - Firebase Hosting for frontend.
    - Firebase Cloud Functions v2 (Node 20, TypeScript, Express) for an `/api` layer.
    - Firebase Auth (email + password).
    - Firestore for user profiles, credits, and mockup metadata.
    - (Optional) Firebase Storage for storing generated images instead of sending pure data URLs.
  - Stripe:
    - Subscription billing for three plans (Monthly, 3 Months, 6 Months).
    - Webhooks to sync subscriptions and credits.
  - Email:
    - Pluggable email provider (SendGrid / Resend / etc.).
    - Implement via an abstraction `emailService.sendGuestMockups(...)` that reads provider API key from env.

- AI / NanoBanana
  - Use `@google/genai` (Google GenAI SDK).
  - Treat NanoBanana / NanoBanana Pro as models behind a configuration layer:
    - `GOOGLE_GENAI_API_KEY` (or `NANOBANANA_API_KEY`) for auth.
    - `NANOBANANA_FREE_MODEL_ID` (default can be `"gemini-2.5-flash-image"`).
    - `NANOBANANA_PRO_MODEL_ID` (default can be `"nanobanana-pro"`).
  - All image generation and editing occur in Cloud Functions (never in the browser).

---

## Security & configuration

Absolutely required:

- Never hard-code secrets in source code.
- All secrets and model IDs must be read from environment variables, for example:

  - AI:
    - `GOOGLE_GENAI_API_KEY`
    - `NANOBANANA_FREE_MODEL_ID`
    - `NANOBANANA_PRO_MODEL_ID`
  - Firebase:
    - `FIREBASE_PROJECT_ID`, etc. (only where needed)
  - Stripe:
    - `STRIPE_SECRET_KEY`
    - `STRIPE_PUBLISHABLE_KEY`
    - `STRIPE_PRICE_MONTHLY`
    - `STRIPE_PRICE_3MONTH`
    - `STRIPE_PRICE_6MONTH`
    - `STRIPE_WEBHOOK_SECRET`
  - Email:
    - `EMAIL_PROVIDER_API_KEY`
    - `EMAIL_FROM_ADDRESS`

- Provide:
  - Root `.env.example` for frontend (`VITE_...` variables and any non-secret config).
  - `functions/.env.example` with all backend secrets listed as placeholder values.
- Document each variable in the README.

---

## User flows

### 1. Marketing / Landing site

Pages:

1. Home
   - Headline and subhead explaining: upload one artwork, get realistic mockups quickly.
   - Primary CTA: “Start with your artwork” (navigates to Guest Studio).
   - Hero section with a strong visual demonstrating art on multiple products (use placeholder images for now).
2. “How it works”
   - Step 1: Upload your artwork.
   - Step 2: We imagine it on real products.
   - Step 3: Download your mockups, free.
3. “What Situ can do for your art”
   - Four cards describing: Wall display, Print collections, Apparel mockups, Phone case designs.
4. Pricing
   - Three plans:
     - Monthly – $12 per month.
     - 3 months – $10 per month, billed $30 every 3 months.
     - 6 months – $7 per month, billed $42 every 6 months.
   - Small text/banner above cards: “Early testing: 20 images free for new members”.
   - Each card has “Start plan” button.
5. Footer CTA:
   - “Ready to see your art in the world?” + “Start with your artwork” button.

UI notes:
- You are free to design a clean, modern UI appropriate for artists and conversion-focused.
- Keep colors, typography, and spacing defined via design tokens / Tailwind theme so they can be swapped later.

### 2. Guest Studio (no login)

Route: `/studio` (public).

- UI:
  - Large drag-and-drop area: “Drop your artwork here”.
  - Show preview thumbnail after upload.
  - Artwork title (optional) input.
  - “Generate mockups” button.
  - Grid of 4 cards: Wall, Prints & postcards, Wearable, Phone case, each with:
    - Icon.
    - Status (idle / generating / complete / error).
    - Image preview on success.

- Behaviour:
  - User uploads one image (JPG/PNG under ~3MB).
  - Frontend reads it as a data URL and POSTs to `/api/generateGuestMockups`:
    - `{ artworkUrl: string (data: URL), categories: ["wall","prints","wearable","phone"] }`
  - Backend:
    - Parses data URL into inline data.
    - For each category, calls NanoBanana (free model) with a category-specific prompt and the artwork image.
    - Returns results:

      ```ts
      {
        ok: boolean;
        results: { category: MockupCategory; url: string | null }[];
        errors: { category: MockupCategory; message: string }[];
      }
      ```

  - Frontend updates each card to show the image or error message.

- Email + download:
  - When at least one mockup succeeded, show an “Email me my mockups” section:
    - Email input.
    - Button: “Send my 4 mockups”.
  - On submit:
    - POST `/api/sendGuestMockups` with `{ email, mockupUrls: string[] }`.
  - Backend:
    - Packages the images into a ZIP (or generates a temporary download link).
    - Sends an email with:
      - Link/button to download the ZIP.
      - CTA: “Create an account and get 20 free credits” linked to `/signup?promo=early-tester-20`.
    - Logs a guest record in Firestore: `guestLeads/{id}` with email, timestamps, and mockup info.

### 3. Auth & membership

#### Signup (/signup)

- Simple form: email + password.
- If `promo=early-tester-20` is present:
  - After successful signup, assign user an initial credits value (e.g. 20) and mark promo.
- On success, redirect to Member Studio.

#### Login (/login)

- Email + password login.
- On success, redirect to Member Studio.

#### User data model

Firestore `users/{uid}`:

```ts
{
  email: string;
  createdAt: Timestamp;
  plan: "free" | "monthly" | "3month" | "6month";
  credits: number;
  stripeCustomerId?: string;
  promo?: string; // e.g., "early-tester-20"
}

Stripe integration:
	•	Three price IDs from env.
	•	Use Stripe Checkout for subscribing.
	•	Webhooks:
	•	On subscription created / updated / cancelled:
	•	Update plan.
	•	Set or refresh credits based on plan (e.g. monthly = 100 credits; amount should be defined in one central config).

4. Member Studio (logged-in)

Route: /member/studio (protected).

Features:
	1.	Artwork gallery
	•	Users can upload multiple artworks.
	•	Store original files as objects in Firebase Storage with metadata in Firestore.
	•	Gallery UI shows thumbnails; selecting a thumbnail sets the “active” artwork.
	2.	Product & size controls
	•	Choose product types (Wall, Prints, Wearable, Phone case; easily extendable).
	•	Select aspect ratio (1:1, 4:5, 3:2, 16:9, etc.).
	•	Select resolution preset (e.g. 1024, 1536, 2048).
	•	Show remaining credits in a visible place.
	3.	Generate mockups (member)
	•	Button: “Generate mockups”.
	•	Before calling backend:
	•	Ensure user has enough credits (e.g. 1 credit per image).
	•	POST /api/generateMemberMockups with:

{
  artworkId: string;
  products: MockupCategory[];
  aspectRatio: string;
  resolution: number;
}

	•	Backend:
	•	Auth via Firebase ID token.
	•	Loads artwork image.
	•	Calls NanoBanana Pro for each requested product, using aspect ratio/resolution.
	•	Decrements credits accordingly on success.
	•	Stores generated mockup metadata in Firestore (e.g. users/{uid}/mockups/{mockupId}).
	•	Returns the URLs.

	4.	Regenerate / edit flow
	•	Each mockup card in Member Studio:
	•	Shows the image.
	•	Small text area: “Not quite right? Describe how you want this changed.”
	•	Button: “Regenerate”.
	•	On click:
	•	POST /api/editMockup with { mockupId, editPrompt }.
	•	Backend:
	•	Fetches base image.
	•	Calls NanoBanana Pro image+text edit.
	•	Deducts 1 credit.
	•	Updates the mockup document with new version.
	5.	Downloads
	•	Allow:
	•	Download a single mockup.
	•	“Download all mockups” → ZIP via backend (reuse guest ZIP logic but no email).

⸻

Backend API endpoints

All implemented in Firebase Functions (Express app), under /api:
	•	GET /api/health
	•	Returns { ok: boolean, service: string, timestamp: string }.
	•	POST /api/generateGuestMockups
	•	Request: { artworkUrl: string, categories: MockupCategory[] }.
	•	Response: { ok, results, errors } as defined above.
	•	POST /api/sendGuestMockups
	•	Request: { email: string, mockupUrls: string[] }.
	•	Sends email + logs lead.
	•	POST /api/generateMemberMockups
	•	Auth required.
	•	Request: { artworkId, products, aspectRatio, resolution }.
	•	Response: URLs + remaining credits.
	•	POST /api/editMockup
	•	Auth required.
	•	Request: { mockupId: string, editPrompt: string }.
	•	POST /api/stripe/webhook
	•	Handles subscription events, updates plan + credits.

All endpoints must have TypeScript request/response types defined.

⸻

NanoBanana service abstraction

Create functions/src/nanobanana.ts (name is flexible but keep it isolated):
	•	Export functions like:

async function generateCategoryMockup(params: {
  modelId: string;
  category: MockupCategory;
  artworkInline: { data: string; mimeType: string };
}): Promise<{ url: string }>;

async function editImage(params: {
  modelId: string;
  baseInline: { data: string; mimeType: string };
  prompt: string;
}): Promise<{ url: string }>;

	•	Internally:
	•	Instantiate GoogleGenAI with apiKey from env.
	•	Use model: modelId.
	•	Build prompts per category (wall / prints / wearable / phone) based on existing wording.
	•	Handle base64 and data URLs consistently in helper functions.

⸻

UI & theming
	•	Antigravity may design the initial UI. Requirements:
	•	Clean, modern, artist-friendly, mobile-responsive.
	•	Use Tailwind config and/or a central theme file to define:
	•	Primary/secondary colors.
	•	Typography scale.
	•	Radius, shadows, spacing.
	•	Do not scatter raw hex values; prefer symbolic class names and theme tokens.
	•	Keep layout and copy in components that are easy to rework without touching business logic.

⸻

Developer experience
	•	Provide a README.md with:
	•	Setup instructions (Node version, Firebase CLI, Stripe, Google AI key).
	•	How to:
	•	npm install.
	•	Configure .env and functions/.env.
	•	Run locally:
	•	npm run dev for frontend.
	•	cd functions && npm run serve for backend emulators.
	•	Deploy to Firebase.
	•	Use TypeScript everywhere (frontend + backend).
	•	Keep code modular, documented where non-obvious, and ready for future UI redesign.