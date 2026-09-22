# nexBet Black Gold Rebuild — Ground-Truth Design Spec

## Reference

The supplied full-page SportyBet screenshot is the structural ground truth. Preserve its dense sportsbook information architecture: a compact two-tier header, primary product navigation, sport/category navigation, a left popular-sports rail, a large promotional hero, a secondary virtual-sports banner, a central highlights table, a live-betting table, a right betslip/cashout rail, mini-games, promotional cards, winners, and a dense footer. The supplied ZIP is the reference asset and markup source for the sports and games content model. The tall games screenshot is the ground truth for the long casino catalogue: many narrow portrait game tiles arranged in a high-density, vertically scrollable lobby.

## Chosen Direction: Black Gold Fieldhouse

This is a reference-faithful sportsbook shell translated into a premium black-and-metallic-gold brand language, with lemon-green and nature-green reserved for live status, active odds, success feedback, and motion accents.

### Design Movement

Contemporary sports-broadcast interface with editorial betting-terminal density, luxury black-metal materials, and restrained kinetic motion.

### Core Principles

1. Preserve the reference hierarchy and page density before adding decoration.
2. Use true metallic gold for brand authority, charcoal black for depth, and green accents only for live/action meaning.
3. Make odds, betslip, match states, and casino browsing immediately scannable.
4. Keep every interaction useful: hover reveals context, active states clarify selection, and motion communicates change.

### Color Philosophy

Black is the stage and improves contrast across dense betting tables. Metallic gold is the ownership color for brand marks, dividers, premium highlights, and key headings. Lemon green signals immediacy and attention; nature green signals confirmation, live play, and positive financial states. Avoid rainbow casino styling in the shell; let game artwork carry the variety.

### Layout Paradigm

Use a full-bleed desktop betting terminal: sticky compact header, horizontal sport strip, asymmetric three-column content region, and a dense footer. On mobile, collapse the rails into an ordered single column while keeping the betslip accessible through a persistent action button or bottom sheet.

### Signature Elements

- Brushed-metal gold hairlines and segmented tab underlines.
- Small live pulse markers that blend lemon green into nature green.
- Deep black panels with subtle radial pitch texture and crisp square-ish betting cells.

### Interaction Philosophy

Interactions should feel fast and deliberate. Odds cells brighten and lift slightly on hover, selected picks use a gold edge with green confirmation, drawers slide from the side, and casino tiles reveal metadata without obscuring the artwork. Avoid decorative motion that delays betting or navigation.

### Animation

Use short 140–240ms transitions for ordinary controls, stagger dense card entrances by 30–60ms, and reserve longer 500–800ms sequences for hero and page transitions. Use transform and opacity for GPU-friendly motion. Respect `prefers-reduced-motion`. For live indicators, use a subtle lemon-green pulse; for hero transitions, use a restrained parallax or crossfade; for betslip updates, use a compact height-safe slide/fade rather than layout-jumping animations.

### Typography System

Use a condensed display face for sportsbook headings and a readable sans for tables and controls. Prefer `Barlow Condensed` or `Oswald` for large labels and `DM Sans` for body/UI text. Use uppercase sparingly for navigation and odds labels; keep match names in sentence case for faster reading.

### Brand Essence

nexBet is a Ghana-focused sports and casino platform for bettors who want fast scanning, clear odds, and a premium terminal-like experience. Personality: **decisive, polished, energetic**.

### Brand Voice

Headlines are compact and active. CTAs are direct. Microcopy reassures users about status and next action.

- “LIVE NOW — FOLLOW THE MOMENT.”
- “BUILD YOUR SLIP. PLAY IT SMART.”

### Wordmark & Logo

Use a compact angular nex mark plus a lowercase `nexBet` wordmark treatment. The mark should work alone in the header and favicon; the wordmark should use a custom geometric cut on the x and B rather than a default text treatment.

### Signature Brand Color

Metallic gold: `#D8A84E`, supported by `#F2C866` highlights and `#0E0F0C` black. Lemon green: `#C7F63A`. Nature green: `#1F8A4C`.

## Implementation Guardrails

Keep the existing nexBet route structure, Zustand store, betslip calculations, wallet state, casino game routing, API client, and Supabase schema untouched unless a frontend integration change is strictly required. Rebuild the visual system around them instead of replacing the application logic. Do not use fabricated reviews, ratings, testimonials, or customer claims.

## Reference Assets

- Full sportsbook screenshot: user-provided `pasted_file_cOqNIO_image.webp`.
- Tall casino games screenshot: user-provided `pasted_file_jma2aa_image.png`, inspected as ordered vertical crops.
- Reference ZIP: user-provided `www.sportybet.com(2).zip`.
- Generated visual assets: `/manus-storage/nexbet-hero-black-gold_b72273e9.jpg`, `/manus-storage/nexbet-virtual-football-banner_88bedc4a.jpg`, `/manus-storage/nexbet-casino-feature_4a5c5150.jpg`, `/manus-storage/nexbet-mark-symbol_1451ef3f.png`.

## Style Decisions

- Use the reference screenshot’s information architecture as the fidelity target.
- Use black and metallic gold as the primary palette, with lemon and nature green only for active/live/positive states.
- Prefer sharp or lightly rounded betting cells over a generic card-everywhere treatment.
- Keep the casino lobby visually rich through artwork while maintaining a restrained black-gold shell.
- Preserve route and business logic; style and component composition are the primary change surface.
