# NOONSWORN M2.1 — Independent verification (live build a1dd870, feature commit 629b99d)
Tested Sep 25 2026, 3:55–5:05 PM ET. I used the qa/m2 harness (`qa/tools/run.js`) plus a new `qa/tools/verify.js` (corner, icons, perf, dynres, misc, lookdev modes) and `qa/tools/dyn2.js`. Everything ran in puppeteer-core with headful Chrome on the box.
- **The renderer is software GL** (ANGLE → Mesa llvmpipe), so all fps numbers are CPU-only.
- CDP CPU throttling slows JS only. Rasterization (bloom, fill) is not throttled, so "6× CPU" measures JS cost and the raw fps measures llvmpipe fill cost.
- Phone runs are Chrome emulation (412×915 and 915×412 at DPR 2.625, touch, Android UA), not a handset.
- Chrome devtools MCP was not used (profile lock).
- Logs: `log_*.json`, `out_*.txt`, `batchV1.out`.

**Verdict: ANOTHER ROUND.** M2.1 wired a lot of real work, but three things keep it from looking like a production game:
- A color-pipeline bug darkens every Med/High frame.
- The sky and backdrop never show.
- The audio is raw oscillator beeps.

The brief is `../../M2_2_BRIEF.md`.

## Key metrics
| Metric | M2 (74558ff) | M2.1 (a1dd870) |
|---|---|---|
| Title load, cache disabled | 277.5 KB | **400.5 KB** (JS 169.1, pillar 68.7, key art 65.9, floor 27.8, logo 22.7, inlay 22.2, sky 19.8, CSS 2.6). Limit 450 KB: PASS. Card atlas 13.2 KB, lazy |
| Console errors / page errors / 404s | 0/0/0 | **0/0/0** in all 20+ sessions |
| Desktop Med auto run, avg / worst 2 s | 59.9 / 55.6 | 59.8 / 53.1 |
| Desktop High, 400 enemies, 1× (10–12 s window) | 60 | **37.6 avg, 1% low 25.0** (4×: 35.6/26.6; 6×: 36.5/26.6). Draws 17 |
| Desktop High, full 5:00, god mode, up to 240 enemies | 59.9 / 51.8 | **46.8 avg** (≈54 early, 40–46 after 3:00); draws 16–25 |
| Phone portrait Med, 6× CPU, 250 enemies | 59.4 | **59.9 avg, 1% low 52.2**, ratio 1.50, draws 18 |
| Phone 4× CPU runs (portrait / landscape) | 59.1 | 59.4 / 58.8 |
| Low tier, 150 enemies | 59.9 | 59.7 avg, 1% low 39.9, draws 14 |
| First level-up while kiting | 9–26 s | desktop 15, 16, 17, 18 s; High 11 s; phone 11, 12, 13 s. **PASS** |
| Idle death (no movement, auto card picks) | 51/44/50 s | **118 / 52 / 23 s**; a 4th run was still alive at 1:47. **FAIL**, and the variance is huge |
| Corner camping at 3:00+ | frozen at 60/235 for 75 s | **XP flows.** Pinned at (23.6, 23.6) from 3:12 to 5:00, it went from L12 to L22. A separate pinned test logged debug xp/s 6–26 for 50+ s |
| Tris (mite / hound / Sela) | primitives | 110 / 120 / 246 |

**How I measured the 1% low:** I took 10–12 s windows (430–720 frames) from my own rAF recorder. 1% low = 1000 ÷ the mean of the slowest 1% of frame times.
- The in-game overlay's "1%" uses only the last ≤120 frames (<1 s) and picks index ceil(0.99·n)−1. At n=120 that is the **2nd-worst** frame, so a single hitch raises the average frame time but never counts in the "1%".
- That is how the build session got an impossible 1% low of 149 above an average of 146. The metric is not a real 1% low: the window is too short and it drops the worst frame.

## Suspect numbers, re-measured
- **The "lit floor 74,43,16" is not the wrong pixel.** The lit floor really is that dark on Med/High. I measured 76,45,18 as a median across 38 lit-enemy blobs in `look_high.png`. The cause is a bug: the custom bloom composite shader (`gl_FragColor = vec4(scene + bloom*uStrength, 1.0)`) writes **linear** color to the canvas with no sRGB encode and no tone mapping.
  - Proof: the same spot on Low (no post pass) is 160,124,72, and the sRGB→linear value of that is 89,51,16. The High frame is 79,47,18.
  - `compare_5_actors_color_bug.png` shows the same frame on both tiers. Every Med/High player (the default on desktop and phones) sees a dusk-brown arena instead of noon sandstone.
- **The lit contrast of 8.55:1 is overstated.** A median over the blobs is **3.6:1** (enemy 145,127,59 vs floor 76,45,18). The build session used the brightest gold pixel. On Low, where color is correct, lit mites vs lit sand are **1.15:1** in luminance: cream on sand, readable only by their outlines. Once the color bug is fixed, criterion 5 fails.
- **Desktop 1% low 149 > 146:** explained above. My measurement is High 400 @1×: 37.6 avg / 25.0 1% low on software GL.

## Acceptance criteria: my result vs the build session's claim
| # | Criterion | Build session | This QA | Evidence |
|---|---|---|---|---|
| 1 | No void; ≥90% arena/backdrop at corners | PASS | **FAIL** | Desktop/landscape: 0% cream, 0% navy. **Portrait: 37–51% of the frame is flat navy void** (the fog/clear color) at mid-arena and every wall. The build session only counted cream pixels. At desktop corners the "backdrop" is the floor texture at 8× scale, giant bricks over ~75% of the frame. `m-portrait-walls_strip.png`, `m-portrait-4x_t10.png`, `look_corner.png` |
| 2 | Pillars, inlays, sky, trim visible | FAIL (sky) | **FAIL** (agree) | Pillars, inlay medallion and trim are visible. The sky is never visible at any camera position on any device |
| 3 | ≥6 distinct icons across 2 level-ups | FAIL (5) | **PASS** | `levelup_icons_1.png` + `_2.png` show 6 distinct icons. Over 24 forced level-ups I saw 12 of 13 icons (not Heal). The Long Day icon has an opaque square backplate; the others are transparent |
| 4 | Full-bleed title, no clock, 4 sizes | PASS | **PASS** | `title_*.png`; sundial hidden at all 4 sizes (the clock still ticks while hidden). At 915×412 the Haptics toggle touches the bottom edge |
| 5 | Lit ≥3:1; shaded avg ≥25 with rim + eyes | PASS (8.55:1) | **FAIL** | Med/High 3.6:1 only because the floor is color-bugged. Low (correct color) 1.15:1. Shaded mites: mean RGB 44.5 with violet rim and pale eyes (that half passes). Shaded hounds still read as black slabs (`desk-high-full_t150.png`) |
| 6 | Bloom on Med/High, off Low, shown in overlay | PASS | **PARTIAL** | The overlay is correct. Visually, bloom is barely perceptible (only a mask of gold/gem pixels at strength 0.35), and the pass causes the linear-output bug |
| 7 | Blob shadows visible | FAIL | **FAIL** (agree) | Not visible in any frame at any tier (`crop_low_vs_high_actors.png`) |
| 8 | Every SFX fires | PASS | **PASS** | 5:00 run: spear 449, hit 4735, exposed 528, armored 3608, kill 1126, cut 66, xp 1931, level 21, hurt 194, shimmer 707, ui 1, win 1. Idle runs: death 3. **They fire, but all of them are raw oscillator tones** (see Audio) |
| 9 | Shake/haptics toggles persist | PASS | **PASS** | Both unchecked, reloaded, both still unchecked (`pause_settings.png`) |
| 10 | Dynres returns to tier max ≤8 s | FAIL | **PASS** (on 60 Hz, load removed) | Med at DPR 1.25: 0.90 → 1.25 in 8.0 s after the throttle was removed and enemies cleared; the same at DPR 1.5, up to 1.25 (fill-limited). With 200 enemies left it stays low because llvmpipe really is slow. **New bug:** High at DPR 2 stops stepping down at 1.65 while at 21 fps (`log_dynres.json`) |
| 11 | Idle death 25–35 s; first level-up ≤20 s | FAIL idle / PASS | **FAIL idle / PASS level-up** | Idle 118/52/23 s (+ one run alive at 107 s). Level-up 11–18 s |
| 12 | Corner camp 60 s at 3:00+ keeps gaining XP | FAIL (30 s) | **PASS** | 108 s pinned at the corner, +10 levels (`log_desk-high-full.json`); a pinned debug run showed xp/s > 0 throughout (`log_corner.json`) |
| 13 | No "Lvl" clipping; clock 4.5:1 | PASS | **PASS** | "Lv N" pill is clean and the clock sits on a dark plate. At 360×640 the HP bar runs under the sundial ring (`crop_hud_360_small.png`) |
| 14 | Meta/OG tags; no Node 20 CI warning | PASS | **PASS** | Live HTML has description, og:title, og:description, og:image. Run 36181824254 (a1dd870) uses checkout/setup-node/upload-pages-artifact/deploy-pages @v5 on Node 24. The only warnings are Node's internal punycode/url.parse DEP notices |
| 15 | Perf guardrails | PASS | **FAIL (box)** | Phone 6× Med 250: 59.9 / 52.2, PASS. Load 400.5 KB, PASS. Draws ≤25, PASS. **Desktop High 400: 37.6 / 25.0**, against 60 on the same harness in M2. This is a render-cost regression (full-res bloom, extra passes) and needs a real-GPU check |

Tally: build session 8 PASS / 7 FAIL. This QA: **8 PASS, 6 FAIL, 1 PARTIAL**. The set changed, not just the count: 3, 10 and 12 now pass, while 1, 5 and 15 fail.

## Specific checks
- **Actors.** Mites now read as spiky creatures (good). Sela does not read as a character from the gameplay camera: the horizontal sun disc covers her head, so she looks like an orange donut on a cone (`crop_player_low_vs_high.png`). On portrait she is about 25 css px. Hounds in shade look like black slabs, and lit hounds look like grainy lumps.
- **Sky / bloom / shadows in play:** sky no, bloom barely, shadows no.
- **"N shield" spam** still stacks dozens deep over the player in a late swarm (`desk-high-full_t285.png`). The per-enemy rate limit doesn't help when 200 enemies are involved. Damage floats also show through the level-up modal.
- **Halo discs** orbit out over the outer plane when you're at a wall.
- **Unrequested boons:** Solar Flare = heal 30 (a duplicate of Heal), Long Day = "noon beam wider" (a duplicate of Wide Noon), and Noon Bell / Searing Light repeat haste/might. The level-up screen offers two cards with the same effect under different names. The decision on these is in the brief.

## Audio (the owner hates it): inventory and diagnosis
The source is `yu()` in the bundle (audio.ts). Every sound is **one raw WebAudio oscillator** with an instant attack, an exponential decay and ±6% random pitch, run through two gains to the destination. There are no samples, filters, reverb, compression, music or ambience.

| Event | What plays now |
|---|---|
| spear | 640 Hz **square**, 70 ms |
| hit | 220 Hz triangle, 50 ms |
| exposed | 880 Hz sine, 90 ms (max 8/s) |
| armored | 90 Hz sine, 60 ms |
| kill | 520 Hz triangle, 80 ms |
| cut | 120 ms white noise + 140 Hz sine |
| xp | 480–760 Hz sine blips (max 12/s) |
| level | triangle/sine arpeggio 523/659/784 Hz |
| hurt | 160 Hz **sawtooth** |
| shimmer | 1200 Hz sine (max 4/s) |
| ui | 700 Hz square |
| death | 196 + 98 Hz |
| win | 523 + 784 Hz |

Why it sounds bad:
- Square and sawtooth waves are harsh and buzzy, and sine blips sound like a 1990s phone.
- There are no transients or texture, so nothing sounds physical (no metal, stone or cloth).
- With no variation beyond ±6% pitch, repeats grate.
- In a swarm, hit + armored alone fire about 28 times/s (4735 + 3608 in 5 min). They share one global 16-voice cap with no per-event cap, no ducking and no limiter, so the late game is a constant chirp-buzz.
- There is no music or ambience, and no volume UI (`setVolumes` exists but is never wired) or mute.

**Candidates downloaded:** `../../audio_candidates/`, 43 CC0 files, 830 KB total (SFX 266 KB, wind loop 50 KB, music loop 515 KB).
- Sources: Kenney Impact/RPG/Interface/Music-Jingles and OpenGameArt (artisticdude swishes, StarNinjas swords, Fupi bell, PWL bell dings, SketchMan3 wind, iamoneabe Desert Loop).
- Every license was verified on its source page. `LICENSES.md` maps each file to an event, and page snapshots are included.
- I could not audition them (no audio output on the box); they were chosen by source description and loudness checks.

## Visual verdict against the bar
**Not yet production quality**, and on Med/High it is arguably a step back from M2's bright frame (`compare_1_bright_arena.png`). The top "looks cheap" causes, in priority order:
1. **Color pipeline bug on Med/High.** Linear output with no sRGB/tone map turns noon sandstone into dim brown leather. Every default player sees it, and the fix is small.
2. **No world beyond the arena.**
   - Portrait shows a 40–50% navy void.
   - Corners are 75% giant-scaled floor bricks.
   - There is no sky, horizon, distant ruins, dunes or haze.
   - The camera still centers the player at the corner.
3. **The hero doesn't read, and the hounds are slabs.** Sela is a donut from above and tiny on phones.
4. **No ground contact or VFX.** No visible blob shadows; the sun rays are thin orange wires; bloom is imperceptible; there are no hit sparks or impact flashes to sell hits.
5. **UI noise in a swarm.** "N shield" stacks, damage numbers bleed through the modal, the gems are flat teal squares, and the card frames are plain dark boxes (Soulstone: ornate frames, rarity color, stats).
6. **Audio** (owner-flagged): raw oscillator beeps with no mix. This matters as much as #1.

## Best screenshots
- `compare_1_bright_arena.png`: shipped Med vs Low (correct color) vs Megabonk; the color bug in one image
- `compare_2_swarm.png`: 4:45 corner swarm (brick outer plane, shield spam, lost hero) vs DRG: Survivor
- `compare_4_phone_portrait.png`: phone portrait with the navy void vs Soulstone
- Also useful: `compare_3_levelup.png`, `compare_5_actors_color_bug.png`, `levelup_icons_1/2.png`, `m-portrait-walls_strip.png`, `m-landscape-walls_grid.png`, `look_corner.png`, `desk-high-full_t150.png`, `fps_*.png`, `dynres_med1.25_*.png`, `title_*.png`, `hud_*.png`
- Note: `contrast_mid/off.png` caught a level-up modal (the game was paused), so I used `look_high/low.png` for contrast instead.

## Not measured / caveats
- No real GPU and no real handset. The High-400 regression needs confirming on a real mid-range GPU.
- CPU throttling doesn't reach llvmpipe raster.
- Criterion 10 as written (remove the throttle, keep 200 enemies) can't pass on software GL. I verified recovery with the load removed.
- The idle test auto-picks cards (Halo first), the same as the build session. Variance is dominated by picks and spawn luck.
- The audio candidates are unauditioned.
