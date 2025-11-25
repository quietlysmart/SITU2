# Situ

AI mockup generator for artists.

## Tech Stack

- **Frontend**: React, Vite, TailwindCSS, shadcn/ui
- **Backend**: Firebase Cloud Functions (Node 20), Firestore, Auth
- **AI**: Google GenAI (@google/genai)
- **Billing**: Stripe

## Setup

### Prerequisites

- Node.js v20+
- Firebase CLI (`npm install -g firebase-tools`)
- Stripe CLI (optional, for webhook testing)

### Installation

1. **Frontend**
   ```bash
   npm install
   cp .env.example .env
   # Fill in .env variables
   ```

2. **Backend**
   ```bash
   cd functions
   npm install
   cp .env.example .env
   # Fill in .env variables
   ```

### Local Development

1. **Start Backend Emulators**
   ```bash
   cd functions
   npm run serve
   ```

2. **Start Frontend**
   ```bash
   # In a new terminal
   npm run dev
   ```

## Deployment

```bash
firebase deploy
```
