# NOONSWORN — Grok Imagine shot list (M2 art slots + concept reference)

*For Bryan. Generate these in Grok Imagine and save the picks into the repo's `art-src/` folder with the exact file names below. Then run `npm run art` (added in M2), which resizes and converts them into `public/assets/art/` and updates the manifest. The game loads any slot that is present and falls back to procedural art for any that isn't, so you can supply them in any order.*

## Style anchor (paste at the start of every prompt)
> **Original world "Lapis Noon":** a sunlit sandstone sundial temple at permanent low golden hour, where every shadow is lapis blue (#3C4F9A, deep #232C5E), never black. Stylized low-poly 3D look with hand-painted textures, soft gradient toon shading, a gentle rim light and soft ambient occlusion. Palette: pale sandstone #E9D2A6, warm sunlight #FFD66B, gold #F2B632, pale hot gold #FFF3B0, bronze #8A5A2B, linen white #FBF6EC; enemies are ink-violet #2A1838 with violet rims #6B4FA0; turquoise #35D6C4 only for rewards; magenta #FF3D8B only for danger. Clean, readable silhouettes, calm, sacred and warm. No orange embers or fire, no gore, no text unless asked, no watermark.

Rules for all prompts: 1 subject per image, no brand, game or artist names, and no lettering except in the logo shot. Generate at the listed size or larger and downscale. Don't upscale small outputs.

---

### Concept reference (not loaded by the game; guides modeling, colors and M3)

**C1 — Sun Court arena (establishing shot)** · 1920×1080 · file `concept_arena.png`
> [Style anchor] High three-quarter view of a square temple courtyard, 48 m across, floored with pale sandstone flagstones inlaid with thin gold hour lines radiating from a central bronze sundial ring. Four tall fluted sandstone pillars with gold bands stand symmetrically around the center. A low golden sun sits just beyond the far wall and casts one wide wedge of warm light across the floor; everything outside the wedge is cool lapis-blue shade, and each pillar throws a long crisp lapis shadow across the gold light. Low carved perimeter walls, distant temple silhouettes and a hazy cream sky. Empty courtyard, no characters. Game-ready stylized environment concept.

**C2 — Sela, the Noonsworn (turnaround)** · 2048×1024 · file `concept_sela.png`
> [Style anchor] Character turnaround sheet with front, side and back views on a flat pale sandstone background. A slim young woman temple guardian in flowing white linen robes with a hood and gold trim; a large flat gold sun-disc halo floats behind her head; she holds a very long, slender bronze blade shaped like a sundial's pointer (gnomon), longer than her height. Simple low-poly forms, strong silhouette readable at tiny size (tall halo disc plus long blade), soft toon shading, gold rim light.

**C3 — Dusk Mite (swarm fodder)** · 1024×1024 · file `concept_mite.png`
> [Style anchor] Small shadow creature concept, three views on a flat sandstone background: a knee-high spiky blob of ink-violet shadow with a teardrop body, stubby legs, two tiny pale violet eyes and a soft violet rim. Show a second version "exposed to sunlight": the same creature cracked with glowing pale-gold fissures and a bright gold outline. Low-poly, very simple shapes suitable for hundreds on screen.

**C4 — Shade Hound (lunger)** · 1024×1024 · file `concept_hound.png`
> [Style anchor] Low, lean four-legged shadow hound, ink-violet, wedge-shaped head, angular low-poly body, long wispy tail of shadow, side and three-quarter views. Normal state: faint violet rim, no eyes visible. Exposed state: two glowing pale-gold eye slits and gold cracks along the spine. On the floor in front of it, a thin magenta danger line shows where it will lunge.

**C5 — Veilcaster (ranged caster)** · 1024×1024 · file `concept_veilcaster.png`
> [Style anchor] A tall floating hooded shadow figure with no legs and a tattered ink-violet veil, holding a small orb of dark violet energy between long thin hands; a faint magenta glow gathers in the orb as it charges. It stands in cool lapis shade at the edge of a warm sunlit patch and recoils from the light. Low-poly, readable silhouette, three-quarter view.

**C6 — The Gloam (boss, living eclipse)** · 1920×1080 · file `concept_gloam.png`
> [Style anchor] A towering eclipse giant rising from the center of the sundial courtyard: a body of swirling ink-violet shadow and a face that is a black sun disc ringed by a thin corona of pale gold light; long arms trailing shadow ribbons; lapis-blue darkness pooling on the floor around it; tiny white-robed hero with a gold halo in the foreground for scale. Monumental, dramatic, and still clean and readable. Low-poly stylized boss concept.

### Art slots loaded by the game

**T1 — Floor texture `tex_floor_sandstone`** · generate 2048×2048 → used at 1024² tiling · slot `floor`
> [Style anchor] **Seamless tileable texture, orthographic top-down view, perfectly flat, even lighting, no shadows, no perspective.** Pale sandstone temple flagstones in an irregular rectangular pattern, soft hand-painted strokes, subtle wear, fine grout lines slightly darker, very low contrast so gameplay colors read on top. Neutral light color (the game tints it gold or lapis). Edges must wrap on all four sides.

**T2 — Carved pillar / wall texture `tex_pillar_carved`** · 2048×2048 → 1024² tiling · slot `pillar`
> [Style anchor] **Seamless tileable texture, straight-on orthographic front view, flat even lighting, no cast shadows.** Carved sandstone surface with vertical flutes and a repeating band of shallow sun-ray and sundial glyph reliefs, thin inlaid gold lines, hand-painted, soft baked ambient occlusion in the recesses only. Wraps horizontally and vertically.

**T3 — Inlay tile `tex_inlay_tile`** · 1024×1024 → 512² tiling · slot `inlay`
> [Style anchor] **Seamless tileable texture, orthographic top-down, flat lighting.** A decorative floor inlay band: polished bronze and gold geometric sun-ray pattern set into pale sandstone, clean hand-painted metal with soft highlights, symmetrical, repeating.

**S1 — Sky / backdrop `sky_backdrop`** · 2048×1024 (wide strip, left and right edges must match) · slot `sky`
> [Style anchor] Wide panoramic backdrop for a game horizon, **left and right edges seamlessly continuous**: a warm cream-to-peach golden-hour sky with soft painted clouds, a low glowing sun disc with a gentle halo, and distant silhouettes of sandstone temple towers and colonnades fading into lapis-blue haze near the bottom edge. Soft, painterly, low detail, no birds, no text.

**I1 — Card icons, set A (weapons + passives)** · each 1024×1024 → 256² · slot `card_<id>` · files `icon_spear.png`, `icon_halo.png`, `icon_flare.png`, `icon_bell.png`, `icon_might.png`, `icon_haste.png`, `icon_swift.png`, `icon_vitality.png`, `icon_lodestone.png`, `icon_heal.png`
> [Style anchor] **Game ability icon, one centered emblem on a plain flat dark ink-violet (#141225) background, consistent set style:** thick clean shapes, gold and pale-gold with bronze accents, soft inner glow, subtle hand-painted shading, readable at 48 px, no text, no frame. Subject: *{one of the following}*
> - spear: a slender spear of pure sunlight streaking diagonally · halo: two gold discs orbiting a small linen figure silhouette · flare: a ring-shaped burst of golden light · bell: a bronze temple bell sending out a gold ring wave · might: a gold blade crossed over a small sun · haste: a sundial with a motion-blurred gold pointer · swift: a winged gold sandal · vitality: a glowing gold heart with a sun ray · lodestone: a bronze horseshoe magnet pulling turquoise gem shards · heal: a warm gold sun orb with a soft plus-shaped glint

**I2 — Card icons, set B (sun boons)** · each 1024×1024 → 256² · files `icon_wide.png`, `icon_longday.png`, `icon_searing.png`
> [Same prompt as I1, but on a plain flat deep lapis (#232C5E) background so boons read as a separate family.] Subject: wide: a sun whose beam fans out into a wide golden wedge · longday: a sun disc resting on an hourglass of gold sand · searing: an intense white-gold sun with sharp rays and a cracked violet shard beneath it

**K1 — Title key art `title_keyart`** · 1920×1080 (keep the center-left third calm for the logo and menu) · slot `keyart`
> [Style anchor] Cinematic key art: the hero in white linen robes with a gold sun-disc halo and a very long bronze gnomon blade stands mid-slash on a sunlit sandstone sundial floor. A wedge of low golden sunlight cuts across the scene; beyond its edge, a horde of ink-violet shadow creatures crowds the lapis-blue shade, and those caught in the light crack with pale-gold fissures. Four fluted pillars cast long lapis shadows. The hero sits right of center; the calmer left side has open sky and shade for the title. Stylized low-poly 3D look, warm and sacred, high readability.

**L1 — Logo `logo_noonsworn`** · 2048×1024 on a flat solid #141225 background (we key it to transparency; ask for no background texture) · slot `logo`
> [Style anchor] Game logo wordmark reading exactly **"NOONSWORN"** in tall, elegant, carved capital letters of polished gold with bronze edges and a thin pale-gold highlight; the second "O" is replaced by a small sun disc with a sundial pointer crossing it; subtle rays behind the word. Centered, flat solid dark ink background, no other text, crisp edges, readable at small size.

---

**Delivery checklist:** textures are square and seamless (tile-test at 3×3 before accepting); icons share one style across both sets; the key art leaves space for the UI; the logo spelling is exactly NOONSWORN (regenerate if any letter is off). Size budget after `npm run art`: all slots ≤ 1.5 MB total (textures about 150–250 KB webp each, icons about 15 KB each, key art ≤ 300 KB, sky ≤ 250 KB).
