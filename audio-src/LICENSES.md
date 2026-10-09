# NOONSWORN audio candidates — licenses

Every file here is **CC0 1.0 (public domain dedication)**: free for commercial use, no attribution required (credit is courteous and is listed in CREDITS.md below). The license was verified on each source page on Sep 25, 2026 (page snapshots are in `src_license_pages/`, plus the Kenney `License.txt` files).

Processing: mono (music is stereo), 44.1 kHz. Every shipped sample is peak-normalized to −3 dBFS or below (`ffmpeg` volume, checked with `volumedetect` after the Vorbis and AAC encode). `cut_blade_1-3` are low-passed at 6 kHz. `hit_stone_1-3` include a short 2.2 kHz click. Shaded kills use `kill_shatter` at −6 dB; `kill_soft_1/2` are kept here and are not shipped. Each shipped file has an AAC `.m4a` twin. R2 re-encoded `amb_wind_loop` to mono 48 kHz at the same loudness (−17.4 LUFS). `music_desert_loop` is retired. The game picks Ogg when `canPlayType('audio/ogg; codecs="vorbis"')` is non-empty, otherwise M4A.

**Modified in M2.4** (the copies in this folder and in `public/assets/audio/`): `cut_blade_2` has an extra 7 kHz low-pass and was not boosted. `hit_stone_1`, `hit_stone_2`, and `hit_stone_3` have an EQ at 1.8 kHz and 2.8 kHz, then a gain trim that puts the peak back at the pre-EQ level. The unmodified originals are the ogg files at commit `955da54` (`audio-src/<name>.ogg` and `public/assets/audio/<name>.ogg`). That commit has no m4a twins for these four.

| File | Suggested event | Bytes | Duration (s) | Original file | Source pack | License |
|---|---|---|---|---|---|---|
| `spear_throw_1.ogg` | Sunspear throw (light swish, random pick + ±8% pitch) | 4,769 | 0.10 | `swish-1.wav` | [artisticdude — Swishes Sound Pack (OpenGameArt)](https://opengameart.org/content/swishes-sound-pack) | CC0 1.0 |
| `spear_throw_2.ogg` | Sunspear throw (light swish, random pick + ±8% pitch) | 4,548 | 0.08 | `swish-2.wav` | [artisticdude — Swishes Sound Pack (OpenGameArt)](https://opengameart.org/content/swishes-sound-pack) | CC0 1.0 |
| `spear_throw_3.ogg` | Sunspear throw (light swish, random pick + ±8% pitch) | 4,770 | 0.11 | `swish-3.wav` | [artisticdude — Swishes Sound Pack (OpenGameArt)](https://opengameart.org/content/swishes-sound-pack) | CC0 1.0 |
| `cut_swish_1.ogg` | Noon Cut dash-slash (layer swish + blade) | 4,952 | 0.13 | `swish-9.wav` | [artisticdude — Swishes Sound Pack (OpenGameArt)](https://opengameart.org/content/swishes-sound-pack) | CC0 1.0 |
| `cut_swish_2.ogg` | Noon Cut dash-slash (layer swish + blade) | 4,550 | 0.07 | `swish-11.wav` | [artisticdude — Swishes Sound Pack (OpenGameArt)](https://opengameart.org/content/swishes-sound-pack) | CC0 1.0 |
| `cut_blade_1.ogg` | Noon Cut dash-slash (layer swish + blade) | 11,458 | 0.88 | `sword.1.ogg` | [StarNinjas — 20 Sword Sound Effects (OpenGameArt)](https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes) | CC0 1.0 |
| `cut_blade_2.ogg` | Noon Cut dash-slash (layer swish + blade). **Modified in M2.4:** 7 kHz low-pass, peak not boosted. Unmodified original: commit `955da54`, `audio-src/cut_blade_2.ogg`. | 9,124 | 0.62 | `sword.3.ogg` | [StarNinjas — 20 Sword Sound Effects (OpenGameArt)](https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes) | CC0 1.0 |
| `cut_blade_3.ogg` | Noon Cut dash-slash (layer swish + blade) | 8,246 | 0.50 | `sword.6.ogg` | [StarNinjas — 20 Sword Sound Effects (OpenGameArt)](https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes) | CC0 1.0 |
| `hit_stone_1.ogg` | weapon hit on enemy (stone thud). **Modified in M2.4:** EQ at 1.8 kHz and 2.8 kHz, peak pulled back. Unmodified original: commit `955da54`, `audio-src/hit_stone_1.ogg`. | 6,881 | 0.61 | `impactMining_000.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `hit_stone_2.ogg` | weapon hit on enemy (stone thud). **Modified in M2.4:** EQ at 1.8 kHz and 2.8 kHz, peak pulled back. Unmodified original: commit `955da54`, `audio-src/hit_stone_2.ogg`. | 6,823 | 0.56 | `impactMining_001.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `hit_stone_3.ogg` | weapon hit on enemy (stone thud). **Modified in M2.4:** EQ at 1.8 kHz and 2.8 kHz, peak pulled back. Unmodified original: commit `955da54`, `audio-src/hit_stone_3.ogg`. | 6,876 | 0.63 | `impactMining_003.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `hit_thud_1.ogg` | weapon hit on enemy (stone thud) | 5,934 | 0.28 | `impactPunch_medium_000.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `hit_thud_2.ogg` | weapon hit on enemy (stone thud) | 6,699 | 0.35 | `impactPunch_medium_002.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `armored_tink_1.ogg` | armored/shaded "tink" (replaces shield text spam) | 4,854 | 0.22 | `impactMetal_light_000.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `armored_tink_2.ogg` | armored/shaded "tink" (replaces shield text spam) | 5,011 | 0.24 | `impactMetal_light_002.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `armored_tink_3.ogg` | armored/shaded "tink" (replaces shield text spam) | 8,010 | 0.58 | `impactPlate_light_001.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `exposed_crack_1.ogg` | Exposed (lit) crit crack | 4,430 | 0.13 | `impactGlass_light_000.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `exposed_crack_2.ogg` | Exposed (lit) crit crack | 4,922 | 0.21 | `impactGlass_light_002.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `kill_shatter_1.ogg` | kill (lit → shatter, shaded → soft) | 6,002 | 0.54 | `impactGlass_medium_000.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `kill_shatter_2.ogg` | kill (lit → shatter, shaded → soft) | 6,163 | 0.54 | `impactGlass_medium_003.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `kill_soft_1.ogg` | kill (lit → shatter, shaded → soft) | 3,981 | 0.12 | `impactSoft_medium_000.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `kill_soft_2.ogg` | kill (lit → shatter, shaded → soft) | 3,979 | 0.14 | `impactSoft_medium_002.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `xp_chime_1.ogg` | XP gem pickup chime (pitch walk up a pentatonic scale) | 5,126 | 0.26 | `glass_001.ogg` | [Kenney — Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 1.0 |
| `xp_chime_2.ogg` | XP gem pickup chime (pitch walk up a pentatonic scale) | 5,109 | 0.12 | `glass_003.ogg` | [Kenney — Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 1.0 |
| `xp_chime_3.ogg` | XP gem pickup chime (pitch walk up a pentatonic scale) | 4,044 | 0.06 | `glass_005.ogg` | [Kenney — Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 1.0 |
| `xp_pluck_1.ogg` | XP gem pickup chime (pitch walk up a pentatonic scale) | 4,814 | 0.10 | `pluck_001.ogg` | [Kenney — Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 1.0 |
| `level_bell.ogg` | level-up (bell + steel-drum jingle) | 10,344 | 1.56 | `bell.wav` | [Fupi — Correct Bell (OpenGameArt)](https://opengameart.org/content/correct-bell) | CC0 1.0 |
| `level_bell_heavy.ogg` | level-up (bell + steel-drum jingle) | 7,859 | 1.19 | `impactBell_heavy_000.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `level_jingle.ogg` | level-up (bell + steel-drum jingle) | 10,084 | 0.93 | `jingles_STEEL00.ogg` | [Kenney — Music Jingles (Steel)](https://kenney.nl/assets/music-jingles) | CC0 1.0 |
| `shimmer_ding.ogg` | sun shimmer / lit-zone enter | 13,250 | 1.24 | `bell_ding2.wav` | [PWL — Bell dings/chimes (OpenGameArt)](https://opengameart.org/content/bell-dingschimes) | CC0 1.0 |
| `hurt_1.ogg` | player hurt | 7,411 | 0.50 | `impactPunch_heavy_000.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `hurt_2.ogg` | player hurt | 6,039 | 0.36 | `impactPunch_heavy_002.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `ui_click.ogg` | UI click/select/confirm | 3,849 | 0.01 | `click_002.ogg` | [Kenney — Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 1.0 |
| `ui_select.ogg` | UI click/select/confirm | 5,766 | 0.21 | `select_003.ogg` | [Kenney — Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 1.0 |
| `ui_confirm.ogg` | UI click/select/confirm | 6,663 | 0.52 | `confirmation_002.ogg` | [Kenney — Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 1.0 |
| `death_jingle.ogg` | death sting | 13,603 | 1.55 | `jingles_STEEL07.ogg` | [Kenney — Music Jingles (Steel)](https://kenney.nl/assets/music-jingles) | CC0 1.0 |
| `win_jingle.ogg` | clear sting | 12,695 | 1.38 | `jingles_STEEL14.ogg` | [Kenney — Music Jingles (Steel)](https://kenney.nl/assets/music-jingles) | CC0 1.0 |
| `footstep_stone_1.ogg` | optional Sela footstep on stone | 4,529 | 0.11 | `footstep_concrete_000.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `footstep_stone_2.ogg` | optional Sela footstep on stone | 4,709 | 0.11 | `footstep_concrete_002.ogg` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 1.0 |
| `cloth_1.ogg` | optional robe/cloth on dash | 8,538 | 0.54 | `cloth1.ogg` | [Kenney — RPG Audio](https://kenney.nl/assets/rpg-audio) | CC0 1.0 |
| `amb_wind_loop.ogg` | arena ambience loop (very low) Re-encoded in R2 to mono 48 kHz. | 33,770 | 6.00 | `wind woosh loop.ogg` | [SketchMan3 — wind whoosh loop (OpenGameArt)](https://opengameart.org/content/wind-whoosh-loop) | CC0 1.0 |

**Total: 293,224 bytes** for 39 ogg files in this table.

## M3b temple foley

These nine clips are original ffmpeg synthesis for the temple. They are not CC0 samples and they are not stored in this folder. Shipped copies are `public/assets/audio/<name>.ogg` and the AAC `.m4a` twin. Each one is peak-normalized to −3 dBFS or below.

`gate_rumble` (1.2 s), `mirror_hum_loop` (1 s, seamless), `mirror_fire`, `slab_warn`, `slab_slam`, `spring_launch`, `spring_land`, `mirage_step`, `relic_get`.

## M4b lattice foley

These seven clips are original synthesis for Lattice Terraces. They are not third-party samples. Shipped copies are `public/assets/audio/<name>.ogg` and the AAC `.m4a` twin. Each file peaks at −3 dBFS or below.

`coin_bloom`, `shutter_open`, `shutter_close`, `darter_dart`, `espalier_rake`, `espalier_slam`, `espalier_wake`.

## Not downloaded but approved as sources
- **Sonniss GDC Game Audio Bundles** (https://sonniss.com/gameaudiogdc): royalty-free, commercial use in games allowed, no attribution required; you may not redistribute the raw files as a sound library. Too large to download here (tens of GB); use it only if a Kenney/OGA sound is not good enough (e.g. a better stone-thud or metallic whoosh).
- **Kenney Impact Sounds** also contains `impactBell_heavy_001-004`, `impactPlate_*`, `impactWood_*` alternates (CC0) if more variety is needed.
- **OpenGameArt "Caught in the Desert Plains"** (Tozan, CC0, https://opengameart.org/content/caught-in-the-desert-plains): 4:43 alternative music track; too large as is (1.28 MB), would need a 60 s edit.

## Suggested CREDITS.md lines (optional under CC0)
- Sound effects: Kenney (kenney.nl), artisticdude, StarNinjas, Fupi, PWL, SketchMan3 via OpenGameArt.org — CC0.
- Music: "Desert Loop (Lo-Fi Remaster)" by iamoneabe — CC0.

## Caveat
These were chosen by name, source description and waveform/loudness checks only. Nobody has listened to them in context yet. The build session must audition each in-game and swap within the same packs if one sounds wrong.

## M5b Cloister cues

These twelve cues are original tones generated for this milestone (sine and a low-pass fade, 22050 Hz mono). They are not copied from a sample library. Each file ships as Vorbis `.ogg` and AAC `.m4a` in `public/assets/audio/` and is copied here. Peaks were checked with `ffmpeg volumedetect` after the Vorbis encode and sit at or below -1 dBFS. No clipped samples. The optional cloister ambience loop was not added.

| File | Cue | Duration |
|---|---|---|
| water_fill | pool fills | 1.5 s |
| water_ebb | pool ebbs | 1.5 s |
| brim_chime | water reaches the brim | 0.7 s |
| brimwash_warn | glyph swell | 2.0 s |
| brimwash_crash | foam crest | 0.6 s |
| blot_rise | blot docks | 0.7 s |
| blot_spit | spit | 0.32 s |
| votary_cowl | direct-beam flash | 0.4 s |
| compline_wake | organ drone, no vocals | 2.2 s |
| compline_pour | ewer pour | 0.7 s |
| compline_drink | drink | 1.1 s |
| compline_slam | slam | 0.45 s |

## M6b Stair cues

These fourteen cues are original synthesis for the Westering Stair (sines, a short noise crack, and a descending glide). They are not copied from a sample library. Each file is 22,050 Hz mono, Vorbis `.ogg` plus an AAC `.m4a` twin, in `public/assets/audio/` and copied here. `ffmpeg volumedetect` after the Vorbis encode put every peak at or below −1.5 dBFS. Combined Ogg size is 62,263 bytes. `newel_disc` is not a file: it is the same kind of short synthesized clank as `compline_halo`, played from `audio.ts`.

| File | Cue | Duration |
|---|---|---|
| westering_bell | stair bell | 1.5 s |
| sun_glide | sun step | 2.0 s |
| seal_set | seal stamp | 0.12 s |
| seal_fade | seal fade | 0.22 s |
| pitch_bubble | ink bubble loop | 1.2 s |
| courser_pounce | pounce | 0.18 s |
| hushmaw_feed | feed | 0.45 s |
| hushmaw_burst | feeding kill | 0.28 s |
| newel_wake | statue wakes | 0.9 s |
| newel_cast | long shadow whoosh | 0.4 s |
| newel_sweep | staff sweep | 0.42 s |
| newel_bow | bow drone loop | 1.6 s |
| newel_break | bow break | 0.32 s |
| newel_fall | collapse | 0.95 s |

## R2 music

# Music: licences (R2), generated from the shipped files on 2026-10-09

Every music file below is derived from a track released under **CC0 1.0 Universal** (https://creativecommons.org/publicdomain/zero/1.0/) on its own OpenGameArt asset page.
Each page was archived on **2026-10-09** (accessed that day) as HTML + PDF in `audio-src/licenses/music/<cue>/`, and the PDF shows the licence block.
Edits (cutting, looping, crossfading, loudness normalisation, re-encoding) are allowed under CC0. There is no AI-generated audio.
This section is regenerated by script from the actual files (sha256 + bytes). Do not edit it by hand.

| File | Bytes | SHA-256 | Source track | Author | Page | Licence | Cut from source |
|---|---|---|---|---|---|---|---|
| `music_menu.ogg` | 409433 | `39ce99dd4fd84740e933cb79dece388d2be92f906f51ccb36efa9ff197f246dd` | A New Town (RPG Theme) | cynicmusic (The Cynic Project) | https://opengameart.org/content/a-new-town-rpg-theme | CC0 1.0 | 1.750 s + 47.956 s |
| `music_menu.m4a` | 502953 | `fd06d597cbc1806990eee48f757617017610e16b0ce1446540e98a3949efea2c` | A New Town (RPG Theme) | cynicmusic (The Cynic Project) | https://opengameart.org/content/a-new-town-rpg-theme | CC0 1.0 | 1.750 s + 47.956 s |
| `music_sundial.ogg` | 351719 | `f12733f5f70a55914fad8cac4203bdfe1dad751927ec71e8264dbc2f5a641e2e` | Relics of Past | Centurion_of_war | https://opengameart.org/content/relics-of-past | CC0 1.0 | 29.820 s + 36.024 s |
| `music_sundial.m4a` | 381670 | `d7220755680a15ed3295c283ec57c5115f6ff5e769c5634ca998dd6ecd046390` | Relics of Past | Centurion_of_war | https://opengameart.org/content/relics-of-past | CC0 1.0 | 29.820 s + 36.024 s |
| `music_lattice.ogg` | 438747 | `e0832da7223e43809634ba77f8c7f5c9897c14d5d3102351ecc981e1363327af` | Mystical Enigmatic Background Music | CleytonKauffman | https://opengameart.org/content/mystical-enigmatic-background-music | CC0 1.0 | 40.960 s + 43.636 s |
| `music_lattice.m4a` | 457724 | `841ed075b79124cd176f83eb9d3a25e2ab92eff8635db02edb9d68e593e4e55d` | Mystical Enigmatic Background Music | CleytonKauffman | https://opengameart.org/content/mystical-enigmatic-background-music | CC0 1.0 | 40.960 s + 43.636 s |
| `music_cloister.ogg` | 468620 | `a6c271bd40c05226fb2edb8328414d4de2f23669c1bc34ccf5fe9a1bfbd01046` | Kokopelli's Labyrinth Theme (Main Loop) | CleytonKauffman | https://opengameart.org/content/kokopellis-labyrinth-theme | CC0 1.0 | 0.020 s + 43.652 s |
| `music_cloister.m4a` | 459058 | `2510f766faa02f2197b8e08f728b903a4d498e55e286a022295da4c945042be4` | Kokopelli's Labyrinth Theme (Main Loop) | CleytonKauffman | https://opengameart.org/content/kokopellis-labyrinth-theme | CC0 1.0 | 0.020 s + 43.652 s |
| `music_stair.ogg` | 512949 | `d89d82e70a1e93336d863af022481751403973395b7d0b77aee23a5bd100a443` | Unexplored Expansion | Bo Jingles (expansion of TAD's "Unexplored (short ver.)", CC0: https://opengameart.org/content/unexplored-short-ver-orchestra-music) | https://opengameart.org/content/unexplored-expansion | CC0 1.0 | 27.390 s + 53.333 s |
| `music_stair.m4a` | 556187 | `2dbaa038784752edc3f0e004185d0d216c9a7bd0cd266ce96e1f5da4bc2cbfc5` | Unexplored Expansion | Bo Jingles (expansion of TAD's "Unexplored (short ver.)", CC0: https://opengameart.org/content/unexplored-short-ver-orchestra-music) | https://opengameart.org/content/unexplored-expansion | CC0 1.0 | 27.390 s + 53.333 s |
| `music_boss.ogg` | 499268 | `4dc9be78a1781cb09ec5a6ac645c9cc9bbc8bdb989687541d7d17f6271672747` | Battle Theme A | cynicmusic (The Cynic Project) | https://opengameart.org/content/battle-theme-a | CC0 1.0 | 13.590 s + 52.603 s |
| `music_boss.m4a` | 548643 | `665a83aaa221ff9ae10971a369b60fe6ecb8133dc79f45209e269ac7607a74f2` | Battle Theme A | cynicmusic (The Cynic Project) | https://opengameart.org/content/battle-theme-a | CC0 1.0 | 13.590 s + 52.603 s |
| `music_nadir.ogg` | 399397 | `6508697b9940e5b51811c31f07bafa0f49fdc61a4786c474e5e57ae675bba957` | Sirens in Darkness | cynicmusic (The Cynic Project) | https://opengameart.org/content/sirens-in-darkness | CC0 1.0 | 26.070 s + 39.382 s |
| `music_nadir.m4a` | 413480 | `0471df17239bd1d73e419aff97024c763353f33158d32e4ab44474586ca02219` | Sirens in Darkness | cynicmusic (The Cynic Project) | https://opengameart.org/content/sirens-in-darkness | CC0 1.0 | 26.070 s + 39.382 s |
| `sfx_sunrise.ogg` | 120991 | `83ce3e0cd5dbffa3562fb6b993aeb9c6d1ba6843fc2db9d946eb988a20e44eff` | Fantasy Orchestral Theme | Joth | https://opengameart.org/content/fantasy-orchestral-theme | CC0 1.0 | Fantasy Orchestral Theme 147.08-161.80 s |
| `sfx_sunrise.m4a` | 150660 | `b9ea72575d5b5f9ce737fc80a5564b61a44a5ed2ee07374ff6bcd9c791ee16af` | Fantasy Orchestral Theme | Joth | https://opengameart.org/content/fantasy-orchestral-theme | CC0 1.0 | Fantasy Orchestral Theme 147.08-161.80 s |
| `sfx_boss_sting_a.ogg` | 27276 | `08b705aa482a8d8426eb5c2b7e2eac900dbe169eaf5f880820c10259baaecccc` | Battle Theme A | cynicmusic (The Cynic Project) | https://opengameart.org/content/battle-theme-a | CC0 1.0 | Battle Theme A 0.515-3.130 s |
| `sfx_boss_sting_a.m4a` | 27523 | `e55eab5f4a1f51559ee96408e89fd43805827537b6657eafc8d95b551e1821ac` | Battle Theme A | cynicmusic (The Cynic Project) | https://opengameart.org/content/battle-theme-a | CC0 1.0 | Battle Theme A 0.515-3.130 s |
| `sfx_boss_sting_b.ogg` | 28146 | `d7dd7bf5aa383a6ee7ab1746d06ddde232b92f3c05b5799521f93a65a87c0c2e` | Battle Theme A | cynicmusic (The Cynic Project) | https://opengameart.org/content/battle-theme-a | CC0 1.0 | Battle Theme A 37.115-39.730 s |
| `sfx_boss_sting_b.m4a` | 27658 | `47c9602242450af3bdaedbe5cf49d3f1a8a17309300a65426772c478a63094b5` | Battle Theme A | cynicmusic (The Cynic Project) | https://opengameart.org/content/battle-theme-a | CC0 1.0 | Battle Theme A 37.115-39.730 s |
| `sfx_boss_sting_c.ogg` | 28418 | `9d15099194e21f7616563c92bc82687c9e582cf2be47b9c6b56458dff0f33779` | Battle Theme A | cynicmusic (The Cynic Project) | https://opengameart.org/content/battle-theme-a | CC0 1.0 | Battle Theme A 71.635-74.250 s |
| `sfx_boss_sting_c.m4a` | 27629 | `bf72182458fc14408c6d63cb7f68e9ce7b29345839f4ee5e8cd58746657b6bf5` | Battle Theme A | cynicmusic (The Cynic Project) | https://opengameart.org/content/battle-theme-a | CC0 1.0 | Battle Theme A 71.635-74.250 s |

## Original downloads (as fetched 2026-10-09, before editing)

| Cue | Original file | Bytes | SHA-256 | Archived page |
|---|---|---|---|---|
| menu | `025_A_New_Town.mp3` | 766291 | `8a83b97f06cad1052eea0a3fa8f65966db742e68275a1d82816773c820578ad2` | `licenses/menu/oga_page.pdf` |
| sundial | `relic_of_past.v2ogg_0.ogg` | 4094198 | `9de70ca346360c2558e6ecb9bd3c0d9e6fb32c244c5c12c4c239353cb3623c4a` | `licenses/sundial/oga_page.pdf` |
| lattice | `CleytonRX - Mystical Enigmatic Background Music.mp3` | 4540151 | `31bc4fe96def522ffd20326ccbca4cb3a0adb10c11246e6dd828dbc5ad686314` | `licenses/lattice/oga_page.pdf` |
| cloister | `kokopellis_labyrinth_theme.zip` | 16455387 | `e1bd5f7a0eaf92ea154255f545850ff763086f03af82e1739614cf768cd91fa9` | `licenses/cloister/oga_page.pdf` |
| stair | `tad_-_unexplored_-_expanded_1_by_bo_jingles_0.mp3` | 1765271 | `a39323b0cbc83dea018fb693fb5b89f5cce6f06761b05407a489f9ace6cc094e` | `licenses/stair/oga_page.pdf` |
| boss | `battleThemeA.mp3` | 3289143 | `6042399782e581d753d616bc703e66483d5eccb5fb687a20c9a552d68c49e620` | `licenses/boss/oga_page.pdf` |
| nadir | `012_Sirens_in_Darkness_0.mp3` | 7042393 | `54c1abdd5ca5d67cf43c29bdf9d8332510dd1d74e8498569e5d9a2824a77079e` | `licenses/nadir/oga_page.pdf` |
| sunrise | `FantasyOrchestralTheme_1.mp3` | 3837827 | `add1de5eae0771c4ce5b3782a6eae9c01f321d32446421691426587000e50cdc` | `licenses/sunrise/oga_page.pdf` |

Stair upstream: TAD, "Unexplored (short ver.) [Orchestra Music]", CC0, archived as `licenses/stair/oga_page_upstream_TAD.pdf`.

## Archived licence pages (sha256)

- `licenses/boss/oga_page.html`: 133703 bytes, sha256 `0075bdfd267ede6e0f48a60a70c7193c18756e71d657964ac5e0626f890c1e97`
- `licenses/boss/oga_page.pdf`: 740482 bytes, sha256 `041519a351c9906e9d311bee13a3b24bd664e6d8424cf6cdd7d85d533ec6fa27`
- `licenses/cloister/oga_page.html`: 31172 bytes, sha256 `0ff11da0780cc45a428cc6327b99725bf025299ca99ba5f65f77f68e8c9680fe`
- `licenses/cloister/oga_page.pdf`: 348735 bytes, sha256 `5f916fd814daf2d2d8c7f0d69f5e3e71eb4e5de8c6e4afb70b6b19b327088047`
- `licenses/lattice/oga_page.html`: 29938 bytes, sha256 `0c6e208c8d5615f0ecb8be8d4bf8632267778f767bec385977c61b0378cccc17`
- `licenses/lattice/oga_page.pdf`: 201090 bytes, sha256 `0a54c40f2cf49d1a5f76052bf4a960e4d4fd6f3891a7e03b39cf2118bf9bdd30`
- `licenses/menu/oga_page.html`: 38294 bytes, sha256 `9c4abda9a129eada35e70814c2ec49ced7328287ed0c4150d5b94837062a90d7`
- `licenses/menu/oga_page.pdf`: 245839 bytes, sha256 `3409d08249f049ddc51e8aa35d3340684b733519f3a9a3e1553236175de3ac1b`
- `licenses/nadir/oga_page.html`: 38322 bytes, sha256 `b4d8f6007e95945d8795ab77bb3ce619a329a99e35338073f06cc402b5af1db1`
- `licenses/nadir/oga_page.pdf`: 254685 bytes, sha256 `bf6938c28a307fb66c83e5f408f7656651d766aebd932c141a6ca259fe328803`
- `licenses/stair/oga_page.html`: 25318 bytes, sha256 `4df51eb646207997ebb44b34e5beb628884525f7103cc0d17b751e3be636d6a2`
- `licenses/stair/oga_page.pdf`: 180035 bytes, sha256 `fdac33fdf5b52fd31ce59d798cd30d624896145237e618f9cfbb17520f496cdd`
- `licenses/stair/oga_page_upstream_TAD.html`: 47663 bytes, sha256 `ceec21283b5465a57506fd49bd8b78b0cbea8101c1e6f145a02c347e925ffd3d`
- `licenses/stair/oga_page_upstream_TAD.pdf`: 267391 bytes, sha256 `011f79450f6769bb0745b5d516656e01b3b88cb5a6f89901d445999aa6b120c1`
- `licenses/sundial/oga_page.html`: 24113 bytes, sha256 `f551bb4959e465a1d11cf48f9e34efd2b7bc69f91cb0a18b6bd8753796bb7bfb`
- `licenses/sundial/oga_page.pdf`: 165601 bytes, sha256 `3efe6e1bb61d4f04bd907ee6f0025113ba1a20009e58b953543e2eaf5b759464`
- `licenses/sunrise/oga_page.html`: 37180 bytes, sha256 `dc5bbb81535c8ce9316b0f0400dc021b837bedb39ba47cae0b029e74df39e14d`
- `licenses/sunrise/oga_page.pdf`: 236301 bytes, sha256 `db161348618e6bfd0e0bc3bbd11eb5756e95d444ae84aaa455180dcde161ef2e`

## Shipped audio hashes

Generated from the files in `public/assets/audio/`. The build fails when a shipped file is missing from this table or its sha256 does not match.

<!-- shipped-hashes -->
| File | Bytes | SHA-256 |
|---|---|---|
| `amb_wind_loop.m4a` | 50108 | `f3813ca3d87e236fc7222c4e47c75f474894c95091284eebcc3962fbab3971a7` |
| `amb_wind_loop.ogg` | 33770 | `e428decfb1e640e6892ed19d2b90f271b1cc8d100c03852d0739c972830443ed` |
| `armored_tink_1.m4a` | 4005 | `89a53cabf6ec7c4666a616c87fb0cf297fd1c581a13f37793385a3997d366a15` |
| `armored_tink_1.ogg` | 4854 | `d75e1105c5e33ccfdac168908f3b3429f9a39fae35057ed00c3673532aaa0515` |
| `armored_tink_2.m4a` | 3947 | `8e0709ae683a918d696d142d626e745f6825b092fef13e98e774d4364203ade1` |
| `armored_tink_2.ogg` | 5011 | `8fe2f3e35563c5ef2d05563f4acac92e2386be584f304c85d60113a0cb18a3fc` |
| `armored_tink_3.m4a` | 8285 | `e0cbf92df3d0985460c30d9f08f3730d9e117e587209fa2dae830d652f0e5037` |
| `armored_tink_3.ogg` | 8010 | `ddb22cb4a818d73c4e19cc6412165971214036e1eab1d263d4929cba65e54f2e` |
| `blot_rise.m4a` | 4885 | `904b897511d35110b76b77a8bcd7f607a682f9d89fbb52f106c7a0c25b491c53` |
| `blot_rise.ogg` | 4303 | `53463a1eb40768e5ff5f673157af15bb8d126634a3e3d152d8de818c0200ae86` |
| `blot_spit.m4a` | 2786 | `73f7c28899260f4f71dbdff6cd589f70b0efa1e37418797138842ee666de42dc` |
| `blot_spit.ogg` | 3967 | `122553cdedcac2e16048868b2b564d6d500bfb7076679a9de52b121dcea90e64` |
| `brim_chime.m4a` | 4755 | `2c3890ae5af0516c244afe46508e6e7a750faaf29fc66189c992162950e47482` |
| `brim_chime.ogg` | 4242 | `3f319c291a49b64b9efa9713b3d2e836fb8d5924f51cedb15e71d382b3e5d86d` |
| `brimwash_crash.m4a` | 4133 | `312969edbf18ed488d7a85df8176b9736d422f5cc64dd6be8aed0e3fefd314a6` |
| `brimwash_crash.ogg` | 4194 | `59a28b08300cbf7f31136f746a82f635890eafc3afe9cf1cbf5a618a014e5394` |
| `brimwash_warn.m4a` | 11456 | `2ad43a86450153a62c075cfafd8b8ce49589159800715712d08fe336f1f180c4` |
| `brimwash_warn.ogg` | 5694 | `facb755ef77969076907b7abdbc913400c5d892c34cdd347d6b89174fd7063f2` |
| `cloth_1.m4a` | 8092 | `90f055b1c33648f26ce3af01de62f8e5560fdbe38ff0451d835e2502fc9b3027` |
| `cloth_1.ogg` | 8538 | `cbaf5e9ac8cfb23dcce7d47db1c7210f1a389e814267420c9252692e1325ce26` |
| `coin_bloom.m4a` | 2868 | `d4ad9fee81eaa28ca7bc3ca83f78dbe3e19b7d97ce73125c021fe8fc2eeb4484` |
| `coin_bloom.ogg` | 3906 | `e3edde06cf4573418d525ea77237fadb8f2d54add3fcf4799fc56a70d19dc173` |
| `compline_drink.m4a` | 6891 | `c207a580911eece3c29cdda7848cfb8f4512acfcca08d0c084a5f3b8d9c62710` |
| `compline_drink.ogg` | 4744 | `0573c4b406eb75ef35c010f09b68bbfdeb045a2962058ab97852f7fce20516a4` |
| `compline_pour.m4a` | 4783 | `9651d873baaf53d5f1a0caf2cee39e652a746569dda07c28bb27217cad84e9f0` |
| `compline_pour.ogg` | 4344 | `77ba4104956303ba03a72498f69d6ee5624dbce7336dfa8ff242d89b52fb43e2` |
| `compline_slam.m4a` | 3513 | `d9ef5f481a77fdae5dae1a3a4a9b476b7c5c7201b040cdfb806d7f881e5b7440` |
| `compline_slam.ogg` | 4046 | `6c681184bf5a293be333400d4f4482aa3174f68c01d593c56dfad02ba0ebd6a2` |
| `compline_wake.m4a` | 12482 | `b0a6d8c028984418259a9bd886e97009f87ac9c17d59437b6f65ad556bd263c6` |
| `compline_wake.ogg` | 5706 | `e35ce2ddb740afff4991e12a5906fff460ac014dfe874cc3d6d2a265b190b4e3` |
| `courser_pounce.m4a` | 2167 | `7204dc1115fdbc4ae29177e05b69e44260783e768317367f6016ca8de307d443` |
| `courser_pounce.ogg` | 4177 | `a1578fbc1c9790a9bb79859e435e9398435d9505e46d709654be5ebce8677c11` |
| `cut_blade_1.m4a` | 11994 | `da1bcb4125019fbc33f3ad433c399ea52f34e7ddb69b6a2f7c8ea142a6f2d4d5` |
| `cut_blade_1.ogg` | 11458 | `8effa0bdabb6d91f4ff7fb6b8fc1b88c20916a7c73169143234c1542179ae820` |
| `cut_blade_2.m4a` | 8812 | `35c550cce2e5973bc811522c93c64a3a73fe399d4217cb6d7cce10b97b80ff34` |
| `cut_blade_2.ogg` | 9124 | `6531b37fd141d85e67f8f1919a514e4f4443bf269371ff821fff495bad3cdce2` |
| `cut_blade_3.m4a` | 7443 | `19b0470a229af81e59bd745ada0b76a47031b08316c0a670c30f74f8cd88acc6` |
| `cut_blade_3.ogg` | 8246 | `9d0969f133a86cb0dcc2b05b6478cb8153f5b3dfd6d691603570b3e0d3fcad0c` |
| `cut_swish_1.m4a` | 2709 | `05df2c9c6f83a50f06c06f628e4ff56f53dedf759228079d667f0e505c1bb9f3` |
| `cut_swish_1.ogg` | 4952 | `cf75ef8199b2a19c46ab589ca78c935b7c4d3dc3d065e7cca058744d3ca0ca7a` |
| `cut_swish_2.m4a` | 2177 | `d101d81e6238b2649bce14c7ec867fa5b118070a35a80bcd34dd598e2eec9c97` |
| `cut_swish_2.ogg` | 4550 | `0fe14fcaf74a8577168d57113ad1e0a0cbe3eafb390a01fe9636530c68e8faff` |
| `darter_dart.m4a` | 1827 | `6498917026fc189ab6b2861eaed3cd8b0b823fde5a41ffa693cfd34826221ff8` |
| `darter_dart.ogg` | 3791 | `ae487597d886e19a0d2cf82066c40fc28448ce1dd06a474235fe28bc8973fd68` |
| `death_jingle.m4a` | 20120 | `e0188535772cb24723058a0c0a3140b73d99fd1e38b84f32e3c998e367c27450` |
| `death_jingle.ogg` | 13603 | `27eb61b7b36216b40ca4a50b8aa82c802141dc0b5342ce880d61a93459ff9c1b` |
| `espalier_rake.m4a` | 3224 | `a6953404593fbc7e043e5d18294b78c61eb0e92a6d5ef396df0a099548f07a49` |
| `espalier_rake.ogg` | 3993 | `e061775b9da02763f5891a24f42f0a1283e84369eebb20cef73d256ec03eb2f4` |
| `espalier_slam.m4a` | 2617 | `4ffb6561c34f22cc2567e8e5224da5950ac48dacf0e1833550eb09bf4a2e4d1c` |
| `espalier_slam.ogg` | 3870 | `1f4618212de726905f682b4a233951dae477c7a720ecb174c925056d77ce8bfe` |
| `espalier_wake.m4a` | 4062 | `dbf4a17011895523b1d38d6fc5da3eb181bdfe3405be2848dbb8aca0f58af1f1` |
| `espalier_wake.ogg` | 4140 | `c8a86431d90810692a07f7238e04d6dcb0d6d24c4d188c149712a877db86d9c7` |
| `exposed_crack_1.m4a` | 2684 | `74d69fc303dfac29de17cfc588640f6c8f87624d06fe418d3dd11d92be85972b` |
| `exposed_crack_1.ogg` | 4430 | `59786ee90a9ed3759bfcfe5a0b44a83b0a985378d6c78dc7a24aed2c1ca3fe30` |
| `exposed_crack_2.m4a` | 3780 | `58f1a7ecd207eceae1e538c63eb8f2f05ca60a97733f71cd46e8e61985b070c2` |
| `exposed_crack_2.ogg` | 4922 | `8a63c31ba0bd627d7e6d4674af315a36bd1c0591b9ce3b257d5f98916dfbd169` |
| `footstep_stone_1.m4a` | 2362 | `8d58575fa33e3870f66bbf133ebccbd5c1e5dfc8ab01caff2094ac64b436ce89` |
| `footstep_stone_1.ogg` | 4529 | `38feec8f1acc46ce0be3e11a255162e4f6720ba77e85efa316e21a56318961b5` |
| `footstep_stone_2.m4a` | 2532 | `cb1ff42a55c25521cdcce2ef69a7d9e68db75d2f16626c6f5e4a3670d3669b50` |
| `footstep_stone_2.ogg` | 4709 | `1cd66dfacf16d65f103dd372f9f2d654da9093160c5af60e0ac2dbc7811247cd` |
| `gate_rumble.m4a` | 8597 | `1fe94cb553d4194f9de47d4aaa30474a12c11e45d1af338bb65180d427468bf3` |
| `gate_rumble.ogg` | 8467 | `075ef763d739de3753b8a51a6e7df2b097d60d02961cc1b96055ca0351905572` |
| `hit_stone_1.m4a` | 8927 | `b2e8c682b1975827073f592550e4b6ca15909e6c061693ce20048bf24b106570` |
| `hit_stone_1.ogg` | 6881 | `f86695a671b9a8bb53442d2c7033b2c958a13425eae4cc5da5c8e3471e47221d` |
| `hit_stone_2.m4a` | 7979 | `ac3cb0c037aceb1bc94670ab313a9014bfa8b42386008c7509da304ece850140` |
| `hit_stone_2.ogg` | 6823 | `e47d04156ccb8ee50145daf2024608ed2572b4b499e089be9d6182a4e01f3dde` |
| `hit_stone_3.m4a` | 9040 | `6b3ff8810edf847e23e80232233ebc33dfcd189883f34859f9782b4ae2a02ee5` |
| `hit_stone_3.ogg` | 6876 | `702e79da8852819134b1a242fe302a69c50d7fe9cc0e6d6ec896bee2214f0219` |
| `hit_thud_1.m4a` | 4523 | `0ba3de51edb3ba717313a4e76a2b72b7910f2063964bdb97bb18ead5049862b5` |
| `hit_thud_1.ogg` | 5934 | `09234a01812277a783d40aa9697c75f8c48e024b16fc7d7ad49ce2e9ac27fd5a` |
| `hit_thud_2.m4a` | 5390 | `b3c5ebbe17168d5b39fc0a95312c04518a6ac48c52c68e96e28400d0fb82b4c9` |
| `hit_thud_2.ogg` | 6699 | `42095c10e667b5384235f1f30a70b176723d3849cca8ebfc3f98607a6d4d1703` |
| `hurt_1.m4a` | 7152 | `33cc68eb30444e84528822989fb674da61e0aab68571a67dd1207f7b151420a4` |
| `hurt_1.ogg` | 7411 | `5bd1c1d42809700739ff028085d756596145ed74eb8ee1824ad205a9bcba7bce` |
| `hurt_2.m4a` | 5692 | `92ccb5c9278d213eb83ca9353bd475619e0f8f3134bf19f3b28e3648cb0a18cc` |
| `hurt_2.ogg` | 6039 | `b89d4fa940965a01cbbe9569aba11fffc7b5e1d9fa2dd1ffa025dd2ffda13796` |
| `hushmaw_burst.m4a` | 2639 | `41969d463e072b60d380d80f6a05ffccdec5907e406fa40b3f0a3ad0b8f1f16f` |
| `hushmaw_burst.ogg` | 4674 | `9c51690641098af9ce266145bea7abade6caa0cdaf5454ece9fdfebd136edcc0` |
| `hushmaw_feed.m4a` | 3513 | `1ebbe99574d099a5407fbf42cd99df0942e67e11e6033d44416661607b04f009` |
| `hushmaw_feed.ogg` | 3871 | `c8227cbe5321dfc3a3f312af42dc2c13add4979418a8b10039cfbb70d73924b8` |
| `kill_shatter_1.m4a` | 7915 | `1801b80239adbc823febc5b49b452e55a7a71fcd3106f7fa0b4d91b97339f7d5` |
| `kill_shatter_1.ogg` | 6002 | `ef6e417b6485565357680c51469c408a7f48baa69364a15e775f39a75dcec7e9` |
| `kill_shatter_2.m4a` | 7941 | `052034810f4e9f3a27865ed25505918c55f2eef0f78c953adc2f5d66cf88ef14` |
| `kill_shatter_2.ogg` | 6163 | `30e9a2fe20be9b98fabfbda54268dd14ea14a73f5da3bc8caadca71709278f24` |
| `level_bell_heavy.m4a` | 15019 | `c0abfabf29aefc32c397dfab69d5ff33e5248c802bd151387ddaf1dc7bfd0520` |
| `level_bell_heavy.ogg` | 7859 | `6e1a27bd6a0909564ab491fb30760990404ad29615fe94a5f6dc82f6f0ba3d21` |
| `level_bell.m4a` | 20351 | `24329ae5aaa1c936a8e4bcd9b3526e304386a036a3abdc9988e6cd443ded96d2` |
| `level_bell.ogg` | 10344 | `ac7776ce97edd3e4464d032e14d2e2703b6b95135a3077e4085fd5b95a15902f` |
| `level_jingle.m4a` | 12698 | `9772d4a4be6dd726bb170d5923a52a2ec3683f6d0458d33653653a1ca22d9ad6` |
| `level_jingle.ogg` | 10084 | `067390b1e6ab367219d0c5aeb170477c0c674f12a0e51bb2a30d48bc9c83db37` |
| `mirage_step.m4a` | 2465 | `ae338c5db247b5e0c326d1427772e87a254ce135c0d9afb2dacf95978b08fe71` |
| `mirage_step.ogg` | 5035 | `d92966e3391b2c24d6c32eb00f07f3bb8bd7cc2b5709a1931e58202e5da9c64f` |
| `mirror_fire.m4a` | 3742 | `20de9e0b1f3729d4fe4165e38802bde65807c83f64173bd7e2248a5702f3885d` |
| `mirror_fire.ogg` | 6386 | `511b64c8f10a3e32ea1a414d64b01d28ba36861a974ca15fd7dbbc0363a207a2` |
| `mirror_hum_loop.m4a` | 7283 | `9d45fdad3b6bd5f70966e46ebb00ff27124695b3eb4bd2aad3826ab3292df461` |
| `mirror_hum_loop.ogg` | 5063 | `1c67db0ea6fab3bcd079936679f3ec7370fbc67ded183dc3d93708c7ae77dad2` |
| `music/music_boss.m4a` | 548643 | `665a83aaa221ff9ae10971a369b60fe6ecb8133dc79f45209e269ac7607a74f2` |
| `music/music_boss.ogg` | 499268 | `4dc9be78a1781cb09ec5a6ac645c9cc9bbc8bdb989687541d7d17f6271672747` |
| `music/music_cloister.m4a` | 459058 | `2510f766faa02f2197b8e08f728b903a4d498e55e286a022295da4c945042be4` |
| `music/music_cloister.ogg` | 468620 | `a6c271bd40c05226fb2edb8328414d4de2f23669c1bc34ccf5fe9a1bfbd01046` |
| `music/music_lattice.m4a` | 457724 | `841ed075b79124cd176f83eb9d3a25e2ab92eff8635db02edb9d68e593e4e55d` |
| `music/music_lattice.ogg` | 438747 | `e0832da7223e43809634ba77f8c7f5c9897c14d5d3102351ecc981e1363327af` |
| `music/music_menu.m4a` | 502953 | `fd06d597cbc1806990eee48f757617017610e16b0ce1446540e98a3949efea2c` |
| `music/music_menu.ogg` | 409433 | `39ce99dd4fd84740e933cb79dece388d2be92f906f51ccb36efa9ff197f246dd` |
| `music/music_nadir.m4a` | 413480 | `0471df17239bd1d73e419aff97024c763353f33158d32e4ab44474586ca02219` |
| `music/music_nadir.ogg` | 399397 | `6508697b9940e5b51811c31f07bafa0f49fdc61a4786c474e5e57ae675bba957` |
| `music/music_stair.m4a` | 556187 | `2dbaa038784752edc3f0e004185d0d216c9a7bd0cd266ce96e1f5da4bc2cbfc5` |
| `music/music_stair.ogg` | 512949 | `d89d82e70a1e93336d863af022481751403973395b7d0b77aee23a5bd100a443` |
| `music/music_sundial.m4a` | 381670 | `d7220755680a15ed3295c283ec57c5115f6ff5e769c5634ca998dd6ecd046390` |
| `music/music_sundial.ogg` | 351719 | `f12733f5f70a55914fad8cac4203bdfe1dad751927ec71e8264dbc2f5a641e2e` |
| `music/sfx_boss_sting_a.m4a` | 27523 | `e55eab5f4a1f51559ee96408e89fd43805827537b6657eafc8d95b551e1821ac` |
| `music/sfx_boss_sting_a.ogg` | 27276 | `08b705aa482a8d8426eb5c2b7e2eac900dbe169eaf5f880820c10259baaecccc` |
| `music/sfx_boss_sting_b.m4a` | 27658 | `47c9602242450af3bdaedbe5cf49d3f1a8a17309300a65426772c478a63094b5` |
| `music/sfx_boss_sting_b.ogg` | 28146 | `d7dd7bf5aa383a6ee7ab1746d06ddde232b92f3c05b5799521f93a65a87c0c2e` |
| `music/sfx_boss_sting_c.m4a` | 27629 | `bf72182458fc14408c6d63cb7f68e9ce7b29345839f4ee5e8cd58746657b6bf5` |
| `music/sfx_boss_sting_c.ogg` | 28418 | `9d15099194e21f7616563c92bc82687c9e582cf2be47b9c6b56458dff0f33779` |
| `music/sfx_sunrise.m4a` | 150660 | `b9ea72575d5b5f9ce737fc80a5564b61a44a5ed2ee07374ff6bcd9c791ee16af` |
| `music/sfx_sunrise.ogg` | 120991 | `83ce3e0cd5dbffa3562fb6b993aeb9c6d1ba6843fc2db9d946eb988a20e44eff` |
| `newel_bow.m4a` | 9454 | `fce8873df74d5bc2dc7b231f479e0ed11e770a5b6e2b2a21104133fc3ca1a56d` |
| `newel_bow.ogg` | 4943 | `2f802df57d9f4a0b90c71da9020b53a32cb0e88b0c6c2220342e66821f643aed` |
| `newel_break.m4a` | 2762 | `93c575e0ce74cc1a5f99f5924714e2910ab1dee6da6f9d21054b881766ddf69f` |
| `newel_break.ogg` | 4882 | `36c5156fbf53b4f344f0daec643214513bd3184b880dffe33d107246d1f1bd9b` |
| `newel_cast.m4a` | 3252 | `ef473a3230504ac0f4e04517e1abe3d6e1cadda8dde24d4d94576af1a924581d` |
| `newel_cast.ogg` | 3926 | `9b9c679a382c5392b8deff3790a2e2e5a6cb8f215bea50dd8f09df5fdea6e25c` |
| `newel_fall.m4a` | 5985 | `353867392bff36a94ec75ed2d30c2599dda836143e3fc22adfb970d3ed340059` |
| `newel_fall.ogg` | 4293 | `f60cdf0964dc231825ac1ea25fc91c9eb68def8b7b5dcf1ce83055c079f00607` |
| `newel_sweep.m4a` | 3523 | `d1617a09ac625420b845b31dfbcb1ed86de98f6b11e226e7ae1c8b356e09221c` |
| `newel_sweep.ogg` | 3929 | `bb4181fc3f09068d1e86443cbd369f54d06ce1d8d2d033a111ebf18a4cb646e6` |
| `newel_wake.m4a` | 5847 | `b19e03d2c7fa1d6695e58a22dec96fecae00a18f96e282aa3e447eb28bd36157` |
| `newel_wake.ogg` | 4717 | `4a1549d8243f34c0b607eac7ea3d99702f7f2abaaef13c812125842218ea84d9` |
| `pitch_bubble.m4a` | 7322 | `f1c34ce1dd43d975ca4ac760b8c5b23678679c01dc443348021eb6daa1c1d8a0` |
| `pitch_bubble.ogg` | 4784 | `fe301b0fd5c525b23f9494499311e70322693b3573987b7cdee3f22dfff032d0` |
| `relic_get.m4a` | 6470 | `592c56c2d2560a15591d3ca0ad704b5d0ae7b7e296becf0dd2df89dd6de18254` |
| `relic_get.ogg` | 5574 | `721fc70f86cc7b664264ae854c4fa58a8dc88676e2b814653091a3221019396a` |
| `seal_fade.m4a` | 2307 | `d75e0b7160280ee3b4cc0b7b5523db5aba493ebccfc86246c73e1fdf6d59fb79` |
| `seal_fade.ogg` | 3702 | `a76d6f96ec8f8b070081ba3197962bde77e6507abffabe5a1ba10551666de9a7` |
| `seal_set.m4a` | 1904 | `82de1556b0034fab49655112a4d0b14205b271025fd104b7a8cdb6da2d4d3fec` |
| `seal_set.ogg` | 3587 | `543e97892fc9d94436697e5dd285b1a8bba1f4debf93f044fc4967a55a59fac6` |
| `shimmer_ding.m4a` | 16415 | `26ed0b37ad0797ec248f1ef289068af575250b28422db0d1bec33463cd6848fd` |
| `shimmer_ding.ogg` | 13250 | `17ac67ad8df39968edae7465639dcf983971e038c15110f5ac883d015a8ad38a` |
| `shutter_close.m4a` | 2707 | `913a5c9ed300b8d3ae301d4ff98ffcab08970bd26b0bb1986ef3531b79009e40` |
| `shutter_close.ogg` | 3915 | `62981e23298dda3ced2ed369dd0f75e8e64867076edff6752747d19b0f3f6f4b` |
| `shutter_open.m4a` | 3117 | `0a2b46e6ba34c33b596daf9219a00342619f9822648e0c8c85601ed45ca8841f` |
| `shutter_open.ogg` | 3994 | `44850419b0956646f610264f3057fe5fa53614b593a3fcd79f3e79939740ddec` |
| `slab_slam.m4a` | 3945 | `8387d1e8379e7c53aa5cbdd5eee0982090c505622ec4c401baaad1521a7655cd` |
| `slab_slam.ogg` | 5400 | `97a123be80e07256cf3f79baf5c3b3bd0d03517585d1060d421866938d7510b1` |
| `slab_warn.m4a` | 4451 | `6f1d831cff6b6e8e1c3245fa434173a01974a84491377a86e66dc618c0a54538` |
| `slab_warn.ogg` | 7427 | `f1e1703deb10624e8af6b92a99fd2a508f623ecd351510a5e309330d52d16fb7` |
| `spear_throw_1.m4a` | 2389 | `3c83b03c80c354afd73192bca95d9b0898fc423433b7bec26993468fcffd3bce` |
| `spear_throw_1.ogg` | 4769 | `8c0aa5b6c64afdc75adaebc6db6d3b697adfe7c6206c4a78f5e992209f4c2c8f` |
| `spear_throw_2.m4a` | 2331 | `8a76be23d5c6c7ec11e97a344b0e1cd58e43b17ac3f81910b323f55343bba85e` |
| `spear_throw_2.ogg` | 4548 | `adac665004fff004dcd00e18643cbcd85112c331bea5ba66ee6db86045faeb0d` |
| `spear_throw_3.m4a` | 2638 | `2de417c488c563bd551164b587519698a5933c58e066d05ebaa4e4ff946eec3a` |
| `spear_throw_3.ogg` | 4770 | `95d077511d9acd69f899d69759646a2c47800bb1ad18741e6760457ce6fde25a` |
| `spring_land.m4a` | 3335 | `c9044cfcd46e8892becd8281d34cb584a7ef88aa80362cf8f4ea1649028bc9c3` |
| `spring_land.ogg` | 5575 | `a08e4fdf4fa870e80479ec786ca073324ea2e978d870a2486711588a38c8bb84` |
| `spring_launch.m4a` | 3283 | `52f2e00c3b460499be8e43b19f137eceefcb4402de6d27db05913a8d23d17950` |
| `spring_launch.ogg` | 5332 | `5bc512bcab1314e56358640708df86f0ef392fd0f13a7d3b26b03d2eac6719df` |
| `sun_glide.m4a` | 11634 | `70cf334382cc120fc44d2c3667e724b75131b7d134155b35a0f3fed3160540e1` |
| `sun_glide.ogg` | 5426 | `89df6073ffeb901f8077c452ca3d85864bf17d65d6256ffe2a6f1e61dca50e50` |
| `ui_click.m4a` | 1426 | `e9b5ecf1304c96633e337c92b2a0ded0e8edd1c4fd14be090132eff42906fffe` |
| `ui_click.ogg` | 3849 | `e294198bb90b8aaab810c879965c41f441227147d0cd4d172feedd3920be31be` |
| `ui_confirm.m4a` | 7574 | `ccab9eaad0f8161194df6455abff45d9f804ab7975925224d5b36cc389b14066` |
| `ui_confirm.ogg` | 6663 | `1e719eb63e95dc600447cc1d5cf95d6385fef588c0d215f63963358961d51600` |
| `ui_select.m4a` | 3823 | `3670f5ce4d7d2c2f5bb3b1b8677b900d7860b00a824e9edee9aa0eb5b5273a53` |
| `ui_select.ogg` | 5766 | `8773a706d84a98dc855b14374093a5effdee695a2a5c6dcd10ef00ac9dcd7c78` |
| `votary_cowl.m4a` | 3302 | `3ff41a121f13333b967acb3dd65203c1f7ff3724a251d4fae69d9dfcf4cbbd02` |
| `votary_cowl.ogg` | 3959 | `aa50d2de564bdc822981765584062464844b458f59b90441388e9c6feb832f0a` |
| `water_ebb.m4a` | 8932 | `c070147d40c6cecd0a7ad7b47c45e1b0b65a538a385f5d9a6c9e7d0eb70492e0` |
| `water_ebb.ogg` | 5248 | `263dd900ff0aa12e1e7233ca712833d77be7e54cac349c1ff73547dd840d6f41` |
| `water_fill.m4a` | 8919 | `24a9f093ccdf3ccf09ae6ad6aa1486e288ea6e0b1b3e6b2bd81f5e432f2d4241` |
| `water_fill.ogg` | 5175 | `0767d47090afafe43a7b1d26be18f4b04bbb052cc7e24d24734dedc326bb38c6` |
| `westering_bell.m4a` | 8810 | `aff650b2188105f7e819b00fb3387a39eca7683867a865f941d55dd0e799faea` |
| `westering_bell.ogg` | 5352 | `375bff0de17cd883fc7738f01c48e0a86ae9c526f4b16bc3d14c37730a5f51fd` |
| `win_jingle.m4a` | 17965 | `51e5ca0d38eeac5988d5d6123ccbbb68591d5626b34e8c2cc09d54c3d5cf8624` |
| `win_jingle.ogg` | 12695 | `4e5f0c365d358c1539b4579e8eca12cadef977e3b794119aefb27001e32c35f0` |
| `xp_chime_1.m4a` | 4378 | `3854572870daa5d927418fb13bf96014c3f6119e881f43637a3b28e93032ee87` |
| `xp_chime_1.ogg` | 5126 | `b5e88c029bf5d90ba972eb6e06c78cd6b72535c8ea0dac7f47a2dd870e8e14c8` |
| `xp_chime_2.m4a` | 2657 | `c05e05b78a1a15dbb4bb5f193e5534736fba24b1cd5b9560f7b6233f59ab3122` |
| `xp_chime_2.ogg` | 5109 | `b68bf17f3e7d3cd19f499b012884df7faa4eb8141ed348d9693c48cbfed5505b` |
| `xp_chime_3.m4a` | 2017 | `de94a10aa41daced708f77abf589f41b397a61873e3ed589590c988faa791ad7` |
| `xp_chime_3.ogg` | 4044 | `38f97e1a4466c75df048533fc0d1cbc5191a7035de3d1384de007b4bb5755fb3` |
| `xp_pluck_1.m4a` | 2673 | `91671bcea913c653f5780ff3ee0d63d0c0b8514e0b612a99a4e0b507b529d5f5` |
| `xp_pluck_1.ogg` | 4814 | `36a2b063ca1f36707c8d0ee511c3fa63aa00c48669d0825bba9ab42594a752f0` |
<!-- /shipped-hashes -->
