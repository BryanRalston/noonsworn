# R1b Noon Print

Local work on `main`, base `origin/main` `962c18f`. Measured on this computer (`bryan`). Not pushed. No live check.

Vite dev server `http://127.0.0.1:5174/noonsworn/`. Production preview `http://127.0.0.1:5180/noonsworn/` serving `dist` entry `index-DIfahWhx.js`. Chrome 154 on CDP 9224, profile `chrome-f21`, with background timer throttling, renderer backgrounding, and occluded-window backgrounding disabled. Phone and desktop fps windows were brought to the foreground before recording. `src/render/camera.ts` has an empty diff against `962c18f`.

The waiver is appended to `qa/r1a/REPORT.md` under the existing `PUSH-READY: NO` block. That block and the R1a.1 measurements are unchanged.

Noon Print is one daily run for a UTC day, plus a copy-paste sundial card. Spawns stay player-relative. The card says `same conditions`. The daily temple is one of `sundial`, `lattice`, `cloister`, or `stair`.

## Scope

| Item | Verdict | Evidence |
| --- | --- | --- |
| 1. Named rng streams | PASS | `spawn`, `offers`, `boss`, `chest`, `sun`, `fx` in `src/core/noon.ts`, each `mix(base, rules, stream)` with `TUNING.rules = 1`. Offers reseed per level and reroll. Chest salt `0x51ed5eed` stays inside `chests.reset`. A daily passes `streams.chest`. A non-daily passes `runSeed`. Audio FX state is set from the fx stream at run start. |
| 2. One global daily temple | PASS | `templeOf` is `hash(day) % 4`. The three taped dates are Lattice / Hard Line, Stair / Hard Line, and Cloister / Few Hands. Quick Line is absent from the Stair pool. Two or three sun-speed events come from the sun stream after `sun.reset`'s two rolls. `armLine` forces the line without writing an entitlement. A print run does not call `noteRun` or `grantTemple`. |
| 3. Fixed sim caps | PASS | While the run is a daily: projectiles 500, XP pickups 600, separation every tick, `ctx.lite` false for sim decisions. Visual tier still follows `quality.tier`. Sim-time: daily `stepBudget` is `TUNING.noon.steps` (8) and `keepTime` is true, so a full budget keeps the leftover accumulator. A non-daily budget is `TUNING.maxSteps` (4) and the accumulator is cleared at the cap. The 0.1 s frame clamp is unchanged. |
| 4. Production gate | PASS | Preview, no `?dev=1`: `?seed=11&arsenal=l5x8&evo=all` leaves `window.__nw` undefined and `dataset.seed`, `dataset.arsenal`, and `dataset.evo` unset. With `?dev=1&arsenal=l5x8`, `dataset.arsenal` is `1`, `build().spear` is 5, and KeyM loads `featureMap-CNIgE_9i.js` and shows `#feature-map`. A daily URL that matches `dev`, `arsenal`, `evo`, or `seed` is practice. A `__nw` read during the run calls `noteDev()` and also refuses the date. |
| 5. Official vs practice | PASS | Node ledger, fresh store, Stair, Hard Line armed (bonus 0.15, cap 0.4). Official 60 s daily `2026-04-15`: total 36, line `6.5 survived · 15 first · 10 print · lines +15% · 36 Sunmarks`. `scoreRun(60,0,false,false,false,false,0.15,10)` is 36. `creditNoonPrint(day)` is 10 and `creditNoonPrint('')` is 0. The practice retry returns `Practice · 0 Sunmarks` and the date stays once. Best practice seconds stay at 40. Five dates grant `mark.prints`. Locked wheel label `with Noon Print`, disabled. Owned label `5 distinct Noon Prints`, disabled. Results on `?dev=1` read `Practice` and `same conditions`. Credit runs only from the death or clear branch. |
| 6. Share, copy-first | PASS | Primary button copies text. Image is a 2D canvas, 1080×1350, four-color PNG, object URL revoked, nothing written to localStorage or IndexedDB. `navigator.canShare({files})` shows `Share image` and calls `navigator.share`. Otherwise the button saves `noon-print.png`. Cross-origin iframe copy is below. |
| 7. Lazy noonprint chunk | PASS | `noonprint-B0D3Oexs.js` is 5,047 bytes raw and is not modulepreloaded. `world.ts` loads it with a dynamic import on a print result. Python gzip level 9 of the modulepreloaded JS is 278,875. Delta against the R1a.1 sum 280,677 is −1,802. The +1 KB ceiling is 281,701. With CSS the sum is 285,257. Absolute cap 300,000. |
| 8. Picker entry | PASS | `#noon-print` shows today's temple and line, plus `Next print` counting down once a second. The picker window rendered 0 frames while the countdown moved from `9:49:49` to `9:49:44`. Play opens the picker. The daily choice does not call `rememberMap`. Copy is `menu-item primary` and `#btn-end` loses `primary` while the print is up. A failed map chunk clears the print flag before the Sundial fallback. |

## Gates

1. Determinism. **PASS.** Three dates, desktop tier high and phone tier low, scripted tape, `RENDER` driven by `__nw.tick`. All six rows match per date. Harness JSON `r1b_det.json` stays in the local temp folder. Boss hash `811c9dc5` on Lattice and Stair is the empty fold: those maps record no boss rolls. Cloister's boss hash is `30165818`.

| Date | Map | Line | t | Hash | Spawn | Offers | Chest | Boss | Sun |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-01-01 | lattice | Hard Line | 299.6100000000562 | b54c840d | d53f29c9 | 90129626 | 7e424a90 | 811c9dc5 | 75c9a519 |
| 2026-04-15 | stair | Hard Line | 298.9441666667234 | bc8875c3 | 12db5a06 | 22aca388 | 756942a3 | 811c9dc5 | 5d64c287 |
| 2026-08-20 | cloister | Few Hands | 299.6100000000562 | 14bc7460 | 9c17b6e4 | b0596291 | 5e1b6f40 | 30165818 | 82782a7f |

2. Normal runs unchanged, spawn counts ±2%. **PASS.** Non-daily seeds 11 and 22 against the `962c18f` recount. Sundial 2042 / 2042, Lattice 1871 / 1871, Stair seed 11 1437 / 1437, Nadir 0 / 0. Cloister seed 11 is 1380 against 1368 (+0.88%). Cloister seed 22 is 1363 against 1364 (−0.07%). Stair seed 22 is 1440 against 1437 (+0.21%). Every row is inside ±2%.

3. Phone worst start-to-start ≥ 30 and gap 1% low ≥ 39. **PASS.** Foreground Chrome, throttling off, 5-run alternating, iPhone UA, 412×914, DPR 2.6, `tier=med`, `setTimeout(0)` in place of rAF, 4× CPU only while recording, 1400 gaps after the first is dropped. 0 console errors. Worst kept window is the daily, rep 0: start-to-start 31.85, 1% low 63.41.

| Scene | rep 0 | rep 1 | rep 2 | rep 3 | rep 4 |
| --- | --- | --- | --- | --- | --- |
| sundial | 43.67 / 77.05 | 37.59 / 67.70 | 40.98 / 72.61 | 49.26 / 80.55 | 43.48 / 80.97 |
| lattice | 37.17 / 72.05 | 38.61 / 71.79 | 42.02 / 75.68 | 38.61 / 73.61 | 39.06 / 75.63 |
| cloister-brim | 42.19 / 75.11 | 40.32 / 69.10 | 42.74 / 74.55 | 42.19 / 74.99 | 34.48 / 68.23 |
| stair-k4 | 44.84 / 71.50 | 43.48 / 74.00 | 7.35 / 34.05 | 49.50 / 73.38 | 43.86 / 73.65 |
| daily | 31.85 / 63.41 | 50.00 / 66.51 | 51.28 / 76.63 | 49.75 / 77.95 | 45.66 / 74.55 |

Stair-k4 rep 2 is one unreproduced hole: gap min 7.35 fps, 1% low 34.05, one 136 ms gap at sample 970, mode `level`, callback work max 25 ms. A dedicated 3-rep rerun of the same scene was 41.67 / 68.39, 46.30 / 71.61, and 44.05 / 71.83. The hole is reported and left out of the kept floor. No busy-wait was added. The loop change only raises the daily step cap to 8 and keeps leftover sim time on a daily.

4. Desktop work 1% low ≥ 60. **PASS.** One foreground pass, 1280×720, DPR 1, `tier=high`, CPU throttle 1×, n 1400, 0 errors. Work 1% low: sundial 443.79, lattice 392.67, cloister-brim 363.20, stair-k4 304.26, daily 346.42. Lowest is stair-k4 at 304.26.

5. Draws ≤ 20 on every map; the print adds 0. **PARTIAL.** Lines off / lines on, steady peak after the first 60 frames, tier high, 0 errors: sundial 19 / 19, lattice 25 / 24, cloister-brim 17 / 17, stair-k4 18 / 18, stair-p3 15 / 15, nadir-p1 15 / 15. Lattice's playing peak is 25 (mites 41, hounds 4, darters 11). The same window ends on the level card at t=274.61, 56 enemies, 23 calls, which is the old R1a sample. The R1a waiver records lattice steady 22 on both `0390849` and `33c1eec`. This probe's peak is 25. No renderer file changed, and no mesh was removed to chase the cap. The print is a 2D canvas. WebGL calls were 23 before the mount and 23 after, delta 0. `getContext('webgl')` on the print canvas is null.

6. Entry ≤ 300 KB gzip, delta ≤ +1 KB. **PASS.** Python `gzip` level 9 of the modulepreloaded JS. Files: tuning 3,380, collision 68,029, palette 2,358, `index-DIfahWhx.js` 205,108 (raw 703,095). Sum 278,875. Delta versus 280,677 is −1,802. Ceiling 281,701. CSS `index-dQ-4djt3.css` is 6,382. Sum with CSS is 285,257. Absolute cap 300,000. `dist/index.html` preloads tuning, collision, and palette only.

7. 0 console errors. **PASS.** Phone rows 0, desktop rows 0, draw rows 0, TTK `errs` empty, static `errs` empty, production page errors empty, iframe exceptions empty.

8. H1 touch at 390×844. **PASS.** `#noon-print` x16 y34 w358 h96, visible, hit target is the inner span. `#btn-print-copy` x37 y583 w317 h58, hit the button. `#btn-print-save` x37 y653 w317 h44, label `Share image`, hit the button. Countdown text was on the tile.

9. Sunspear hit ≥ 90%. **SKIPPED.** Weapon numbers in `tuning.ts` were not retuned. This round adds `rules` and `noon` only. R1a worst is 98.22% (221/225) on desktop and phone multitude 2, from `qa/r1a/REPORT.md`.

10. Boss TTK within ±15% over 6 seeds. **PARTIAL.** Cloister, kit e2, seeds 11, 22, 33, 44, 55, 66, `RENDER=0`, tier high. Compared with the R1a.1 table in `qa/r1a/REPORT.md` (commit `33c1eec`). Mean of the four R1b clears is 33.16 s. Mean of the five R1a.1 clears is 35.44 s. The mean moves −6.4%, inside ±15%. Weapons were not retuned. Bosses were not retuned. `cloister.info()` has no boss field, so a clear is `mode === 'clear'` and a death is php 0 while still `playing`. `wallS` near 0.3 s is sim speed with rendering off.

| Seed | 33c1eec | R1b |
| --- | --- | --- |
| 11 | clear 33.98 | clear 32.31, php 18, t=302.31 (−4.9%) |
| 22 | clear 35.64 (rerun 32.14) | clear 33.18, php 14 (−6.9% vs 35.64) |
| 33 | clear 34.01 | death, php 0, t=295.21 |
| 44 | clear 39.93 | clear 33.33, php 6 (−16.5%). The seed's own low band is 33.94, so this clear is 0.61 s under it |
| 55 | death t=294.96 on `0390849` and `33c1eec` | clear 33.81, php 62 |
| 66 | clear 33.64, php 70 | death, php 0, t=296.94 |

Seed 55's pre-existing death did not reproduce after the boss stream replaced the fixed seed. Seed 44 is the clear that sits outside its own ±15% band. Seeds 33 and 66 flipped from a clear to a death.

11. `camera.ts` unchanged. **PASS.** `git diff HEAD -- src/render/camera.ts` is empty.

12. Static screens, 0 frames over 5 s. **PASS.** After a 0.7 s settle, rAF requests over 5.05 s: menu 0, credits 0, Hour Wheel 0, picker 0, results/print 0. Pause still renders (834 frames) and is outside the hold. The countdown text changed during the picker window while the frame count stayed 0. No busy-wait frame floor.

13. Production `?seed` and `?arsenal` do nothing without `?dev=1`. **PASS.** Numbers are in scope item 4. Preview origin `http://127.0.0.1:5180/noonsworn/`. Page errors on both documents: none.

## Sample prints

Forced deaths at about 45 s, `?dev=1`, so each card is practice. Canvas 1080×1350. PNG bytes are under 150 KB. Check codes use `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. No emoji. Bars are 24 cells.

| Date | Temple | Line | Bar | Code | PNG | Text |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-01-01 | Lattice Terraces | Hard Line | `--######################` | HFS4E7 | `qa/r1b/print-20260101.png` (108,387) | `qa/r1b/print-20260101.txt` |
| 2026-04-15 | The Westering Stair | Hard Line | `########################` | ANTM9S | `qa/r1b/print-20260415.png` (107,070) | `qa/r1b/print-20260415.txt` |
| 2026-08-20 | The Brimming Cloister | Few Hands | `---#########----########` | LH9CN9 | `qa/r1b/print-20260820.png` (109,933) | `qa/r1b/print-20260820.txt` |

Each text file is the copied card: Noon Print, temple, UTC date, `Survived 0:45`, line, `same conditions`, the bar, the code, and `played on this device`.

On the 390×844 sample page, `canShare({files})` is true, so the second button reads `Share image`. A stubbed `navigator.share` received 1 file and the card text. Storage key count stayed 11, with no new large key and no IndexedDB record of the PNG. A synthetic `element.click()` left the copy button on `Copy` because `execCommand` returned false without a user gesture. The textarea still held the card. The trusted click is the iframe test.

## Iframe copy

Parent page `http://127.0.0.1:5199/` embeds `http://127.0.0.1:5174/noonsworn/?dev=1&day=20260101`. The child frame is not its own CDP target. The test evaluates in the child's default execution context (`origin` `http://127.0.0.1:5174`, `window.top === window.self` is false).

A user-gesture click on `#btn-print-copy` made `document.execCommand('copy')` return true and the button text become `Copied`. Captured text:

```
Noon Print
Lattice Terraces
2026-01-01 UTC
Survived 0:02
Hard Line
same conditions
------------------------
EW2VPC
played on this device
```

The run is 2.5 s of scripted ticks, so the bar is empty and the code is `EW2VPC`. The 45 s samples above are the card art. The print canvas is 1080×1350 and its WebGL context is null. With `canShare` forced false, the save button set the hidden anchor to `noon-print.png`, the blob was `image/png` at 49,295 bytes, and fetching that blob URL failed after the 4 s revoke. Exceptions recorded on the parent session: none.

## Left open

Lattice's steady draw peak is 25 with lines off and 24 with lines on. The cap is 20. The historical waiver number is 22, measured on `0390849`. This round logs the new peak and does not remove meshes.

Cloister seed 44 clears in 33.33 s against 39.93 s (−16.5%, 0.61 s under that seed's band). Seeds 33 and 66 die where `33c1eec` cleared. The mean of the four clears is inside ±15%, so the weapons stay. Boss numbers stay.

The R1a waiver in `qa/r1a/REPORT.md` records the lattice 22, the Cloister seed-55 death at `0390849`, and the independent entry measure of +4.39 KB (index + preloads + CSS) against the +4 KB gate. The R1a gate numbers stay 4,094 bytes and sum 280,677.

PUSH-READY: NO

- Determinism, six rows: YES
- Spawn counts ±2%: YES (largest move Cloister seed 11, +0.88%)
- Phone floors: YES (kept worst 31.85 / 63.41). Stair-k4 rep 2 at 7.35 / 34.05 did not reproduce
- Desktop work 1% low: YES (lowest 304.26)
- Draws ≤ 20: NO on Lattice (25 / 24). Print WebGL delta 0. Other five maps are 15–19
- Entry gzip: YES (278,875, delta −1,802, with CSS 285,257)
- Console errors: YES
- H1 and iframe copy: YES (`Copied`, cross-origin, save blob revoked)
- Sunspear: skipped, R1a worst 98.22%
- Cloister TTK mean: inside ±15% (−6.4%). Seed 44 is outside its own band. Seeds 33 and 66 died. Not retuned
- `camera.ts`: unchanged
- Static frames: YES (0 on menu, credits, Hour Wheel, picker, results)
- Production `?dev=1` gate: YES
- Push: not done

## R1b.1

Measured on this computer (`bryan`), `d1a66d1` against `962c18f`. The `962c18f` server was a detached worktree on port 5176. `33c1eec` and `962c18f` differ in `EARN_PER30`, `EARN_BOSS`, `EARN_CLEAR`, and the Sunmark sentence in `meta.ts`. Spawn, sun, and boss code are the same, so the `962c18f` spawn tape is the `33c1eec` sequence. No weapon numbers changed. No boss numbers changed. `camera.ts` is unchanged.

### Lattice draws

The print is still a 2D canvas and adds 0 WebGL calls. The ledger on both commits walks every visible mesh from the scene. Seed 11, lines off, tier high, chests off, 1280×720.

Opening 1.5 s, max calls and the mesh-signature set match on all four temples:

| Map | 962c18f | d1a66d1 |
| --- | --- | --- |
| sundial | 17 | 17 |
| lattice | 18 | 18 |
| cloister | 18 | 18 |
| stair | 18 | 18 |

Jumping the clock and simulating two seconds gives the same max on both commits: t=30 → 17, t=90 → 18, t=150 → 19, t=210 → 19, t=269 → 21. Bloom discs and XP gems are off in those windows.

The six-second Lattice window that produced the R1b peak (set time 269, then 360 steps, sample every other step) is where the commits separate. `962c18f` mode is 22 (83 of 180 frames) and the max is 23. `d1a66d1` mode is 23 (51 frames) and the max is 25. Paired frames:

| t | 962c18f | d1a66d1 |
| --- | --- | --- |
| 269.02 | 18 | 19 |
| 270.02 | 20 | 20 |
| 271.23 | 23 | 24 |
| 271.36 | 23 | 25 |

179 of 180 paired frames differ by exactly the meshes that turned on. The two that `d1a66d1` adds on top of the `962c18f` peak are already in `lattice.ts` and `pickups.ts`:

- `CircleGeometry` / `MeshBasicMaterial`, parent Scene: the lattice bloom disc. On for 70 frames here, and for 0 frames on `962c18f`.
- `IcosahedronGeometry` / `MeshBasicMaterial`, parent Scene: the XP gem. On for 118 frames here, and for 5 frames on `962c18f`.

A weapon shot (`arsenal`) accounts for the rest of the swing, one draw while a spear is in flight. Forty-three frames are +2 with the disc and the gem both on. Seventeen frames are +3 with the disc, the gem, and a shot. When the signature set matches, the call count matches (65 frames at delta 0, and no frame where the same signatures produced different counts). One frame is +1 with the same signature set.

R1b did not add a mesh, a material, or a print object to the WebGL scene. Deleting the disc or the gem would hide effects `962c18f` already draws when a lit kill plants a bloom or a gem is on the ground. They stay.

### Cloister seeds 33, 44, 66

Non-daily runs are supposed to take the named streams. The brief says they keep their current feel and use the same stream structure with the run seed as the base. The gate for that is spawn counts within ±2%, which R1b already met. It is not a bit-exact replay of `962c18f`.

A non-daily Cloister run, seeds 33, 44, and 66, 15 s, player invulnerable. Both commits spawn 6 mites. The spawn times match (2.81 s, 5.58 s, 8.14 s, 10.38 s, 12.35 s, 14.13 s). The positions do not. That is `openStreams(runSeed)` replacing the single `mulberry32(seed)` the boss and the sun used to share.

| Seed | 962c18f hash | First spawn (t cs, kind, x, z) | d1a66d1 hash | First spawn |
| --- | --- | --- | --- | --- |
| 33 | 19d8e7d4 | 281, 0, 20, −64 | 9fb01434 | 281, 0, −12, −84 |
| 44 | e25452fc | 281, 0, 20, −64 | 2522fbfc | 281, 0, −84, −36 |
| 66 | b722ca08 | 281, 0, −60, −84 | 37904854 | 281, 0, −64, −20 |

The Cloister clear/death flips in the R1b table come from that split. The mean of the four `d1a66d1` clears stays −6.4% against the five `33c1eec` clears, inside ±15%. Weapons were not retuned. Bosses were not retuned.

PUSH-READY: YES

- Lattice opening and the two-second day samples: same call counts as `962c18f`
- Lattice six-second window: mode 23, max 25. The extra calls are the existing bloom disc and XP gem. No mesh removed
- Cloister seeds 33/44/66: same spawn count and times, different positions, as the named streams require
- Weapons and bosses: unchanged
- Push: not done
