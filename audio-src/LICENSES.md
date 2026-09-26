# NOONSWORN audio candidates — licenses

Every file here is **CC0 1.0 (public domain dedication)**: free for commercial use, no attribution required (credit is courteous and is listed in CREDITS.md below). The license was verified on each source page on Sep 25, 2026 (page snapshots are in `src_license_pages/`, plus the Kenney `License.txt` files).

Processing: mono (music is stereo), 44.1 kHz. Every shipped sample is peak-normalized to −3 dBFS or below (`ffmpeg` volume, checked with `volumedetect` after the Vorbis and AAC encode). `cut_blade_1-3` are low-passed at 6 kHz. `hit_stone_1-3` include a short 2.2 kHz click. Shaded kills use `kill_shatter` at −6 dB; `kill_soft_1/2` are kept here and are not shipped. Each shipped file has an AAC `.m4a` twin. The game picks Ogg when `canPlayType('audio/ogg; codecs=vorbis')` is non-empty, otherwise M4A.

| File | Suggested event | Bytes | Duration (s) | Original file | Source pack | License |
|---|---|---|---|---|---|---|
| `spear_throw_1.ogg` | Sunspear throw (light swish, random pick + ±8% pitch) | 4,738 | 0.10 | `swish-1.wav` | [artisticdude — Swishes Sound Pack (OpenGameArt)](https://opengameart.org/content/swishes-sound-pack) | CC0 1.0 |
| `spear_throw_2.ogg` | Sunspear throw (light swish, random pick + ±8% pitch) | 4,512 | 0.08 | `swish-2.wav` | [artisticdude — Swishes Sound Pack (OpenGameArt)](https://opengameart.org/content/swishes-sound-pack) | CC0 1.0 |
| `spear_throw_3.ogg` | Sunspear throw (light swish, random pick + ±8% pitch) | 4,818 | 0.11 | `swish-3.wav` | [artisticdude — Swishes Sound Pack (OpenGameArt)](https://opengameart.org/content/swishes-sound-pack) | CC0 1.0 |
| `cut_swish_1.ogg` | Noon Cut dash-slash (layer swish + blade) | 4,944 | 0.13 | `swish-9.wav` | [artisticdude — Swishes Sound Pack (OpenGameArt)](https://opengameart.org/content/swishes-sound-pack) | CC0 1.0 |
| `cut_swish_2.ogg` | Noon Cut dash-slash (layer swish + blade) | 4,529 | 0.07 | `swish-11.wav` | [artisticdude — Swishes Sound Pack (OpenGameArt)](https://opengameart.org/content/swishes-sound-pack) | CC0 1.0 |
| `cut_blade_1.ogg` | Noon Cut dash-slash (layer swish + blade) | 11,444 | 0.88 | `sword.1.ogg` | [StarNinjas — 20 Sword Sound Effects (OpenGameArt)](https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes) | CC0 1.0 |
| `cut_blade_2.ogg` | Noon Cut dash-slash (layer swish + blade) | 9,134 | 0.62 | `sword.3.ogg` | [StarNinjas — 20 Sword Sound Effects (OpenGameArt)](https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes) | CC0 1.0 |
| `cut_blade_3.ogg` | Noon Cut dash-slash (layer swish + blade) | 7,979 | 0.50 | `sword.6.ogg` | [StarNinjas — 20 Sword Sound Effects (OpenGameArt)](https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes) | CC0 1.0 |
| `hit_stone_1.ogg` | weapon hit on enemy (stone thud) | 6,518 | 0.61 | `impactMining_000.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `hit_stone_2.ogg` | weapon hit on enemy (stone thud) | 6,343 | 0.56 | `impactMining_001.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `hit_stone_3.ogg` | weapon hit on enemy (stone thud) | 6,518 | 0.63 | `impactMining_003.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `hit_thud_1.ogg` | weapon hit on enemy (stone thud) | 5,889 | 0.28 | `impactPunch_medium_000.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `hit_thud_2.ogg` | weapon hit on enemy (stone thud) | 6,718 | 0.35 | `impactPunch_medium_002.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `armored_tink_1.ogg` | armored/shaded "tink" (replaces shield text spam) | 4,711 | 0.22 | `impactMetal_light_000.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `armored_tink_2.ogg` | armored/shaded "tink" (replaces shield text spam) | 4,872 | 0.24 | `impactMetal_light_002.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `armored_tink_3.ogg` | armored/shaded "tink" (replaces shield text spam) | 7,934 | 0.58 | `impactPlate_light_001.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `exposed_crack_1.ogg` | Exposed (lit) crit crack | 4,270 | 0.13 | `impactGlass_light_000.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `exposed_crack_2.ogg` | Exposed (lit) crit crack | 4,821 | 0.21 | `impactGlass_light_002.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `kill_shatter_1.ogg` | kill (lit → shatter, shaded → soft) | 5,964 | 0.54 | `impactGlass_medium_000.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `kill_shatter_2.ogg` | kill (lit → shatter, shaded → soft) | 6,174 | 0.54 | `impactGlass_medium_003.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `kill_soft_1.ogg` | kill (lit → shatter, shaded → soft) | 3,981 | 0.12 | `impactSoft_medium_000.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `kill_soft_2.ogg` | kill (lit → shatter, shaded → soft) | 3,979 | 0.14 | `impactSoft_medium_002.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `xp_chime_1.ogg` | XP gem pickup chime (pitch walk up a pentatonic scale) | 5,024 | 0.26 | `glass_001.ogg` | [Kenney — Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 1.0 |
| `xp_chime_2.ogg` | XP gem pickup chime (pitch walk up a pentatonic scale) | 4,903 | 0.12 | `glass_003.ogg` | [Kenney — Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 1.0 |
| `xp_chime_3.ogg` | XP gem pickup chime (pitch walk up a pentatonic scale) | 3,867 | 0.06 | `glass_005.ogg` | [Kenney — Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 1.0 |
| `xp_pluck_1.ogg` | XP gem pickup chime (pitch walk up a pentatonic scale) | 4,339 | 0.10 | `pluck_001.ogg` | [Kenney — Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 1.0 |
| `level_bell.ogg` | level-up (bell + steel-drum jingle) | 11,390 | 1.56 | `bell.wav` | [Fupi — Correct Bell (OpenGameArt)](https://opengameart.org/content/correct-bell) | CC0 1.0 |
| `level_bell_heavy.ogg` | level-up (bell + steel-drum jingle) | 7,622 | 1.19 | `impactBell_heavy_000.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `level_jingle.ogg` | level-up (bell + steel-drum jingle) | 10,131 | 0.93 | `jingles_STEEL00.ogg` | [Kenney — Music Jingles (Steel)](https://kenney.nl/assets/music-jingles) | CC0 1.0 |
| `shimmer_ding.ogg` | sun shimmer / lit-zone enter | 13,654 | 1.24 | `bell_ding2.wav` | [PWL — Bell dings/chimes (OpenGameArt)](https://opengameart.org/content/bell-dingschimes) | CC0 1.0 |
| `hurt_1.ogg` | player hurt | 7,439 | 0.50 | `impactPunch_heavy_000.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `hurt_2.ogg` | player hurt | 6,004 | 0.36 | `impactPunch_heavy_002.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `ui_click.ogg` | UI click/select/confirm | 3,660 | 0.01 | `click_002.ogg` | [Kenney — Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 1.0 |
| `ui_select.ogg` | UI click/select/confirm | 5,680 | 0.21 | `select_003.ogg` | [Kenney — Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 1.0 |
| `ui_confirm.ogg` | UI click/select/confirm | 6,414 | 0.52 | `confirmation_002.ogg` | [Kenney — Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 1.0 |
| `death_jingle.ogg` | death sting | 13,963 | 1.55 | `jingles_STEEL07.ogg` | [Kenney — Music Jingles (Steel)](https://kenney.nl/assets/music-jingles) | CC0 1.0 |
| `win_jingle.ogg` | clear sting | 13,316 | 1.38 | `jingles_STEEL14.ogg` | [Kenney — Music Jingles (Steel)](https://kenney.nl/assets/music-jingles) | CC0 1.0 |
| `footstep_stone_1.ogg` | optional Sela footstep on stone | 4,366 | 0.11 | `footstep_concrete_000.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `footstep_stone_2.ogg` | optional Sela footstep on stone | 4,607 | 0.11 | `footstep_concrete_002.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `cloth_1.ogg` | optional robe/cloth on dash | 8,489 | 0.54 | `cloth1.ogg` | [Kenney — RPG Audio](https://kenney.nl/assets/rpg-audio) | CC0 1.0 |
| `amb_wind_loop.ogg` | arena ambience loop (very low) | 49,649 | 6.00 | `wind woosh loop.ogg` | [SketchMan3 — wind whoosh loop (OpenGameArt)](https://opengameart.org/content/wind-whoosh-loop) | CC0 1.0 |
| `music_desert_loop.ogg` | in-run music loop (separate Music bus) | 515,303 | 64.00 | `desert_loops_2.mp3` | [iamoneabe — Desert Loop (Lo-Fi Remaster) (OpenGameArt)](https://opengameart.org/content/desert-loop-lo-fi-remaster) | CC0 1.0 |

**Total: 830,610 bytes (811 KB)** for 42 files. SFX alone: 265,658 bytes. Music is the largest item (515 KB); lazy-load it after the first run starts.

## Not downloaded but approved as sources
- **Sonniss GDC Game Audio Bundles** (https://sonniss.com/gameaudiogdc): royalty-free, commercial use in games allowed, no attribution required; you may not redistribute the raw files as a sound library. Too large to download here (tens of GB); use it only if a Kenney/OGA sound is not good enough (e.g. a better stone-thud or metallic whoosh).
- **Kenney Impact Sounds** also contains `impactBell_heavy_001-004`, `impactPlate_*`, `impactWood_*` alternates (CC0) if more variety is needed.
- **OpenGameArt "Caught in the Desert Plains"** (Tozan, CC0, https://opengameart.org/content/caught-in-the-desert-plains): 4:43 alternative music track; too large as is (1.28 MB), would need a 60 s edit.

## Suggested CREDITS.md lines (optional under CC0)
- Sound effects: Kenney (kenney.nl), artisticdude, StarNinjas, Fupi, PWL, SketchMan3 via OpenGameArt.org — CC0.
- Music: "Desert Loop (Lo-Fi Remaster)" by iamoneabe — CC0.

## Caveat
These were chosen by name, source description and waveform/loudness checks only. Nobody has listened to them in context yet. The build session must audition each in-game and swap within the same packs if one sounds wrong.
