#!/bin/bash
set -e

echo "🚧 Starting Deployment Process..."

# 1. Build Frontend
echo "📦 Building Frontend..."
npm run build

# 2. Deploy Hosting
echo "🚀 Deploying Hosting..."
firebase deploy --only hosting

# 3. Update Environment Variables for Production
SITE_URL="https://situ-477910.web.app"
echo "✅ Deployed Hosts. Setting production URLs for $SITE_URL in functions/.env..."

# Backup .env
cp functions/.env functions/.env.bak

# Update URLs
# Note: Using | delimiter for sed to handle slashes in URLs
sed -i '' "s|STRIPE_SUCCESS_URL=.*|STRIPE_SUCCESS_URL=$SITE_URL/member/studio|" functions/.env
sed -i '' "s|STRIPE_CANCEL_URL=.*|STRIPE_CANCEL_URL=$SITE_URL/pricing|" functions/.env
sed -i '' "s|APP_BASE_URL=.*|APP_BASE_URL=$SITE_URL|" functions/.env

echo "📄 functions/.env updated (Backup saved as .env.bak)"

# 4. Deploy Functions
echo "⚡ Deploying Cloud Functions (this uploads .env safely)..."
firebase deploy --only functions

echo "🎉 Deployment Complete!"
echo "👉 Live URL: $SITE_URL"
echo "⚠️  REMINDER: Check your Stripe Webhook URL in dashboard: $SITE_URL/api/stripeWebhook"
