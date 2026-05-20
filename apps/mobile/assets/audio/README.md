# Audio feedback assets

The feedback provider (`apps/mobile/providers/feedback.tsx`) plays a sound for each event in `FeedbackEvent`. Drop the files listed below into this folder and swap the matching entry in `SOUND_SOURCES` from `null` to `require('@/assets/audio/<file>')`.

| Event          | File            | Character                                  |
| -------------- | --------------- | ------------------------------------------ |
| `bet_accepted` | `tick.mp3`      | Short UI tick — confirms the tap landed    |
| `bet_matched`  | `jingle.mp3`    | Short upbeat jingle — "you're locked in"   |
| `bet_won`      | `chaching.mp3`  | Cash-register ring — winner payout         |
| `bet_lost`     | `deflation.mp3` | Descending deflation — loser notification  |
| `chip_donated` | `coin.mp3`      | Coin sound — chip donation made            |
| `chip_received`| `coin.mp3`      | Coin sound — chips received                |
| `alert`        | `alerts.mp3`    | Neutral alert — errors, confirms           |

**Spec**: ≤ 1s, mono, 64–96 kbps MP3 to keep the bundle small.

While these files are absent the app still runs — haptics fire normally and sound trigger calls are silent no-ops.
