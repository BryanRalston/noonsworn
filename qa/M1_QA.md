# NOONSWORN M1 — QA + game-feel review

*Build tested: live https://bryanralston.github.io/noonsworn/ (Feature Map says `v0.1.0 · c112d12`). Date: Fri 25 Sep 2026, 12:20–13:40 ET. Tester: QA agent (Bryan did not test).*

## 0. How this was tested (read this before the numbers)

- **Tooling:** the `user-Chrome-devtools` MCP server would not start. A stale Chrome from an older MCP instance (PID 174115, started Thu 24 Sep 08:55 ET) holds the lock on its profile, so every call returned "browser is already running". I did not kill it because it may belong to another agent. Instead I drove the box's Chrome through **puppeteer-core + CDP**, which covers the same ground: device emulation, CPU throttling, tracing, screenshots, console and network capture. I ran Lighthouse from its CLI. The harness is in `qa/tools/` (`run.js` plays runs, `perf.js` measures throttled fps, `misc.js` covers tier spoofing, UI and network, `touchtest.js` checks touch, `juice.js` grabs close-ups). Each run's raw log is `qa/log_<label>.json`.
- **GPU caveat:** the box has no GPU. WebGL runs on **llvmpipe**, a software renderer (`ANGLE (Mesa, llvmpipe (LLVM 19.1.7 256 bits))`) on 8 CPU cores. The fps numbers show CPU/JS cost and a pessimistic software fill rate. They are **not** a stand-in for an Adreno or Mali GPU. Chrome's CPU throttle slows the page's main thread but not the GPU process. I confirmed the throttle is real: a fixed JS loop took 38 / 151 / 220 / 386 ms at 1× / 4× / 6× / 10×.
- **Play:** a scripted bot held keys, or sent touch pointer events, for 60–300 s per run. It kites away from enemies, fires the Noon Cut when 4+ enemies are within 4 m, and picks cards (Halo > Sunspear > Might > …). I also ran an "idle" bot that never moves, to model a new player who hesitates, and a god-mode run to reach 5:00 and the enemy cap.

## 1. Measured numbers

### 1.1 Frame rate, draw calls, triangles

| Run (label) | Viewport | CPU | Tier (how set) | Avg fps | Worst 2 s window | Enemies seen | Draw calls | Tris | Pixel ratio |
|---|---|---|---|---|---|---|---|---|---|
| desk-auto | 1280×720 @1 | 1× | Low (auto: llvmpipe) | 60.0 | 58.9 | ≤135 | 6–15 | ≤3.3k | 1.0 (0.6 in a repeat run, see B4) |
| desk-med | 1280×720 @1 | 1× | Med (`?tier=med`) | 59.9 | 57.9 | ≤61 (bot died 0:33) | 5–10 | ≤1.8k | 1.25 |
| desk-high-full (5:00, god mode) | 1280×720 @1 | 1× | High (`?tier=high`) | 59.9 | 54.9 (first 2 s) | **399** at 4:58 | 7–12 | 15.8k | **dropped to 0.8 at 0:33 and stayed** |
| perf high stress | 1280×720 @1 | 1/4/6/10× | High | 60.0 / 60.0 / 60.0 / 59.7 | p99 16.8 ms | 398–400 | 3–8 | 5.4–5.6k | 1.0 → 0.8 |
| m-portrait-4x | 412×915 @2.625, touch, Android UA | 4× | Low (auto) | 59.7 | 57.7 | ≤74 | 4–10 | ≤1.8k | 1.0 (= 412×915 px on a ~1080×2400 screen) |
| m-portrait-6x (+stress to cap) | 412×915 @2.625 | 6× | Low (auto) | 59.9 | 57.5 | **150/150** | 4–10 | 2.5–2.7k | 1.0 |
| m-landscape-4x | 915×412 @2.625 | 4× | Low (auto) | 59.5 | 57.5 | ≤79 | 4–10 | ≤1.7k | 1.0 |

- **Trace** (desktop, 6× CPU, 400 enemies, 5 s; `qa/trace_desk_6x.json.gz`): game rAF callback p95 **2.1 ms**, max 8.7 ms. 79 GC events, 65 ms total, largest pause 13 ms (a visible hitch on a 60 Hz display).
- **Takeaway:** the simulation is very cheap. Even at 10× throttle with 400 enemies, the main thread holds 60 fps. Draw calls (≤15) and triangles (≤16k) are about 10–30× under budget. **There is plenty of headroom for real art, lighting and post.** The real risk on phones is GPU fill rate at higher pixel ratios. That needs a real-device check, which I can't do here.

### 1.2 Load
- **3 requests, 162 KB transferred:** JS 159,277 B gzip (606 KB raw), CSS 2,078 B, HTML 816 B. No fonts, images or audio. Page load took 105–245 ms from the box.
- **Lighthouse mobile** (simulated slow 4G + 4× CPU): Performance **95**, FCP / LCP / TTI **2.2 s**, TBT 0 ms, Speed Index 3.5 s, Accessibility 87, Best Practices 100, SEO 100. Flags: forced reflow, `user-scalable=no`, 61 KB of unused JS, short cache lifetime (`max-age=600`, from GitHub Pages). Report: `qa/lighthouse_mobile.json`.
- **Headers:** no COOP/COEP; `crossOriginIsolated=false`; gzip on. No third-party requests. ✅

### 1.3 Stability
- **0 console errors or warnings** across every run: about 25 minutes of play, 13+ restarts, and all tiers.
- **Restart without reload works:** R key and a tap both restart. Across 13 consecutive restarts `renderer.info.memory` stayed flat at 10 geometries / 0 textures. ✅
- Pause (Esc) freezes the sun and the sim ✅. The Feature Map (M) is accurate for M1 ✅ (`qa/featuremap.png`). `Math.random` does not appear in `src/game/*` ✅.

### 1.4 Tier auto-detect (renderer string spoofed through `WEBGL_debug_renderer_info`; the box itself runs at 60 fps, so the benchmark passes every time)

| Renderer string | Result after the 2 s benchmark | Correct? |
|---|---|---|
| Intel UHD 620 (desktop) | **Low**, ratio 1.0 | ❌ Should reach Med. The benchmark can only *raise* Med → High, never Low → Med |
| Intel Iris Xe (desktop) | Med 1.25 | ✅ (could be High at 60 fps) |
| RTX 3060 (desktop) | High | ✅ |
| Adreno 619 (phone) | Low | ✅ |
| Mali-G57 (phone) | Low | ✅ |
| **Mali-G710 (phone)** | **Low** | ❌ The regex `/mali-g[567]/` catches G710/G715/G720 and G610/G615, all current mid-to-high-end GPUs |
| Adreno 740 (phone) | Med | ✅ |
| llvmpipe (box) | Low | ✅ |

### 1.5 Gameplay metrics
- **Idle new player dies at 0:16–0:20** in 13 of 13 runs (mean about 17.5 s).
- **Kiting bot deaths:** 0:33 (Med), 1:16 and 1:30 (Low desktop), 0:53 (touch portrait). *(`log_desk-auto.json` holds the 1:16 repeat run; the screenshots are from the 1:30 run. The landscape touch run's early death (0:31) came from a harness bug, since fixed, that released the stick on every Cut tap, so only its fps numbers count.)*
- **First level-up at 0:22–0:40** on desktop and 0:24 on touch. Kills at 10 s: 7–10. The opening is slow and quiet.
- **XP starvation:** on Med, with god mode, XP collection **stopped entirely at 2:33** once the XP pool filled (600/600). The player was stuck at level 15 through 5:00 despite about 7,000 more kills (see B1).
- About 46% of the floor is lit (CPU grid sample). The percentage of enemies Exposed swings from 0% to 97% over each orbit.

## 2. Bug list (severity: S1 = blocks the quality bar, S2 = major, S3 = minor)

| # | Sev | Bug | Repro | Evidence |
|---|---|---|---|---|
| B1 | S1 | **XP stops once the XP pool is full.** At cap, new drops merge into the *nearest existing* shard, which is usually a stale shard far away that the player never visits, so XP collection drops to zero. | `?tier=med&debug=1`, survive about 2:30 (or god-mode). Watch `xp 600/600` in the overlay: level and XP freeze. | `log_diag-xp.json` |
| B2 | S1 | **Portrait camera shows only about 12 m horizontally** (portrait FOV 45° is *vertical*, so at aspect 0.45 the horizontal FOV is about 21°). With the ±14 m follow clamp, **the player walks off-screen**. | 412×915 portrait: walk toward any side wall for 3 s. | `m-portrait-4x_t20.png`, `_t45.png`, `_dead_run1.png` (player not visible) |
| B3 | S2 | **The camera follow clamp (±14 m) lets the player reach the screen edge** on desktop too: under the HUD at the top, cut off at the bottom. You can't see what's behind you near walls. | Desktop: walk to the +x/+z corner. | `desk-med_t20.png`, `desk-auto_levelup.png`, `desk-high-full_t285.png` |
| B4 | S2 | **Dynres ratchets down and never recovers.** (a) After a step the 0.5 s window isn't cleared, so one hitch drops a step on every following frame (1.0 → 0.6 within a few frames). (b) Raising needs avg < 0.8 × 16.6 = 13.3 ms, which a 60 Hz vsync display (16.7 ms) can never reach. | `?tier=high`, start a run or press Spawn 50: ratio 1.0 → 0.8 permanently while fps stays at 60. | `perf_desk_tier_high.json`, `log_desk-high-full.json` |
| B5 | S2 | **Tier detection:** Intel UHD stuck on Low (the known issue; the benchmark can't raise from Low); Mali-G6xx/G7xx misclassified as Low; **Low's max pixel ratio of 1.0 renders phones at CSS resolution** (about 0.38× native on a 2.6 DPR phone), so the image is soft and fails "looks sharp". | See §1.4. | `misc.js` output |
| B6 | S2 | **Difficulty depends on the quality tier.** The director's minimum count ramps to the *tier cap* (150 Low → 400 High), so desktop High faces 2.7× the horde of a phone. | Compare enemy counts at 4:30 on Low vs High. | `log_desk-high-full.json` |
| B7 | S2 | **The hound telegraph reads white, not magenta, on lit floor** (additive magenta on gold saturates to white). The danger color disappears exactly where fights happen. | Survive to 0:50, get a hound in the beam. | `juice_hound_telegraph.png` |
| B8 | S2 | **Exposed enemies are *less* visible than Armored ones:** a goldHot tint on a gold floor gives khaki "rocks" that blend into the sand. The enemies you *should* hit look like floor debris. | Any lit area. | `desk-auto_t30.png`, `desk-med_t20.png` |
| B9 | S2 | **The player is lost in the swarm:** a linen capsule under Lambert shading reads grey-beige on sandstone, with no outline, ring or shadow blob. | Any late-wave shot. | `closeup_player.png`, `desk-high-full_t285.png` |
| B10 | S3 | Any tap on the death/clear screen **restarts instantly** (no delay), so accidental restarts on touch are likely. The Cut button and sundial stay visible on end screens. | Die on touch, tap. | `m-portrait-4x_dead_run1.png` |
| B11 | S3 | HUD overlap: "Lv N" sits under the sundial ring. At 412 px the HP number collides with the ring. The kill counter (goldHot on sand) is barely readable. | 412×915. | `m-portrait-4x_t45.png` |
| B12 | S3 | Level-up says "Press 1, 2, or 3" on touch. `<p>` text falls back to a **serif** font (body has no font-family). | Touch level-up, title screen. | `m-portrait-4x_levelup.png` |
| B13 | S3 | The title screen shows the 100 benchmark mites as a black grid (looks like a glitch). | Load the title. | `desk-auto_title.png`, `m-portrait-4x_title.png` |
| B14 | S3 | Halo Discs use an unrotated `CircleGeometry`, so they stand vertical and read as flat yellow "pac-man" blobs. | Take Halo Discs. | `desk-auto_t60.png` |
| B15 | S3 | The sun marker (gold sphere at 6 m) looks like a random floating blob. The sun pointer line is thin and unreadable. | Any. | `desk-med_t20.png` |
| B16 | S3 | Forced reflow (Lighthouse): the HUD writes style/text every frame even when nothing changed; touch `layout()` reads `getBoundingClientRect` on pointerdown. | Lighthouse. | `lighthouse_mobile.json` |
| B17 | S3 | 13 ms GC pauses at 400 enemies (small per-frame allocations, e.g. `const face = {x,z}` in `updateCut`). | Trace. | `trace_desk_6x.json.gz` |

Verified OK: touch stick moves the player, the Cut button dashes exactly 6.00 m, a right-side up-flick cuts screen-up, multi-touch pointer routing works (`touchtest.js`), no scroll or zoom, pause and visibility pause work, 0 errors.

## 3. Game-feel critique, ranked by impact on the quality bar
*(Bar: feels good in the first 30 s, looks sharp and smooth on a mid-range phone, makes you want another run.)*

1. **The first 30 s are quiet, then suddenly lethal.** One spear every 1.1 s, 7–10 kills at 10 s, first level-up at 22–40 s, and an idle player dies at about 17 s. There's no power fantasy early and no forgiveness while learning. *Fix:* first level at about 8 s (xpToNext(1) ≈ 5), a second weapon offered by about 30 s, a gentler contact/density ramp for the first 45 s, Sunspear cooldown 0.8 s at L1.
2. **The Shadow-Clock isn't taught and doesn't read at a glance.** The beam and pillar shadows are clear on the floor (good), but nothing tells you that gold floor = double damage. Lit enemies turn khaki and blend in (B8), there are no damage numbers, and Armored hits look the same as Exposed ones. *Fix:* first-run hint ("Fight in the SUN — enemies take ×2"), big warm crit numbers and a gold rim/crack flash for Exposed hits, small grey "armored" ticks in shade, a light-entry "shimmer" pop plus stagger stars.
3. **Phone presentation fails** (B2, B5): the player goes off-screen in portrait, rendering is soft at DPR 1.0, and the HUD overlaps. That's the owner's primary platform.
4. **No juice:** no sound at all, hit flash 80 ms only, hitstop only on Cuts that hit 5+, a thin ribbon, no death bursts (enemies just shrink), no pickup sparkle/sound, no level-up fanfare, no player-hurt vignette. Kills feel weightless.
5. **Weak readability of actors** (B8, B9, B7): the player has no silhouette pop, enemies are black cones and bricks, the telegraph goes white. In a 300-enemy swarm you can't find yourself.
6. **The ramp is flat, then a wall:** a linear spawn rate, the hour-pack burst at 1:00 kills weak builds, the ramp depends on tier (B6), and XP starvation after about 2:30 (B1) removes the build fantasy just when it should peak.
7. **Level-up cards are text-only jargon** ("Beam half-angle +4°"), with no icons, rarity or synergy hint, and a keyboard hint on touch.
8. **End screens are flat:** "THE DAY IS HELD" over a frozen horde, no celebration, no stats breakdown, no best time, no "one more run" pull. Death has no slow-mo or beat.
9. **Greybox look:** plain cylinders, cream slab walls dominating the foreground, flat Lambert shading, no tonemapping, bloom or AO. It doesn't yet look like a product (see the M2 art pass).

## 4. Screenshot index (all in `qa/`)
- Title: `desk-auto_title.png`, `m-portrait-4x_title.png`
- Early play: `desk-auto_t3.png`, `desk-auto_t10.png`, `desk-auto_t30.png`, `m-portrait-4x_t5.png`, `m-landscape-4x_t4.png`, `m-landscape-4x_t15.png`
- Player off-screen / edge: `m-portrait-4x_t20.png`, `m-portrait-4x_t45.png`, `desk-med_t20.png`
- Level-up: `desk-auto_levelup.png`, `m-portrait-4x_levelup.png`
- Mid/late swarm: `desk-auto_t60.png`, `desk-high-full_t120.png` … `_t285.png`, `m-portrait-6x_t30.png`
- Juice: `juice_cut0-2.png`, `juice_hound_telegraph.png`, `closeup_player.png`
- End screens: `desk-auto_dead_run1.png`, `m-portrait-4x_dead_run1.png`, `desk-high-full_clear_run1.png`
- UI: `featuremap.png`, `pause.png`, `touch_test.png`
