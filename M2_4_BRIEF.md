# NOONSWORN: M2.4 Brief, "Clear the sky"

**For:** the same Grok Build session · repo `C:\Users\bryma\dev\noonsworn`
**Base:** live M2.3 (HEAD 24facd5, feature commit a257629, bundle `index-CqvQoibl.js`)
**Findings:** `qa/m2_3_verify/M2_3_VERIFY.md`. Copy the folder into the repo as reference.

## Why this round exists
M2.3 passed 11 of 13 criteria: clear portrait, clean audio, a working duck, the M2 camera, and readable Sela and hound. Two items are left that a player can see. This is a small round: fix them, prove them, and stop.

**Frozen:** the camera (pitch 55°, yaw 45°, distance 30 / 64 portrait fit, FOV 35 / 45, lead ≤4.5 m, slide ≤6 m), the audio mix, the XP and spawn curves, and all art. Don't change anything else.

## Work items

### 1. Sun-marker disc covers the playfield (P0, blocker)
**Where:** `sunMark.place(...)` in `world.ts` (~line 803) puts a camera-facing cream disc at `markerRadius` 26.5 m, height `markerHeight + 8` = 14 m.

**Problem:** when Sela is on the camera side of the arena (the SE half), the disc sits between the camera and the floor.
- On desktop it covers **12–14% of the frame, directly over Sela and the enemies,** for about 6 s of every 60 s cycle (`sun_disc_desktop_edge_t58.png`).
- In portrait it covers 3–4%.
- It's a flat, unlit shape with no texture, so it reads as a rendering bug.

**Fix:**
- The disc must never draw over the arena interior. Choose one:
  - (a) Hide it whenever its screen-space bounds intersect the floor inside the walls, and show the existing edge pointer instead.
  - (b) Place it only on the far side of the view: clamp the marker to directions whose screen y is in the top 20% of the frame, otherwise hide it.
  - (c) Replace the disc with a small (≤48 css px) sun icon pinned to the screen edge in the sun's direction, like an off-screen indicator.
- Whatever remains visible must look finished: a soft radial gradient or a sun glyph with a rim, not a flat fill.
- Keep the 22 m ground pointer if it helps, but it must not cover Sela either.

### 2. Dynres step-down stalls (P1)
**Problem:** at DPR 2 on High, under load, the ratio went 2.0 → 1.75 and then **held at 1.75 while running 14–17 fps for 20+ s** (`log_dynres.json`). M2.2 stepped all the way down to 1.0. The new "step down at most once per 2 s" rule combined with the climb logic stops further drops.

**Fix:**
- While avg frame > target × `dynDown`, keep stepping down (0.1 per step, ≤1 s apart) until the tier floor.
- Only the *climb* waits for a stable p95.
- Don't touch the tier thresholds.

## Acceptance criteria
1. **Sun disc:** `qa/tools/sunsweep.js` method: player placed at (0, 0), (12, 12), (−12, 12), (12, −12) and (20, 20). Sweep the sun cycle in 2 s steps (30 frames each) on desktop 1280×720 and portrait 412×915.
   - A flat bright blob (L > 215, local σ < 2.5) inside the arena covers **0% of the frame in all 300 frames.**
   - Sela is visible (not occluded) in every frame; check this by projecting her position and sampling the pixel against a hidden-marker reference render.
2. **Sun indicator:** still visible in ≥80% of the frames (at the edge or the top of the screen), so the sun direction stays readable.
3. **Dynres step-down:** at DPR 2 on High, under 6× CPU + 200 enemies, the ratio reaches the tier floor within 10 s of frames exceeding the budget. After the load is removed it never stays above the floor while fps < 0.8 × the target.
4. **Nothing else changed:** the camera probe reads the same numbers (pitch 54.33 / 54.69, FOV 35 / 45, distance 29.51 / 63.51). Audio: peak ≤ −1 dBFS, 0 clipped, duck ≥4 dB for ≥300 ms. Idle death median 25–35 s. 0 console errors or warnings. Title ≤450 KB.
5. **Proof hygiene:** every proof PNG must be a distinct capture. QA checks md5s, and a duplicate counts as missing (M2.3's `portrait_high_mid.png` was byte-identical to `portrait_med_mid.png`).

## Proof you must capture (`qa/m2_4/`, commit it)
- `sun_sweep_desktop.png` and `sun_sweep_portrait.png` (contact sheets of the 30 sweep frames at (12, 12)), plus `sun_sweep.json` (blob % per frame)
- `dynres_{before,hitch,after}.png` and `dynres_trace.csv`
- `camera_probe.json`

## Stop-and-report template (reply in exactly this format; also commit it as `qa/m2_4/REPORT.md`)
```
LIVE URL:
REPO (SHA):
REPORT FILE: qa/m2_4/REPORT.md
DONE: (item 1, item 2)
ACCEPTANCE: (1–5, each PASS/FAIL with the measured number and method)
KNOWN ISSUES:
DEVIATIONS: (must be empty or justified)
NEXT:
```
Don't make unrequested changes. Ideas go under NEXT. The M3 leftovers are already tracked in `M2_3_VERIFY.md`.
