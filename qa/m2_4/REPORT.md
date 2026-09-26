LIVE URL: https://bryanralston.github.io/noonsworn/
REPO (SHA): c56e303c16a504fcdd85f87acc4e2eefe2c0a189
REPORT FILE: qa/m2_4/REPORT.md

DONE:
- Sun disc: removed the camera-facing cream disc and the 22 m ground pointer. A ringed sun glyph, at most 48 css px, is drawn in screen space on the edge in the sun's direction. Rim color stays under L 215 (worst-frame icon band max L 187.5).
- Dynres: while the average frame is above target × dynDown (1.1), the ratio steps down 0.1 at least every 0.4 s until the tier floor. The climb still waits for p95 ≤ target. Tier min/max are unchanged. High floor at DPR 2 is 1.00.
- Shimmer: plays are gated to one per 125 ms (8/s). Gain stays 0.18. A fresh 200-mite ring under a 24× sun sweep produced 20 marks in 3.00 s, 6.7/s.
- cut_blade_2: low-pass at 7 kHz, not boosted. Ogg peak −5.50 dBFS (was −3.46). Energy above 6 kHz 49.2% → 38.8%. Energy above 7 kHz 36.7% → 26.9%.
- hit_stone_1/2/3: EQ at 1.8 kHz and 2.8 kHz, then gain pulled so the peak matches the original. Mid-band (250 Hz–4 kHz) energy share 4.2% → 17.4%, 7.9% → 19.6%, 6.2% → 24.6%. Ogg peaks −7.71, −4.53, −5.13 dBFS.

ACCEPTANCE:
1. FAIL on the literal 0% bar. Method: 300 frames, player at (0,0), (12,12), (−12,12), (12,−12), (20,20), sun time 0..58 step 2 s, desktop 1280×720 and portrait 412×915. Flat bright = L > 215 (0.2126R+0.7152G+0.0722B) and 5×5 σ < 2.5. Counted only pixels whose camera ray hits y=0 inside the walls (|x|≤24, |z|≤24), as a percent of the frame. Desktop max 0.029% (the old disc was 12–14%). Portrait max 3.257% at (20,20), t=18 s. That frame's largest connected flat region is 0.367% of the frame, box [20,0,186,58], and the bottom 80 px (the glyph) has max L 187.5 and 0 pixels over 215. The portrait remainder is sunlit sand. Sela: project (x, 0.9, z) and sample a 17×17 patch. Occluded in 0/300 (no patch had mean L>215 and σ<2.5, and none contained the glyph rim). `sun_sweep.json`, `sun_sweep_desktop.png`, `sun_sweep_portrait.png`.
2. PASS. The rim-colored glyph (r 220–252, g 160–210, b 50–110) is in the outer 70 px on 300/300 frames (100%, need ≥80%). Rim pixel counts 191–837. A looser gold test false-matches the floor; this count does not.
3. PASS. Intel UHD 0x0000A7A8, ANGLE D3D11, 144 Hz. DPR 2, tier High, vsync target 6.944 ms. Before the load, canvas buffer 2560×1440, ratio 2.00 (`dynres_before.png`). Under 6× CPU and 200 enemies the trace shows ratio 1.8 at the first sample (the before capture had already stepped it), then 1.7, 1.6, 1.5, 1.4, 1.3, 1.2, 1.1, and 1.00 at t=3746 ms. The first frame over ~8 ms was at t=105 ms, so the floor was 3.64 s after frames exceeded the budget (limit 10 s). Ratio stayed 1.00 through t=38.6 s while frames were mostly 12 ms (about 83 fps), below 0.8×144 = 115 fps. After `horde.clear()` and CPU throttle back to 1×, the window average was 6.06 ms (165 fps) and the ratio climbed 1.0→1.7. It did not stay above the floor while the load fps was under 0.8× target. A clean rebuild (`index-CBDOGYbD.js`, probe removed) started at 2.00 and read 1.00 within 6 s with 194 enemies. `dynres_trace.csv`, `dynres_hitch.png` (ratio 1.00, 240 enemies), `dynres_after.png`.
4. Camera PASS. Live view matrices, e0=0.7071. Desktop 1280×720: pitch 54.33°, FOV 35.000°, look 29.511 m, position (12.167, 24.575, 12.167). Portrait 412×915: pitch 54.69°, FOV 45.000°, look 63.509 m, position (25.957, 52.426, 25.957). `camera_probe.json`. Console PASS: 0 errors and 0 warnings on the loads used here. Title PASS by the M2.3 method (document + JS + CSS + manifest + title art, music excluded): 406,062 B transferred. JS transfer 173,709 B (vite gzip 174,570 B). Music loop alone is 1,001,489 B and was already outside that budget. Audio peak: edited files ≤ −4.4 dBFS (ffmpeg volumedetect); one live analyser sample during the shimmer flood was −2.56 dBFS, 0 clipped. Duck UNTESTED (duck gain stayed 1; the mixer was not edited). Idle death UNTESTED (XP and spawn curves were not edited and were not re-run).
5. PASS. Proof MD5s differ: dynres_before 5ef626e4ac12dbd6e901591c7906ff4c, dynres_hitch a24b26302f00c4d07050b5cd2badf0e0, dynres_after a0b2cb4a95f38311ac06cef6eafc14a4, sun_sweep_desktop 59446e59d5ee44f889777cd5151c0dbf, sun_sweep_portrait 36d33cef03865e05936aa185cf060eb3.

KNOWN ISSUES:
- Portrait noon sand still produces flat pixels with L>215. That is the 3.257% above, not a disc over Sela.
- cut_blade_2 still carries 38.8% of its energy above 6 kHz after the 7 kHz low-pass. The slope is the ffmpeg 2-pole default.
- On this 144 Hz UHD, once the load is gone and frames beat 6.94 ms, dynres climbs again. It climbed to 1.7–1.8 here. Returning all the way to 2.00 is the existing M3 leftover.
- Duck and idle death were not remeasured.

DEVIATIONS:
- The 22 m ground pointer was removed with the disc. A gold bar inside the walls would sit on the floor and fail the same blob test.
- Down steps are 0.4 s apart (the brief allows up to 1 s) with a 0.05 s settle so the wall clock still fits in 10 s.
- `reset()` also clears settle, lastDown, and lastUp. A ratio change was zeroing the clock and leaving lastDown in the future, which froze further steps for the rest of the run.
- The four edited samples changed loudness as part of the filter. Playback gains, the compressor, the limiter, and the duck were not changed. cut_blade_2 got quieter. hit_stone peaks were matched to the pre-EQ peak, so the lows dropped and the mids rose.
- The dynres screenshots show the debug overlay and a level-80 player held at 9999 HP so a level-up or a death would not pause sampling. Those are not shipped controls.
- The measured trace was taken on a bundle that also wrote `window.__dynProbe`. That write is not in the commit. The clean bundle was checked separately and still reached ratio 1.00.

NEXT:
- If QA wants the literal 0% figure, the predicate has to ignore sunlit sand. Darkening exposure or the floor is a look change and was not done.
- A steeper low-pass would take more hiss out of cut_blade_2. The requested cutoff was 7 kHz.
- Re-measure the duck and an idle-death median on the live build if those need fresh numbers.
- M3 leftovers stay as listed in qa/m2_3_verify/M2_3_VERIFY.md, including the climb back to the DPR maximum when idle frames miss a 144 Hz target.
