# NOONSWORN M2.3: Independent QA Verify

**Build:** https://bryanralston.github.io/noonsworn/ (HEAD 24facd5, feature commit a257629, bundle `index-CqvQoibl.js`; the live audio files are byte-identical to the repo)
**Brief:** `M2_3_BRIEF.md`. **Build report:** `NOONSWORN_M2_3_REPORT.md`.
**Date:** Fri Sep 25, 2026, 8:40–9:30 PM ET. Box files only: no repo changes, no pushes, no messages.

**Harness:** `qa/tools/`
- `run.js`: 13 scripted runs
- `verify.js`: perf / lookdev / misc / dynres
- `camprobe.js`: WebGL uniform camera probe
- `contrastprobe.js` + `/tmp/contrast3.py`: true-position contrast
- `audiotest.js`: destination tap, 30 s at 400 enemies; the `M4A=1` variant forces `canPlayType(ogg)=''`
- `ducktest.js`: AudioParam hook, per-rAF gain trace
- `sunsweep.js`: **new**; sweeps the 60 s sun cycle at 2 s steps and detects flat bright blobs
- `/tmp/void.py`: void check after a 5 px blur

**Caveat:** software GL (llvmpipe). Absolute fps is box-bound, especially at DPR 2.625, where raster dominates.

## Verdict: **ANOTHER ROUND** (small: 2 player-visible fixes)
M2.3 fixed nearly everything:
- The phone portrait is clear and good-looking.
- Audio is clean (−1.31 dBFS, 0 clipped, on both the OGG and M4A paths).
- The duck works (−6 dB for about 375 ms).
- The camera is unchanged. Sela reads as a hooded figure with a round halo, and hounds are quadrupeds.

**One blocker remains**, and it was already present in M2.2 (I missed it then):
- **The sun-marker billboard is a flat, featureless cream disc floating at 14 m.** When Sela is on the camera side of the arena (SE half), the disc sits between the camera and the floor. On desktop it **covers 12–14% of the frame and hides Sela and the enemies under it.** At (12, 12) it's on screen for about 6 s of every 60 s cycle; in portrait it covers 3–4% for about 6 s per cycle. Any player will see it within the first minute, and it looks like a rendering bug. (`sun_disc_desktop_edge_t58.png`, `compare_5_sun_disc_corner.png`, `desk-auto_t60.png`)

**Also fix:** dynres step-down now **stalls at 1.75 while running 15 fps** (DPR 2, High). M2.2 reached the 1.0 floor. The "once per 2 s" step-down limit plus the new climb rule broke it. This is a one-line class of fix, and it matters for DPR-2 laptops on High.

Everything else is M3 leftovers. After these two, the verdict is SHOW BRYAN.

## Criteria: QA vs the build session
| # | Criterion | Build | QA measured | QA |
|---|---|---|---|---|
| 1 | Camera unchanged | PASS | Pitch 54.33° / 54.69°, FOV 35.00 / 45.00, look distance 29.51 / 63.51 m (desktop / portrait). Look-ahead 2.15–2.24 m at full speed, wall slide 5.55 m. Identical to M2.2. | **PASS** |
| 2 | Portrait Med/High clear | PASS | No haze on Med 0:10–1:30 (`compare_4`). The portrait Med smoothed-flat fraction is 1.2% (M2.2: 66%). The build's `portrait_high_mid` and `portrait_med_mid` proofs are **byte-identical** (same md5), so their High proof is invalid. My own High portrait probe is clear. | **PASS** |
| 3 | Void after 5 px blur ≤15% at corners; residual noise σ ≤2 | PASS (8–10%) | Desktop corners **10.5 / 12.8 / 15.2%**, portrait walls 0.8%. Residual σ 3.8–4.2 at corners (edges included; flat sand about 0.5, per the build). **But the arena share at the exact corner is still about 45%, not ≥60%.** The build measured % flat, not share. The outer sand now reads as **brown wood-grain streaks**, not dunes. | **PASS** on the metric · arena share FAIL (minor) |
| 4 | Audio clipping | PASS (−2.04) | Destination tap, 30 s at 400 enemies: **OGG −1.31 dBFS, 0 clipped. M4A −1.29 dBFS, 0 clipped.** The meter agrees (−1.3). The limiter at −3 dB still lets ~1.7 dB through because Chrome's DynamicsCompressor adds makeup gain and isn't a true peak limiter. Inaudible either way. | **PASS** |
| 5 | Duck ≥4 dB for ≥300 ms | PASS | Minimum gain 0.50 (−6 dB). 15 dips of **361–384 ms** (two short re-triggers of 46 and 170 ms). | **PASS** |
| 6 | Sliders persist; M4A fallback | partial / untested | Sliders persist after reload (music=20, sfx=60). **M4A path forced in Chrome: all 40 files fetched as .m4a, 0 bad responses, full swarm plays.** All 80 files peak ≤ −3.0 dBFS (ffmpeg volumedetect). Not tested on a real Safari device. The code still doesn't fall back to M4A if an OGG decode fails. | **PASS** (device test is a leftover) |
| 7 | Idle 25–35 s; first level-up ≤20 s median | PASS (own caps) | **Idle (card 1, no input): 35, 30, 30, 33, 33 (+30), median 33, all within 25–35.** First level-up on my 3 kites: 18, 27, 26 (median 26). Across all 9 moving runs (kites, auto, portrait, landscape, high, walls) the median is **20 s** (10–27). Idle runs level at 18–24 s. The build's 19.4 s came from holding W+D. | idle **PASS** · level-up **borderline** (median 20 over all runs; varies with the route) |
| 8 | Sela hooded + round halo; portrait ≥36 px; width ≤2.2 m | PASS | Crop: a dark-hood bell with a white rim and a round gold halo ring. Reads as hooded (`crop_sela_hound_high.png`). Portrait projected height ≈39 css px. Width 2.16 m. Scale 1.15 is what the brief asked for. Mites still visually overlap her robe (hit radius 0.45 m vs visual 1.08 m). | **PASS** |
| 9 | Hound quadruped | PASS | Long violet body with legs (`desk-auto_t30.png`). Not a box anymore. It reads as a lean beast or stick-insect, not premium. | **PASS** |
| 10 | Lit mites ≥3:1; shadows on High | untested | High **3.13:1** median (n=150), Low 3.28:1 (n=83). Shaded mite body mean RGB 48. Blob shadows visible on High. | **PASS** (lower margin than M2.2's 6.4) |
| 11 | Draws ≤25; phone 6× 250 ≥55 avg / 1% ≥45 | PASS (112 / 65 on UHD) | Draws **18** (perf) and **≤24** over all runs. Box phone 6× 250: 43.3 / 27. At 4× it's 44.6 / 30, the same as 6×, so the box is **raster-bound** (llvmpipe at ratio 1.5), not CPU-bound; the build's real-GPU 112 / 65 is the relevant number. Desktop High 400: 32 / 18.5 (box). | **PASS** (accept the real-GPU number; re-measure on a phone in M3) |
| 12 | Dynres | FAIL (1.85) | **Worse: the step-down stalls.** DPR 2 High under 6× + 200: 2.0 → 1.75, then held at 1.75 while running **14–17 fps for 20+ s**. DPR 1.25: 1.25 → 1.0 (floor), no recovery. | **FAIL** |
| 13 | Console, title load, M2.2 passes | PASS | 0 errors or warnings in 13 runs + 8 tool sessions. Title **405,665 B**. Settings persist, sundial stopped on the title, no HUD overflow at 360×640. | **PASS** |
| — | **Sun-marker disc occlusion** (new finding) | not mentioned | Covers **12–14% of the desktop frame over Sela** for about 6 s per cycle when she's on the SE half; 3–4% in portrait. | **FAIL (blocker)** |

**Score:** 11 PASS, 1 borderline (level-up), 1 FAIL (dynres), plus the new sun-disc blocker.

## Points of doubt from the build report: resolved
- **Corner %:** confirmed they measured % flat. The arena share at a corner is about 45%. Since the outer ground is now textured, this is a look issue, not void. Leftover.
- **Audio peak −2.04 vs a −3 dB limiter:** I measure −1.31 dBFS. The compressor makeup gain means "limiter −3" isn't a ceiling. Still no clipping, so it passes.
- **XP self-made caps:** idle meets the real 25–35 target (median 33, max 35). The first level-up median is 20 s across 9 moving runs and 26 s for my kite bot, so it depends on the route. That's invisible to a player (one card, a few seconds). Leftover.
- **Sela 1.15:** the brief set 1.15, and the width is within 2.2 m. Fine.
- **M4A:** works when forced in Chrome. A real Safari device is still a leftover.
- **Mites/shadows:** contrast 3.13:1, shadows visible. PASS.
- **Dynres 1.85:** worse on this box (stalls at 1.75). FAIL.
- **Duplicate proofs:** `portrait_high_mid.png` equals `portrait_med_mid.png` (identical md5), which is invalid proof. The corner copies (`corner_desktop.png` = `_sw`, and so on) are summary copies, which is fine.
- **kill_soft removed:** OK. The shaded kill plays kill_shatter at −6 dB, which is audible on phones (50% of its energy above 250 Hz).
- **Unrequested changes:**
  - Sand noise and rubble: acceptable, but the multi-octave ripple reads as wood grain. Retune in M3.
  - XP retune: both brief options used together. Acceptable.
  - Dither: now ±1/255, invisible. Fine.

## Leftovers for M3 (not blocking)
1. Dynres climb back to max (and the step-down stall, if not fixed in M2.4).
2. The outer sand looks like wood grain; use lower-frequency dunes and a paler sand tint. The corner arena share is about 45%.
3. First level-up is route-dependent (18–27 s).
4. Mites overlap Sela's robe (visual 1.08 m vs hit 0.45 m). The M2.5 character pass fixes this.
5. Safari device test and an OGG→M4A fallback on decode failure.
6. `cut_blade_2` still has 55% of its energy above 6 kHz. `hit_stone` is still 97% below 250 Hz by energy (the click layer is quiet).
7. Shimmer plays about 1,100 times per 30 s in a swarm (the voice cap holds it to 3 concurrent). Consider a rate limit.
8. Real-phone perf measurement. `mobileTarget` 33.3 ms means phones accept 30 fps before scaling down.

## Files
- **Compares:** `compare_1_bright_arena.png`, `compare_2_swarm.png`, `compare_3_levelup.png`, `compare_4_phone_portrait.png`, `compare_5_sun_disc_corner.png`
- **Blocker shots:** `sun_disc_desktop_edge_t58.png`, `sun_disc_portrait_t24.png`
- **Crop:** `crop_sela_hound_high.png`
- **Logs:** `camera_probe.json`, `log_audio.json`, `log_audio_m4a.json`, `audio_swarm_capture*.wav`, `log_duck.json`, `log_perf.json`, `log_dynres.json`, `log_contrastprobe.json`, `log_*.json` per run, `batchA.out` / `batchB.out`
