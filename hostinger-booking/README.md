# Hostinger booking staging artifact

This folder contains a standalone static copy of the existing integration-enabled booking prototype.

- Entry point: `hostinger-booking/index.html`
- Source: `preview/index.html` from `main`
- This is a separate staging artifact, not a redesign.
- The file is prepared but is not yet deployed to Hostinger.

## Deployment destination

Use a separate Hostinger site or subdomain for booking staging. Do not upload over `ladancestone.lt` or the working teacher schedule site `maroon-monkey-459645.hostingersite.com`.

Upload this folder's `index.html` as the staging site's root page.

## Before accepting real bookings

The current backend still has GitHub Pages return URLs. The class registration function also has a fixed GitHub Pages CORS origin. The exact Hostinger staging URL must be known before safely changing these settings. Do not change the production domain or the live teacher schedule app as part of this staging work.

After the staging origin is selected, update the relevant backend allowlists and Stripe return URLs in a reviewed deployment, then test rental availability, saved reservations, class registration, email delivery, and payment return handling using Stripe test mode.

Do not put private server credentials in frontend files or GitHub.
