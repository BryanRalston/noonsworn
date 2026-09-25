# NOONSWORN — M2.1 Brief: "Make it look finished"

**For:** the same Grok Build session · repo `C:\Users\bryma\dev\noonsworn` · model grok-4.7
**Base:** live M2 at https://bryanralston.github.io/noonsworn/ (commit 74558ff)
**Source of findings:** `qa/m2/M2_QA.md` (independent QA on the live build, Sep 25 2026)

## Why this milestone exists
M2 performs well (60 fps with 390 enemies at 6× CPU, ≤14 draw calls, 278 KB) but still **does not look like a production game**. Pillar, inlay and sky textures and all 13 card icons are unused. There is no bloom, toon/rim shading or contact shadows. Shaded enemies are pure-black boxes, and lit enemies are olive (2.0:1 against the sand). Near walls, 30–50% of the screen is flat cream void. Wire what exists, fix confirmed bugs, and prove it.

**Out of scope:** new Imagine generation (all art exists in `m2_art/`), new weapons/enemies/P4 content, meta-progression, and any balance change not listed here.

## Work items (in priority order)

### 1. Wire all existing art (highest priority)
- **Sky/backdrop:** use the sky texture as a large inward-facing dome or cylinder, or as a scene background with a horizon band. Add a ground plane outside the walls: dune/sand, with the sandstone texture at lower saturation and fog. **Nowhere in any camera position should flat `#F6E7C8` void be visible.**
- **Camera:** clamp the follow camera to the arena bounds, allowing about 2 m of overshoot past the wall. At the corner (±23.6, ±23.6), the arena plus backdrop must fill at least 90% of the frame. Today it is about 50%.
- **Pillars:** apply the pillar texture (albedo; plus the normal map if it exists) to the pillar mesh. Add a base and a capital: two cheap stacked cylinders or a lathe. They are plain cream cylinders now.
- **Floor inlays:** apply the inlay texture as a decal/overlay: a sundial ring and hour glyphs around the center, plus inlay bands along the wall bases.
- **Walls:** reuse the sandstone texture at an adjusted scale, with a darker top trim so the wall reads as stone rather than a flat cream strip.
- **Card icons:** show the matching icon for every one of the 13 cards, at 64 px or larger on desktop and 48 px or larger on 360-wide screens. Also add a rarity/"new" frame color and a gold border on hover/focus.
- **Title:** key art full-bleed (object-fit: cover) behind the whole title screen, logo on top, and a dark gradient at the bottom behind the Play and Feature Map buttons. **Hide the sundial clock HUD on the title screen.** It currently overlaps the logo at 360×640 and 915×412, and it ticks 0:03 while no run is active. The "Tap or press any key" text must have at least 4.5:1 contrast (text shadow or backplate).

### 2. Shading: toon ramp, rim light and tiered bloom
- Replace the `MeshLambertMaterial` on enemies, player and pillars with a 3-step toon ramp. Use `MeshToonMaterial` with a gradientMap, or patch the Lambert shader.
- **Shaded (umbral) enemies:** base color `umbral #2A1838`, plus an `umbralRim #6B4FA0` fresnel rim and glowing eyes (the eye attribute already exists). They must not be pure black: rendered average RGB of 25 or more, and eyes visible.
- **Lit enemies:** they must read as hot gold, not olive. Make them emissive-leaning (goldHot, with emissive 0.35 or more), and give them a dark outline or rim so they separate from the sand. **Target: lit enemy vs lit floor luminance contrast of 3:1 or more** (today 2.0:1).
- **Player:** a linen/gold toon material with a white rim, so it pops in both light and shade.
- **Bloom:** Med gets a half-res UnrealBloom (threshold about 0.85, strength about 0.6), or a cheap custom 2-pass. High gets full-res bloom. Low gets none. Only emissive items should bloom: sun rays, halo discs, spears, XP gems, lit-enemy flash, Noon Cut ribbon. Tone mapping: ACES or AgX, with exposure tuned so the sand does not clip.

### 2b. Real actor silhouettes (replace boxes, blobs and the capsule)
Match the concept art in `art-src/concept_*`. Build these as small procedural low-poly meshes merged into one geometry each, still **instanced for enemies** (no per-enemy draw calls, and no skinned rigs):
- **Sela:** a tapered linen robe (lathe or cone) with a hood, a flat gold sun-disc halo floating behind the head, and a long slender bronze gnomon blade longer than her height held at her side. Procedural animation: run lean and bob, robe hem sway, and a visible blade swing arc on Noon Cut and hits. Target 800 triangles or fewer.
- **Dusk Mite:** a spiky teardrop body (displaced icosahedron, 6–8 spikes), two stubby legs, and two pale violet eyes. Animation: squash-and-stretch hop via a per-instance time offset in the vertex shader. Target 150 triangles or fewer.
- **Shade Hound:** an angular low quadruped with a wedge head and a wispy tail. Animation: vertex-shader leg scissor while moving, and a crouch before the lunge. Target 300 triangles or fewer.
- **Lit state (all enemies):** gold crack lines via an emissive noise or crack mask in the shader, plus gold eye slits. **Shaded state:** violet rim and pale eyes.
- **Death:** shatter into 6–10 instanced shards with gold sparks if lit, violet wisps if shaded.
- Acceptance: at 1280×720, a new viewer can tell Sela, mites and hounds apart in the `readability_*` proof screenshots; enemies are no longer primitive boxes or spheres.

### 3. Contact shadows
- An instanced soft blob shadow (opacity 0.35, scaled per type) under every enemy, the player and each pickup. One extra draw call.

### 4. Juice gaps
- **Shake:** add small shakes on the Noon Cut (0.08), player hurt (0.12, already exists; verify it fires) and Exposed kill bursts (0.02, capped).
- **Hitstop:** add 40 ms on player hurt and 30 ms on an Exposed multi-kill of 5 or more. Keep the existing 60 ms on cuts.
- **SFX:** the `spear`, `cut`, `xp`, `level`, `death` and `win` synths exist but are not all called. Every one must fire at its event. Rate-limit the xp pickup sound (for example 12/s with pitch walk).
- **Feedback text:** replace the spammy stacked "N shield" floats. Show at most one armored float per 150 ms per enemy, or a small grey spark plus a "tink" instead.
- **Settings:** add Haptics and Screen shake toggles to pause and title, persisted to localStorage. Haptics uses `navigator.vibrate` on hurt, level-up and cut (Android). It must be a silent no-op where vibrate is unsupported.

### 5. Confirmed bugs
1. **Dynres never recovers (the M1 ratchet is still present).** Frames are vsync-locked at about 16.7 ms, but the step-up needs an average below `targetMs × dynUp` (0.9 × 16.7 = 15.0 ms), which cannot happen.
   - QA evidence: desk-auto dropped 1.0→0.95 at 0:50 on one hitch, then held 0.95 for 50 s at a steady 60 fps (p99 16.8 ms).
   - **Fix:** step up when p90 frame time ≤ 1.05 × vsync and there have been 0 drops in the last 3 s. Probe upward every 5 s of stable frames.
2. **Vsync calibration measures device slowness.** `targetMs` is the median of the first 60 frames, so a device that is already at 30 fps treats 30 fps as its refresh and dynres never engages.
   - QA evidence: High at DPR 2 held ratio 1.85 at 30.8 fps.
   - **Fix:** snap the measured interval to the nearest standard refresh (60/90/120/144 Hz) and never accept a vsync above 16.7 ms.
3. **Tier-drop ratchet persists across sessions.** A drop when already at the minimum ratio is saved to localStorage forever. **Fix:** don't persist a tier drop that happened during a run. Persist only the benchmark result.
4. **Phones render at ratio 2.0 on Med** (824×1830 on a 2.625-DPR phone), and the mobile target lets it fall to about 27 fps before dynres acts. **Fix:** Med max ratio on mobile = 1.5, and use a 60 Hz target on mobile, same as desktop, with a floor of 0.9.
5. **XP freezes when the player camps a corner.** Pinned at (23.6, 23.6), XP stayed at exactly 60/235 for 75 s and 2,100 kills: drops merge into gems outside the 2.5 m pickup radius. **Fix:** when the pool is at 80% or more, or a gem is older than 20 s, have it drift to the player. Or cap the merge radius so merges never land outside the pickup range while the pool is not full. A moving player is fine.
6. **Top-left HUD:** the "Lvl N" label is clipped by the HP bar at every size. Make the level label and HP number fully legible. The clock text on sand needs 4.5:1 contrast (dark backplate).
7. **Meta description** still says "M1 greybox". Write a real description and add og:title, og:description and og:image (use the key art).
8. **GitHub Actions still run on Node 20.** Bump to Node 24 versions: `actions/checkout@v5`, `actions/setup-node@v5` (node-version 24), `actions/upload-pages-artifact@v4`, `actions/deploy-pages@v4` or later (whichever declare node24). If a needed action has no node24 major yet, set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` at workflow env. The CI log must show no Node 20 deprecation warning.

### 6. Early-game damage (decision: retune the ×0.6, don't keep it as is)
QA first-30 s data on M2:
- First level-up (kiting bot, 7 desktop runs): 9, 11, 13, 14, 22, 24, 26 s. **Keep** the early XP thresholds 5/9/14.
- Idle survival: the player never moves and dies at **51 / 44 / 50 s**. That is far above the M1 17 s and above the ≥25–30 s target. The first 45 s cannot be lost, which removes all tension.

Change to `openContact: 0.75`, `openSeconds: 30`, and remove `openInvuln` (use the normal i-frames). **Target: idle death 25–35 s**, measured over 3 runs. If idle death is below 22 s, raise openContact back toward 0.6; if it is above 38 s, lower it.

### 7. P4 content
Deferred.

## Performance guardrails (must still hold)
- Desktop High, 400 enemies: 60 fps average at 1× and 4× CPU throttle, with at most 25 draw calls including bloom and shadows.
- Phone emulation (412×915 @2.625, 6× CPU, Med, 250 enemies): 50 fps or better on average.
- Load: at most 450 KB transferred on the first title screen (it is 278 KB now). Lazy-load card icons as one atlas, 60 KB or less. Low tier must skip bloom and use blob shadows only.

## Acceptance criteria (all measurable)
1. Zero flat-void pixels at any camera position. Corner screenshots at desktop 1280×720, portrait 412×915 and landscape 915×412 show arena/backdrop in at least 90% of the frame.
2. The textured pillars (with base and capital), floor inlays, sky and wall trim all appear in screenshots.
3. All 13 card icons appear on level-up cards. Screenshot at least two level-ups that together show 6 or more distinct icons.
4. The title is full-bleed key art plus logo, with no clock HUD, at 360×640, 412×915, 915×412 and 1920×1080.
5. Lit enemy vs lit floor contrast is 3:1 or more, and shaded enemies' average RGB is 25 or more with a visible rim and eyes. Report the sampled numbers.
6. Bloom is visibly on for Med and High and off for Low. The debug overlay shows `bloom on/off`.
7. Blob shadows are visible under all actors.
8. Every SFX in `audio.ts` fires. Log a counter per SFX in the debug overlay over one 60 s run; every entry must be above 0 except death/win, which are verified separately.
9. The shake and haptics toggles work and persist after a reload.
10. **Dynres recovery:** with `?debug=1`, click Spawn 50 ×4 at 6× throttle until the ratio drops, then remove the throttle. The ratio must return to its tier max within 8 s. Screenshot the overlay before, during and after.
11. Idle death is 25–35 s (3 runs); first level-up (kiting) is 20 s or less (3 runs).
12. A player camping a corner for 60 s at 3:00 or later still gains XP (debug `xp/s` > 0).
13. No "Lvl" clipping, and the clock has 4.5:1 contrast.
14. The meta/OG tags are correct in the deployed HTML, and the CI log has no Node 20 warning.
15. The perf guardrails above hold, as reported by the debug overlay: fps avg and 1% low.

## Proof you must capture (save under `qa/m2_1/`, commit it, link it in the report)
- `fps_desktop_high_400.png`: debug overlay showing fps, calls, tier and ratio with 400 enemies.
- `fps_phone_6x_250.png`: same, in devtools phone emulation at 6× CPU.
- `dynres_before.png`, `dynres_hitch.png`, `dynres_after.png`
- `title_1920.png`, `title_360x640.png`, `title_915x412.png`
- `levelup_icons_1.png`, `levelup_icons_2.png`
- `mid_arena_lit_0-20s.png`, `swarm_4-30.png` (High), `corner_desktop.png`, `corner_portrait.png`, `corner_landscape.png`
- `shade_vs_lit_closeup.png`: enemies in both zones, with the player
- `pause_settings.png`: showing the toggles
- A table of idle-death times and first-level-up times (3 runs each)

## Stop-and-report template (reply in exactly this format)
```
LIVE URL:
REPO (SHA):
LOCAL PATH:
DONE: (bullets per work item 1–7)
ACCEPTANCE: (1–15, each PASS/FAIL with the measured number)
ART SLOTS: (every file in m2_art/ → where it is used, or "unused + why")
KNOWN ISSUES:
DEVIATIONS: (anything changed that this brief didn't ask for; must be empty or justified)
NEXT:
```
Do not make unrequested gameplay/tuning changes. If you think one is needed, list it under NEXT instead.
