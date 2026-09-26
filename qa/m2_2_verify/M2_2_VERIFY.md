# NOONSWORN M2.2: Independent QA Verify

**Build:** https://bryanralston.github.io/noonsworn/ (HEAD 6fe3b5b, feature commit 955da54)
**Brief:** `M2_2_BRIEF.md`. **Build report:** `NOONSWORN_M2_2_REPORT.md` / `qa/m2_2/REPORT.md`.
**Date:** Fri Sep 25, 2026, 6:50–7:45 PM ET. Box files only: no repo changes, no pushes, no messages.
**Harness:** `qa/tools/`
- `run.js`: scripted bots
- `verify.js`: perf / dynres / corner / icons / misc / lookdev
- `dyn2.js`
- `audiotest.js`: output tap at the AudioDestination
- `ducktest.js`: per-frame music-bus gain trace plus AudioParam automation hooks
- `camprobe.js`: **new**; reads the live projection and view matrices from WebGL uniform uploads
- `contrastprobe.js`: **new**; freezes rAF and projects true enemy positions
- `blackframe.js`

Analysis scripts are `/tmp/void.py`, `/tmp/contrast3.py` and the compose script.

**Caveat:** the box renders with software GL (llvmpipe, CPU only). The fps numbers here are box numbers. CDP CPU throttling slows JS, not raster. All ratios and relative comparisons are valid; the absolute fps on real GPUs will be higher.

## Verdict: **ANOTHER ROUND**
Desktop color is fixed and looks like a sunlit game now (compare_1). The camera matches M2 exactly. Idle death and lit-enemy contrast pass. But the **phone view, which is Bryan's main target, is washed out by fog.** Also:
- the audio **clips at the output**, and the **music duck is dead**
- the first level-up regressed to about 26 s
- Sela reads as a tan sack and hounds read as violet boxes
- corners are still half flat orange ground

That is not the "quality production game" bar yet. All of these are fixable in one focused round (see `M2_3_BRIEF.md`).

## Criteria: QA vs the build session
| # | Criterion | Build said | QA measured | QA |
|---|---|---|---|---|
| 1 | Low vs High color parity; lit sand 200–230 | PASS | Same camera and sun at 1:00: floor patch Low (213,184,134) vs High (211,182,131), ΔRGB ≤3. Lit sand luminance about 186 (slightly under 200). | **PASS** (luminance a bit low) |
| 2 | Zero void, sky visible | PASS (mids only) | The raw 24 px σ<1.5 metric gives 0–0.6% everywhere, **but only because of the new ±0.0275 screen-space grain.** After a 5 px box filter, the flat fraction is: portrait Med 0:30 **66%**, portrait walls **68%**, desktop corners **43–50%**, desktop mid 13%. No sky is visible in any gameplay aspect (you can't see it at 55° pitch). The void is still there, just hidden by grain. | **FAIL** |
| 3 | Corner interior ≥60% | UNTESTED | Desktop corner (23.5, 23.5): about 45–55% interior (the flat-orange mask reads 48–65% outside, which overcounts lit sand, so the true number is in that range). The wall midpoint gives about 61% interior. The camera slide works: the player sits at screen (782, 238) of 1280×720 at the corner. | **FAIL** (desktop corner) |
| 4 | Sela hooded + halo; portrait ≥36 css px | UNTESTED | **Size PASS:** projected ≈51 css px tall in portrait (2.9 m extent × 17.4 px/m) and ≈113 px on desktop. **Readability FAIL:** from the gameplay camera she's an olive-tan bell or sack on tan sand. The vertical torus halo shows as a 1–2 px vertical gold line, not a halo (`crop_sela_desktop_vs_portrait.png`, `crop_bloom_shadows_high_vs_low.png`). New issue: root scale 1.45 gives a 2.9 m-wide robe on a 0.45 m hit radius, so enemies visibly overlap her before any contact. That's also why the game looks zoomed in compared with M2, although the camera is unchanged. | **FAIL** |
| 5 | Lit enemy vs lit sand ≥3:1 (≥10 blobs); shaded RGB ≥25 | UNTESTED | True-position method (freeze rAF, project each isolated mite with the live matrices, body = the 40% of pixels within 9 px that deviate most from the 18–30 px ring median). Lit mites: High **6.40:1** median (n=136, p25 4.02); Low **3.20:1** (n=158). Shaded mites: body mean RGB 45 (High) / 40 (Low). | **PASS** |
| 6 | Bloom visible; blob shadows visible | UNTESTED | Bloom is visible on High (a soft glow on XP gems and spears), though subtle. Blob shadows are clearly visible on Low and faint on High (`crop_bloom_shadows_high_vs_low.png`). | **PARTIAL** |
| 7 | Audio: no oscillators; swarm peak ≤ −1 dBFS and 0 clipped; sliders persist; music ducks | PASS (peak −20.3 dBFS) | `createOscillator` calls: **0**. Sliders: 2 on pause (and title); after reload they still read music=20 sfx=60, and bus gains follow (0.2 / 0.6). **Output tap at the destination during a 30 s, 400-enemy swarm: peak +1.24 dBFS, 38 clipped samples** (per-second peaks reach 1.154). The in-game meter reported −8.6 dB / clip 0 at the same moment, so the build's meter under-reads. **Duck:** 3 duck ramps were scheduled (0.45→0.225), but a per-frame trace of the music-bus gain dipped below 0.44 in **1 of 2,709 frames**. `world.ts` calls `setMusic/setSfx/setMuted` from localStorage every frame, which overwrites the ramp. | **FAIL** |
| 8 | 4 boons distinct | PASS | All 4 appear in the card pool with distinct texts and icons (`levelup_icons_*.png`). I didn't re-screenshot each effect. | not re-measured |
| 9 | Idle death 25–35 s (median of 5, none >40); first level-up ≤20 s (3 kites) | Idle PASS; level-up FAIL (20.3 s) | Idle (card-1 protocol, no input): **32, 33, 39, 31, 31** (+34), median 32 → PASS. First level-up on 3 kites: **26, 27, 18** (median 26). Across all 8 runs with a first level-up it's 18–30 s, median 27. M2.1 was 12–16 s with the same bot. | Idle **PASS** / level-up **FAIL** |
| 10 | Dynres steps down to the floor; recovers within 8 s | FAIL | Step-down PASS: DPR 2 High goes 2.0→1.0 under 6× + 200. Recovery: 0 of 4 configs return to tier max within 8 s (High stays at 1.0 20 s after release; Med stays 0.9–1.05 with fps 55–58). Box-limited: after release the box runs 42–58 fps, so a strict climb rule may hold correctly. Still unproven. | **FAIL** (agree) |
| 11 | Overlay 1% low: 10 s window, ≤ avg | PASS | Window is 10.0 s; 1% ≤ avg in every reading. But at High 400 the window held only 357 frames (the brief asked for ≥600). Numbers: **High 400 at 1×: avg 35.5 / 1% 29.9**; 4×: 33.4 / 20; **phone 6× 250 Med: avg 56.5 / 1% 26.2** (overlay says 28). | **PASS** (reporting) · perf guardrails **FAIL** |
| 12 | No shield floats; no floats over the modal; HUD at 360×640 | PASS | In 4 level-up captures, no floats appear over the modal. The 360×640 HUD shows no overlap. | **PASS** |
| 13 | 0 console errors or warnings; M2.1 passes hold | UNTESTED | **0** errors or warnings across 17 scripted runs (the only warning came from my own ScriptProcessor tap). XP corner drift still flows (xp/s 7–87 at 3:00+). Settings persist. Sundial stopped on the title. Title load **404,251 B** (≤450 KB). | **PASS** |
| G | Draw calls ≤25 | — | High swarm: **28–30** draws (desk-high-full, 4:00–5:00). | **FAIL** |

**Score:** 5 PASS (1, 5, 9-idle, 12, 13), 6 FAIL (2, 3, 4, 7, 9-levelup, 10), 1 PARTIAL (6), 1 not re-measured (8), plus draws and phone 1% low over budget.

## Camera (Bryan's blocker check)
Numbers come from the live GPU uniforms (`camera_probe.json`), not from reading code:

| View | Forward pitch | Yaw | vFOV | Look distance |
|---|---|---|---|---|
| Desktop 1280×720 | 54.33° | −135° | 35.00 | 29.51 m |
| Landscape 915×412 | 54.33° | −135° | 35.00 | 29.51 m |
| Portrait 412×915 (Med / Low / High) | 54.69° | −135° | 45.00 | 63.51 m |

- **This matches M2.** The code is identical to de65c64: 55° pitch toward the ground focus, look target at 0.6 m height, distance 30, and the portrait fit loop lands at 64. **No tilt or zoom change, so it's not a blocker.** The "zoomed-in" look in the side-by-side (`compare_5_camera_corner.png`) comes from bigger props: Sela is scaled 1.45× (2.9 m wide), and the pillars have wider bases and capitals.
- **Look-ahead:** at full speed the look point leads the player by **2.2–2.24 m** after 1.5 s in all three aspects. The theoretical cap is min(4.5, 5.5 × 0.55) = 3.0 m, less smoothing lag. It snaps back to 0 about 1.2 s after stopping.
- **Wall slide:** at the wall (z = −23.55) the look point holds at z = −18.0, a 5.55 m slide, as specified.
- **Portrait view ahead:** geometry is fine: about 22 m across and about 50 m of depth. Moving sideways shows about 13 m ahead with the lead. **But on Med and High (the phone default) the player sits 63.5 m from the camera, inside fog 40→78, so ≈69% fog covers her and everything around her.** The view ahead is a cream haze (`compare_4_phone_portrait.png`). Low (fog off) is clear. This is the #1 fail.
- **Black frame:** one black capture at 0:10 in the portrait batch. It didn't reproduce in 180 captures over 40 s (`blackframe.js`), so it's noted, not scored.

## Audio (analytical, the box has no speakers)
- **Files:** **42 files served** (830,610 B; 38 referenced plus 4 unused: footsteps ×2, level_bell_heavy, ui_select). That's not 78.
- **Event coverage:** every event maps to a sample set: spear, hit, armored, exposed, kill, cut (swish + blade + cloth), xp, level (bell + jingle), hurt, shimmer, ui, death, win, bell, music, and wind ambience. PASS.
- **Variation:** ±8% rate and ±3 dB per play, random pick. PASS.
- **Caps:** hit 6, armored 3, kill 6, xp 4, spear 4; total 24. The voice high-water mark was 24 for the whole swarm. `shimmer`, `exposed`, `hurt` and `level` have no per-kind cap: **shimmer fired 606 times in 30 s**, and armored fired 296 times.
- **Clipping:** the output exceeds 0 dBFS (see #7).
  - The compressor (−12 dB, 4:1, 3 ms attack) isn't a limiter.
  - Several source samples peak at +0.5 to +1.3 dBFS after decode (armored_tink, cut_swish, exposed_crack, hit_*, hurt_2, kill_*, spear_throw, shimmer, xp_pluck, cloth, footsteps). **That's my own `audio_candidates` prep error** (loudnorm on short clips). They must be re-rendered to −3 dBFS peak.
  - The build also needs a real brickwall limiter (compressor at 20:1, −3 dB, 1 ms attack, then a gain of 0.8) or a WaveShaper soft clip.
- **Duck:** broken by the per-frame setMusic overwrite. It also reads localStorage every frame.
- **Harsh or wrong samples:**
  - `cut_blade_1-3` have 77–89% of their energy above 6 kHz: hiss or scrape, harsh on phone speakers.
  - The xp pitch-walk reaches 2.16× on `xp_pluck` (centroid ≈8.7 kHz): shrill.
  - `kill_soft_1/2` sit at a ~100 Hz centroid with all energy below 250 Hz, so they're inaudible on phones. `hit_stone` has 98% of its energy below 250 Hz; it needs a 1–3 kHz click layer.
  - The swarm capture is 68% below 250 Hz and has a 2.8 kHz centroid: bass-heavy mud. That's a mix issue, not harshness.
- **Safari:** OGG Vorbis isn't supported on iOS ≤17.3, partial on 17.4–18.3, and full on 18.4+. **There are no .m4a twins.** On top of that, a failed `decodeAudioData` resets `loading`, so every tap re-fetches and re-decodes the whole set. **Risk: silent game plus repeated downloads on older iPhones.**

## Build-left items, measured
| Item | Result |
|---|---|
| Corners + landscape void | Landscape corners are about 50% flat orange outer ground, desktop corners 43–50% smoothed-flat. The grain hides this from the raw metric. **FAIL** |
| Sela from above | Big enough, but reads as a sack; the halo torus is a 1–2 px line. **FAIL** |
| Mites | Readable: dark spiky bodies with violet tips, 6.4:1 on lit sand. **PASS** |
| Glow and shadows | Bloom subtle but present. Shadows good on Low, faint on High. **PARTIAL** |
| Console | 0 errors or warnings. **PASS** |
| Dynres "stuck at 1.10" | Step-down OK; no recovery to max in any of 4 configs. **FAIL** (box-limited caveat) |
| Phone 1% low (build 35 vs 45) | QA: **26.2** (6× CPU, 250, Med, 12 s window); 4×: 59.5. **FAIL** |
| First level-up (build 20.3 s) | QA: median **26 s** (3 kites), 18–30 s over 8 runs. **FAIL** |
| Idle death (build 31 s) | QA: median **32 s** (31–39). **PASS** |

## Unrequested changes: review
1. **Grain/dither.** Two passes of `(hash − 0.5) × 0.055` (bloom composite plus world materials), σ ≈ 5–6 levels (residual std 5.2–8.4 measured). The hash uses `gl_FragCoord` with no time term, so it's **fixed-pattern screen noise** that doesn't move with the world ("dirty screen" when panning). Its stated purpose was to stop smooth areas reading as flat 24 px blocks, which is gaming the void metric. **Revert.** If banding needs it, use ≤1/255 in the final composite only.
2. **Early spawn retune** (0.7/s for 7 s, then 2.4/s; a hound at 18 s; a mite ring at 25 s). This fixed idle death but starved XP: first level-up went from 12–16 s to about 26 s. Keep the idle curve and fix the XP side.
3. **Wider violet-shell hound.** From the camera it reads as a **flat violet box or slab** (compare_2, look_corner). That's a readability regression versus the brief ("visible legs, violet rim on back ridge").
4. **cards_atlas edit.** Only slot 12 (Long Day) changed: its opaque square was made transparent (`cards_atlas_slot12.png`). The brief requested this. **OK.**
5. **Shake values.** Not swapped in M2.2: cut 0.08 and hurt 0.12 are the same as M2.1. They *are* swapped versus M2 (0.12 / 0.08), but that happened in M2.1 (629b99d), and hurt > cut is the right priority. Minor bug: the cut-hit callback assigns `shakeAmp = 0.08` instead of `max()`, so it can cancel a concurrent 0.12 hurt shake.
6. **Also noticed:**
   - `mobileTarget` went back to 33.3 ms (undoes the M2.1 fix).
   - Fog 40/78 with `far` 140 was restored "for phone 1% low". That's what creates the portrait haze, and the phone 1% low still fails.
   - Sela root scale is 1.45.

## Screenshots
- `compare_1_bright_arena.png`: Megabonk ref vs M2.1 vs M2.2 High. The color fix is real.
- `compare_2_swarm.png`: DRG Survivor ref vs M2.2 at 4:00 (hounds as violet slabs).
- `compare_3_levelup.png`: Soulstone ref vs M2.2 cards.
- `compare_4_phone_portrait.png`: M2 vs M2.2 Med (haze) vs High vs Low.
- `compare_5_camera_corner.png`: M2 vs M2.2 at 0:10 (same camera, bigger props), plus the corner.
- Crops: `crop_sela_desktop_vs_portrait.png`, `crop_bloom_shadows_high_vs_low.png`, `cards_atlas_slot12.png`, `contrast_{high,low}_t{60,75,90}.png`.
- Logs: `camera_probe.json`, `log_audio.json`, `log_duck.json`, `audio_swarm_capture.wav` (30 s output tap), `log_perf.json`, `log_dynres.json`, `log_dynres2.json`, `log_contrastprobe.json`, and `log_*.json` per run.
