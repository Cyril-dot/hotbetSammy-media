# HotBet fix pass

This snapshot includes the following fixes:

- Match-detail links now use the sport/admin endpoint supplied by the sportsbook instead of always trying football first.
- Live, real-priced odds can be selected from the sportsbook; ended and estimated-price matches remain disabled.
- Match-detail selections carry the normal `Home vs Away` label into the betslip.
- API responses with `success: false` now fail as errors instead of looking like a successful bet placement.
- Added typed AkwaPay init, status, and checkout API methods.
- Fixed wallet, booking-code, and redeem-response type handling.
- Login and registration validate email/password/profile input, normalize email to lowercase, and send the normalized address to the API.
- `/open-bets` now accepts the normal paginated response as well as array/alternate list payloads and recognizes pending/open/active placed-bet statuses.
- The empty Open Bets state now sends users back to the betslip; selecting an odd alone does not create a wager until Place bet is submitted successfully.
- Browser API calls now use a same-origin `/api` path. Vite, Express production hosting, and Vercel proxy that path server-side to the Railway backend, avoiding the deployed-origin CORS 403 that blocked login, wallet reads, and bet placement.
- The Vercel catch-all proxy now preserves the `/api` prefix expected by Railway, so deployed match, odds, account, and bet requests reach the correct upstream routes.
- Vercel now has an explicit first-priority `/api/:path*` rewrite to Railway, preventing the SPA `index.html` fallback from swallowing API requests on deployments that do not invoke the serverless catch-all function.
- Fixed the remaining TypeScript response-envelope errors, including missing deposit/bet API aliases, `.data` access in account screens, and wrapped match-detail responses.

The project still requires its normal package installation before running checks. In this environment the package firewall blocked the snapshot's pinned `vitest` tarball, so the TypeScript check must be run on the target machine after dependencies are installed.