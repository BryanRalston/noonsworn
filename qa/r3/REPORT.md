# R3 Art cleanup

Local only. Not pushed. Base `origin/main` is `d6c9db9`. Geometry is `efa9543`. Temple cards and the phone tip are `82f72b6`. Measured on this computer against Vite `http://127.0.0.1:5174/noonsworn/` and the production preview `http://127.0.0.1:5180/noonsworn/` (`index--zWJKOCu.js`). Chrome 154, CDP 9224, profile `chrome-f21`, background throttling off. `src/render/camera.ts` and `src/data/tuning.ts` have an empty diff against `d6c9db9`.

The Cloister seed-55 death is the known baseline for the balance pass. It is reported below and was not fixed.

## Items

| Item | Verdict | Evidence |
| --- | --- | --- |
| 1 Corona | PASS | Open 48-segment floor ring, three shared rings (gold at 2.8 m and 3.52 m, bronze edge at 3.6 m), 144 verts. Placed at y 0.05. The 0.08 m edge is why the mesh is 144 verts rather than a single 96-vert annulus. Phone Meridian stretch is capped at 9; desktop stays 12. Twelvefold bell is placed at 0.6×, 1.2 m behind Sela. Damage still uses the player position. The stair contact crop shows the open gold arc. |
| 2 Halo discs | PASS | 16-segment open annulus, gold from r 0.36 to 0.58, bronze `(0.45, 0.24, 0.06)` out to r 0.64, opaque, same arsenal draw. Hit radius unchanged. At play scale the bronze edge reads dark next to the gold. |
| 3 Sun Chests | PASS | 108 verts, 36 tris, under the 80-tri cap. Bevelled lid, gold band, keyhole, 8-ray sun, charge ring and hit box kept. Arsenal part verts sum to 1125 (cap 1500). Instance cap stays 128. |
| 4 Sundial pillars | PASS | Shaft radius 1.2 and positions ±9 still come from `TUNING.arena`. Base flare 1.15 / 1.2, echinus 0.3 m at 1.25×, square abacus 1.4× by 0.18 m, gem removed, 24 segments, flute shade ±8%, pillar texture tiling 1×1. The sundial card and the phone shot show the fluted shaft and the square capital. |
| 5 Extra soft assets | PASS | Coin spokes closed in memory (the PNG is untouched) plus a shader rim. Leaf cards are 5 per station, 1200 tris, baked into the dressing draw, darker on the back. Vines are scaled long on Z. Stair stools are braziers in the arch mesh. The out-of-bounds plane uses the sky colour. Wall posts have one flat gold cap. The wall base is a sandstone strip plus seven warm-stone niche frames. The inlay discards below alpha 0.5. The phone tip now clears the HUD: see the measurement below. |
| 6 Temple cards | PARTIAL | One crop, Sela at a third, Nadir left midnight. 768×288, q70–78, decode gate with a flat swatch until `img.decode()` resolves. Total 75,714 bytes, under 175 KB. Three files stay under the 20 KB floor at q78: Sundial 16,384, Cloister 10,978, Nadir 5,834. Lattice is 21,766 at q74. Stair is 20,752 at q78. No noise was added to push the small files up. |
| 7 Sela visibility | PASS | 120 / 120 desktop and 120 / 120 phone, max-evo, silhouette against the floor, `Sela` in the draw ledger on every sample. No linen rim was added. |
| 8 Sweep | PARTIAL | Both cameras, every temple and the finale. The one S-effort fix is the tip, which at 136px covered the objective. Everything else that is still soft is deferred below. Sela, enemies, Compline, Newel, Matins, their GLBs, and the Espalier lemon tree were not touched. |
| 9 Lattice draw peak | PARTIAL | Desktop high boss window peaks at 21. The target is ≤ 20. Phone med at the same moment is 19. Bloom, XP gems, the boss, and the player stayed. |

Part verts, both tiers: lance 36, disc 192, bell 105, clapper 6, mirror 78, scarab 30, stake 54, prism 168, obelisk 36, sunball 96, chest 108, tongue 72, corona 144. Sum 1125. Lattice tris after the merge: terrain 720, pergola 960, dressing 2124, foliage 1200.

## Gates

1. Phone worst start-to-start ≥ 30 and gap 1% low ≥ 39. **PASS.** Foreground Chrome, throttling off, 5-run alternating, iPhone UA, 412×914, DPR 2.6, `tier=med`, `setTimeout(0)` in place of rAF, 4× CPU only while recording, 1400 gaps after the first is dropped, horde fill 250. Scenes: sundial, lattice, cloister-brim, stair-k4, daily, nadir-p1. The URL base carries `arsenal=l5x8&evo=all` on every scene except the stock nadir URL. 0 console errors. Kept worst window is sundial, rep 0: start-to-start 33.90, gap 1% low 80.60. The lowest kept 1% low is sundial rep 3 at 66.83.

| Scene | worst start-to-start | worst kept 1% low |
| --- | --- | --- |
| sundial | 33.90 | 66.83 |
| lattice | 35.97 | 72.13 |
| cloister-brim | 39.06 | 68.43 |
| stair-k4 | 41.32 | 72.95 |
| daily | 40.16 | 72.20 |
| nadir-p1 | 66.67 | 73.96 |

Nadir rep 3 is one unreproduced hole: start-to-start 5.79, 1% low 35.85, one 172.7 ms gap at sample 842, mode `playing`, stage `fight`, callback work max 14.0 ms. A 3-rep rerun was 50.51 / 67.90, 52.08 / 70.64, and 60.61 / 80.55. The hole is reported and left out of the kept floor. Rows are in `qa/r3/r3_fps_phone.json` and `qa/r3/r3_fps_nadir_rerun.json`.

2. Desktop work 1% low ≥ 60. **PASS.** One foreground pass, 1280×720, DPR 1, `tier=high`, CPU throttle 1×, n 1400, 0 errors. Work 1% low: sundial 390.62, lattice 403.23, cloister-brim 373.13, stair-k4 313.81, daily 361.45, nadir-p1 432.28. Lowest is stair-k4 at 313.81. `qa/r3/r3_fps_desk.json`.

3. Draws ≤ 20 peak on every map, net 0 added. **PARTIAL.** The Lattice desktop peak is 21. No rim was added, so the added-draw count is 0. The Lattice lost two scene meshes (scatter hidden, foliage baked into dressing). The remaining 21 is 16 scene meshes plus the four bloom quads and the sun pip. Those meshes are the player, the marker, the spear, the arsenal, the enemies, the Espalier, the bloom disc when it is up, the XP gems when they are up, the terrain, the dressing, the shadows, the sky, and the outer. None of those were cut. Desktop fps on the filled Lattice wake also recorded max calls 21. Sundial's filled window peaked at 20. Cloister-brim 18, stair-k4 14, daily 18, nadir-p1 12.

4. Entry ≤ 300 KB gzip. **PASS.** Python gzip level 9 of the files referenced from `dist/index.html`, WebP excluded. `index--zWJKOCu.js` 205,697, `collision-Ds6aN4-z.js` 68,029, `tuning-DNSzWLer.js` 3,380, `palette-JdJxxuJ1.js` 2,358. JS sum 279,464. CSS `index-3vEny91h.css` 6,414. Sum 285,878. Cap 300,000. `noonprint` and `featureMap` stay lazy. The title WebP in the `og:image` tag is not part of the JS entry.

5. 0 console errors. **PASS.** Phone rows 0, desktop rows 0, draw/agree/Sela rows 0, static `errs` empty, TTK `errs` empty. Production preview without `?dev=1` loaded `index--zWJKOCu.js`, left `__nw` undefined, and recorded no page errors. `?seed` and `?arsenal` did not open the dev API.

6. H1 touch at 390×844. **PASS.** Inner size 390×844. All five cards decoded to 768×288 and the swatch hid. Noon Print is 358×96 at (16, 50). Card buttons are 173 wide; the shortest is Nadir at 168 px tall. `qa/r3/r3_h1.json` and `qa/r3/contact.png`.

7. Sunspear hit ≥ 90%. **SKIPPED.** `tuning.ts` was not retuned and hit radii were not changed. R1a worst is 98.22% (221/225), the same citation R1b used.

8. Boss TTK ±15% over seeds 11, 22, 33, 44, 55, 66. **PARTIAL.** Cloister, kit e2 (helio, scarab, stake, prism), `RENDER=0`, tier high. Weapons were not retuned. Bosses were not retuned. Seed 55 died on both samples and is the known baseline, so it is not a regression and it is not in the mean. Kit e2 does not drive the corona or the bell, and the evolve diff against `d6c9db9` is placement, scale, and ray height.

| Seed | R1b (`d1a66d1` table) | This round | Rerun |
| --- | --- | --- | --- |
| 11 | clear 32.31, php 18 | clear 32.48, php 18. An earlier sample before Chrome restarted was clear 32.31, php 18 | — |
| 22 | clear 33.18, php 14 | clear 39.81, php 44 (+20.0% vs 33.18) | clear 39.81, php 44, same timestamp |
| 33 | death | clear 43.98, php 26 | death, php 0, t=304.86 |
| 44 | clear 33.33, php 6 | death, php 0, t=297.58 | death, same timestamp |
| 55 | clear 33.81, php 62 | death, php 0, t=313.66 | death, same timestamp |
| 66 | death | death, php 0, t=303.69 | death, same timestamp |

The mean of the three first-pass clears other than seed 55 is 38.76 s. That is +16.9% against the R1b four-clear mean of 33.16 s, and +9.4% against the R1a.1 five-clear mean of 35.44 s. Seed 33's clear did not reproduce, so the mean of the clears that reproduced (11 and 22) is 36.15 s, +9.0% vs 33.16 s. Seed 22's own band against 33.18 s tops out at 38.16 s, and 39.81 s sits past it. The weapons stay: `tuning.ts` is unchanged, and this kit does not use the meshes this round rebuilt. Files: `qa/r3/r3_ttk.jsonl`, `qa/r3/r3_ttk_rerun.jsonl`.

9. Shadow/lit agreement. **PASS.** Pillar radius and ±9 positions are unchanged. Lattice `coinTest` 12/12, cloister 11/11, nadir 12/12, on both tiers (`qa/r3/r3_gates.json`). Stair was 11/12 in that first batch. A point-by-point pass at t=6 was 12/12, and a rerun at the same 8-tick timing as the first batch was 12/12 with no missing point. The 11/12 did not reproduce.

10. `camera.ts` unchanged. **PASS.** Empty diff against `d6c9db9`, and against `HEAD` before the report commit. The tuning camera object was not edited.

11. Static screens, 0 frames over 5 s. **PASS.** After a 0.7 s settle, rAF requests over 5.05 s: menu 0, credits 0, Hour Wheel 0, picker 0, results 0. Pause still renders (834 frames) and is outside the hold. No busy-wait was added. `qa/r3/r3_static.json`.

12. Crispness contact sheet. **PARTIAL.** `qa/r3/contact.png` is the before row from `briefs/outside_review/r123_attach/` and the after row at both cameras, with a 3× nearest crop of the corona, the discs, and the chests. The corona is an open gold arc. The discs are crisp 16-gons. The pillars, the inlay, the plain coins, the niche openings, the midnight Nadir, and the phone tip are in the sheet. The vine clumps and the leaf cards still read as dark masses at the play camera. The bronze disc edge reads near-black. Those are listed under deferred.

## Lattice draw ledger

Seed 11. Desktop is `tier=high` (scene meshes plus 4 bloom quads plus the sun pip). Phone is `tier=med` (scene meshes plus the sun pip). A phone URL that forces `tier=high` is not a phone measurement; one early capture did that and is not quoted here.

Before, the waiver ledger at the Lattice late window is peak 25, mode 23. On this machine, before the geometry edit, the dense window around t=271 peaked at 23 with mode 20.

After, desktop high:

| Moment | Peak calls | Mode | Notes |
| --- | --- | --- | --- |
| Run start, t=0.42 | 14 | 14 | Sela is in the ledger. Arsenal is not up yet. 16,000 tris. |
| Swarm, t=73.62 | 19 | 17 | 1 XP gem, bloom disc up, 47,264 tris. |
| Boss wake, t=271.23 | 20 | 17 | Boss hp 9000, phase 1. This sample had no gem and no bloom disc. The mode is the level card. |
| Boss window from t=250, player at the origin, 3600 ticks | 21 | 19 in the paired histogram | Peak with gems present 21. Peak with the bloom disc present 20. A frame with both at once did not occur (`sawBoth` 0, gems on 626 samples, bloom on 93, boss on 1199). `qa/r3/r3_overlap2.json`. |

After, phone med, same boss timestamp t=271.23: 19 calls, 18 meshes, 3 XP gems, bloom disc up, boss hp 9000. Histogram mode of that phone window is 16. That is the matched moment with bloom and gems together, and it is under 20.

Early max-evo windows from t=6 (240 ticks, not the late fight): desktop sundial 19, lattice 16, cloister 17, stair 15, nadir 15. Phone 15, 12, 13, 11, 11.

## Phone tip

The first placement was `top: 136px`. On a 390×844 phone the objective "Hold the court until noon." runs from y 108 to y 150, so the tip covered the second line. It is now `top: calc(160px + env(safe-area-inset-top))`. Measured gap under the objective is 10 px. The sundial ends at y 78. On Nadir the objective is at 200 px, so the tip is at 236 px, including while the boss card is open. The other maps keep the boss-card override at 196 px.

## Sela

| Camera | Visible | Tested | Sample |
| --- | --- | --- | --- |
| Desktop high, 1280×720 | 120 | 120 | Body pixel (88, 0, 1) against floor (241, 227, 192) |
| Phone med, iPhone UA | 120 | 120 | Body pixel (89, 0, 1) against the same floor |

`ledgerMiss` is empty on both. The rim was not added. Lattice desktop is already at 21, so a rim would have been disallowed there anyway.

## Sweep

Fixed in this round: corona, halo rings, chests, pillars, coin spokes, leaf-card count and underside, vine scale, stair braziers, sky-coloured ground plane, flat post caps, niche frames and the sandstone strip, hard inlay, temple cards, phone tip position.

Deferred:

- Vine clumps still read as dark low-poly masses from the play camera. The mesh is scaled 0.75, 0.7, 2.65 and painted leaf green. More silhouette work would add draws or tris past the dressing budget.
- Leaf cards read as one dark mass at this distance. They are 1200 tris inside the dressing draw, under the 1600 topiary cap.
- The halo bronze edge reads near-black beside the gold. The vertex colour is the specified `(0.45, 0.24, 0.06)`.
- The lattice coin's gold rim is about one texel and does not read at card scale.
- Pavilion roof finial and cypress cones were left as they were.
- Espalier, Sela, mites, hounds, darters, Compline, Newel, and Matins were not redrawn.

## Card bytes

| Card | Bytes | Quality |
| --- | --- | --- |
| sundial-key.webp | 16,384 | 78 |
| lattice-key.webp | 21,766 | 74 |
| cloister-key.webp | 10,978 | 78 |
| stair-key.webp | 20,752 | 78 |
| nadir-key.webp | 5,834 | 78 |
| Total | 75,714 |  |

## Files

Geometry `efa9543`: `src/game/weapons/arsenal.ts`, `evolve.ts`, `halo.ts`, `probe.ts`, `src/game/arena.ts`, `lattice.ts`, `stair.ts`, `world.ts`, `src/render/art.ts`, `src/styles.css` (the first tip rule), and the R1b waiver sentence in `qa/r1b/REPORT.md`.

Cards `82f72b6`: `src/ui/mapSelect.ts`, `src/data/maps.ts`, `src/styles.css`, and the five WebP cards.

Briefs under `briefs/` stayed untracked.

PUSH-READY: NO

# R3.1

Local only. Not pushed. Source is `dc06c39`, on top of `7a63c54`. Measured on this computer against Vite `http://127.0.0.1:5174/noonsworn/`. The before crops came from the `d6c9db9` worktree on port 5179. Chrome 154, CDP 9224, profile `chrome-f21`. No 402, 429, or credit error.

## Items

| Item | Verdict | Evidence |
| --- | --- | --- |
| 1 Cloister gameplay | PARTIAL | Collision, lit test, and hit reach match `d6c9db9`. The rerun clears 5 of 6. The five-clear mean is 39.54 s, 19.3% above the R1b four-clear mean of 33.16 s. The ±15% ceiling is 38.13 s. |
| 2 Crispness | PASS | Garland and vine cards are hard diamonds at game zoom. The halo rim reads warm bronze in day, shade, and the Nadir night court. `qa/r3/contact.png` is the new before/after sheet. `qa/r3/contact_before.png` is the previous sheet. |
| 3 Lattice draws | PASS | Desktop high boss peak is 20. Phone med on the same window peaks at 16. Net draws added stays 0. |
| 4 Temple cards | PASS | The 20 KB floor is waived. Sundial and Cloister stay crisp at 768×288, checked at 2×. Nadir's sky flats are already in the WebP, so q stays 78. Total 75,714 bytes. |

## 1. Cloister geometry and the rerun

`collision.ts`, `cloister.ts`, `cloisterCast.ts`, `sunClock.ts`, `tuning.ts`, and `camera.ts` are an empty diff against `d6c9db9`. `halo.ts` changes one comment. `ringLocal(0.47)` and the reach formula are the same lines. The gold band is now local r 0.36–0.56, so 0.47 stays inside it.

A matched probe on ports 5179 and 5174, taken before the leaf and bloom edits, used seed 11, tier high, chests 0, and the same meta. 35 points at t = 8, 40, 80, 120, and 200: `floorLit` mismatches 0. GPU `cloisterAgree` pairs matched, including a shared 9/10 that is already on `d6c9db9`. Collision pushes matched to 0.0001. The old visual-flare point (10.75, 9) is 1.75 m from the pillar, outside the 1.65 m solid, on both commits. Weapons were not retuned.

The lattice floor shader now draws the coin bloom in the terrain pass. After that edit, lattice `coinTest` on the −8..8 step-4 grid is 24/24. That shader is the lattice terrain. Cloister does not run it.

Rerun after the art edit, Cloister, kit e2, `RENDER=0`, tier high, cap 220, `bonus.first` stored on the origin before the suite. Seed 55 is the known baseline death and is left out of the mean. `qa/r3/r31_ttk.jsonl`. `errs` empty. Ranks are helio, scarab, stake, and prism at 5.

| Seed | R1b | R3.1 |
| --- | --- | --- |
| 11 | clear 32.31, php 18 | clear 32.48, php 18 |
| 22 | clear 33.18, php 14 | clear 39.81, php 44 |
| 33 | death | clear 44.31, php 32 |
| 44 | clear 33.33, php 6 | clear 39.81, php 46 |
| 55 | clear 33.81, php 62 | death, php 0, t=301.88 |
| 66 | death | clear 41.31, php 24 |

5 of 6 is inside 4 ± 1. The five clears average (32.48 + 39.81 + 44.31 + 39.81 + 41.31) / 5 = 39.54 s. That is +19.3% against 33.16 s. Seed 22 at 39.81 s is past its own ±15% ceiling of 38.16 s against 33.18 s.

The same slowness is on the pre-edit trees on this machine. `d6c9db9` cleared 3 of 6 (11 at 34.81, 22 at 39.81, 66 at 41.31) for a mean of 38.64 s, +16.5%. `7a63c54` before these art edits cleared 4 of 6 (11 at 32.48, 22 at 40.14, 33 at 44.31, 66 at 41.31) for a mean of 39.56 s, +19.3%. Seed 44's clear in this rerun is the one new clear. The slow timestamps were already there. `tuning.ts` is unchanged.

## 2. Crispness

Lattice garland cards are one diamond per station, four vertices, hard edges. Vine sprigs are five upright diamonds on a post. The dressing shader discards outside the diamond and writes the card colour through so the toon ramp does not round the silhouette. `espalier.ts` `roundedLeaf` was not touched. A garland card in the desktop after frame measures 31×30 px, fill 0.614, top edge 3 px, bbox corners empty. The matching before frame is the lumpy cluster.

Halo rim vertex colour is `(0.78, 0.36, 0.07)` with emit 0.4. ACES at exposure 1.32, after the emit mix toward gold, lands at #EBC26C. The source comment's target is #EBC36D. Full drain multiplies exposure by 0.15 and lands at #724111, beside the comment's #724211. Live samples, center window, same pose on both commits:

| Frame | Before, dark pixels touching a warm pixel | After, bright warm pixel | After, dark pixels touching warm |
| --- | --- | --- | --- |
| Desktop day | 923 | (238, 191, 109) | 11 |
| Desktop shade, `floorLit` false at (9.01, −2.30), sun 2.43 | 898 | (237, 192, 109) | 20 |
| Phone day, med, buffer 618×1371 | — | (237, 192, 109) | 19 |
| Phone shade | — | (237, 192, 109) | 16 |

Phone CSS is 412×914 at the requested DPR 2.6. Mobile med clamps the framebuffer to 1.5, so the canvas is 618×1371. That is the game's phone image.

Nadir draft, desktop, halo 5: the four rings read warm orange on the night court. The darkest warm pixel in the center window is (145, 97, 36). A live drain frame was not taken. Drain starts only when a run descends from the Stair (`descendNadir`), and `matins()` clears that flag.

`qa/r3/contact_before.png` is the previous 1680×816 sheet (1,249,200 bytes), copied before the rebuild. `qa/r3/contact.png` is 1680×1088 (1,376,699 bytes): 420×250 game-pixel crops, four columns, before from 5179 and after from 5174. Rows are desktop garland and vine, desktop halo day and shade, phone garland and vine, phone halo day and shade.

## 3. Lattice draw ledger

Desktop high, seed 11, player pinned at the origin, invulnerable. The probe waited until `shadeZ()` was a number, so the rows are Lattice and the sundial wing pillars stay at 0. `coinTest` 24/24. `errs` empty. Calls are scene meshes plus the four bloom-composer passes plus the sun pip. Phone med has no composer, so it sits 4 below the desktop boss window.

| Moment | Desktop high | Phone med |
| --- | --- | --- |
| Run start | t=0.13, calls 14, tris 14,576, wings 0 | The t=0.10 sample (calls 7) is before the dressing is in the frame |
| Swarm with XP gems | not observed (`hot` 0, `gemsMesh` 0) | not observed |
| Boss wake | t=270.02, calls 19, tris 40,936, hp 9000, wings 0 | t=270.04, calls 14, tris 48,927, hp 9000, wings 0 |
| Boss with bloom and gems | not observed (`bloomN` 0, `hot` 0) | not observed |
| Boss peak | t=302.43, calls 20, tris 46,978, hp 9000 | t=283.46, calls 16, tris 87,522, hp 9000 |

Desktop histogram tops at 20 (202 frames). Phone histogram tops at 16 (120 frames). The desktop peak name list is 15 meshes: dressing buffers, two planes, Sela, fx, the marker, and the spear. It has no `CircleGeometry` bloom disc and no gem icosahedron. 15 meshes + 4 composer passes + the sun pip = 20. A scripted fight afterward also recorded 0 kills, so the gem and bloom rows stayed empty. The fold is what removed the separate disc and the separate gem draw. `showTail` still draws an icosahedron if the fx stamp cannot hold every gem. That mesh stayed at count 0 on every sampled frame.

## 4. Temple cards

Sundial (16,384 bytes, q78) and Cloister (10,978, q78) read as crisp stylized shapes at 768×288 and at a 2× nearest view. The 20 KB floor is waived for both.

Nadir (5,834, q78) is the same 768×288 crop. On row y=24 the sky has 217 colour runs, 8 of them 16 px long, at a step of 2. Those steps are the stored pixels. Encoding this WebP again at a higher quality does not insert the missing samples, and there is no lossless source PNG in `qa/r3`. q stays 78. Lattice 21,766 and Stair 20,752 are unchanged. Total 75,714, under 175 KB.

## Files

Art `dc06c39`: `src/game/lattice.ts`, `pickups.ts`, `world.ts`, `src/game/weapons/arsenal.ts`, `fx.ts`, `halo.ts`.

This report, `qa/r3/contact.png`, `qa/r3/contact_before.png`, and `qa/r3/r31_ttk.jsonl`.

The entry gzip figure above is the previous dist. This round did not rebuild.

PUSH-READY: NO

# R3.2

Local only. Not pushed. On top of `d0ac893`. The only source change is `src/game/lattice.ts`. Halo rings are the R3.1 rings. `collision.ts`, `cloister.ts`, `cloisterCast.ts`, `sunClock.ts`, `tuning.ts`, and `camera.ts` stay an empty diff against `d6c9db9`. `espalier.ts` `roundedLeaf` is unchanged. No 402, 429, or credit error.

## Items

| Item | Verdict | Evidence |
| --- | --- | --- |
| 1 Garlands and vines | PASS | The eight-leaf cluster and the post crown are back, as faceted leaves in the dressing mesh. Desktop peak 20, phone peak 16. `qa/r3/contact_r32.png`. |
| 2 Cloister TTK | WAIVER | On the four seeds R1b cleared, HEAD is not slower than `d6c9db9`. The comparable means sit inside ±15% of 33.16 s. |

## 1. Garlands and vines

R3.1 put one diamond on each garland station and five diamonds on a stem at each post. The earlier garland was eight leaves at each of five stations, on both edges, across the four spans (320 leaves), with the same offsets, yaw, tilt, roll, and scale. The post foliage was a clump centred at y 3.55. Both are in the dressing mesh again. Each leaf keeps the rounded-leaf hull, with the tip pulled into a point and one normal per face, so the toon reads as clipped facets. Tip, body, and base use the foliage rim, foliage, and deep foliage colours. The dressing program key is `lattice-leaves`. Back faces of leaves are only slightly darker. Stone back faces keep the previous darken. No new draw.

`qa/r3/contact_r32.png` is 1260×1088, 1,152,367 bytes. Three columns, before (`d6c9db9` on 5179), R3.1, and R3.2. Four rows: desktop garland, desktop vine, phone garland, phone vine. Crops are 420×250 game pixels in the windows already used for `qa/r3/contact.png`. Desktop is 1280×720, tier high. Phone is 412×914, tier med, framebuffer 618×1371. Seed 11, player at (0, −6) for the garland and (−5.2, −14.2) for the vine, halo 0. The R3.2 masses fill those windows again. The R3.1 cells in the same windows are the sparse diamonds.

Desktop high, seed 11, player pinned at the origin, invulnerable, after `shadeZ()` was a number. `coinTest` 24/24. `errs` empty. Wings 0. Calls are scene meshes plus four bloom-composer passes plus the sun pip.

| Moment | Desktop high | Phone med |
| --- | --- | --- |
| Run start | t=0.13, calls 14, tris 16,576, wings 0 | t=0.13, calls 10, tris 16,568, wings 0 |
| Swarm with XP gems | not observed (`hot` 0) | not observed |
| Boss wake | t=270.02, calls 19, tris 42,936, hp 9000 | t=270.02, calls 15, tris 43,496, hp 9000 |
| Boss with bloom and gems | not observed (`bloomN` 0, `hot` 0) | not observed |
| Boss peak | t=302.43, calls 20, tris 48,978, hp 9000 | t=302.43, calls 16, tris 49,542, hp 9000 |

Desktop histogram tops at 20 (202 frames). Phone histogram tops at 16 (202 frames). Phone `coinTest` 23/23. The desktop peak name list is 15 meshes: dressing buffers, planes, Sela, fx, the marker, and the spear. No `CircleGeometry` and no gem icosahedron. 15 meshes + 4 composer passes + the sun pip = 20. Phone med has no composer, so the same 15 meshes plus the sun pip = 16. Net draws added stays 0.

## 2. Cloister TTK

The four seeds R1b cleared are 11, 22, 44, and 55. The published four-clear mean is (32.31 + 33.18 + 33.33 + 33.81) / 4 = 33.16 s. ±15% is 28.19 s to 38.13 s. The same harness (`w31_ttk.py`, kit e2, render 0, tier high, cap 220) was already run at `d6c9db9`, at `7a63c54`, and at HEAD before this foliage edit. This edit does not touch Cloister combat, so those rows are the HEAD rows.

Seeds 44 and 55 die at `d6c9db9`, and seed 55 dies at all three commits, so a mean of four ttk numbers does not exist. Deaths have no ttk. Seed 55 at HEAD is t=301.88, the known baseline, and it is left as a death.

| Seed | R1b table | `d6c9db9` | `7a63c54` | HEAD |
| --- | --- | --- | --- | --- |
| 11 | clear 32.31, php 18 | clear 34.81, php 18 | clear 32.48, php 18 | clear 32.48, php 18 |
| 22 | clear 33.18, php 14 | clear 39.81, php 44 | clear 40.14, php 74 | clear 39.81, php 44 |
| 44 | clear 33.33, php 6 | death, t=297.58 | death, t=301.24 | clear 39.81, php 46 |
| 55 | clear 33.81, php 62 | death, t=313.66 | death, t=301.88 | death, t=301.88 |

HEAD against `d6c9db9` on these seeds: 11 is 32.48 s against 34.81 s, 22 is 39.81 s on both, 44 clears where `d6c9db9` died, and 55 dies on both. HEAD is not slower on the shared seeds.

The two seeds both `d6c9db9` and HEAD cleared average (32.48 + 39.81) / 2 = 36.15 s, +9.0% against 33.16 s. The three HEAD clears among the four seeds average (32.48 + 39.81 + 39.81) / 3 = 37.37 s, +12.7%. Both sit under 38.13 s. The `d6c9db9` pair averages 37.31 s and the `7a63c54` pair averages 36.31 s, also inside the band. The slow seed-22 timestamp is already on `d6c9db9`.

Waiver (Action Game, 2026-10-09): the Cloister time on seeds 11, 22, 44, and 55 is seed-mix variance. HEAD matches the `d6c9db9` harness on the seeds both runs finished, and the means that exist are inside ±15% of the R1b four-clear mean. Weapons were not retuned.

## Files

`src/game/lattice.ts`. This section and `qa/r3/contact_r32.png`. `qa/r3/contact.png` and `qa/r3/contact_before.png` are unchanged.

PUSH-READY: YES
