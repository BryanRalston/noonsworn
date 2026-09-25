# NOONSWORN — M2.2 Brief: "Noon, not dusk — and make it sound good"

**For:** the same Grok Build session · repo `C:\Users\bryma\dev\noonsworn` · model grok-4.7
**Base:** live M2.1 at https://bryanralston.github.io/noonsworn/ (commit a1dd870)
**Source of findings:** `qa/m2_1_verify/M2_1_VERIFY.md` (independent QA on the live build, Sep 25 2026). Copy that folder into the repo as reference.

## Why this milestone exists
M2.1 wired the art, silhouettes, icons, toggles and the XP drift. Independent QA scored it **8 PASS / 6 FAIL / 1 PARTIAL**. It still doesn't look or sound like a production game:
- **Color bug.** Every Med/High frame, which is the default on desktop and phones, is color-broken: the custom bloom composite writes **linear** color to the canvas with no sRGB encode or tone map. Noon sandstone renders as dim brown (lit floor 76,45,18 on High vs 160,124,72 on Low). See `compare_5_actors_color_bug.png`.
- **No world.** Portrait shows a 37–51% flat navy void, corners are 75% giant-scaled floor bricks, and the sky never appears.
- **Owner-flagged audio.** The owner hates the audio: every sound is a raw WebAudio oscillator (square spear, sawtooth hurt), with no mix and no music.

**Out of scope:** new Imagine art (use what's in `public/assets/art/` and `art-src/`), new enemies/weapons beyond the 4 boons below, meta-progression, and balance changes not listed here.

## Work items (in priority order)

### 1. Fix the color pipeline (P0, do first)
- The composite shader (`scene + bloom*uStrength`) must end with tone mapping and sRGB output: `#include <tonemapping_fragment>` + `#include <colorspace_fragment>`, or `linearToOutputTexel`. Or switch to three's `EffectComposer` + `OutputPass`.
- Use `HalfFloatType` render targets. Check that Low, Med and High produce the **same base colors** (ΔE < 5 on the floor at the same camera/sun position).
- Retune exposure so lit sand sits at about 200–230 sRGB luminance and never clips. Shade stays violet-navy, not black.
- Retune bloom **after** the fix so it is actually visible: threshold in linear space, strength about 0.6 on High, and emissive-only sources (spears, halo discs, gems, sun-disc, Noon Cut ribbon, lit-kill sparks).

### 2. World beyond the arena (P0)
- **Sky:** the gameplay camera must see sky. Options: tilt/raise the camera FOV slightly, put the sky texture on a dome that fills the upper frame in portrait, or put a horizon band plus distant ruin/mesa silhouettes (cheap cards or low-poly) ringing the arena at 60–90 m. **Delete the navy clear/fog void.** Fog color = sky horizon color.
- **Outer ground:** stop reusing the floor texture at 8× scale (it reads as giant bricks). Use a dune/sand treatment: the floor texture at a low repeat, desaturated, with a large-scale noise tint, plus a few fallen columns or rubble instances outside the walls.
- **Camera clamp:** at a corner, the arena interior must fill **≥60%** of the frame (today about 25%). Offset the follow target toward the arena center when within 6 m of a wall, and let the player move off-center.
- **Portrait:** frame so the player is at least 36 css px tall and the upper third shows sky/ruins, not void.

### 3. Actor readability
- **Sela:** from the gameplay camera she must read as a hooded figure with a halo.
  - Tilt the sun-disc upright behind her head (facing the camera), not horizontal. Shrink it to about 0.7× head width and give it a thin bright rim.
  - Raise the hood and shoulders. Add a white rim light.
  - Use more of the 800-tri budget (she is 246 today).
- **Shade Hound:** thicken the silhouette (wider body, visible legs, violet rim on the back ridge). No more tall black slabs.
- **Lit enemies:** after item 1, lit mites vs lit sand must reach **≥3:1 luminance contrast measured on the median blob** (see Acceptance). Use a darker body with gold crack emissive and a dark 1–2 px outline/rim, not cream on sand.
- **Blob shadows:** they must be visible. Opacity 0.5–0.6, 1.3× footprint, darker on lit sand. Check them in a screenshot.

### 4. Juice and UI cleanup
- Replace "N shield" floats entirely with a small grey spark plus the "tink" sound (item 5). Cap floats globally to 12 on screen. **Floats must never render above the level-up modal.**
- Sun rays: replace the thin orange lines with soft additive light shafts (wider quads with a gradient) or remove them.
- XP gems: a small faceted gold-teal gem mesh with bloom instead of flat squares.
- Level-up cards: a framed card (gold border, rarity tint, icon well). Fix the Long Day icon's opaque square (make it transparent like the others).
- HUD at 360×640: the HP bar must not run under the sundial ring.
- Halo discs must not orbit visibly outside the walls (clip, or shrink the orbit near walls).

### 5. Audio overhaul (P0, owner priority)
Goal: warm, tactile, premium sound that fits a sunlit sandstone temple.
- **Candidates:** use the pre-cleared **CC0** candidates in `audio_candidates/` (43 files, 830 KB; `LICENSES.md` maps file → event → source page).
  - Copy them into `public/assets/audio/`. Add AAC `.m4a` twins if Safari needs them.
  - Audition every sound. Swap within the same Kenney/OGA packs if one is wrong, and record each swap in `CREDITS.md`.
- **Event map:** use the table in `LICENSES.md`. Highlights:
  - Soft blade swishes for spears (pick at random from 3, low volume).
  - Swish + blade layer for Noon Cut, with a short wind/cloth whoosh as the dash.
  - Deep stone thuds for hits, a metallic tink for armored, a glass crack for Exposed.
  - Pitch-walked glass chimes for XP (pentatonic, steps up within a 1 s combo).
  - Bell + steel-drum jingle for level-up; soft hurt thumps.
  - A very low wind ambience loop; the Desert Loop as music.
- **Mixer:** Master → {Music, SFX, Ambience} buses, then a `DynamicsCompressor`/limiter on master (threshold −12 dB, ratio 4).
  - Duck music by 4–6 dB for 400 ms on level-up and hurt.
  - Per-event voice caps: hit 6, armored 3, kill 6, xp 4, spear 4; total 24.
  - Per-play variation: ±8% pitch, ±3 dB gain, random sample from the set.
  - Distance/density attenuation: when more than N hits land in 100 ms, play one louder "cluster" hit instead of N.
- **Settings:** Music and SFX volume sliders plus a Mute toggle, on the title and pause screens, persisted in localStorage.
- **Loading:** lazy-load after the first input on the title. SFX before the run starts, music streamed after. Title load stays ≤450 KB.
- **No raw oscillator tones for core events.** A synthesized sub-layer is fine only if it is layered under a sample.

### 6. The 4 reskinned boons: make them distinct and cheap, or pull them
Each one should take ≤1 h using existing systems. Anything that takes longer gets pulled from the pool (list it under NEXT):
- **Solar Flare:** every 6 s, a radial sun burst (radius 3.5 m, +1 m per rank) deals damage, doubled for lit enemies. Reuse the shard/ring VFX.
- **Noon Bell:** every 10 s a bell toll (the bell sample) slows enemies within 5 m by 40% for 1.2 s, with a gold ring pulse.
- **Long Day:** slows the sun's rotation by 12% per rank, so lit zones persist longer. This is the theme's own mechanic.
- **Searing Light:** Exposed (lit) enemies take a burn of 4 dmg/s for 2 s, with ember particles.
- Heal and Wide Noon stay as they are. No two cards may have the same effect.

### 7. Confirmed bugs
1. **Idle death** is 118 / 52 / 23 s (target 25–35 s, tiny variance wanted).
   - Early pressure must not depend on card luck.
   - Make the 0–35 s spawn curve denser: guarantee one hound by 18 s and a mite ring at 25 s.
   - Keep openContact 0.75.
   - Test protocol: no movement, always pick card 1, 5 runs.
2. **Dynres step-down stalls**: High at DPR 2 held 1.65 while running at 21 fps. It must keep stepping down to the tier floor while frames exceed budget.
3. **Debug overlay 1% low is wrong.** It uses ≤120 frames and index ceil(0.99n)−1, which drops the worst frame. Replace it with a rolling 10 s window: 1% low = 1000 / mean of the slowest 1% of frame times, with ≥600 frames. Show the window length in the overlay.
4. **High-tier render cost**: desktop High with 400 enemies fell from 60 (M2) to 37.6 fps on the QA software renderer. Profile the bloom passes, make High bloom half-res with a full-res composite, and confirm on real hardware.
5. **Hidden sundial keeps ticking** on the title. Stop the clock when no run is active.

## Performance guardrails (must hold)
- Desktop High, 400 enemies: 60 fps average and 1% low ≥50 at 1× and 4× CPU on a real GPU. Draws ≤25.
- Phone emulation (412×915 @2.625, 6× CPU, Med, 250 enemies): ≥55 fps average, 1% low ≥45.
- Load: title ≤450 KB. Audio ≤1 MB total, lazy.

## Acceptance criteria (all measurable)
1. **Color parity:** the same camera/sun screenshot on Low vs High gives floor RGB within ΔE 5. Lit sand is 200–230 luminance.
2. **Zero void:** flat navy/cream void blocks (24 px blocks, σ < 1.5) cover 0% at mid-arena and all 4 corners in portrait 412×915, landscape 915×412 and desktop 1280×720. Sky/horizon is visible in the upper frame in all three.
3. At a corner, the arena interior is ≥60% of the frame (desktop and portrait).
4. Sela reads as a hooded figure with a halo (close-up plus gameplay crop). Portrait: Sela is ≥36 css px tall.
5. Lit enemy vs lit sand ≥3:1 **median over ≥10 enemy blobs** after the color fix. Shaded enemies average RGB ≥25 with rim and eyes. Report the method and numbers.
6. Bloom is visibly on (a side-by-side crop of Med vs Low shows glow on spears/gems/halo). Blob shadows are visible under actors in a crop.
7. **Audio:** no raw oscillator tone is the primary sound for any core event (spear, hit, armored, exposed, kill, cut, xp, level, hurt, death, win, ui).
   - During a 400-enemy swarm, record 30 s via an `AnalyserNode` on master: peak ≤ −1 dBFS, 0 clipped samples. Log the peak and the voice count in the debug overlay.
   - The Music/SFX sliders and Mute work and persist after a reload.
   - Music ducks on level-up.
8. The 4 boons each have a distinct visible effect (screenshot each), or are removed from the pool. No two cards share an effect.
9. Idle death 25–35 s: median of 5 runs, none above 40 s (protocol in 7.1). First level-up ≤20 s (3 kiting runs).
10. Dynres: steps down to the tier floor under load, and returns to the tier max within 8 s once load is removed.
11. The overlay 1% low uses a ≥10 s window and is always ≤ the average. Report both at desktop High 400 and phone 6× 250.
12. No "N shield" floats; floats never draw over the level-up modal; the HUD doesn't overlap at 360×640.
13. 0 console errors or warnings; the M2.1 passes (XP corner drift, icons, toggles, OG, CI Node 24) still hold.

## Proof you must capture (save under `qa/m2_2/`, commit it)
- `color_low_vs_high.png`
- `corner_{desktop,portrait,landscape}.png`, `mid_{portrait,landscape}.png`
- `sela_closeup.png`, `readability_1280.png`, `shadows_bloom_crop.png`
- `boon_{flare,bell,longday,searing}.png`
- `swarm_4-30_high.png` (real 4:30, not 0:11)
- `levelup_cards.png`, `settings_audio.png`
- `audio_peak_swarm.png` (overlay showing peak dBFS and voices)
- `fps_desktop_high_400.png`, `fps_phone_6x_250.png`
- `dynres_{before,hitch,after}.png`
- A timings table (idle ×5, level-up ×3)

**Write your stop-and-report as a file: `qa/m2_2/REPORT.md` in the repo, committed, and reply with the same content.** For every number, state how it was measured (window, frames, pixel or blob method).

## Stop-and-report template (reply in exactly this format)
```
LIVE URL:
REPO (SHA):
LOCAL PATH:
REPORT FILE: qa/m2_2/REPORT.md
DONE: (bullets per work item 1–7)
ACCEPTANCE: (1–13, each PASS/FAIL with the measured number and method)
AUDIO: (event → file → source/license; bytes; peak dBFS in swarm)
ART SLOTS: (every file in public/assets/art/ → where it is used, or "unused + why")
KNOWN ISSUES:
DEVIATIONS: (anything changed that this brief didn't ask for; must be empty or justified)
NEXT:
```
Do not make unrequested gameplay/tuning changes. If you think one is needed, list it under NEXT instead. Do not add debug helpers to the shipped API without listing them under DEVIATIONS.
