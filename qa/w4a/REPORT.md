# W4a Impact core

Base is `b70fc90` (`origin/main`, “Record the R2 waiver and WebKit check.”). HEAD matched `origin/main` and the tracked tree was clean before the edit. The shipped bundle for the final measurements is `index-D1Fj2Xe7.js`, served from `dist` on `http://127.0.0.1:5182/noonsworn/`. Hit-stop, the zombie table, H1, and the canonical Sunspear rates were measured on the previous bundle `index-D31xCrvy.js`. The only source change after that bundle is the FX pool’s last-resort eviction of the death stamp closest to expiring. That change does not touch damage, hit-stop, audio, or the UI.

Boss multipliers were not edited. `git diff b70fc90 -- src/render/camera.ts` is empty. `exposedBurst` remains in `tuning.ts` and has no readers.

## Scope

### 1. Bugs — PASS

`strike()` in `src/game/weapons/evolve.ts` is the one lethal path. It calls `horde.slay` when damage returns 2. There are 13 call sites (meridian, corona, dayburst, twelvefold, heliograph, sunroller, obelisk blade, fence, ring, prism). The same lethal return is handled in flare, bell, halo, w2, sunspear, the noon cut, and the cloister damage hook.

40 mites, 6 s, evolutions on, measured on `D31xCrvy`. Zombies (alive, HP ≤ 0, state not DYING) are 0. Doubled kill feedback is 0.

| Weapon | Kills | Doubles | Zombies | Still alive |
| --- | ---: | ---: | ---: | ---: |
| spear | 40 | 0 | 0 | 0 |
| halo | 16 | 0 | 0 | 24 |
| flare | 40 | 0 | 0 | 0 |
| bell | 0 | 0 | 0 | 40 |
| helio | 40 | 0 | 0 | 0 |
| scarab | 6 | 0 | 0 | 34 |
| stake | 38 | 0 | 0 | 2 |
| prism | 27 | 0 | 0 | 13 |

Bell’s 6 s row kills nothing because Twelvefold’s cadence is 8 s. A 10 s bell pass on the same build killed 40, with 0 doubles and 0 zombies. Scarab’s ball orbits near 5–7 m and the ring sits inside that, so 6 kills in 6 s is range, and the longer pass stayed at 6 kills with 0 zombies. B2 (Sunroller replaces `stepScarabs`), B3 (Obelisk lit test uses the obelisk), B4 (`requestStop(TUNING.cut.hitStop, true)`), B5 (corona and halo rays on sim ticks), B6 (reused toll scratch), and B8 (float cap 12 in tuning and in `createFloats`) are in the source.

### 2. Per-enemy hit-hold — PASS

Hold is the max, not a sum. Bosses are not horde slots, so they take 0. Spear pierce 0.05. Halo sun 0.02, shade 0.04. Flare radius 0.04. Bell slam 0.05, toll 0.02. Meridian big lance 0.06. Dayburst tongue 0.03. Heliograph and the first solar link 0.015. Stakes and the obelisk blade 0.04. Prism shard 0.02. Scarab latch, damage-over-time, and corona ticks 0. The small meridian lance also holds 0.05. That is extra against the brief, which names only the big lance. A heliograph spend can request 0.015 three times; the hold keeps the max.

### 3. Global hit-stop — PASS

Stops take the max. The cut’s first valid hit in a dash is 0.055. A big cut or a lit elite kill is 0.065. Bell slam of 6 or more is 0.035. Flare of 8 or more is 0.03. The meridian big lance’s first connect is 0.04. Dayburst is 0.04 once per burst. Boss stagger is 0.06. The only stop above 0.065 is the boss kill at 0.10. Refractory is 0.30 s after a stop ends. The rolling 1 s budget is 0.12 s. A stop is refused mid-dash unless it is the cut’s own, refused during a boss telegraph wind-up, and refused while the level-up modal is up. `exposedBurst` has no readers.

The first weapon offer used to request 0.40 s. That would break the 0.12 s budget, so the offer is clamped to `requestStop(0.12)`. Hurt still goes through `requestStop(TUNING.hurtStop)`.

60 s full kit, rank 5, all evolutions, 200 foes, tier high, real rAF, on `D31xCrvy`: 61 samples, mode only `playing`, 41 stops, max rolling 1 s = 0.12, refractory breaks = 0, max single stop = 0.12, clock 0 → 57.22, render frames 18 → 58992. The med 20 s sample matches: max rolling 0.12, refractory breaks 0, max stop 0.12. The 0.12 s maximum is the clamped first offer. Dash and telegraph refusal is the `requestStop` predicate. The stop log does not tag those refusals.

### 4. Velocity knockback — PASS

`knockFrom`, `pullTo`, `nudge`, and `shove` add velocity with τ = 0.09 s. `slideCircle` runs only while speed is above 0.2, and speed clamps at 25. Mass is the share received: mite 1.0, darter 1.2, hound 0.6, bosses 0. Lit multiplies by 1.3 and shade by 0.6. Spear 0.25 lit / 0.08 shade along the lance. Halo shade contact is a fixed 1.2. Flare 0.8 lit / 0.3 shade outward. Bell tolls push 0.6 on a lit enemy and pull 0.4 on a shaded enemy. CC fatigue is unchanged. `knockFrom` does not call `allowControl`. The other three do, so a hit-hold blocks them.

### 5. Typed flash and squash — PASS

Remaining flash time stays in `flash[]`. Kind lives in a CPU `Uint8Array` and is uploaded as `iFlash = flash + 2·kind` (0 exposed, 1 armored, 2 kill). The shader holds full strength while `flashT > 0.05`, then eases out with `(1-(1-u)^2)·0.7` over the last 0.05 s. That is a quadratic ease, where the brief wrote a linear `flash/0.05·0.7`. Exposed is white. Armored is steel `(0.70, 0.76, 0.90)` at 55%. A kill is white for 0.05 s and then collapses.

Squash is CPU instance scale, along the incoming direction when the hit has one, otherwise from the enemy back toward Sela. Lit squash is 0.16 over 0.12 s with a −0.05 rebound. Shade is 0.06 with no rebound. A kill pops 1 → 1.12 in 0.04 s and then falls to 0 over 0.14 s. Darters get the squash. Mites and hounds take the flash through the charpack standard material. The darter is the one `ShaderMaterial`. It multiplies Three’s injected `instanceMatrix` and does not redeclare that attribute. The earlier bundle that redeclared it (`index-CajHOPvg.js`) is not the measured build. `D31xCrvy` and `D1Fj2Xe7` both report `shaderErr` false.

### 6. Death bursts and the FX pool — PASS

`vx` and `vz` integrate in `fx.update` before the draw cap, with drag. Lit kills get a white ring from 0.4 m to 1.2 m plus 4 gold shards. Shade kills get 3 ink chips plus an ink splat. Deaths within 1.2 m and 60 ms scale the first burst by 1.4 once. Ambient stamps may hold at most 45% of the cap. Impact and death overwrite the oldest ambient, then the shortest-lived impact, then the shortest-lived death. Reserved slots and the spear ribbon stay put. Pool caps were not raised. Med is 120 (80 sparks + 40 trails). High is 680.

The persistent spear ribbon is up to 8 lance slots past the pool, growing 0 → 6.5 m over 0.08 s, tapering, life 0.12 s. Noon Cut hush drops optional ambient for 120 ms after release. Impacts and deaths still allocate.

Med full kit, 200 foes, real rAF, on `D1Fj2Xe7` (`qa/w4a/med_fix.json`): impact drops 0, death drops 0, ambient share 0.3167, peak 121, cap 120, ambient skips 3158, max draws 16, console errors `[]`. The earlier med sample on `D31xCrvy` (impact 18, death 67) is the pool before death stamps could be evicted. It is superseded. High 60 s on `D31xCrvy`: impact 0, death 0, ambient share 0.0824, peak 627, cap 680, ambient skips 511.

### 7. Shake — PASS

The kick is a directional spring in world shake state, ω = 38, ζ = 0.45. Hurt keeps the existing noise. Summed amplitude clamps at 0.12 m. `noonsworn.shake` is honored. New shakes drop after 3 land inside 0.5 s. The level-up modal and boss telegraph wind-ups add none. Routine spear, halo, scarab, prism, stakes, and heliograph shakes are 0. `camera.ts` is unchanged.

### 8. Damage numbers — PASS

Canvas font is 800 `ui-sans-serif, system-ui`, `lineJoin` round. No woff2 was added. Exposed hits are white 18 px, stroke 3, rise 1.0 (the brief did not set the rise). Lit kills are 26 px `#FFE27A`, stroke 3.5, pop 1.6 → 1.0 over 0.12 s, rise 1.1, drift ±0.3, life 0.7. Armored is 14 px `#A7AEC2`, stroke 2.5, no pop, rise 0.7, life 0.45. Stroke color is `#2A1606`. The same enemy and kind inside 0.25 s accumulates. Area events emit one number at the centroid when the event kills or the largest hit is at least 45, with `×N` at 12 px. Only lit kills and hits of 45 or more are shown. The cap is 12. `EXPOSED!` shows once, and only while the tutorial is active.

### 9. Exposed vs Armored audio — PASS

`audio.contact(lit, killed, rank, index)` clusters for 90 ms. A higher rank replays. The body is one stone plus one sweetener. A lit kill is the shatter, pitched `2^(semi/12)` on a chain of 0 through +5 semitones, then the chain resets. A shaded kill is the same shatter 6 dB down (`10^(-6/20)`), with no pitch chain. Lit cracks are throttled to 500 ms per enemy index. On a lit kill the sweetener is the shatter, so a third crack is not played. Armored tinks at −2 semitones. One kill accent per 120 ms. Caps were not raised.

2 s full kit on `D31xCrvy`, sample 0 versus sample 2. High: hit 115 / played 13, armored 1 / 1, kill 102 / played 11, clustered 103, crack throttle 0. Med: hit 114 / 14, armored 1 / 1, kill 101 / 11, clustered 102, crack throttle 0. Almost every hit in that window was a kill, so the sweetener is the shatter and the crack throttle stays at 0.

### 10. Boss feedback adapter — PASS

`horde.bossHit` plays `fx.hit`, a damage number from the HP delta, and `audio.contact`. HP crossing to 0 or below requests a 0.10 s stop. A phase increase requests 0.06 s. The adapter does not change boss damage. Cloister pings inside 4 m are deduped. `cloisterCast` peek gained a `wind` flag (`force > 0` or `slamT > 0.4`) so `requestStop` can refuse during the telegraph. Boss HP and attacks are unchanged.

### 11. Early cap — PARTIAL

`earlyWeaponCap` is 6 through level 6. Below level 6, weapon cooldown is ×1.6. A lit mite (8 HP, exposed ×2) dies to one spear: cap 6 × 2 = 12. Measured on the cap-6 build: 1 hit, 12 damage, dead, floor lit. Before, with cap 3, the same mite took 2 hits of 6.

A shaded mite that stays shaded and ungleamed would take 3 damage a hit (cap 6 × 0.5) and die on the third hit. Sunspear’s gleam lasts 1.5 s and forces the victim lit, so the next spear inside that window is an exposed 12. A pinned shaded mite on an unlit floor, sun time 0, recorded 3 (lit 0), then 12 (lit 1), then 3, then 12. Floor stayed unlit. The 8 HP mite dies on hit 2. Gleam was not disabled.

Early sundial, spear rank 1, six seeds. `t10` is 0 when the run never reached 10 kills. The after rows were recorded on `index-CajHOPvg.js`, which still had the darter `instanceMatrix` redefinition. That shader error does not change the damage formula. The cap in every after row is 6.

| Seed | Before t / HP / kills / t10 / HP lost | After t / HP / kills / t10 / HP lost |
| --- | --- | --- |
| 11 | 41.05 / 0 / 3 / — / 100 | 41.53 / 0 / 3 / — / 100 |
| 22 | 38.97 / 0 / 3 / — / 100 | 60.02 / 36.8 / 79 / 37.78 / 63.2 |
| 33 | 45.72 / 0 / 19 / 42.23 / 100 | 51.07 / 0 / 49 / 40.43 / 100 |
| 44 | 41.00 / 0 / 3 / — / 100 | 42.67 / 0 / 4 / — / 100 |
| 55 | 40.17 / 0 / 5 / — / 100 | 41.13 / 0 / 5 / — / 100 |
| 66 | 42.32 / 0 / 4 / — / 100 | 56.93 / 0 / 78 / 39.83 / 100 |

Seeds 22, 33, and 66 clear packs that the cap-3 spear did not. Seeds 11, 44, and 55 still die near 41 s with a handful of kills. The rows that end in mode `level` with HP 0 are the recorded end state. They are not a 60 s survival.

### 12. Desktop draw peak — PASS

The frozen base sweep already peaked at 19, so bloom was not folded and no mesh was hidden. The after sweep on `D1Fj2Xe7` peaks at 19. Fails 0. Full kit is applied in the harness after `seedRun`: all 8 weapons rank 5, evolutions on, 200 mites spawned. Stair ends at 40 foes because the stair culls. Blob shadows are already one instanced mesh and the shadow map is off.

| View | Map | Before peak | After peak | After foes |
| --- | --- | ---: | ---: | ---: |
| desk high | sundial | 19 | 19 | 176 |
| desk high | lattice | 16 | 16 | 177 |
| desk high | cloister | 17 | 17 | 194 |
| desk high | stair | 14 | 14 | 40 |
| desk high | nadir | 16 | 16 | 200 |
| phone med | sundial | 15 | 15 | 176 |
| phone med | lattice | 12 | 12 | 177 |
| phone med | cloister | 13 | 13 | 194 |
| phone med | stair | 10 | 10 | 40 |
| phone med | nadir | 12 | 12 | 200 |

## Gates

| Gate | Result | Number |
| --- | --- | --- |
| Zombie test | PASS | 0 zombies, 0 doubled kills. Table above. |
| Phone fps | FAIL | Worst window is nadir phase 1, rep 4: start-to-start 2.30, gap 1% low 11.44. Work 1% low on that same window is 294.7. The stall is outside the callback (gaps 216, 327, 435 ms, work max 4.4 ms, 0 console errors). The other 24 windows pass. Worst of those is cloister-brim rep 1 at 34.13 / 44.32. |
| Desktop work 1% low | PASS | Lowest is cloister-brim at 266.90. Sundial 321.89, lattice 333.33, stair 296.44, nadir 350.47. |
| Draws ≤ 20 | PASS | Worst 19, desk high sundial, full kit evolved, 176 foes. |
| Entry ≤ 300 KB gzip | PASS | 291,862. Python gzip level 9, mtime 0. Delta versus the R2 report’s 287,546 is +4,316. The base dist was overwritten, so that delta is against the published R2 figure. |
| Boss TTK ±15% | FAIL | See the table. Multipliers were not retuned. There is no single damage ratio. |
| Sunspear hit ≥ 90% | PASS | Rank 1, 72 s: multitude 0 is 46/47 = 97.87%. Multitude 2 is 103/105 = 98.10%. |
| Console errors | PASS | Phase 2 `shaderErr` false. Med rerun `errs []`. Draw sweep fails 0. Phone and desktop fps rows that ran have `errors: []`. |
| H1 | PASS | 390×844, touch 5, on `D31xCrvy`. Play 313×58, howto 313×44, settings 313×44, credits 313×44. Music slider reads 45. Mute 13×13, unchecked. Vorbis `probably`. |
| camera.ts unchanged | PASS | `git diff b70fc90 -- src/render/camera.ts` is empty. |
| Static screens | PASS | Settled 5 s dwell, frames 0 on menu, howto, settings, credits, paused, and dead. |
| Hour Wheel | SKIPPED | `#btn-wheel` is absent unless sunmark meta exists. H1 `wheel` is null. |
| Hit-stop audit | PASS | Max rolling 1 s = 0.12. Refractory breaks 0. `exposedBurst` unread. |
| FX audit | PASS | Med: impact 0, death 0, ambient share 0.3167, peak 121, cap 120. High peak 627, cap 680, drops 0. |
| Audio audit | PASS | Counts in item 9. |
| Acceptance clips | PASS | 72 primary clips, 36 side-by-sides, contact sheet. Primary floors met. Webms 640.7 MB, gitignored. |
| Daily print scene | SKIPPED | `setDay` / `startPrint` exist only behind `import.meta.env.DEV`. The production preview cannot arm the daily scene. The five temples were measured. |
| WebKit | SKIPPED | `webkit-2370` is installed under `%USERPROFILE%\AppData\Local\ms-playwright`. No WebKit matrix was run. R2 recorded that WebKit has no Web Audio. |
| Nadir boss TTK | SKIPPED | `w31_ttk.py` fights lattice, cloister, and stair. Nadir was not added. |
| e1 TTK | SKIPPED | Every e1 row in `ttk_before.jsonl` has a null time. Under `RENDER=0` the base spear never releases, because `spears.release()` runs from the pose path. e2 is the comparison set. |

### Phone method

Foreground Chrome, launched with background throttling disabled, CPU rate 1 during the window. `setTimeout(0)` replaces rAF before load. 1400 gaps, first dropped. 5 reps alternating through sundial, lattice, cloister-brim, stair-k4, daily, nadir phase 1. iPhone UA, 412×914, DPR 2.6, `tier=med`. Sundial, lattice, cloister, and stair URLs carry `arsenal=l5x8&evo=all`, and the harness fills the horde to 250. Nadir stays the stock URL, matching R3. File: `qa/w4a/fps_phone.json`.

| Scene | Reps | Worst start-to-start | Worst gap 1% low |
| --- | ---: | ---: | ---: |
| sundial | 5 | 44.84 (rep 0) | 107.28 (rep 0) |
| lattice | 5 | 44.05 (rep 0) | 73.38 (rep 0) |
| cloister-brim | 5 | 34.13 (rep 1) | 44.32 (rep 0) |
| stair-k4 | 5 | 34.48 (rep 1) | 42.54 (rep 0) |
| nadir-p1 | 5 | 2.30 (rep 4) | 11.44 (rep 4) |
| daily | 5 | — | `ns.setDay is not a function` |

### Desktop method

One foreground pass, desktop UA, 1280×720, DPR 1, `tier=high`, CPU rate 1. Same scenes. File: `qa/w4a/fps_desk.json`. Work 1% low is the gate. The lowest is cloister-brim at 266.90.

### Sunspear

The canonical 72 s protocol, player pinned, other weapons off, chests off, `tick` plus `renderNow` every step so the throw cue advances. Rank-5 with the 8° partner on a thin natural crowd is 133/320 = 41.56%. At 6 m the partner sits about 0.84 m off the aim, outside the 0.7 m hit radius, so a lone body is hit by the aimed lance only. The same rank-5 spear into a filled ring is 73/80 = 91.25%. Meridian on a thin natural horde is 130/393 = 33%. That row is the 24° five-lance fan firing into empty space. It is not the rank-1 gate.

### Entry

| File | Raw | gzip 9 |
| --- | ---: | ---: |
| `index-D1Fj2Xe7.js` | 719,550 | 211,684 |
| `collision-XPfAqayp.js` | 256,958 | 68,029 |
| `tuning-ShnNjeRq.js` | 7,186 | 3,376 |
| `palette-CGg5e2Y7.js` | 7,086 | 2,359 |
| `index-3vEny91h.css` | 28,444 | 6,414 |
| Sum |  | 291,862 |

Music chunk excluded. Cap 300,000.

## Boss TTK

`RENDER=0`, tier high, kit e2 (heliograph, scarab, stake, prism), six seeds. Before column is `qa/w4a/ttk_before.jsonl`. After is `qa/w4a/ttk_after.jsonl` on `D1Fj2Xe7`, cache cleared, 0 console errors on every row. Percent is `(after − before) / before` where both times exist. A matching death is not a percentage. Cloister seed 55 dying on both sides is the known baseline.

| Map | Seed | Before | After | PHP after | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| lattice | 11 | 49.36 clear | 58.83 clear | 81 | +19.2% FAIL |
| lattice | 22 | 59.36 clear | 63.01 clear | 100 | +6.1% PASS |
| lattice | 33 | death | 55.33 clear | 14 | survival flip FAIL |
| lattice | 44 | death | 59.16 clear | 68 | survival flip FAIL |
| lattice | 55 | 71.49 clear | 62.49 clear | 92 | −12.6% PASS |
| lattice | 66 | 42.48 clear | 73.54 clear | 51 | +73.1% FAIL |
| cloister | 11 | 32.48 clear | 32.48 clear | 40 | 0% PASS |
| cloister | 22 | 39.98 clear | 45.64 clear | 6 | +14.2% PASS |
| cloister | 33 | 44.31 clear | death | 0 | new death FAIL |
| cloister | 44 | death | death | 0 | matched death |
| cloister | 55 | death | death | 0 | known baseline |
| cloister | 66 | 41.31 clear | death | 0 | new death FAIL |
| stair | 11 | 144.26 | 74.49 | 100 | −48.4% FAIL |
| stair | 22 | 104.09 | 119.16 | 100 | +14.5% PASS |
| stair | 33 | 84.16 | 78.36 | 100 | −6.9% PASS |
| stair | 44 | 86.16 | 169.16 | 79.95 | +96.3% FAIL |
| stair | 55 | 117.54 | 154.49 | 100 | +31.4% FAIL |
| stair | 66 | 103.33 | 112.83 | 100 | +9.2% PASS |

The only tuning damage change versus `b70fc90` is `earlyWeaponCap` 3 → 6. These fights are level 13, so the cap does not bind. `bossTouch` still passes the original per-weapon boss scales. Seeds move both faster and slower (stair 11 is −48%, stair 44 is +96%), and survival flips in both directions. `boss_new = boss_old × dmg_old / dmg_new` has no single ratio. Retuning a multiplier would push the slow seeds further out. Hit-stop does not run under `RENDER=0`, because the stop decays in `beginFrame`. Cloister seed 11 matching to the hundredth (32.48) shows the harness stays put when the fight does not diverge. Knockback and hit-hold change where bodies stand, so scripted contact and player deaths move without a damage-scalar change. No boss multiplier was changed. Bosses were not retuned.

## Clips

The set is 72 primary clips, 36 side-by-sides, and `contact_sheet.jpg` (1200×12376, 2.28 MB). Primary clips are VP9 + Opus, 8.20–8.21 s, desktop 1280×720 at or above 6 Mbps, phone 390×844 at or above 4 Mbps, with a game-audio track. Together the webms are 640.7 MB. The primary files are 581.7 MB. That is past the ~400 MB hope because the bitrate floors were kept. Side-by-sides put before on the left and after on the right, encoded at 2 Mbps desktop and 1.5 Mbps phone (measured 1.16–2.22 Mbps), using the after clip's audio. They sit under the primary floor on purpose.

Encode-only grain (`noise=alls=4:allf=t+u`, audio copied) was applied where a quiet phone frame could not hold 4 Mbps. Before: `flare_r5_before_phone.webm`, `bell_evo_before_phone.webm`. After: `flare_r5_after_phone.webm`, `flare_evo_after_phone.webm`, `bell_evo_after_phone.webm`, `helio_evo_after_phone.webm`. The harness URL and the in-page setup are in `qa/w4a/clips/README.md`. The webms stay on disk and are gitignored.

The contact sheet takes six frames at 0.8, 2.0, 3.4, 4.8, 6.2, and 7.6 seconds. Each subject has a before row over an after row, desktop then phone.

| File | Sec | MB | Mbps | Px | Audio |
| --- | ---: | ---: | ---: | --- | --- |
| `bell_evo_after_desk.webm` | 8.21 | 9.20 | 8.96 | 1280x720 | yes |
| `bell_evo_after_phone.webm` | 8.21 | 11.68 | 11.39 | 390x844 | yes |
| `bell_evo_before_desk.webm` | 8.21 | 7.51 | 7.32 | 1280x720 | yes |
| `bell_evo_before_phone.webm` | 8.21 | 11.77 | 11.47 | 390x844 | yes |
| `bell_evo_sbs_desk.webm` | 8.21 | 1.62 | 1.58 | 2560x720 | yes |
| `bell_evo_sbs_phone.webm` | 8.21 | 1.33 | 1.29 | 780x844 | yes |
| `bell_r5_after_desk.webm` | 8.21 | 9.13 | 8.90 | 1280x720 | yes |
| `bell_r5_after_phone.webm` | 8.21 | 4.57 | 4.46 | 390x844 | yes |
| `bell_r5_before_desk.webm` | 8.21 | 6.92 | 6.74 | 1280x720 | yes |
| `bell_r5_before_phone.webm` | 8.21 | 4.23 | 4.12 | 390x844 | yes |
| `bell_r5_sbs_desk.webm` | 8.20 | 1.61 | 1.57 | 2560x720 | yes |
| `bell_r5_sbs_phone.webm` | 8.21 | 1.19 | 1.16 | 780x844 | yes |
| `flare_evo_after_desk.webm` | 8.21 | 7.93 | 7.73 | 1280x720 | yes |
| `flare_evo_after_phone.webm` | 8.21 | 11.82 | 11.52 | 390x844 | yes |
| `flare_evo_before_desk.webm` | 8.21 | 7.74 | 7.55 | 1280x720 | yes |
| `flare_evo_before_phone.webm` | 8.21 | 4.71 | 4.60 | 390x844 | yes |
| `flare_evo_sbs_desk.webm` | 8.20 | 1.62 | 1.58 | 2560x720 | yes |
| `flare_evo_sbs_phone.webm` | 8.21 | 1.65 | 1.61 | 780x844 | yes |
| `flare_r5_after_desk.webm` | 8.21 | 6.93 | 6.76 | 1280x720 | yes |
| `flare_r5_after_phone.webm` | 8.21 | 11.81 | 11.51 | 390x844 | yes |
| `flare_r5_before_desk.webm` | 8.21 | 7.17 | 6.99 | 1280x720 | yes |
| `flare_r5_before_phone.webm` | 8.21 | 11.87 | 11.57 | 390x844 | yes |
| `flare_r5_sbs_desk.webm` | 8.21 | 2.12 | 2.06 | 2560x720 | yes |
| `flare_r5_sbs_phone.webm` | 8.21 | 1.97 | 1.93 | 780x844 | yes |
| `fullkit_after_desk.webm` | 8.21 | 15.81 | 15.41 | 1280x720 | yes |
| `fullkit_after_phone.webm` | 8.21 | 12.39 | 12.07 | 390x844 | yes |
| `fullkit_before_desk.webm` | 8.21 | 8.26 | 8.05 | 1280x720 | yes |
| `fullkit_before_phone.webm` | 8.21 | 12.92 | 12.60 | 390x844 | yes |
| `fullkit_evo_after_desk.webm` | 8.21 | 15.73 | 15.33 | 1280x720 | yes |
| `fullkit_evo_after_phone.webm` | 8.21 | 9.73 | 9.49 | 390x844 | yes |
| `fullkit_evo_before_desk.webm` | 8.21 | 8.37 | 8.16 | 1280x720 | yes |
| `fullkit_evo_before_phone.webm` | 8.21 | 9.09 | 8.86 | 390x844 | yes |
| `fullkit_evo_sbs_desk.webm` | 8.21 | 2.06 | 2.01 | 2560x720 | yes |
| `fullkit_evo_sbs_phone.webm` | 8.21 | 1.42 | 1.39 | 780x844 | yes |
| `fullkit_sbs_desk.webm` | 8.21 | 1.98 | 1.93 | 2560x720 | yes |
| `fullkit_sbs_phone.webm` | 8.21 | 1.46 | 1.43 | 780x844 | yes |
| `halo_evo_after_desk.webm` | 8.21 | 6.78 | 6.61 | 1280x720 | yes |
| `halo_evo_after_phone.webm` | 8.21 | 4.21 | 4.10 | 390x844 | yes |
| `halo_evo_before_desk.webm` | 8.21 | 7.72 | 7.53 | 1280x720 | yes |
| `halo_evo_before_phone.webm` | 8.17 | 5.34 | 5.23 | 390x844 | yes |
| `halo_evo_sbs_desk.webm` | 8.21 | 1.70 | 1.65 | 2560x720 | yes |
| `halo_evo_sbs_phone.webm` | 8.21 | 1.26 | 1.23 | 780x844 | yes |
| `halo_r5_after_desk.webm` | 8.21 | 8.59 | 8.37 | 1280x720 | yes |
| `halo_r5_after_phone.webm` | 8.21 | 5.00 | 4.88 | 390x844 | yes |
| `halo_r5_before_desk.webm` | 8.21 | 7.33 | 7.14 | 1280x720 | yes |
| `halo_r5_before_phone.webm` | 8.17 | 4.72 | 4.62 | 390x844 | yes |
| `halo_r5_sbs_desk.webm` | 8.21 | 1.78 | 1.74 | 2560x720 | yes |
| `halo_r5_sbs_phone.webm` | 8.21 | 1.30 | 1.26 | 780x844 | yes |
| `helio_evo_after_desk.webm` | 8.21 | 7.46 | 7.27 | 1280x720 | yes |
| `helio_evo_after_phone.webm` | 8.21 | 11.76 | 11.46 | 390x844 | yes |
| `helio_evo_before_desk.webm` | 8.21 | 8.28 | 8.07 | 1280x720 | yes |
| `helio_evo_before_phone.webm` | 8.17 | 8.76 | 8.58 | 390x844 | yes |
| `helio_evo_sbs_desk.webm` | 8.20 | 1.87 | 1.82 | 2560x720 | yes |
| `helio_evo_sbs_phone.webm` | 8.21 | 1.45 | 1.41 | 780x844 | yes |
| `helio_r5_after_desk.webm` | 8.21 | 11.32 | 11.03 | 1280x720 | yes |
| `helio_r5_after_phone.webm` | 8.21 | 6.10 | 5.94 | 390x844 | yes |
| `helio_r5_before_desk.webm` | 8.21 | 6.81 | 6.64 | 1280x720 | yes |
| `helio_r5_before_phone.webm` | 8.17 | 6.24 | 6.11 | 390x844 | yes |
| `helio_r5_sbs_desk.webm` | 8.21 | 2.27 | 2.22 | 2560x720 | yes |
| `helio_r5_sbs_phone.webm` | 8.21 | 1.61 | 1.57 | 780x844 | yes |
| `prism_evo_after_desk.webm` | 8.21 | 10.16 | 9.91 | 1280x720 | yes |
| `prism_evo_after_phone.webm` | 8.21 | 5.71 | 5.56 | 390x844 | yes |
| `prism_evo_before_desk.webm` | 8.21 | 8.34 | 8.13 | 1280x720 | yes |
| `prism_evo_before_phone.webm` | 8.17 | 8.49 | 8.32 | 390x844 | yes |
| `prism_evo_sbs_desk.webm` | 8.21 | 1.83 | 1.79 | 2560x720 | yes |
| `prism_evo_sbs_phone.webm` | 8.21 | 1.34 | 1.30 | 780x844 | yes |
| `prism_r5_after_desk.webm` | 8.21 | 11.40 | 11.11 | 1280x720 | yes |
| `prism_r5_after_phone.webm` | 8.21 | 6.98 | 6.81 | 390x844 | yes |
| `prism_r5_before_desk.webm` | 8.21 | 8.20 | 7.99 | 1280x720 | yes |
| `prism_r5_before_phone.webm` | 8.17 | 6.81 | 6.67 | 390x844 | yes |
| `prism_r5_sbs_desk.webm` | 8.20 | 1.81 | 1.77 | 2560x720 | yes |
| `prism_r5_sbs_phone.webm` | 8.21 | 1.36 | 1.32 | 780x844 | yes |
| `scarab_evo_after_desk.webm` | 8.21 | 9.16 | 8.93 | 1280x720 | yes |
| `scarab_evo_after_phone.webm` | 8.21 | 4.36 | 4.25 | 390x844 | yes |
| `scarab_evo_before_desk.webm` | 8.21 | 6.94 | 6.76 | 1280x720 | yes |
| `scarab_evo_before_phone.webm` | 8.17 | 5.81 | 5.69 | 390x844 | yes |
| `scarab_evo_sbs_desk.webm` | 8.21 | 1.67 | 1.63 | 2560x720 | yes |
| `scarab_evo_sbs_phone.webm` | 8.21 | 1.37 | 1.34 | 780x844 | yes |
| `scarab_r5_after_desk.webm` | 8.21 | 8.64 | 8.42 | 1280x720 | yes |
| `scarab_r5_after_phone.webm` | 8.21 | 4.92 | 4.80 | 390x844 | yes |
| `scarab_r5_before_desk.webm` | 8.21 | 6.65 | 6.48 | 1280x720 | yes |
| `scarab_r5_before_phone.webm` | 8.17 | 4.94 | 4.84 | 390x844 | yes |
| `scarab_r5_sbs_desk.webm` | 8.21 | 2.11 | 2.06 | 2560x720 | yes |
| `scarab_r5_sbs_phone.webm` | 8.21 | 1.57 | 1.53 | 780x844 | yes |
| `spear_evo_after_desk.webm` | 8.21 | 12.14 | 11.83 | 1280x720 | yes |
| `spear_evo_after_phone.webm` | 8.21 | 7.86 | 7.66 | 390x844 | yes |
| `spear_evo_before_desk.webm` | 8.21 | 8.35 | 8.14 | 1280x720 | yes |
| `spear_evo_before_phone.webm` | 8.17 | 8.62 | 8.44 | 390x844 | yes |
| `spear_evo_sbs_desk.webm` | 8.21 | 1.86 | 1.81 | 2560x720 | yes |
| `spear_evo_sbs_phone.webm` | 8.21 | 1.37 | 1.33 | 780x844 | yes |
| `spear_r5_after_desk.webm` | 8.21 | 10.03 | 9.78 | 1280x720 | yes |
| `spear_r5_after_phone.webm` | 8.21 | 5.76 | 5.61 | 390x844 | yes |
| `spear_r5_before_desk.webm` | 8.21 | 6.50 | 6.33 | 1280x720 | yes |
| `spear_r5_before_phone.webm` | 8.17 | 5.30 | 5.19 | 390x844 | yes |
| `spear_r5_sbs_desk.webm` | 8.20 | 1.87 | 1.83 | 2560x720 | yes |
| `spear_r5_sbs_phone.webm` | 8.21 | 1.42 | 1.39 | 780x844 | yes |
| `stake_evo_after_desk.webm` | 8.21 | 10.32 | 10.06 | 1280x720 | yes |
| `stake_evo_after_phone.webm` | 8.21 | 5.09 | 4.97 | 390x844 | yes |
| `stake_evo_before_desk.webm` | 8.21 | 8.08 | 7.88 | 1280x720 | yes |
| `stake_evo_before_phone.webm` | 8.17 | 6.97 | 6.83 | 390x844 | yes |
| `stake_evo_sbs_desk.webm` | 8.21 | 1.75 | 1.71 | 2560x720 | yes |
| `stake_evo_sbs_phone.webm` | 8.21 | 1.35 | 1.31 | 780x844 | yes |
| `stake_r5_after_desk.webm` | 8.21 | 9.46 | 9.22 | 1280x720 | yes |
| `stake_r5_after_phone.webm` | 8.21 | 4.30 | 4.20 | 390x844 | yes |
| `stake_r5_before_desk.webm` | 8.21 | 7.42 | 7.23 | 1280x720 | yes |
| `stake_r5_before_phone.webm` | 8.17 | 4.33 | 4.24 | 390x844 | yes |
| `stake_r5_sbs_desk.webm` | 8.20 | 1.71 | 1.67 | 2560x720 | yes |
| `stake_r5_sbs_phone.webm` | 8.21 | 1.31 | 1.28 | 780x844 | yes |

## Push

PUSH-READY: NO

- Zombie test: PASS
- Phone fps: FAIL (nadir phase 1, rep 4, start-to-start 2.30, gap 1% low 11.44)
- Desktop work 1% low: PASS (lowest 266.90)
- Draws: PASS (worst 19)
- Entry: PASS (291,862)
- Boss TTK: FAIL (no multiplier change; seeds move both ways)
- Sunspear hit: PASS (97.87% and 98.10%)
- Console errors: PASS
- H1: PASS
- camera.ts: PASS
- Static screens: PASS
- Hour Wheel: SKIPPED (control absent)
- Hit-stop: PASS (0.12 s)
- FX: PASS (med drops 0/0, ambient 31.7%)
- Audio: PASS
- Acceptance clips: PASS (72 primary, 36 side-by-sides, contact sheet; webms gitignored)
- Daily scene: SKIPPED (`setDay` is dev-only on the production bundle)
- WebKit: SKIPPED (installed, not run; R2 has no Web Audio)
- Nadir TTK: SKIPPED (harness has no nadir fight)
- e1 TTK: SKIPPED (invalid under RENDER=0)

Local commits only. This round was not pushed.

## W4a.1

On top of `b7bbd42`. Weapon boss scales are unchanged (`solar` 1.7, `sunroller` 0.3, `obelisk` 0.18, `mocksun` 0.25). Boss HP, contact, and speed were left alone. `camera.ts` is still identical to `b70fc90`. Sundial clips do not run with a tracked boss, and Sundial does not call `horde.shove`, so the weapon clips were not re-recorded.

While `horde.bossAt` is set, per-enemy hit-hold returns immediately, and `knockFrom`, `pullTo`, and `nudge` place the authored delta instead of adding spring velocity. `shove` places that delta on every map that calls it. Hit-stop still counts down in `beginFrame`, and the sim step still runs while a boss is tracked, so the stop does not eat boss-damage time. `RENDER=0` never included the stop, because the stop decays before `step`.

### Nadir phase 1, phone

Same clean setup as the W4a phone pass: foreground Chrome, med tier, 1400 frames, 5 reps. Measured canvas 618×1371 (inner 412×914). Worst start-to-start is `gapMin`. Gap 1% low is `gapLow`. Both files have `errors: []`.

The 2.30 fps window did not reproduce on `b7bbd42`. Worst rep there is 91.74, and every rep clears 30 fps and a gap 1% low of 39. `b70fc90` rep 4 hits 6.18 fps on one frame (161.9 ms, work 0.4 ms) in the same scene, with gap 1% low still 42.39. That hitch is an outside stall.

| Build | Rep | Worst fps | Gap 1% low | Work 1% low |
| --- | ---: | ---: | ---: | ---: |
| b7bbd42 | 0 | 136.99 | 152.51 | 417.83 |
| b7bbd42 | 1 | 96.15 | 148.46 | 378.79 |
| b7bbd42 | 2 | 91.74 | 147.99 | 471.70 |
| b7bbd42 | 3 | 98.04 | 147.21 | 468.75 |
| b7bbd42 | 4 | 116.28 | 150.70 | 501.67 |
| b70fc90 | 0 | 78.74 | 143.59 | 470.22 |
| b70fc90 | 1 | 120.48 | 148.62 | 364.08 |
| b70fc90 | 2 | 133.33 | 152.51 | 354.61 |
| b70fc90 | 3 | 95.24 | 142.86 | 383.63 |
| b70fc90 | 4 | 6.18 | 42.39 | 372.21 |

### Boss TTK

`RENDER=0`, tier high, kit e2, six seeds. Before is `qa/w4a/ttk_before.jsonl`. After is `qa/w4a/ttk_w4a1.jsonl` (0 console errors), measured on the feedback build above. A fresh pass of the same harness against `b70fc90` on port 5183 is `qa/w4a/ttk_base_fresh.jsonl`. It matches the archive on every lattice and stair row. Cloister seed 66 in that single pass died at t=303.86. Four immediate repeats all cleared at 41.31. Cloister seed 33 cleared on three of four repeats (43.98–45.31) and died once. On this build, cloister 33 died four times at t=310.68, and cloister 66 died four times (three at 295.41, one at 299.98).

| Map | Seed | Before | After | PHP after | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| lattice | 11 | 49.36 clear | 61.49 clear | 86 | +24.6% FAIL |
| lattice | 22 | 59.36 clear | 60.83 clear | 86 | +2.5% PASS |
| lattice | 33 | death | 56.66 clear | 7 | survival flip FAIL |
| lattice | 44 | death | 57.66 clear | 39 | survival flip FAIL |
| lattice | 55 | 71.49 clear | 61.99 clear | 72 | −13.3% PASS |
| lattice | 66 | 42.48 clear | 61.43 clear | 72 | +44.6% FAIL |
| cloister | 11 | 32.48 clear | 32.48 clear | 40 | 0% PASS |
| cloister | 22 | 39.98 clear | 45.64 clear | 6 | +14.2% PASS |
| cloister | 33 | 44.31 clear | death | 0 | new death FAIL |
| cloister | 44 | death | death | 0 | matched death |
| cloister | 55 | death | death | 0 | known baseline |
| cloister | 66 | 41.31 clear | death | 0 | new death FAIL |
| stair | 11 | 144.26 | 74.49 | 100 | −48.4% FAIL |
| stair | 22 | 104.09 | 119.16 | 100 | +14.5% PASS |
| stair | 33 | 84.16 | 78.33 | 100 | −6.9% PASS |
| stair | 44 | 86.16 | 105.91 | 80 | +22.9% FAIL |
| stair | 55 | 117.54 | 154.49 | 100 | +31.4% FAIL |
| stair | 66 | 103.33 | 112.83 | 100 | +9.2% PASS |

Named seeds 33 and 66: stair passes both. Lattice 33 is a survival flip. Lattice 66 is +44.6%. Cloister 33 and 66 are new deaths.

Fresh-base boss calls explain the lattice spread. Prism (`4.75`) calls were 338, 336, 13, 13, 139, and 482 across seeds 11–66. This build lands 62–72 prism calls on every lattice seed, and the six clears sit between 56.66 s and 61.99 s. Seed 66's 42.48 s clear is the 482-call fight. Helio calls on that seed are 254 on base and 368 here, so the missing damage is the prism burst. A prism scale large enough to replace it speeds seeds 22 and 55, which are already inside the band, and stair 66, where prism damage is 604 of 14000. Stair 11 is already −48.4%. There is no single `boss_new = boss_old × dmg_old / dmg_new`.

The burst is the ring kite, not a boss-stat change. Lattice slides the player about 5.35 m off an out-of-arena ring point on every tick (`shoves` equals `samples` on both builds). Prism samples the post-slide position, so that slide does not fill `runLeft`. Base seed 66 still produces 11 prism boss hits per second because 0-HP chasers keep the ring choice moving. Slay removes those chasers. They are the zombie bug: alive, HP ≤ 0, state not DYING. Restoring contact would fail the zombie gate. Lattice 33's base death is that contact (php 100 to 0 by t=281.74, boss still at 8358). A damage scale cannot turn the current clear back into that death.

Two crowd experiments were measured and dropped. A 15 s invisible slot hold left lattice 66 at 60.49 s with 69 prism calls and moved stair 33 from 78.33 s to 137.99 s. An 8 s non-contact chase during DYING, boss fights only, cleared cloister 66 at 41.48 s and left lattice 66 at 61.49 s with 70 prism calls. Stair 33 and 66 moved to 132.16 s and 136.33 s. Neither stayed in the tree.

Stair 44 moved from 169.16 s on `b7bbd42` to 105.91 s with the placed knock. It is still +22.9%.

## Push

PUSH-READY: NO

- Nadir phone stall: outside stall. Five reps on `b7bbd42` pass. `b70fc90` rep 4 hit 6.18 fps on one frame.
- Boss TTK: FAIL. Stair 33 is −6.9% and stair 66 is +9.2%. Lattice 33 flips death to clear. Lattice 66 is +44.6%. Cloister 33 and 66 die. No weapon boss multiplier was changed. Bosses were not retuned.
- Feel clips: unchanged. No after-clip was re-recorded.
- camera.ts: unchanged versus `b70fc90`.

Local commits only. This round was not pushed.

## W4a.2

Measurement only, on `d9001a3` against `b70fc90`. No game file changed. The per-seed ±15% rule is retired. For each boss the mean TTK of the clears must sit within ±15% of base, and the clear count within ±1 seed of base. If pass A and pass B of the base already disagree by more than that, the band becomes the observed base-vs-base spread plus 5%. They did not, so the band stays ±15% and ±1 seed.

Pass A and pass B are `b70fc90` on port 5183. Pass H is `d9001a3` on port 5182 (`index-CAF0mxFV.js`). Same harness, `RENDER=0`, tier high, kit e2, cap 220, seeds 11, 22, 33, 44, 55, 66. 90 rows, 0 console errors, no wall cut. A clear is a numeric TTK with player HP above 0. The mean is the average of those times. The spread is the max clear minus the min clear. The base mean is the midpoint of A and B. Head must land within ±15% of that midpoint, and within 1 seed of both A and B.

Lattice, Cloister, Stair, and Sundial use the official ring, seek to t=269, and TTK = kill time − 270. Sundial has no boss HP. A Sundial clear is reaching t=300. Nadir's fight clock enrages at 240, so a seek to 269 would start the fight already enraged. On Nadir only, the same script calls `nadirPhase(1)`, writes the e2 ranks back over the draft grant, and sets time to 0. Nadir TTK is the time when boss HP reaches 0. A, B, and H all used that path.

A and B matched on every Lattice, Stair, Nadir, and Sundial row. Cloister seed 66 cleared on B (41.31) and died on A (t=303.86). Cloister seed 44 died on both, at t=301.24 and t=297.58. Cloister means are 38.87 and 39.48 (1.6% apart) and the clear counts are 3 and 4. That is inside the gate, so the band was not widened.

### Sundial

Deaths are player HP at 0 between t=283.05 and t=288.72, before noon. Five of the six base deaths happen with a level offer open. The harness does not pick cards. Head reaches noon on every seed at 30.02 s, player HP 92 or 100.

| Pass | Clears | Mean | Spread | 11 | 22 | 33 | 44 | 55 | 66 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 0/6 | — | — | death | death | death | death | death | death |
| B | 0/6 | — | — | death | death | death | death | death | death |
| H | 6/6 | 30.02 | 0.00 | 30.02 | 30.02 | 30.02 | 30.02 | 30.02 | 30.02 |

FAIL. Clear rate moves by 6 seeds. There is no base mean of clears to compare with 30.02.

### Lattice

| Pass | Clears | Mean | Spread | 11 | 22 | 33 | 44 | 55 | 66 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 4/6 | 55.67 | 29.01 | 49.36 | 59.36 | death | death | 71.49 | 42.48 |
| B | 4/6 | 55.67 | 29.01 | 49.36 | 59.36 | death | death | 71.49 | 42.48 |
| H | 6/6 | 60.01 | 5.33 | 61.49 | 60.83 | 56.66 | 57.66 | 61.99 | 61.43 |

Mean +7.8% PASS. Clear rate 6 versus 4 FAIL. Seeds 33 and 44 die on base (t=281.74, boss 8358; t=283.09, boss 8412) and clear here.

### Cloister

Seed 55 dies on A, B, and H.

| Pass | Clears | Mean | Spread | 11 | 22 | 33 | 44 | 55 | 66 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 3/6 | 38.87 | 11.50 | 32.48 | 40.14 | 43.98 | death | death | death |
| B | 4/6 | 39.48 | 11.50 | 32.48 | 40.14 | 43.98 | death | death | 41.31 |
| H | 1/6 | 32.48 | 0.00 | 32.48 | death | death | death | death | death |

Mean −17.1% FAIL. Clear rate 1 versus 3 and 1 versus 4 FAIL. Seed 11 stays 32.48. Seeds 22, 33, and 66 die here (t=308.38, t=310.68, t=295.41).

### Stair

| Pass | Clears | Mean | Spread | 11 | 22 | 33 | 44 | 55 | 66 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 6/6 | 106.59 | 60.10 | 144.26 | 104.09 | 84.16 | 86.16 | 117.54 | 103.33 |
| B | 6/6 | 106.59 | 60.10 | 144.26 | 104.09 | 84.16 | 86.16 | 117.54 | 103.33 |
| H | 6/6 | 107.54 | 80.00 | 74.49 | 119.16 | 78.33 | 105.91 | 154.49 | 112.83 |

Mean +0.9% PASS. Clear rate 6 versus 6 PASS. The clear times still swing (base spread 60.10 s, head spread 80.00 s). The mean does not.

### Nadir

| Pass | Clears | Mean | Spread | 11 | 22 | 33 | 44 | 55 | 66 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 6/6 | 133.01 | 1.03 | 132.31 | 133.34 | 133.14 | 132.98 | 132.98 | 133.34 |
| B | 6/6 | 133.01 | 1.03 | 132.31 | 133.34 | 133.14 | 132.98 | 132.98 | 133.34 |
| H | 5/6 | 137.71 | 0.17 | 137.64 | death | 137.81 | 137.64 | 137.64 | 137.81 |

Mean +3.5% PASS. Clear rate 5 versus 6 PASS. Seed 22 dies at t=154.71 with 1251 boss HP left. The five clears sit between 137.64 and 137.81.

## Push

PUSH-READY: NO

- Sundial: FAIL. Base dies 0/6 before noon. Head clears 6/6 at 30.02 s.
- Lattice: FAIL on clear rate. Mean of clears is +7.8%. Seeds 33 and 44 flip from death to clear, so the count moves by 2.
- Cloister: FAIL. Mean −17.1%. Clears fall from 3 and 4 to 1. Seed 11 is unchanged at 32.48.
- Stair: PASS. Mean +0.9%, 6/6 on every pass.
- Nadir: PASS. Mean +3.5%, 5/6 against 6/6.
- Gate width: unchanged. Base A versus B stayed inside ±15% and ±1 seed. Cloister seed 66 was the only clear-or-death disagreement.
- Game code: unchanged. No clip was re-recorded.

Local commits only. This round was not pushed.

## W4a.3

On top of `b913bbb`. Same harness and the same base table. The band stays ±15% and ±1 seed of both base passes. Head is `index-QKpIM3vv.js` on port 5182. 0 console errors. Boss numbers were not retuned.

### Cause

The e2 kit's only boss knock is the sunroller, 1.5 m, and only while a boss is tracked. Halo and Bell are not equipped, and no knock deposited an add on Sela.

On Cloister the head and the base do not fail the same way. Measured on seeds 33 and 66 before the edit: every head nudge was shortened by a pillar (7/7 and 1/1) and none of them entered shade. The base, which clears those seeds, completed most nudges and did push adds into shade (4 and 10). The player stands in the wash band on both builds. The stable head deaths are extra brim hits of 10 and a boss-body hit of 30, not mite contact.

On Lattice the player is stuck in the same spot on both builds. The base hound stays up and lands twelve bites of 8. The head slays that hound after about nine bites, and seeds 33 and 44 clear. Hold already does nothing while a boss is tracked, so a shorter hold cannot put those bites back.

### What changed

Cloister boss knocks that a pillar would eat now take an open heading of the same length, and a lit add stops at the shade line instead of landing Armored. `TUNING.latticeTouch` is 0.15. During a Lattice boss, a hound already within 0.75 m past contact reach takes that share of a weapon hit. A one-HP floor on Cloister adds was tried and made spit kill the seed that used to clear, so it is not in this build.

### Sundial

The base deaths are player HP at 0 between t=283.05 and t=288.72. The cap already runs to t=490. Extending it cannot produce a base mean of clears. The W4a.2 table stands: base 0/6, head 6/6 at 30.02. FAIL. Clear rate moves by 6 seeds.

### Lattice

| Pass | Clears | Mean | Spread | 11 | 22 | 33 | 44 | 55 | 66 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Base | 4/6 | 55.67 | 29.01 | 49.36 | 59.36 | death | death | 71.49 | 42.48 |
| W4a.3 | 4/6 | 61.44 | 1.16 | 61.49 | 60.83 | death | death | 61.99 | 61.43 |

Mean +10.4% PASS. Clear rate 4 versus 4 PASS. Seeds 33 and 44 die again (t=291.01, boss 5960; t=282.09, boss 7236), on the same twelve bites of 8 plus a final 4 as the base. Seeds 11, 22, 55, and 66 are unchanged from W4a.2.

### Cloister

| Pass | Clears | Mean | Spread | 11 | 22 | 33 | 44 | 55 | 66 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 3/6 | 38.87 | 11.50 | 32.48 | 40.14 | 43.98 | death | death | death |
| B | 4/6 | 39.48 | 11.50 | 32.48 | 40.14 | 43.98 | death | death | 41.31 |
| W4a.3 | 1/6 | 32.48 | 0.00 | 32.48 | death | death | death | death | death |

Seed 11 stays 32.48. Seeds 22 and 33 die at the W4a.2 times (t=308.38, t=310.68). Seed 55 still dies. Seed 66 dies at t=299.98. Seed 44 cleared once at 43.64 and died on the repeat at t=305.06, so it is not counted as a clear. Mean of the one stable clear is −17.1% FAIL. Clear rate 1 versus 3 and 1 versus 4 FAIL.

### Stair

Replayed all six seeds. They match W4a.2 head exactly: 74.49, 119.16, 78.33, 105.91, 154.49, 112.83. Mean 107.54, +0.9%, 6/6. PASS.

### Nadir

Replayed all six seeds. They match W4a.2 head exactly, including seed 22 dead at t=154.71 with 1251 boss HP left. Mean of the five clears 137.71, +3.5%, 5/6. PASS.

### Feel

No after-clip was re-recorded. The knock steer runs only on the Cloister court while a boss is tracked, so the Sundial weapon clips do not take it. The Lattice share changes how hard a hound on Sela is hit. It does not change the hold, the flash, or the knock distance. The existing after-clips still show that feel.

## Push

PUSH-READY: NO

- Sundial: FAIL. No base mean. Deaths are already inside the cap, so the cap was not extended. Head remains 6/6 at 30.02.
- Lattice: PASS. Mean +10.4%. Clears 4/6 against 4/6.
- Cloister: FAIL. The pillar steer does not restore a stable clear. Mean of the one stable clear is −17.1%. Clears stay 1 against 3 and 4.
- Stair: PASS. Mean +0.9%, 6/6, same rows as W4a.2.
- Nadir: PASS. Mean +3.5%, 5/6, same rows as W4a.2.
- Gate width: unchanged.
- Clips: not re-recorded. Sundial weapon feel is on the same path as W4a.2.

Local commits only. This round was not pushed.
