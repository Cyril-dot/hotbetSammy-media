# HotBet integration audit

## Source availability

The local `/home/ubuntu/nexbet-reference` directory contains reference screenshots/assets and extraction logs, but no original frontend source tree or package manifest. The requested GitHub repository `https://github.com/Cyril-dot/nexBet.git` could not be cloned because GitHub returned that the repository could not be resolved. The authenticated owner repository listing includes `Cyril-dot/nexbetSubAdmin` and several unrelated betting/admin/frontend repositories, but no repository named `nexBet`.

## Current HotBet architecture

The active project is a static React 19 + Vite + TypeScript application. `server/index.ts` is only an Express static-file server with a catch-all route for `index.html`; it does not expose application API routes or webhook endpoints. The project contains `axios` as a dependency, but no current application usage was found. No Supabase client, Zustand store, Firebase integration, webhook handler, sportsbook API URL, wallet API, or bet-placement API was found in the current source.

The only existing environment-backed client integrations found are the Manus OAuth URL builder in `client/src/const.ts`, analytics script values in `client/index.html`, and the Google Maps proxy component in `client/src/components/Map.tsx`.

## Implication

There is no verified original frontend API or webhook implementation available locally or through the supplied GitHub path. A real MVP sportsbook/wallet/webhook integration requires a backend-enabled project and the actual provider API documentation/credentials. The static frontend can safely receive a typed API client and mock adapter, but secrets and authenticated webhook verification must not be implemented in browser code.

## External source checked

GitHub repository lookup used the GitHub CLI against the owner account and repository search. The direct source URL was not resolvable; owner repositories included `https://github.com/Cyril-dot/nexbetSubAdmin` and other unrelated projects, but no `nexBet` repository.

## Recovered API contracts

The owner’s public `Cyril-dot/nexbetSubAdmin` repository contains a reusable API utility with the following user-facing contracts: `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/logout`, `GET /api/wallet`, `GET /api/matches/upcoming`, `GET /api/matches/live`, `POST /api/bets`, `POST /api/games/:game/play`, `POST /api/games/:game/cashout`, and `POST /api/webhooks/stripe` / `POST /api/webhooks/paystack`. Its request client stores a browser access token as `accessToken`, sends a Bearer token on protected routes, and treats `/api/auth/`, `/api/public/`, and `/api/geo/` paths as public. The recovered repository references an older Railway host ending in `67b0`, while the user supplied the newer `f14d` host.

## Current implementation

HotBet now contains `client/src/lib/hotbet-api.ts`, configured from `VITE_HOTBET_API_BASE_URL` with the user-supplied Railway URL as fallback. It implements typed login, registration, logout, wallet summary, upcoming/live match reads, and bet placement methods. The login and registration screens call the backend and persist a returned `accessToken` or `token`. The wallet screen calls `GET /api/wallet` and renders loading, unauthorized, unavailable, and balance states.

## Reachability result

Requests to the supplied host returned HTTP 403 for `/`, `/health`, `/api`, `/api/health`, `/docs`, `/swagger`, `/swagger.json`, `/api-docs`, and the candidate API routes. CORS preflight requests from the published HotBet origin also returned HTTP 403 without `Access-Control-Allow-Origin` headers. The recovered older `67b0` host returned HTTP 404 for an auth preflight. Therefore the client integration is implemented, but live browser calls cannot be confirmed until the Railway service permits the HotBet origin and exposes the expected API routes.

## Verified futballBackend repository findings

The verified repository is a Spring Boot backend. Its README documents public football feeds at `/api/public/football/matches`, `/api/public/football/matches/with-odds`, `/api/public/football/matches/live`, `/api/public/football/matches/today`, and `/api/public/football/matches/upcoming`. The `with-odds` feed returns a response envelope whose data contains `live`, `today`, `upcoming`, `future`, and `results` buckets. Match entities expose UUID `id`, `league`, `homeTeam`, `awayTeam`, `kickoffAt`, `status`, `scoreHome`, `scoreAway`, logos, and metadata.

The verified user contracts include JWT-based `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/refresh`, and `POST /api/auth/logout`; authenticated wallet, bet, and game routes; and Paystack/Stripe webhook endpoints with signature verification. The bet controller requires a decimal `stake`, optional `currency`, and a non-empty `selections` list of UUID `matchId`, `market`, `selection`, and decimal `submittedOdds` values. Live score and commentary updates are exposed through STOMP/SockJS topics `/topic/livescore/{matchId}` and `/topic/commentary/{matchId}`.

The HotBet API client now uses the verified public football paths for its match feed, upcoming, and live methods instead of the earlier guessed protected paths.

## HotBet logic alignment completed

HotBet now consumes the verified `/api/public/football/matches/with-odds` feed when it returns normalizable matches, while preserving the existing fixture cards as a controlled unavailable-data fallback. Backend match records are normalized using `id`, `league`, `homeTeam`, `awayTeam`, `kickoffAt`, `scoreHome`, `scoreAway`, `featured`, and nested odds entries whose `selection` values are `1`, `X`, and `2` and whose prices use `value`, `odd`, or `price`.

The live and upcoming cards now use backend UUID match IDs when available, so bet selections can be submitted using the controller’s required UUID `matchId`. The betslip now submits authenticated bets through `POST /api/bets` with `stake`, `currency: GHS`, `market`, `selection`, and `submittedOdds`, and routes unauthenticated users to login. Backend errors are surfaced in the betslip instead of silently redirecting to the wallet.

The repository contains `FRONTEND_URL` configuration for payment redirects, but no permissive CORS origin was found in the inspected source. The deployed host therefore still needs its CORS/security configuration and frontend URL environment variable aligned with the HotBet published origin before browser calls can succeed.
