# SportyBet Palette and Interaction Verification

- [ ] Audit every header, sport-strip, sidebar, footer, card, CTA, and icon control for a working destination or action.
- [ ] Audit every existing route and add missing page routes for visible navigation items.
- [ ] Restore the red, white, charcoal, and green visual system from the supplied reference.
- [ ] Replace placeholder alerts and dead buttons with working UI state, navigation, dialogs, or drawers.
- [ ] Make betslip add/remove/clear/stake/place actions functional without breaking existing state behavior.
- [ ] Make casino filters, search, tile links, and game detail navigation functional.
- [ ] Make wallet deposit/withdraw, account, promotions, affiliate, live, and utility links functional.
- [ ] Verify desktop and mobile layouts, route loading, browser console errors, and production build.
- [ ] Save a checkpoint only after all verification passes.

- [ ] Recenter and resize the login/register account card so the account UI is balanced on desktop and mobile.
- [ ] Make balance, help centre, bet history, My Account, logo, and mobile menu controls functional.
- [ ] Tighten the header/logo spacing and confirm no visible control is inert.
- [ ] Run compiler/build checks and capture repaired desktop/mobile previews.

- [ ] Inspect the live preview against the supplied SportyBet-colored reference and note visual mismatches.
- [ ] Refine panels, cards, header, betslip, odds, and account surfaces with restrained claymorphism/glassmorphism while preserving the red, white, charcoal, and green palette.
- [ ] Verify Register Now, Join Now, menu, logo, balance, Help centre, Bet history, My Account, sport navigation, odds, betslip, casino tiles, and footer links have working destinations or actions.
- [ ] Test desktop and mobile browser flows, then run TypeScript/build checks before the final checkpoint.

- [ ] Audit all routes and source strings for remaining nexBet branding.
- [ ] Create and use a custom HotBet crown mark in the header and favicon treatment.
- [ ] Remove mobile empty space by stacking/expanding the betslip and Grand Prize Winners modules into the content flow.
- [ ] Verify narrow mobile previews and connected-browser route behavior across the main pages.
- [ ] Run TypeScript/build checks and publish only after the responsive revision is verified.

- [ ] Keep active HotBet header navigation labels fully readable instead of faded on subpages.
- [ ] Verify active navigation contrast on home, live, casino, promos, affiliate, and mobile layouts.
- [ ] Run build checks and publish the focused navigation-state fix.

- [ ] Keep the desktop betslip rail anchored without overlapping the winners card or footer while scrolling.
- [ ] Preserve the normal full-width stacked rail flow on tablet and mobile layouts.
- [ ] Verify desktop scroll screenshots, mobile screenshots, compiler/build checks, and publish the fix.

- [ ] Review the supplied account-page content against the current HotBet login and sign-up routes.
- [ ] Improve login and sign-up layout, spacing, hierarchy, and HotBet visual consistency.
- [ ] Preserve password visibility, validation, two-step sign-up, referral, country, and terms interactions.
- [ ] Verify desktop/mobile account flows, route navigation, compiler/build checks, and publish the revision.

- [ ] Make odds labels and values readable on dark live panels and light betting panels.
- [ ] Highlight selected odds clearly and keep the visual state synchronized with the betslip.
- [ ] Verify upcoming/live odds selection on desktop and mobile, then run build checks.

- [ ] Keep the PC betslip card anchored in its own stable position without covering mini-games or winners.
- [ ] Preserve the normal mobile stacked order and full-width cards.
- [ ] Verify long desktop scroll, footer separation, mobile flow, and build checks before publishing.

- [ ] Replace Popular sidebar entries with top leagues including Premier League and UEFA Champions League.
- [ ] Give each top-league item a useful sports destination without dead links.
- [ ] Verify desktop/mobile sidebar appearance and run build checks before publishing.

- [ ] Remove Virtuals from the sport strip.
- [ ] Connect each remaining sport item to an existing relevant HotBet page.
- [ ] Verify desktop/mobile sport-strip navigation and run build checks before publishing.

- [ ] Make All games, Hot, Crash, Table, and Live filter the casino cards.
- [ ] Keep the active filter highlighted and preserve game-detail links.
- [ ] Verify every filter on desktop/mobile and run build checks before publishing.

- [x] Keep the mobile sport strip compact with a visible More sports control instead of clipped labels.
- [x] Expand and collapse the full sport list from the mobile arrow/control with accessible state feedback.
- [x] Verify the compact and expanded sport-strip states at narrow mobile widths and on desktop.

- [x] Remove the entire header sport-strip section from desktop and mobile layouts.
- [x] Increase global body and interface text weights moderately while preserving display-heading hierarchy.
- [x] Verify the header-to-content spacing and text readability after the sport-strip removal.

- [x] Darken and bolden small utility, metadata, helper, league, odds, and footer text.
- [x] Preserve readable contrast for muted text across light panels and dark live-betting panels.
- [x] Verify compact typography on home, live, casino, and account routes before publishing.

- [x] Increase the overall site font sizes while preserving responsive fit and hierarchy.
- [x] Remove the gap between the mobile header and expanded navigation menu.
- [x] Make the expanded mobile menu cover the header transition cleanly without exposed background.
- [x] Close the mobile menu automatically when the user scrolls.
- [x] Verify mobile menu open, navigation, scroll-close, and typography behavior.

- [x] Reduce the expanded mobile menu from full-height to a compact card-sized panel.
- [x] Keep the compact menu flush beneath the header with no visible gap.
- [x] Preserve scroll-to-close and navigation-close behavior after resizing the menu.

- [x] Inspect the original nexBet frontend for API utilities, environment variables, Supabase clients, stores, and webhook-related code.
- [x] Compare reusable MVP integration paths with the current static HotBet architecture.
- [x] Implement only verified, compatible integration foundations without exposing secrets in the frontend.
- [x] Validate the integration foundation and document any required backend upgrade or credentials.

- [x] Discover the provided Railway backend API routes, health endpoint, auth requirements, and CORS behavior.
- [x] Add a typed HotBet API client configured with the provided backend base URL.
- [x] Connect only verified MVP endpoints to the corresponding HotBet screens and interactions.
- [x] Validate loading, empty, error, and unauthorized API states plus the production build.

- [x] Audit the verified Cyril-dot/futballBackend repository and identify its actual route/controller/DTO contracts.
- [x] Map authentication, wallet, match, odds, bet, game, and webhook behavior to HotBet flows.
- [x] Replace guessed client contracts with the backend repository’s verified logic.
- [x] Validate the connected flows and document any backend deployment or CORS requirements.
