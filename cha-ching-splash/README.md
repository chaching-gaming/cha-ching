# Cha Ching — action splash animation (handoff)

A ~2 second "bounce" splash that plays the instant a user action is confirmed
(wager placed, bet accepted, etc.). The screen flips from dark to bright green,
the golf-ball logo bounces into the foreground, and the action text sits on the
green background.

## Files

| File | What it is |
|---|---|
| `splash.html` | Working reference. Open in a browser: pick an action, press Replay. This is the source of truth for look and timing. |
| `splash.css` | All keyframes. One timeline of 2.8s; the action is done by 2.0s. |
| `assets/chaching-ball.png` | Logo, full resolution (1254×1254, transparent). |
| `assets/chaching-ball.webp` | Logo, 640×640, for the web reference. |

## Screen layout (390×844 reference frame, scale to device)

- Ball: 300×300, centred horizontally, top at 230 (centre ≈ y 380).
- Soft ground shadow: 220×34 ellipse under the ball (top 526).
- Headline: top 584, Lilita One 60px, line-height 0.94, white, 7px outline `#0A4F24`, 4px drop `#073D1B`.
- Sub line: 16px below headline, Fredoka 600 18px, white on pill `rgba(4,46,24,.72)`.
- Background wordmark "CHA / CHING": Lilita One 150px, rotated −8°, `rgba(6,70,32,.14)`, behind the ball.
- Background: radial gradient `#6EDC4C → #34BE47 → #1A9F40` (centre at 50% 45%).
- Start state (dark app screen): radial `#0E4F2B → #052A17`, fades out.

## Timeline

| Time | What happens |
|---|---|
| 0.00–0.15s | Dark screen holds (action just fired) |
| 0.15–0.35s | Dark layer fades out → bright green; wordmark and headline fade/slide in (10px) |
| 0.15–0.55s | Ball grows from 30% to 108%, rising 30px, easing out |
| 0.55–0.95s | One soft bounce: squash (1.04, 0.96) → (0.99, 1.01) → 1.0 |
| 0.60–1.20s | One white ring (50% opacity) expands from the ball to 1.6× and fades |
| 0.60–0.85s | Headline nudges to 1.04× and back |
| 0.85–1.10s | Sub line fades/slides in (8px) |
| 1.10–2.00s | Hold, then hand off to the next app screen |

Exact percentages and cubic-bezier curves are in `splash.css` (percent = seconds ÷ 2.8 × 100).
Respect reduced-motion: skip straight to the final frame.

## Text per action

| Action | Headline | Sub line |
|---|---|---|
| Round started | TEE IT / UP! | Round's live. Bets are on. |
| Wager placed | WAGER / PLACED! | You're locked in. Game on. |
| Bet accepted | BET / ACCEPTED! | Your opponent is in. |
| Birdie | BIRDIE! | That one pays. |
| You won | YOU / WON! | Winnings are on the way. |
| Paid out | PAID / OUT! | Winnings sent to your wallet. |

`/` = line break. Copy is draft and still needs client sign-off.

## Suggested prompt for Claude Code

> Read README.md and open splash.html in this folder. It's the reference for an
> action splash animation in our golf wager app, Cha Ching. Build it as a
> reusable component in our app ([React Native / Flutter / Swift / Kotlin —
> fill in]) that takes an `action` value and plays once, about 2 seconds, then
> calls `onDone`. Match the layout, colours, fonts and timeline in the README
> and splash.css exactly, scaling the 390×844 frame to the device. Use
> assets/chaching-ball.png for the logo. Respect the system reduced-motion
> setting.
