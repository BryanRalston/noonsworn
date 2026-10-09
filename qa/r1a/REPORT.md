# R1a Replays

Local commit `33c1eec` on `main`, one commit ahead of `origin/main` `0390849`. Not pushed. No live check. Measured on this computer (`bryan`, `COMPUTERNAME=BRYAN`). Vite dev server `http://127.0.0.1:5174/noonsworn/`. Chrome 154 on CDP 9224, profile `chrome-f21`, launched with background timer throttling, renderer backgrounding, and occluded-window backgrounding disabled. Phone runs were brought to the foreground (`FG` true) before recording. `src/render/camera.ts` and `src/core/loop.ts` are unchanged against `0390849`.

Noon Print is not paid. `creditNoonPrint` remains in source and is absent from the production bundle. The 12th Hour Wheel mark is labeled `with Noon Print` and stays locked.

## Scope

| Item | Verdict | Evidence |
| --- | --- | --- |
| 1. Hour Lines | PASS | Sliver 14°, Hard shade ×0.47, Blister 4 s / 2% max HP/s, Quick day 42 s (off on Stair and Nadir), Few Hands bank cap 1. Bonuses 15/15/15/10/10, cap +40%. |
| 2. Sunmarks | PARTIAL | Earn table and practice = 0 are in the ledger and written before the results card. The economy sim misses the ±30% bands for 5 purchases and all 9. The earn table was not changed. |
| 3. Hour Wheel | PASS | 12 marks. Bought costs 25/35/45/60/70/85/100/125/150. Weapon A/B kept on any save with a best row. Reroll and Banish are on the level-up sheet. |
| 4. Dawn Linen wardrobe | PASS | Default, Dawn Linen, Flax `#E6C36A`, Pewter `#A9B7C2`. Uniform swaps. |
| 5. Save migration | PASS | `noonsworn.meta.v1` envelope. Node fixtures 14 pass. Browser fixtures 14 pass, 0 console errors, wheel text matched the envelope, reload left the envelope unchanged. |
| 6. Static screens | PASS | Splash, menu, picker, Hour Wheel, wardrobe, results, and credits: 0 frames and 0 GL draws over 5 s. Pause is outside that list and still renders. |
| 7. Bundle | PASS | Entry 280,646 bytes gzip. Delta vs the same-Vite rebuild of `0390849` is 4,063 bytes (cap 4,096). |

## Gates

1. Phone worst start-to-start ≥ 30. **FAIL.** Matrix file `qa/r1a/fps-phone.json` (35 rows, 5-run alternating, foreground, throttling off, 4× CPU only while recording, 412×914, DPR 2.6). Worst rows: cloister-brim rep 1 = 12.29 fps (work max 10.90 ms, calls 14); sundial rep 0 = 20.92 fps (work max 10.30 ms, calls 16). Lines run `qa/r1a/fps-phone-lines.json`, Sliver+Hard+Blister armed (beam 14, shade damage 4.7): cloister-brim rep 3 = 8.52 fps from one 117.4 ms gap (work max 16.50 ms, calls 14). The other nine lines rows are 36.23–48.54. No busy-wait was added. `fps-phone.json` was not overwritten.
2. Phone gap 1% low ≥ 39. **PASS.** Matrix low is 45.45 (cloister-brim). Every matrix scene is at or above 39. Lines-run low is 40.02 on the same cloister-brim rep 3 row; the other lines rows are 73–86.
3. Desktop work 1% low ≥ 60. **PASS.** `qa/r1a/fps-desktop.json`, foreground, 1280×720, DPR 1, tier high. Sundial 337.30, stair-k4 307.97, stair-p3 335.97, cloister-brim 382.88, sundial-reveal 420.79. Window peaks 20, 14, 13, 18, 20. 0 errors.
4. Draws ≤ 20, lines add 0. **FAIL** on the absolute cap. **PASS** on lines adding 0. `qa/r1a/draws.json`, lines-on beam 14 and 3 notches. Steady peaks, lines off and on: sundial 19, lattice 23, cloister-brim 16, stair-k4 17, stair-p3 15, nadir-p1 15. Delta 0 on all six. Lattice 23 is the miss (mode level, 56 enemies, t=274.61). The sundial sample is short (t=6, 2 enemies); the desktop fps window on sundial peaked at 20. Historical ledger named in the brief (Sundial 17/21, Lattice 16/21, Cloister 15/20, Stair 12/14/16, Nadir 14) is the prior budget, not this sample.
5. Entry ≤ 300 KB gzip. **PASS.** Python `gzip.compress` level 9 of every modulepreloaded JS file: 280,646. Cap 300,000.
6. Entry delta ≤ +4 KB. **PASS.** Same-Vite rebuild of `0390849` preloaded sum is 276,583. Delta 4,063. Cap 4,096. Margin 33 bytes. Preloaded: index 206,905, collision 68,029, tuning 3,352, palette 2,360. Lazy and not preloaded: meta 2,491, lineFx 871. `dist/index.html` has no storage chunk and no `/meta-` preload.
7. 0 console errors, including migration fixtures. **PASS.** `qa/r1a/ui.json` `errs` is `[]`. Browser fixtures 1–14 each recorded `errs: []` on the first load, and the reload recorded none. Phone matrix and lines rows recorded 0 errors. Node fixtures print `r1a fixtures: 14 pass, earn math pass`.
8. H1 touch at 390×844. **PASS.** Line buttons 5×48, Hour Wheel buttons 14×48, wardrobe buttons 5×48. Reroll 1 and Banish 1 are 48 px on 1280×720 and on 390×844 (`qa/r1a/offers.json`).
9. Sunspear hit ≥ 90%. **PASS.** `qa/r1a/hit.json`. Desktop rank 0: 75/75. Desktop multitude 2: 221/225 (98.22%). Phone 390×844 rank 0: 75/75. Phone multitude 2: 221/225 (98.22%). Desktop meridian: 525/525. Phone meridian: 525/525. Worst 98.22%.
10. Boss TTK within ±15% with no lines. **FAIL.** `qa/r1a/ttk-nolines.jsonl`, kit e2, seeds 11/22/33/44/55/66. 16 rows match the baseline exactly. Cloister seed 11 is 33.98 vs 34.81 (−2.4%, inside ±15%). Cloister seed 55 is a player death (`ttk` null, php 0, t≈294.96) against a baseline clear of 38.48. A retry of that seed died again. Shade weapon damage during that run was 5 (×0.5), so Hard Line was not armed. The extra hit is one Cloister blot of 6. Weapons and bosses were not retuned. Lattice and Stair are exact on all 12 comparable rows.
11. Hard Line boss TTK ≤ +35%. **PASS** at the shipped ×0.47. See the Hard Line section. The specified ×0.3 missed this cap on Lattice seed 22 (+47.4%) and was softened.
12. No lines = same spawns within ±2%. **PASS** on the 24 rows that have an F2 baseline. Worst delta 0. `qa/r1a/spawn.json` against `qa/f2/f21-spawn.json`. Nadir has no row in that baseline. Under the same pin, all 6 Nadir seeds stayed alive 0 / spawned 0 / mode playing. Recorded as no baseline.
13. `camera.ts` unchanged. **PASS.** `git diff 0390849 -- src/render/camera.ts src/core/loop.ts` is empty.
14. Static screens, frames over 5 s = 0, including the menu and the Hour Wheel. **PASS.** Counts below. Pause is the documented exception: the loop keeps running behind pause (165 frames and 2,145 draws in 1 s, vsync off). The 15 fps menu exception was not used.
15. Fresh-save weapon test. **PASS.** Five Rays on a fresh envelope, Nadir, no descend: each `.ray-row` has 2 buttons (Sunspear/Halo Discs, Solar Flare/Noon Bell, Might/Haste, Vitality/Swiftness, Wide Noon/Searing Light). No Heliograph or Scarablight. Three fresh level-up offers, then the sheet stopped at level 4 with pending 0: Wide Noon/Halo Discs/Might/Haste; Lodestone/Multitude/Wide Noon/Reach; Haste/Wide Noon/Might/Reach. None of those cards is a locked weapon. Reroll replaced Might with Prism Shards (Hour Stakes is the unlocked stake weapon; Prism Shards is unlocked).
16. Fast-forward only, local commit, no push. **PASS.** `33c1eec` sits on `0390849`. `origin/main` is still `0390849`.

## Migration fixtures

Node (`node --import ./scripts/r1a-register.mjs --experimental-strip-types scripts/r1a-fixtures.ts`): 14 pass, earn math pass, re-run after the shade change. Browser (`qa/r1a/fixtures-browser.json`): each seed booted on the game origin, the wheel was opened when the save had progress, and a reload with the seed locked did not change the envelope.

| # | Browser result | Envelope after boot |
| --- | --- | --- |
| 1 fresh | PASS, no wheel button | sunmarks 0, rev 1, `migratedFrom` fresh, empty wheel |
| 2 Sundial clear | PASS, weapons drawn kept | sunmarks 15, `maps.v1`, wheel weapon A and B, Sliver entitled, not inferred |
| 3 four temples, Nadir not cleared | PASS | sunmarks 15, wheel temples + both weapons, no finale, palette default |
| 4 finale clear | PASS | sunmarks 40, palette linen, wheel finale + temples + both weapons, no Noon Print mark |
| 5 `noonsworn.dawn` without a Nadir clear | PASS | sunmarks 40, palette linen, finale + temples + both weapons, Sliver and the earlier lines inferred |
| 6 inferred Sundial | PASS | sunmarks 15, Sliver inferred and entitled, both weapons kept, no Hard Line, no temples |
| 7 corrupt meta `{` | PASS, 0 throw | bak is `{`, maps unchanged, sunmarks 15, both weapons kept |
| 8 corrupt maps `{` | PASS, 0 throw | maps stay `{`, bak is `{`, `migratedFrom` legacy-bad, sunmarks 0, empty wheel, no wheel button |
| 9 future `v: 2` | PASS, raw unchanged | sunmarks 77, rev 9, wheel frame only, read-only, palette string `harbor` left as stored |
| 10 two tabs | PASS for the loaded seed | sunmarks 40, rev 1, empty wheel. The concurrent merge is the node fixture: disk sunmarks 165, frame and reroll each once. Max of sunmarks refunds the other tab's spend. Left as specified. |
| 11 quota | PASS for the loaded seed | sunmarks 40, rev 4, disk unchanged. The failed commit is the node fixture: reason `session`, notice `Sunmarks stayed on this tab.`, previous envelope kept. |
| 12 migrate twice | PASS | reload envelope identical, sunmarks 15, both weapons kept |
| 13 cut off before death | PASS, fresh wheel | sunmarks 0 until `credit`. Node: 90 s first death = 21, second = 6, practice stamp = 0 and does not consume the first-run bonus, `__nw` during the run = 0, `?dev` `?seed` `?arsenal` `?evo` = 0. |
| 14 origins do not sync | PASS | fresh envelope, no github/portal/sync key from the adapter. Node writes only `noonsworn.meta.v1`. |

Maps and dawn keys were unchanged on the fixtures that seeded them.

## Hard Line

`damageAmount` in `src/game/sunClock.ts`: might, then lit ×2 (`exposedDamage`). A shade weapon hit uses Cloister deep-weapon 0.3 when the foe is deep, otherwise `shadeWeapon`. A shade cut uses `armoredCut` 1. Default `shadeWeapon` is `armoredWeapon` 0.5. Hard Line, on a map where it is live, sets `shadeWeapon` to `TUNING.lines.hardShade`.

Shipped `hardShade` is **0.47**. ×0.3 was measured first. Lattice seed 22 was 40.99 vs baseline 27.81 (+47.4%) with shade damage 3, so the cap required a soften. ×0.40, ×0.45, and ×0.46 all stayed on the slow fight (46.33, +66.6%, 0 obelisks). ×0.47 returned that seed to 27.81, php 70, 4 obelisks, the same fight as no lines. Proof field `damageAmount(10, false, 'weapon', 0)` reads 4.7.

Paths that move with Hard Line:

| Target | Lit | Shade |
| --- | --- | --- |
| Normal horde, weapon | ×2 | ×0.47 (×0.3 if Cloister deep). Darting counts as lit. Darting cut is an extra ×1.5 on top of the cut row. |
| Normal horde, cut | ×2 | ×1 |
| Cloister cast mode-0 foe, and a shade foe that is not deep and not under | — | ×0.47 |
| Cloister cast deep foe | — | ×0.3 (`deepWeapon`, unchanged) |
| Cloister cast under foe | ×2 | — |

Paths that do not move:

| Boss / state | Factor |
| --- | --- |
| Cloister Compline, lit | ×2 |
| Cloister Compline, deep | ×0.25 (`deepBoss`) |
| Cloister Compline, other shade | ×0.35 (`shadeBoss`) |
| Lattice Espalier | lit ×2, shade ×0.35 |
| Stair Newel, weapon | lit ×2, shade ×0.35 |
| Stair Newel, cut | lit ×2, shade ×1 |
| Nadir Matins | lit ×2 (`exposed`), shade ×0.35 (`sealed`); phase-1 teach window gates shade hits to 0 |

Shipped Hard Line boss times (`qa/r1a/ttk-hard-047.jsonl`). `ok` is the +35% check and is blank when the baseline has no clear. Comparable rows: maximum pct is 0.0. Cloister seed 44 is 12.4% faster.

| Map | 11 | 22 | 33 | 44 | 55 | 66 |
| --- | --- | --- | --- | --- | --- | --- |
| Cloister ttk | 33.98 | 35.64 | 34.01 | 34.98 | 38.48 | 33.64 |
| Cloister baseline | 34.81 | 35.64 | — | 39.93 | 38.48 | — |
| Cloister pct | −2.4 | 0 | — | −12.4 | 0 | — |
| Lattice ttk | 63.51 | 27.81 | 28.74 | 78.56 | 34.64 | 49.33 |
| Lattice baseline | — | 27.81 | 28.74 | 78.56 | 34.64 | 49.33 |
| Lattice pct | — | 0 | 0 | 0 | 0 | 0 |
| Stair ttk | 153.49 | 93.16 | 117.33 | 93.16 | 120.66 | 138.66 |
| Stair pct | 0 | 0 | 0 | 0 | 0 | 0 |

Stair day stays 60. All Stair rows are exact.

The ×0.3 Lattice seed 22 row that forced the soften is kept in `qa/r1a/ttk-lines-03.jsonl`: ttk 40.99, baseline 27.81, +47.4%, shade damage 3, mode clear, php 62.

## Line cost

Boss ttk after t=270, kit e2, one line at a time. Sliver, Blister, Quick, and Few Hands are from `qa/r1a/ttk-lines-03.jsonl` (they do not read `hardShade`). Hard Line is the shipped ×0.47 table above. A blank ttk is no boss clear in the window. Pct is versus the no-lines baseline. These swings are reported as cost. They are not the Hard Line +35% gate, and weapons were not retuned to chase them.

Sliver, beam 14, day 60, shade damage 5:

| Map | 11 | 22 | 33 | 44 | 55 | 66 |
| --- | --- | --- | --- | --- | --- | --- |
| Cloister | 33.98 (−2.4) | death | death | death | 37.98 (−1.3) | 33.64 |
| Lattice | death | 58.76 (+111.3) | death | 56.58 (−28.0) | 46.99 (+35.7) | 53.28 (+8.0) |
| Stair | 153.49 (0) | 93.16 (0) | 117.33 (0) | 93.16 (0) | 120.66 (0) | 138.66 (0) |

Blister, beam 17, day 60. Cloister: player death on all 6 seeds. Lattice 22/33/44/55/66 exact; Lattice 11 death. Stair 11/22/33/55/66 exact on the clock with lower php (92.95, 32, 82, 24, 30). Stair 44 death.

Quick, day 42 on Cloister and Lattice, day 60 on Stair (the line is disabled there; Stair times are exact):

| Map | 11 | 22 | 33 | 44 | 55 | 66 |
| --- | --- | --- | --- | --- | --- | --- |
| Cloister | 33.48 (−3.8) | death | death | 35.28 (−11.6) | 37.48 (−2.6) | 34.48 |
| Lattice | 79.33 | 47.36 (+70.3) | death | 41.99 (−46.6) | death | 30.31 (−38.6) |
| Stair | exact, day 60 | exact | exact | exact | exact | exact |

Few Hands, beam 17, day 60, shade damage 5. Lattice 44 is +1.5% (79.73 vs 78.56). Lattice 22/33/55/66 exact. Stair exact. Cloister 11 and 22 exact; 44 and 55 are player deaths; 33 and 66 cleared with no baseline.

## Economy

`qa/r1a/economy.json`. `printPaid` false, 2000 careers, cap 80. The +10 Noon Print column is not shipped. Bands are ±30% of the published targets. First purchase is inside for all three. 5-buy and all-9 are outside, except a good player's 5-buy (8 is inside 4.9–9.1). New all-9 reached 268 of 2000 careers, so that median is censored at the run cap.

| Player | Target first / 5 / all 9 | Band | Median | Inside | With +10 (not shipped) |
| --- | --- | --- | --- | --- | --- |
| new | 2 / 13 / 40 | 1.4–2.6 / 9.1–16.9 / 28–52 | 2 / 27 / 77 | yes / no / no | 1 / 12 / 38 |
| mid | 1 / 9 / 26 | 0.7–1.3 / 6.3–11.7 / 18.2–33.8 | 1 / 13 / 41 | yes / no / no | 1 / 8 / 25 |
| good | 1 / 7 / 18 | 0.7–1.3 / 4.9–9.1 / 12.6–23.4 | 1 / 8 / 24 | yes / yes / no | 1 / 6 / 18 |

## Static frames

Over 5 s after the screen was up (`qa/r1a/ui.json`):

| Screen | Frames | GL draws |
| --- | --- | --- |
| Splash | 0 | 0 |
| Menu | 0 | 0 |
| Picker | 0 | 0 |
| Hour Wheel, 0 marks | 0 | 0 |
| Hour Wheel, 12 marks | 0 | 0 |
| Wardrobe | 0 | 0 |
| Credits | 0 | 0 |
| Results | 0 | 0 |
| Pause, 1 s (not parked) | 165 | 2145 |

Results text on a `?dev=1` death: `Practice · 0 Sunmarks`. Next mark: `next mark: Picker frame, 25, ~0 runs`. First-run menu had no Hour Wheel button.

## Stills

`qa/r1a/stills/`.

| Screen | Desktop | Phone 390×844 |
| --- | --- | --- |
| Splash | splash-desk.png | — |
| Menu, first run | menu-first-desk.png | — |
| Menu with the wheel entry | menu-wheel-desk.png | — |
| Picker with lines | picker-lines-desk.png | picker-lines-phone.png |
| Hour Wheel 0 / 5 / 12 | wheel-0-desk.png, wheel-5-desk.png, wheel-12-desk.png | wheel-phone.png |
| Wardrobe | wardrobe-desk.png, wardrobe-flax-desk.png, wardrobe-pewter-desk.png | wardrobe-phone.png |
| Results | results-desk.png | — |
| Reroll / Banish | reroll-banish-desk.png | reroll-banish-phone.png |
| Blister ring | blister-desk.png | — |
| Credits | credits-desk.png | — |

Results and the Blister ring were captured on desktop. The phone set covers the picker, the wheel, the wardrobe, and reroll/banish.

## Names

UI copy uses Hour Wheel, Sliver Line, Hard Line, Blister Line, Quick Line, Few Hands, Flax, and Pewter. A case-sensitive search of `src` found none of: The Dial, Thin Line, Scorch Line, Long Line, Narrow Line, Gilt, Oath, Vow, Pact, Ascension. The Stair shader bool `gilt` is not UI copy. `ads.ts` uses `bonusMark` where it previously said `doubleGilt`.

PUSH-READY: NO

- Phone worst start-to-start: NO (matrix 12.29 and 20.92; lines run 8.52)
- Phone gap 1% low: YES (matrix ≥ 45.45, lines run ≥ 40.02)
- Desktop work 1% low: YES (lowest 307.97)
- Draws ≤ 20: NO (lattice 23). Lines add 0: YES
- Entry ≤ 300 KB gzip: YES (280,646)
- Entry delta ≤ +4 KB: YES (4,063)
- Console errors: YES (0, including 14 browser fixtures)
- H1 390×844: YES (48 px)
- Sunspear hit: YES (worst 98.22%)
- Boss TTK, no lines, ±15%: NO (Cloister seed 55 death vs 38.48)
- Hard Line ≤ +35%: YES at ×0.47 (comparable max 0%)
- Spawns within ±2%: YES (worst 0% on 24 baseline rows; Nadir has no baseline)
- camera.ts unchanged: YES
- Static frames over 5 s: YES (0, including menu and Hour Wheel). Pause still renders
- Fresh-save weapons and Five Rays: YES
- Busy-wait frame floor: none added
- Push: not done. Local commit `33c1eec` only

## R1a.1

Local commit `962c18f` sits on `33c1eec`. `origin/main` is still `0390849`. Not pushed. No live check. Phone, draws, and Cloister times below were taken on `33c1eec` and `0390849` before the earn commit. `962c18f` changes the Sunmark rates, the ledger, and the fixture totals. It does not touch the render loop, `hold()`, combat, or bosses.

Same setup for both commits: foreground Chrome (`FG` true), background throttling off, 5-run alternating, iPhone UA, 412×914, DPR 2.6, 4× CPU only while recording. `0390849` was Vite on port 5178. `33c1eec` was Vite on port 5174. One `about:blank` tab besides the harness tab. CPU time before the matrix was 984 s. Files: `qa/r1a/ab.json`, `ab-fps-0390849.json`, `ab-fps-33c1eec.json`, `ab-fps-33c1eec-rerun.json`, `ab-seeds.jsonl`. `fps-phone.json` and `draws.json` were not overwritten.

### A/B

Worst start-to-start and lowest gap 1% low across the 5 reps. Every phone window ended in `level`.

| Scene | 0390849 worst / 1% low | 33c1eec worst / 1% low |
| --- | --- | --- |
| sundial | 42.37 / 74.07 | 10.95 / 44.71 |
| cloister-brim | 39.06 / 67.60 | 40.98 / 72.65 |
| lattice | 37.74 / 71.25 | 38.91 / 71.17 |

`0390849` passes both phone floors. Its worst window is lattice rep 2 at 37.74, and its lowest 1% low is cloister-brim rep 0 at 67.60. No gap over 26.5 ms. Callback work stayed at or under 15.1 ms.

`33c1eec` misses one window: sundial rep 4, gapMin 10.95, gapMax 91.3, gapLow 44.71, workMax 29.9, end mode `level`. The 91.3 ms gap is frame 856, mode `level`, with 4.4 ms of callback work. A different frame in that window did 29.9 ms of work inside a 37.3 ms gap. The other 14 windows on this commit stayed at or above 38.91, and every one of them also ended in `level`.

A second 5×3 on `33c1eec` only (`ab-fps-33c1eec-rerun.json`), same setup: worst is lattice rep 1 at 35.84, lowest 1% low is 71.43 on that same window. Every window is at or above those two numbers. The 91.3 ms hole did not return.

Draw peaks, same method on both commits (desktop 1280×720, tier high, chests 0). Lattice steady 22 is on both, so it is not an R1a change. Left as measured.

| Scene | 0390849 max / steady / min | 33c1eec max / steady / min |
| --- | --- | --- |
| sundial | 19 / 19 / 17, playing, t=6, 2 enemies | 19 / 19 / 17, playing, t=6, 2 enemies |
| cloister-brim | 16 / 16 / 15, playing, t=6 | 16 / 16 / 15, playing, t=6 |
| lattice | 22 / 22 / 19, level, t=274.61, 56 enemies | 22 / 22 / 19, level, t=274.61, 56 enemies, beam 17 |

Cloister seed 55, kit e2, one run inside the A/B: `0390849` died (`ttk` null, php 0, mode playing, t=294.96). `33c1eec` cleared at 34.98 (php 46, t=304.98). That clear did not reproduce. The six-seed pass below dies at the same timestamp on both commits.

### Phone fps

The required A/B worst is 10.95 on `33c1eec` against 37.74 on `0390849`. The miss is one gap between `setTimeout(0)` starts. Callback work on that gap is 4.4 ms, so about 87 ms sits outside the game callback. Mode was already `level`. Fourteen other windows in the same matrix, all of which also opened a level-up, had no gap over 26 ms.

The follow-up on the same build did not reproduce it: 8 traced Sundial windows stayed at gapMin 40.32–51.81 and gapMax 19.3–24.8, and the 15-window confirmation worst is 35.84 with a 1% low of 71.43.

The trace is a buffered long-task observer (threshold 50 ms) plus resource loads whose names contain meta or lineFx. Each of the 8 pages recorded exactly 3 long tasks, all attributed to `self` / `unknown` / `window`, durations about 202–221 ms, 66–70 ms, and 54–84 ms. `meta.ts` loaded 15–20 ms at 15–29 ms into the page. `lineFx.ts` loaded 1–3 ms at about 370–390 ms. Those loads finish before the fps window arms. No fourth long task landed inside the recorded 1400 gaps. `hold()` returns a boolean and does not spin or touch the loop. A fresh envelope does not import the wheel UI, so the reroll and banish buttons are not in the document. Storage writes for a run happen on death or clear, after this window. No busy-wait was added.

The 117.4 ms gap in `qa/r1a/fps-phone-lines.json` is the same shape. Cloister-brim rep 3, frame 360, mode `playing`, gap 117.4 ms, callback work 5.0 ms. About 112 ms is outside the callback. The window's work max of 16.5 ms is a different frame. The lines-run row ends in `level`. It was not reproduced as a game long task.

### Draws

Lattice steady draws are 22 on `0390849` and 22 on `33c1eec`. The earlier `draws.json` 23 was this same scene (mode `level`, 56 enemies, t=274.61) measured on one commit. The cap of 20 is missed on the baseline as well. No draw was removed this round.

### Boss TTK, no lines

Kit e2, Cloister, six seeds, both commits (`qa/r1a/ab-seeds.jsonl`). A blank ttk is a player death. Historical file numbers are in parentheses and are not from this setup.

| Seed | 0390849 | 33c1eec |
| --- | --- | --- |
| 11 | clear 33.98 (34.81) | clear 33.98 |
| 22 | clear 32.14 (35.64) | clear 35.64 |
| 33 | death t=300.36 (death) | clear 34.01 |
| 44 | clear 39.93 (39.93) | clear 39.93 |
| 55 | death t=294.96 (clear 38.48) | death t=294.96 |
| 66 | clear 33.64 php 70 (death) | clear 33.64 php 70 |

Seeds 11, 44, 55, and 66 match across the two commits, including the seed 55 death at t=294.96. Seed 11 is 33.98 on both today, so its gap versus the old file is the harness. Seed 66 clears on both today.

Seeds 22 and 33 disagreed in that pass, so they were run again. The outcomes swapped. `0390849` seed 22 died at t=298.56 (4 obelisks). `0390849` seed 33 cleared at 34.01, php 32, and its boss-hit histogram matched `33c1eec` seed 33 on both passes: damage keys 14.28, 12.00, 4.75, and 3.24. `33c1eec` seed 22 cleared at 32.14 on the rerun. There is no 4.7 shade hit, so Hard Line at 0.47 is not leaking into the no-lines fight. Weapons and bosses were not retuned.

### Sunmarks

Costs stay 25, 35, 45, 60, 70, 85, 100, 125, 150. First-run 15 and finale 25/5 stay put. Noon Print's +10 is not paid. Rates are `EARN_PER30` 3.25, `EARN_BOSS` 9, `EARN_CLEAR` 16 in `src/data/tuning.ts`. `scoreRun` and the ledger both read those. Official sim `scripts/r1a-economy.ts`, 2000 careers, cap 80, `printPaid` false, written to `qa/r1a/economy.json`. Node fixtures: 14 pass, earn math pass.

| Player | Band | Median first / 5 / all 9 | Inside |
| --- | --- | --- | --- |
| new | 1.4–2.6 / 9.1–16.9 / 28–52 | 2 / 14 / 50 | yes / yes / yes |
| mid | 0.7–1.3 / 6.3–11.7 / 18.2–33.8 | 1 / 7 / 23 | yes / yes / yes |
| good | 0.7–1.3 / 4.9–9.1 / 12.6–23.4 | 1 / 5 / 14 | yes / yes / yes |

All 2000 careers reached all 9. The +10 column is not shipped: new 1/9/28, mid 1/6/17, good 1/4/11. Integer per-30 rates missed the bands. At 3 per 30 seconds the nearest point in the search was new 2/14/53 and good 1/4.5/13. At 4, a new player's first buy lands on run 1. 3.25 stays inside and prints clean tenths.

### Bundle

Python `gzip` level 9 of the modulepreloaded JS, after `962c18f`. Preloaded sum 280,677. Same-Vite base `0390849` is 276,583. Delta 4,094. Cap 4,096. Margin 2 bytes. Absolute cap 300,000. Preloaded: index 206,927, collision 68,030, tuning 3,361, palette 2,359. Lazy: meta 2,489, lineFx 869. `dist/index.html` has no storage chunk and no `/meta-` preload.

### Gates

1. Phone worst start-to-start ≥ 30. **FAIL** on the required A/B (sundial rep 4 at 10.95). **PASS** on the confirmation matrix (worst 35.84). The miss is one scheduler hole, 4.4 ms inside the callback, and it did not reproduce. No game change.
2. Phone gap 1% low ≥ 39. **PASS.** A/B lowest is 44.71 on the failing window. Confirmation lowest is 71.43. Base lowest is 67.60.
3. Draws ≤ 20 on lattice. **FAIL** on both commits at steady 22. Not an R1a change. Not removed this round.
4. Boss TTK ±15%, no lines. Seed 55 dies at t=294.96 on both commits. The six-seed table plus the 22/33 rerun is seed variance. Weapons and bosses were not retuned. Hard Line does not leak.
5. Sunmarks, ±30% of 2/13/40, 1/9/26, and 1/7/18. **PASS.** Medians 2/14/50, 1/7/23, 1/5/14. Costs unchanged.
6. Entry delta ≤ +4 KB and entry ≤ 300 KB. **PASS.** Delta 4,094. Sum 280,677. Margin 2 bytes.

PUSH-READY: NO

- Phone A/B worst: NO (10.95 on one `33c1eec` Sundial window). Confirmation: YES (35.84, 1% low 71.43)
- Phone gap 1% low: YES
- Lattice draws ≤ 20: NO (22 on `0390849` and 22 on `33c1eec`)
- Boss TTK, no lines, seed 55: dies on both commits at t=294.96. Reported as variance. Not retuned
- Sunmarks bands: YES (2/14/50, 1/7/23, 1/5/14)
- Entry gzip: YES (280,677, delta 4,094, margin 2)
- Push: not done. Local commit `962c18f` only

### Waiver (logged with R1b)

Lattice draws 22 and the Cloister seed-55 no-lines TTK are pre-existing at 0390849, logged for the launch perf/balance pass. The entry delta was +4.39 KB by an independent measure (index + preloads + CSS), vs the +4 KB gate. The gate numbers above stay 4,094 bytes and sum 280,677.
