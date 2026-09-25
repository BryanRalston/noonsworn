# NOONSWORN — Milestone 2 Brief (Grok Build): feel + readability + phone + production art pass

**Session rules:** model **grok-4.7** · **one single session** · **no twins** · work in **`C:\Users\bryma\dev\noonsworn`** (existing repo `bryanralston/noonsworn`, branch `main`, live at https://bryanralston.github.io/noonsworn/). Build **M2 only**, deploy it, then **stop and report** (template at the end). **Grok Imagine is allowed ONLY for the shots in `IMAGINE_SHOTLIST.md`, one request at a time (never parallel; wait for each to finish; on HTTP 429 wait 60 s and retry that shot once, then skip it and note it in the report). 1 generation per shot, max 1 retry for a clear defect.** Save picks to `art-src/`; `npm run art` converts them into `public/assets/art/`. Accept 1024–1408 px outputs (don't upscale). Crop away any baked-in text labels. Re-check `node -v`, `git --version`, `gh auth status` (account **BryanRalston**). If `gh` isn't authenticated, stop and report. Don't hunt for tokens.

**Context:** M1 (`c112d12`) is stable: 0 console errors, 60 fps with 400 enemies even under a 10× CPU throttle, ≤ 15 draw calls, 162 KB first load. QA found progression- and phone-breaking bugs, a dull first 30 s, an untaught sun rule, no juice or sound, and a greybox look. **Goal:** on a mid-range Android phone a new player gets the sun in 30 s, feels every hit, always sees Sela, and the game looks like a small production title. `SPEC.md` has the full design. Where they differ, **this brief wins**.

**Hard budgets:** first load (to an interactive title) **≤ 2.5 MB** transferred, total **≤ 8 MB**, JS **≤ 300 KB gzip**. No COOP/COEP, SharedArrayBuffer, required workers, WASM threads, or runtime requests to other domains (basis/meshopt decoders are served from our own origin). **No `Math.random()` in `src/game/`** (all randomness goes through `rng.ts`; cosmetic-only VFX may use a separate seeded `fxRng`). All numbers go in `tuning.ts`, all colors in `palette.ts`. `features.ts` is updated in the same commit as each feature. Commit in small steps.

**Priority order.** Finish each block before starting the next. If time runs short, cut from the bottom.

---

## P0 — Bugs (must all be fixed)

1. **XP starvation (S1).** In `pickups.ts`, at pool cap new XP merges into the nearest shard even when it's far away, so XP gain drops to zero after about 2:30. At cap, merge only within 3 m; otherwise recycle the shard **furthest from the player** into the new drop. Add a debug readout "xp/s".
2. **Portrait camera (S1).** The 45° vertical portrait FOV shows only about 12 m horizontally, and the player walks off-screen. Use a **framing rule**: distance/FOV chosen so the visible ground spans **≥ 22 m on the short screen axis**. Replace the ±14 m clamp so the **player always stays in the central 60% of the screen**; the view may go past the walls (backdrop, P3).
3. **Dynres ratchet (S2).** After any step, clear the window and wait **1.0 s**. Raise when avg < target × 0.9 for 2 s, with the desktop target = the measured vsync interval (median of the first 60 frames), not 16.6 ms; 13.3 ms is unreachable on 60 Hz.
4. **Tier auto-detect (S2, known issue).** The renderer string is only a **starting guess** (fix the Mali regex: G5x and G6x below G610 → Low, G610+ → Med; masked → Med). Then a **2.5 s title benchmark** on a representative scene (floor shader, 150 instanced mites, post on) **raises or drops** one tier by median frame time: raise < 0.55 × target, drop > 1.15 × target, **including Low → Med** (Intel UHD at 60 fps must end on Med). Phones stay ≤ Med unless the median is < 0.45 × target. Persist `{renderer, tier, version}`; re-benchmark on a new version.
5. **Tier-independent difficulty (S2).** The director's min-count and spawn curves must be **identical on every tier** (use a design constant, max 240 at 5:00). The tier cap only limits what's *rendered and simulated at once*. When over the cap, relocate the furthest enemy, as now.
6. **Pixel ratio for sharpness:** Low 0.75–1.5, Med 0.9–2.0, High 1.0–2.0 (never above `devicePixelRatio`). Dynres governs it. A mid phone should settle ≥ 1.25 when it holds 30+ fps.
7. **Hound telegraph** must read magenta on the lit floor: use normal alpha blending plus a dark outline, not additive.
8. **UI bugs:** touch UI and sundial hidden on title/end screens; end screens ignore taps for 0.8 s (restart via button/R/Enter); touch level-up hint "Tap a card"; `font-family` on `body` (system stack or one ≤ 30 KB woff2); fix "Lv" under the sundial and the HP number collision at 360–412 px; kill counter on a dark pill; benchmark mites out of view; Halo discs flat, as glowing rings; replace the floating sun sphere with a **sun disc on the backdrop plus a bright beam-edge line on the floor**.
9. **Hygiene:** HUD writes only when a value changes (no forced reflow). Remove per-frame allocations (`updateCut`'s `face` object, etc.) to target 0 GC pauses > 8 ms in a 60 s trace.

## P1 — Phone + touch polish

- **Touch:** floating stick (60 px radius, 12% deadzone) that recenters if the thumb drifts > 1.5 radii. Cut button 96 px from the safe area with a **cooldown ring, "ready" pulse and haptic** (`navigator.vibrate(12)`, settings toggle). Flick-to-cut stays. A subtle **cut-direction arrow** on Sela while the stick is held. Touch targets ≥ 48 px.
- **HUD (360×640 to 915×412):** HP number inside the bar (top-left), clock inside the sundial (top-center), level badge on the XP bar, kills under pause. No overlaps; safe-area insets.
- **Player visibility:** Sela gets a **ground ring** (linen/gold, readable in light and shade), an **x-ray silhouette through pillars/enemies** (depth-test-off pass or stencil outline) and a linen **rim**.
- **Orientation:** rotation mid-run with no stretch; keep the pause on `visibilitychange`.

## P2 — The first 30 seconds + juice + ramp

**Onboarding (no text wall):**
- Seed θ0 so the beam reaches Sela about 4 s in. Toasts on the first 2 runs (stored in `storage.ts`): "**Fight in the SUN** — enemies take ×2", then "**Space / Cut button** to dash-slash".
- The first 5 light entries show a **gold "EXPOSED!" pop** plus a crack/rim flash; stagger stars for 0.35 s. **Damage numbers:** big warm ones on Exposed hits, small grey ones with a shield glyph on Armored hits (pooled; 40 visible on High, 24 on Low).

**Tuning of the opening (targets, all in `tuning.ts`):** `xpToNext(1)=5`, `(2)=9`, `(3)=14`, then the M1 curve. **First level-up ≤ 10 s** for a moving player. Sunspear L1 cooldown 0.8 s. The Halo Discs card is guaranteed in the first or second offer. Contact damage × 0.6 for the first 45 s. Spawn rate eases in (quadratic from 1.2/s). **An idle player must survive ≥ 30 s**, and a player who kites survives ≥ 90 s on a default build. The hour-pack burst at 1:00 telegraphs its arc with a 1 s ring.

**Juice (all cheap, all pooled):**
- **Hitstop:** 30 ms on Exposed kills (≤ 1 per 120 ms), 60 ms on Cuts hitting ≥ 3, 90 ms on hurt.
- **Flashes + particles:** white hit flash 80 ms plus 1.15× scale punch; deaths burst into 6–10 umbral shards (plus a gold spark if Exposed), one instanced additive particle system.
- **Shake** (additive, toggle): 0.12 m big Cut, 0.08 m hurt, 0.03 m Exposed kill (rate-limited).
- **Noon Cut:** thicker gold ribbon with a goldHot core, 3 afterimages, a slash decal, "+0.15" refund ticks on the ring.
- **Pickups / level-up:** XP sparkles and eases in with a rising-pitch chain; level-up = gold burst, fanfare, 150 ms slow-mo, then pause.
- **Hurt / death:** magenta edge vignette 250 ms, HP bar shake, heartbeat below 30%; death = 0.6 s slow-mo, the beam fades out, then results.
- **Procedural WebAudio SFX** (`src/audio/audio.ts`; no audio files; unlocked on first input; master/SFX volume plus mute in settings; muted on `visibilitychange`; max 16 voices; pitch ±6%): spear throw, hit, **Exposed hit** (bright bell, ≤ 8/s), armored thud, kill pop, Cut (noise sweep plus thump), XP pickup (rising), level-up chord, hurt, light-entry shimmer (≤ 4/s), UI click, death, win. Each synth ≤ 30 lines. No music (optional soft pad drone on Med/High).

**Ramp:** per-minute table in `src/data/waves.ts` (rate, min count, hound share, pack size) replaces the linear rate; a **4:30 surge** for the final 30 s; at 5:00 a **light wave culls the horde** before the win banner.

**Level-up cards:** icon slot (P3; procedural glyph fallback), rarity frame, plain text ("Wide Noon — the sun's beam gets wider"), current → next values, a "NEW" tag.

**End screens:** time, kills, level, % damage dealt in light, local best time, primary **Play again** plus Title. The win adds a gold burst.

## P3 — Production art pass ("Lapis Noon")

**Target look:** stylized low-poly 3D, **toon/hand-painted shading** with a 3-step gradient ramp, **rim light**, and a **soft AO look**. A sunlit sandstone temple court at golden hour with **lapis-blue shadows** (never black), using the SPEC palette only. No ember orange.

- **Renderer:** ACES (or AgX) tonemapping, exposure about 1.0, sRGB; one sun-aligned `DirectionalLight` plus a `HemisphereLight` (sky/shade).
- **Materials** (`src/render/materials.ts`): `MeshToonMaterial` with a 3-step `gradientMap` built in code, plus `onBeforeCompile` for a **rim term** (gold on Sela and Exposed enemies, `umbralRim` in shade) and a **vertex-AO** multiplier. Enemies keep instancing and `iLit/iFlash`.
- **Environment:** carved pillars (fluted shaft, base, capital, gold ring); walls with wainscot and molding, **camera-side walls lowered or faded** so the foreground is never a cream slab; floor inlays (hour lines, bronze gnomon ring, center sundial); **contact blob shadows** under all actors (1 instanced mesh); **beam dust motes** Med/High (200/500); a backdrop ring beyond the walls (sky plus distant temple silhouette).
- **Characters:** Sela = linen robe plus hood, gold halo disc, long bronze Gnomon Blade, readable at 40 px; Mite = spiky umbral blob; Hound = low-poly four-legged wedge, eyes glow when Exposed. Procedural (≤ 300 tris per horde type) **or** tiny CC0 models (Quaternius, KayKit, Kenney) recolored to the palette, as **glTF + meshopt/Draco**, **KTX2 (ETC1S)** textures, credited in `CREDITS.md`. No skinning on horde types.
- **Post (tiered):** Low none (fake beam-edge glow in the floor shader); Med half-res bloom on hot emissives (threshold about 0.85: beam edge, Cut, spears, Exposed cracks, sparks); High bloom plus FXAA plus a light vignette. Post ≤ 3 ms on Med at 1080p (Iris Xe class).
- **Art slots (filled from Phase A Imagine art in `art-src/`):** `public/assets/art/`, loaded **only if listed** in `public/assets/art/manifest.json`. Generate the manifest at build time with a tiny Vite plugin that scans the folder, so missing files **never cause a 404 or a console error**. Every slot has a procedural fallback that looks finished on its own.

| Slot id | File (webp/png, or .ktx2) | Size | Use | Fallback |
|---|---|---|---|---|
| `floor` | `tex_floor_sandstone` | 1024² tiling | floor albedo × sun/shade shader | procedural flagstones plus checker |
| `pillar` | `tex_pillar_carved` | 1024² tiling (vertical) | pillar/wall albedo | vertex colors plus AO |
| `inlay` | `tex_inlay_tile` | 512² tiling | gnomon ring / border inlay | procedural gold lines |
| `sky` | `sky_backdrop` | 2048×1024 (equirect strip) | backdrop ring/sky | gradient sky → shadeDeep horizon |
| `card_<id>` | `icon_<id>` (spear, halo, might, haste, swift, vitality, lodestone, wide, heal, flare, bell, longday, searing) | 256² alpha | level-up card icons | procedural SVG glyph |
| `keyart` | `title_keyart` | 1920×1080 (≤ 300 KB webp) | title background, **lazy after first frame** | live arena behind the title |
| `logo` | `logo_noonsworn` | 1024×512 alpha | title logo | styled text logo |

- File names match Bryan's `IMAGINE_SHOTLIST.md` (picks saved to `art-src/<name>.png|jpg`).
- Add `npm run art` (devDependency `sharp`): converts `art-src/*.png` into right-sized webp (q80) in `public/assets/art/` and rewrites the manifest; KTX2 via `toktx` only if installed. Tiling textures: `RepeatWrapping`, mipmaps, anisotropy 4 on Med/High. All art ≤ 1.5 MB; key art and sky lazy-load after the title is interactive.

## P4 — Content slice (only if P0–P3 pass)

In order, each with an icon slot, Feature Map entry and SFX: **Solar Flare** (pulse), **Noon Bell** (ring, ×2 size in light), **Long Day** and **Searing Light** boons, **Veilcaster** (fires only from shade, 0.6 s telegraph), and the **Umbral Warden** elite at 3:00 (1200 HP, 3-way shadow wave, drops a Sun Chest = 1–3 upgrades). Use SPEC §5–6 numbers.

---

## Acceptance criteria (report PASS / FAIL / NEEDS-DEVICE with numbers for each)

1. `npm run build`: 0 TypeScript errors (strict), 0 new warnings. JS ≤ 300 KB gzip; **first load ≤ 2.5 MB** with and without art present; total ≤ 8 MB. Report the actual numbers. No COOP/COEP, no third-party requests.
2. **0 console errors or warnings** on load, over a full 5:00 run and 5 restarts, **with the art folder empty and full** (no 404s).
3. **XP:** with god mode on Med for 5:00, the level keeps rising after 2:30 (xp/s > 0 every 10 s window).
4. **Camera:** in 412×915 portrait and 915×412 landscape, the player stays in the central 60% of the screen everywhere in the arena (walk into all 4 corners; screenshots). The visible ground on the short axis is ≥ 22 m.
5. **Dynres:** on 60 Hz desktop High, one hitch (Spawn 50) does not leave the ratio below max after 5 s of steady 60 fps. Under a 4× throttle plus mobile emulation it settles and stays (report the value).
6. **Tier detection** (spoof `UNMASKED_RENDERER_WEBGL` through an init script): Intel UHD at 60 fps → Med; Iris Xe → Med or High; Mali-G57 → Low; Mali-G710 → Med; masked → Med start. Mobile never above Med unless it benchmarks as very fast.
7. **Perf:** desktop High ≥ 60 fps avg, 400 enemies, post on. 4× throttle plus 412×915: ≥ 55 fps, 150+ enemies. Draw calls ≤ 60 / 90 / 140, tris ≤ 120k / 250k / 500k (Low/Med/High). No GC pause > 8 ms in a 60 s trace. Real phone ≥ 30 fps (NEEDS-DEVICE).
8. **Difficulty is tier-independent:** enemy count at 1:00 / 3:00 / 4:30 is the same (±5%) on Low and High, with the same seed and bot.
9. **First 30 s:** first level-up ≤ 10 s with basic movement; an idle player survives ≥ 30 s; the onboarding toast appears on runs 1–2 only; the "EXPOSED!" pop shows for the first 5 light entries.
10. **Readability:** Exposed and Armored enemies are distinguishable in a grayscale screenshot (luminance difference ≥ 25%); the telegraph reads magenta on the lit floor; Sela stays visible behind a pillar and inside a 150-enemy swarm (screenshots).
11. **Juice + audio:** hitstop, flashes, shake, damage numbers, bursts and every SFX work; audio unlocks on first input and mutes on tab hide; shake/haptics toggles work.
12. **Art pass:** tonemapping; toon ramp, rim and AO; bloom Med/High only; contact shadows; backdrop; carved pillars. Each art slot loads when present and falls back cleanly when absent (screenshots of both).
13. **HUD** has no overlaps at 360×640, 412×915, 915×412 and 1280×720 (screenshots). Touch UI hidden on title/end; end screens ignore taps for 0.8 s.
14. Feature Map updated (M2 items shipped/partial/planned); `CREDITS.md` lists every CC0 asset; no `Math.random` in `src/game/`.

## Deploy + finish

- Push to `main` → the existing GitHub Actions workflow deploys to **https://bryanralston.github.io/noonsworn/** (same Pages URL). Wait for success, open the live URL, and confirm criteria 1–2 on the live build.
- **At the end: `git add -A && git commit` (clear message) and `git push origin main`, even if some criteria FAIL.** Report the final SHA. Don't force-push or rewrite history.

## Stop and report

When deployed (or blocked), **stop** and reply with exactly:
```
LIVE URL: https://bryanralston.github.io/noonsworn/
REPO: https://github.com/bryanralston/noonsworn  (commit SHA: …)
LOCAL PATH: C:\Users\bryma\dev\noonsworn
DONE: bullet list of what shipped (P0 / P1 / P2 / P3 / P4)
ACCEPTANCE: 1–14, each PASS / FAIL / NEEDS-DEVICE, with numbers (fps per tier, draw calls, tris, enemies, first-load MB with/without art, JS KB gz, first level-up time, idle survival time)
ART SLOTS: each slot id → loaded/fallback, and the exact file names + sizes Bryan must supply
KNOWN ISSUES: bullets
DEVIATIONS FROM BRIEF: bullets (with the reason)
NEXT (M3) SUGGESTIONS: ≤ 5 bullets
```
Don't continue past this point in the session.
