# NOONSWORN: M2.3 Brief, "Clear the haze"

**For:** the same Grok Build session · repo `C:\Users\bryma\dev\noonsworn`
**Base:** live M2.2 (HEAD 6fe3b5b, feature commit 955da54)
**Findings:** `qa/m2_2_verify/M2_2_VERIFY.md`. Copy that folder into the repo as reference.

## Why this round exists
M2.2 fixed desktop color, and the camera matches M2 exactly. Independent QA scored it **5 PASS / 6 FAIL / 1 PARTIAL**. The fails are narrow but visible to Bryan on his phone:
- The portrait view (Med/High, the phone default) is **≈69% fog haze**.
- Audio **clips at the output**, and the **music duck never happens**.
- First level-up regressed to **≈26 s**.
- Sela reads as a sack, and hounds read as violet boxes.
- Corners are half flat orange ground, hidden from the metric by a new screen grain.

**Camera is frozen.** Pitch 55°, yaw 45°, distance 30 / 64 (portrait fit), FOV 35 / 45, lead ≤4.5 m and slide ≤6 m stay exactly as they are. Any change to these constants is an automatic fail. Bryan rejected the M2.1 camera.

**Out of scope:** new features, new art generation, and balance changes not listed here.

## Work items (in priority order)

### 1. Portrait fog (P0)
- Fog must scale with camera distance: `fog.near = camDist + 8`, `fog.far = camDist + 45`. Do the same for the floor shader's `smoothstep(40.0, 78.0, …)` via uniforms. Keep `camera.far ≥ camDist + 60`.
- At 412×915 Med/High, the player and a 15 m radius around her must have fog factor 0.
- Proof: `portrait_med_mid.png`, `portrait_high_mid.png`. Mean luminance and a smoothed-σ map must match the Low capture within 10%.

### 2. Remove the screen grain; fix the void honestly (P0)
- Delete the two `(hash − 0.5) × 0.055` grain injections (the bloom composite and the world materials). If banding shows, use ≤1/255 dither in the final composite only.
- QA will now run the void metric **after a 5 px box blur.** The target is ≤15% flat blocks at any corner (desktop, landscape and portrait), measured on corners and edges.
- **Outer ground:** break up the flat orange field beyond the walls. Add dune-noise tint (2 octaves, 12 m and 40 m scale). Scatter 12–20 instanced rubble and fallen-column pieces with 1 shared material, within 4–14 m outside the walls. Add a darker sand band at the wall base. That's +1–2 draw calls at most.
- A sky isn't required anymore (the camera can't see it at 55°). Don't tilt the camera to get it.

### 3. Audio: output clipping and the dead duck (P0)
- **Duck:** remove the per-frame `setMusic/setSfx/setMuted` calls in `world.ts` (~lines 781–783). Apply settings only on slider `input` events and at boot. Keep a separate `duckGain` node between the music bus and master, so user volume and duck never write the same param.
- **Limiter:** after the compressor, add a true ceiling: a second `DynamicsCompressor` (threshold −3 dB, ratio 20, knee 0, attack 0.001, release 0.05) followed by a gain of 0.89. Or add a `WaveShaper` soft clip.
- **Assets:**
  - Re-render every SFX to **−3 dBFS peak**. The QA candidates overshot to +1.3 dBFS; that's QA's error, and it must be fixed here.
  - Replace `cut_blade_1-3` (77–89% of energy above 6 kHz) with softer blade layers from the same Kenney packs, or low-pass them at 6 kHz.
  - Cap the xp pitch-walk at 1.5×.
  - Add a 1–3 kHz click layer to `hit_stone`, or swap it. Drop `kill_soft` in favor of `kill_shatter` at −6 dB (the soft kill sits below 250 Hz and is inaudible on phones).
- **Caps:** shimmer 3, exposed 3, hurt 2, level 1. Shimmer fired 606 times in a 30 s swarm.
- **Meter:** the overlay meter must read the same point QA taps (the input to `destination`), sampling `getFloatTimeDomainData` every frame and holding the max. It currently reports −8.6 dB while the output hits +1.24 dBFS.
- **Safari:**
  - Ship AAC `.m4a` twins and select the format with `canPlayType('audio/ogg; codecs=vorbis')`.
  - If `decodeAudioData` fails, mark that file failed and never re-fetch it (today every tap re-downloads the whole set).

### 4. First level-up ≤20 s without breaking idle death (P1)
- Keep the idle curve (median 32 s passes). Change only XP: set `xp.early1` 5 → 3, or give the first 15 mites of the run 2 XP each.
- Test protocol: 3 kiting runs plus 5 idle runs (card 1, no input). The first level-up median must be ≤20 s and none >24 s. Idle median 25–35 s, none >40.

### 5. Actor readability (P1)
- **Sela:**
  - Reduce the root scale from 1.45 to **1.15**. Today her visual width is 2.9 m on a 0.45 m hit radius, so enemies overlap her before contact, and the frame looks zoomed in.
  - Raise contrast against the sand: a darker linen (value ≤0.35) plus the white rim.
  - Replace the vertical torus halo with a **camera-facing ring**: a billboarded 0.5 m ring, 0.06 m thick, gold, bloom source, above and behind the hood. It must read as a circle from 55°.
  - Target: at least 24 px tall on desktop, and still ≥36 css px in portrait.
- **Shade Hound:** it reads as a violet box.
  - Revert the wider slab body.
  - Build a low quadruped silhouette: an elongated body (length:width at least 2:1), 4 visible legs, a head wedge, and a violet emissive back-ridge line.
  - Blind test: 3 of 3 viewers say "dog or beast" from `compare_2`-style crops.
- **Blob shadows on High:** opacity 0.55 and 1.3× footprint, matching Low. They must be visible in a High crop.

### 6. Performance (P1)
- **Draw calls:** ≤25 on High in the 400 swarm (28–30 today). Merge the hound telegraph and hound meshes, or fold the sun-ray quads into one mesh.
- **Phone 1% low:** ≥45 at 412×915 @2.625, 6× CPU, Med, 250 enemies (QA measured 26.2). Profile the long frames: GC from per-frame allocations (the localStorage reads in item 3 are part of this) and dynres resizes. Stop resizing more than once per 2 s.
- **Dynres recovery:** after a load spike ends, climb one step per 0.5 s while p95 ≤ target, until tier max. Prove it on a real device (the QA box is software GL).
- `mobileTarget`: document why it's 33.3 or restore 16.6. Don't leave it as an unexplained revert.

### 7. Minor
- The cut-hit shake must use `shakeAmp = max(shakeAmp, 0.08)`, not a plain assignment.
- Remove the 4 unused audio files from the build, or wire them (footsteps at −18 dB while moving).
- Correct the report: 42 audio files, not 78.

## Acceptance criteria (all measurable)
1. **Camera unchanged:** the WebGL projection/view probe (`qa/tools/camprobe.js` method) reads forward pitch 54.33° / 54.69°, FOV 35 / 45 and look distance 29.51 / 63.51 m (±0.1) on desktop and portrait.
2. **Portrait Med/High clear:** fog factor at the player is 0. Mean luminance is within 10% of Low at the same spot.
3. **Void after blur:** with 5 px box blur, 24 px blocks with σ < 1.5 cover ≤15% at the 4 corners in 1280×720, 915×412 and 412×915. The raw per-pixel noise σ (3×3 median residual) is ≤2 levels.
4. **Audio clipping:** a 30 s capture tapped at the destination input during a 400-enemy swarm gives peak ≤ −1 dBFS and 0 samples ≥1.0. The overlay meter agrees within 1 dB.
5. **Audio duck:** a per-frame trace of the music-bus output gain drops ≥4 dB for ≥300 ms on every level-up and hurt (QA hooks AudioParam and samples every rAF).
6. **Audio persistence and Safari:** sliders and Mute persist after reload (still passing). M4A twins are served, and Safari 17.0 plays sound (real device or BrowserStack video).
7. **XP curve:** first level-up ≤20 s median of 3 kites (none >24 s). Idle death median 25–35 s over 5 runs, none >40.
8. **Sela:** reads as a hooded figure with a round halo in a 1280×720 gameplay crop. Portrait ≥36 css px. Visual width ≤2.2 m.
9. **Hound:** reads as a quadruped in a gameplay crop. Its silhouette length:width is ≥2:1.
10. **Contrast holds:** lit mites ≥3:1 median (QA true-position method, n ≥ 10). Shadows visible on High.
11. **Perf:** ≤25 draws on High 400. Phone 6× 250: avg ≥55, 1% low ≥45 (report both from the 10 s overlay, ≥600 frames).
12. **Dynres:** returns to tier max within 8 s after the load is removed (real hardware log).
13. **0 console errors or warnings.** Title ≤450 KB. All M2.2 passes still hold (color parity, idle death, contrast, settings, XP corner drift, icons).

## Proof you must capture (`qa/m2_3/`, commit it)
- `portrait_{med,high,low}_mid.png`, `corner_{desktop,landscape,portrait}.png` (no grain)
- `audio_capture_swarm.wav` + `audio_peak.png`, `duck_trace.csv`
- `sela_gameplay_crop.png`, `hound_gameplay_crop.png`, `shadows_high_crop.png`
- `fps_desktop_high_400.png`, `fps_phone_6x_250.png`, `dynres_{before,hitch,after}.png`
- A timings table (idle ×5, level-up ×3)
- `camera_probe.json`

## Stop-and-report template (reply in exactly this format; also commit it as `qa/m2_3/REPORT.md`)
```
LIVE URL:
REPO (SHA):
REPORT FILE: qa/m2_3/REPORT.md
DONE: (bullets per work item 1–7)
ACCEPTANCE: (1–13, each PASS/FAIL with the measured number and method)
AUDIO: (changed files; peak dBFS at destination in swarm; duck trace min gain)
KNOWN ISSUES:
DEVIATIONS: (anything changed that this brief didn't ask for; must be empty or justified)
NEXT:
```
Don't make unrequested gameplay, tuning or visual changes. List ideas under NEXT. Never alter a metric's input to pass it: no noise injection, no capture on a different tier than the one stated.
