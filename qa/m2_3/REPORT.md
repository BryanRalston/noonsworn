LIVE URL: https://bryanralston.github.io/noonsworn/
REPO (SHA): a257629c70c1af5a486958f09ff26433b9eda870
REPORT FILE: qa/m2_3/REPORT.md

DONE:
- Fog scales with the camera: near = look distance + 8, far = look distance + 45, on the scene fog and the floor shader. At 412×915 the player sits at 64.0 m with fog starting at 71.5 m, so her fog factor is 0. Center-patch luminance on Med and High is within 0.2% of Low.
- Screen grain of ±0.055 is gone. The bloom composite keeps a ±1/255 dither. The outer sand uses world-space dune noise (12 m and 40 m, plus 3 m, 1.2 m, and a ripple) and 16 instanced rubble pieces in the band 5–13 m outside the walls, with a darker band at the wall base.
- Audio: every shipped sample peaks at −3 dBFS or below, with AAC .m4a twins. The mixer is Master → compressor (−12 dB, 4:1) → limiter (−3 dB, 20:1) → gain 0.89 → analyser → destination. Music volume and the duck write different nodes. Settings apply at boot and on slider input. Caps: shimmer 3, exposed 3, hurt 2, level 1. XP pitch walk stops at 1.5×. Shaded kills play kill_shatter at −6 dB. A failed decode is not fetched again.
- XP: first level needs 3, and the first 15 mites grant 2 XP. The spawn curve is unchanged. Idle deaths stayed in range. Three kites leveled at a median of 19.4 s.
- Sela's root scale is 1.15. The robe is dark linen with a white rim, and the halo is a camera-facing gold torus (0.5 m, 0.06 m thick) above the hood. The hound is a long quadruped (legs, head wedge, violet ridge) instead of a wide slab. Blob shadows stay at opacity 0.55 and are 1.3× the previous footprint.
- High swarm draws were 18–20. Phone Med, 412×915 at 2.625, 6× CPU, 250 enemies: average 112, 1% low 65 over 10.0 s / 1119 frames. mobileTarget stays 33.3 ms because phones aim for 30 fps, and that target is no longer overwritten by the desktop vsync snap. Dynres steps down at most once per 2 s and climbs 0.1 every 0.5 s while p95 ≤ target. On this UHD it did not climb back to 2.00 inside 8 s.
- Cut-hit shake uses max(). Footsteps play at −18 dB while moving. ui_select and level_bell_heavy are in the sets. kill_soft is not shipped.

ACCEPTANCE:
1. PASS. WebGL uniform probe. Desktop 1280×720: pitch 54.33°, FOV 35.00°, look distance 29.51 m. Portrait 412×915: pitch 54.69°, FOV 45.00°, look distance 63.51 m. `camera_probe.json`.
2. PASS. Portrait look distance 63.51 m, fog near 71.51 m, distance to the player 64.0 m, fog factor 0. Center patch luminance: Med 175.2, High 175.2, Low 174.9 (0.2% of Low).
3. PASS. After a 5 px box blur, the worst 24 px corner region was 10.0% flat (portrait sw, 412×915), 8.0% (desktop sw, 1280×720), and 0% (landscape). 3×3 median residual σ was 0.51 on the outer sand and 0.85 on the floor.
4. PASS. 30 s with about 400 enemies, analyser on the destination input, held max: peak −2.04 dBFS, 0 samples at 1.0. The overlay meter is that same reading.
5. PASS. Isolated hurt, duck gain sampled every 30 ms (`duck_trace.csv`). Minimum 0.50 (−6.0 dB). Gain stayed ≤ 0.63 from 91 ms through 391 ms. Level-up calls the same duck.
6. M4A twins: 40 files in `public/assets/audio/`, chosen when `canPlayType('audio/ogg; codecs=vorbis')` is empty. Slider keys are unchanged and are applied on input, not per frame. A reload of the sliders was not repeated this pass. Safari 17 on a device was not played. UNTESTED for the device playback.
7. PASS. Idle, card 1, no movement, five runs: 33.77, 33.87, 34.65, 32.98, 39.00 s. Median 33.87 s, none above 40 s. Kites holding W+D: 16.90, 23.93, 19.43 s. Median 19.43 s, none above 24 s. Game clock `time()`.
8. PASS for the crop and the mesh width. `sela_gameplay_crop.png` shows a hood, a round gold halo, and the blade. Lathe radius 0.94 at scale 1.15 is 2.16 m across. Portrait css-pixel height was not re-projected this pass.
9. PASS. `hound_gameplay_crop.png` shows a long body, a head, and four legs. Mesh bounds 2.28 m long by 0.70 m wide (ratio 3.3).
10. UNTESTED as a new contrast sample. The lit-mite branch of the shared shader was not edited (prior QA median was 6.40:1). Shadow opacity is 0.55 and the footprint is 1.3× the previous scales. `shadows_high_crop.png`.
11. PASS. High, about 400 enemies: draws 18 and 20. Phone 412×915, device scale 2.625, iPhone UA, Med, 6× CPU, 250 enemies, Intel UHD: average 112, 1% low 65, window 10.0 s / 1119 frames. That window was taken before the final sand-ripple octaves.
12. FAIL. Desktop DPR 2, High, started at ratio 2.00. Under 8× CPU and 400 enemies it fell to 1.85. After the enemies were cleared and the CPU throttle returned to 1×, ratio was still 1.85 at 8.2 s. The idle frame was 12.1 ms and the vsync target was 6.94 ms, so p95 stayed above the target.
13. PASS for console on the loads used here: the captured `console.error` / `console.warn` list was empty. Title script gzip is 174,421 bytes. The art set is unchanged and is still outside the audio download, so the first load stays under 450 KB. XP corner drift was not remeasured.

AUDIO:
- Re-rendered ogg and new m4a twins, peak ≤ −3 dBFS after encode (`volumedetect`). `cut_blade` low-passed at 6 kHz. `hit_stone` mixed with a 2.2 kHz click. `kill_soft` is not shipped; shaded kills use `kill_shatter` at −6 dB.
- Swarm, destination analyser, 30 s, ~400 enemies: peak −2.04 dBFS, clipped 0, voice high-water 24.
- Duck trace minimum gain 0.50. See `duck_trace.csv`.

KNOWN ISSUES:
- Dynres did not return from 1.85 to the DPR-2 maximum of 2.00 within 8.2 s. The idle frame on this UHD was 12.1 ms against a 6.94 ms desktop target.
- One idle run died at 39.00 s. The median was 33.87 s and none exceeded 40 s.
- Portrait css-pixel height, lit-mite contrast, slider reload, and Safari 17 playback were not remeasured.
- The phone 1% low window was recorded before the last sand-ripple edit.

DEVIATIONS:
- Bloom composite keeps a ±1/255 dither. The ±0.055 screen grain is removed.
- Outer sand adds 3 m and 1.2 m noise plus a world-space ripple on top of the 12 m and 40 m dunes, so a 24 px block after the blur is not flat.
- Dynres climbs by 0.1, once per 0.5 s. A 0.05 step cannot cover a drop of 1.0 inside 8 s at that interval. Step-down waits 2 s between resizes.
- Phones keep `mobileTarget` 33.3 ms. The desktop vsync snap no longer overwrites it.
- First level needs 3 XP, and the first 15 mites grant 2 XP. Both are the brief's XP options, used together. The spawn curve was not changed.
- Sela's hem radius is 0.94 so the 1.15 scale stays within 2.2 m. The fresnel rim is 0.72.
- The hound telegraph is triangles in the hound mesh, discarded unless that hound is telegraphing. Walls and trim are one mesh. The sun disc and the ground pointer are one mesh. The sky cap is merged into the sky.
- `kill_soft` is not in `public/assets/audio/`. Footsteps, `ui_select`, and `level_bell_heavy` are played.
- `window.__noonsworn.meter()` reads the destination analyser. It is the same object the overlay already printed.

NEXT:
- On this 144 Hz UHD, bloom at ratio 2.00 costs about 12 ms, so a climb rule that waits for 6.94 ms never returns to the tier max.
- Play the m4a path on an iPhone 17 or older Safari.
- Re-project Sela's portrait css height and re-sample lit-mite contrast on this camera.
