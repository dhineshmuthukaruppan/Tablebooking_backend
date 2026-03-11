# Backend Deployment Guide - Google Cloud Run (Table Booking)

Complete step-by-step guide for deploying the **Table Booking backend** (Express + MongoDB + Firebase Admin) to Google Cloud Run using Google Cloud Build.

This mirrors the frontend deployment pattern: `Dockerfile` + `cloudbuild.yaml` + Cloud Build trigger.

## What’s included in this repo

- `Dockerfile`  
  Multi-stage build that:
  - installs deps
  - compiles TypeScript to `dist/`
  - runs production image with only production dependencies
  - listens on port `8080` (Cloud Run-friendly)

- `cloudbuild.yaml`  
  Cloud Build pipeline that:
  - builds a Docker image
  - pushes it to Artifact Registry
  - deploys it to Cloud Run

## Required environment variables

Your backend validates env vars at startup (`src/config/env.ts`). You must provide:

- `MONGODB_URI`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `CORS_ORIGIN` (comma-separated allowed origins; example: `https://your-frontend.com,https://admin.your-frontend.com`)

Cloud Run will inject these into `process.env` at runtime.

### Important: Firebase private key format

If you paste the key into an env var, it may contain literal `\n` sequences. The backend already normalizes this:

- `FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")`

So it’s fine to store the key with escaped newlines (common in Secret Manager).

## Recommended: use Secret Manager for sensitive values

Do **not** put secrets into Cloud Build substitutions. Use Secret Manager and mount them as env vars in Cloud Run.

Recommended secrets (names are up to you):

- `tablebooking-mongodb-uri`
- `tablebooking-firebase-project-id`
- `tablebooking-firebase-client-email`
- `tablebooking-firebase-private-key`

Grant the Cloud Run service account **Secret Manager Secret Accessor** role to read them.

## Cloud Build substitutions (per environment)

When you create a Cloud Build trigger for this repo, configure:

- `_REGION`: e.g. `asia-south1`
- `_AR_REPOSITORY`: e.g. `tablebooking-backend`
- `_SERVICE_NAME`: e.g. `tablebooking-backend-dev` / `tablebooking-backend-staging` / `tablebooking-backend-prod`
- `_ENVIRONMENT`: e.g. `dev` / `staging` / `prod`
- `_CORS_ORIGIN`: e.g. `https://your-frontend-domain.com`

Optional if you choose to use the `--set-secrets` section in `cloudbuild.yaml`:

- `_MONGODB_URI_SECRET`
- `_FIREBASE_PROJECT_ID_SECRET`
- `_FIREBASE_CLIENT_EMAIL_SECRET`
- `_FIREBASE_PRIVATE_KEY_SECRET`

## High-level deployment steps

1. **GCP setup**
   - Enable: Cloud Run, Cloud Build, Artifact Registry, Secret Manager.
   - Create an Artifact Registry **Docker** repository (example: `tablebooking-backend`).

2. **IAM**
   - Cloud Build service account: grant
     - Artifact Registry Repository Administrator
     - Cloud Run Admin
     - (Optional but recommended) Service Account User
   - Cloud Run runtime service account: grant
     - Secret Manager Secret Accessor (if using secrets)

3. **Create Cloud Build Trigger**
   - Point it to this repository.
   - Config file: `cloudbuild.yaml`
   - Add the substitutions listed above.

4. **Set secrets/env vars**
   - Either:
     - configure secrets in Cloud Run Console → *Variables & Secrets*, or
     - use `--set-secrets` in `cloudbuild.yaml` (and set the secret-name substitutions).

5. **Deploy**
   - Push to the branch that matches your trigger.
   - Monitor Cloud Build → History.
   - Monitor Cloud Run service logs.

## Multi-environment pattern (recommended)

- `dev` branch → `tablebooking-backend-dev`
- `staging` branch → `tablebooking-backend-staging`
- `main` branch → `tablebooking-backend-prod`

Create one trigger per branch with different substitutions.

