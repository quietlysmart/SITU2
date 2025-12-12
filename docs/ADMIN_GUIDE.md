# Admin Console Guide

## Overview

The Situ Admin Console allows authorized administrators to:
- View high-level metrics (users, mockups, credits)
- Browse and search users
- View user details and usage
- Manually adjust user credits with audit logging

## Configuration

### 1. Admin Emails

Administrators are identified by their email address. To grant admin access:

**Backend** (`functions/.env`):
```
ADMIN_EMAILS=your@email.com,another@admin.com
```

**Frontend** (`.env`):
```
VITE_ADMIN_EMAILS=your@email.com,another@admin.com
```

Both values should match. The backend is the true gatekeeper; the frontend check is only for UI protection.

### 2. Restart Servers

After updating environment variables:
```bash
# Frontend
npm run dev

# Backend (in functions/)
npm run serve
```

## Accessing the Admin Console

1. **Log in** to the app with an admin email
2. **Navigate to** `/admin` directly (e.g., `http://localhost:5173/admin`)
3. You'll see the Admin Dashboard with navigation to:
   - **Dashboard**: High-level stats
   - **Users**: Paginated user list with search

## Features

### Dashboard
- Total users
- New users in last 7 days
- Total mockups generated
- Mockups in last 7 days

### Users List
- Search by email or display name
- Filter by: All / Zero Credits / Subscribed
- Click any user to view details

### User Detail
- Basic info (email, plan, credits, Stripe status)
- Usage summary (artworks, mockups)
- Recent mockups (thumbnails, clickable)
- **Credit Adjustment**: Add or remove credits with a reason (creates audit log)

## Security

- **Backend**: All admin endpoints verify the caller's email against `ADMIN_EMAILS`
- **Frontend**: Routes are protected; non-admins are redirected to `/login`
- **Audit Log**: All credit adjustments are logged in `creditAdjustments` collection

## Audit Log Schema

Each credit adjustment creates a document in `creditAdjustments`:
```json
{
  "userId": "abc123",
  "delta": 12,
  "reason": "Tester bonus",
  "previousCredits": 0,
  "newCredits": 12,
  "adminEmail": "admin@example.com",
  "adminUid": "xyz789",
  "timestamp": "2024-12-09T..."
}
```

## Troubleshooting

### "Forbidden: Admin access required"
- Ensure your email is in `ADMIN_EMAILS` in `functions/.env`
- Restart the functions server

### Admin routes show blank page
- Ensure your email is in `VITE_ADMIN_EMAILS` in `.env`
- Restart the frontend dev server

### Stats not loading
- Check that the functions emulator is running
- Verify you're logged in with an admin email
