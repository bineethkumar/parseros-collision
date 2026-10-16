PARCEROS COLLISION CENTER - WEBSITE + CUSTOMER & SHOP PORTALS
=============================================================

Full instructions: SETUP.md (open with Notepad or VS Code).

Quick start on this PC:
  1. Install Node.js LTS from https://nodejs.org (one time).
  2. Copy ".env.example" to ".env.local" and paste your Supabase keys (SETUP.md step 4).
  3. In this folder, open a terminal and run (first time only):  npm install
  4. Start it:  npm run dev   ->  http://localhost:3000   (Ctrl+C stops it)
       /          public website (drive-through garage)
       /request/  public "request an estimate" form
       /portal/   customer portal (status, approve estimates, photos, book drop-off)
       /manage/   shop management (board, customers, estimates, requests, staff)

Deploying: this folder is a Vercel project (GitHub -> Vercel, like Modern Bella).
Never commit .env.local - it holds the secret service_role key.

Folder map:
  index.html, garage.css, garage.js, assets\   public website
  portal\ manage\ request\ print\ shared\       portal pages
  api\                                          Vercel server functions
  supabase\schema.sql                           database + security rules (run in Supabase)
  dev-server.mjs (npm run dev)                  run everything on this PC
  vercel.json, .vercelignore, package.json      Vercel settings
