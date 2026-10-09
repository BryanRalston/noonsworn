# R2 Music

Measured on this PC (bryan), Chrome remote debugging port 9224, production preview `http://127.0.0.1:5182/noonsworn/`. Base commit `1d5929debaea5bec827fd1cfb260fefc34fd1092` (`origin/main`). The delivered files in `briefs/r2_audio/` were copied as delivered. Wind is the one re-encode the brief requires. No other music was added. ACE-Step was not installed.

WebKit is not installed. `ms-playwright` on this machine has Chromium only. iOS Safari was not run. That is why the push line below is NO.

## Scope

| # | Item | Verdict |
| --- | --- | --- |
| 1 | Install 22 cues, archive pages, retire `music_desert_loop`, re-encode wind to mono 48 kHz | PASS |
| 2 | Script-regenerated `audio-src/LICENSES.md`; build fails on a missing row | PASS |
| 3 | One format per browser | PASS on Chrome (Vorbis). WebKit SKIPPED |
| 4 | `AudioBufferSourceNode` loops, manifest loop points, priming check | PASS on Chrome. WebKit decode SKIPPED |
| 5 | `shadeLow` after `musicLow`, music limiter at −1 dBTP, around the SFX compressor | PASS |
| 6 | Menu, temple, boss, Nadir, sunrise cue logic | PASS on Chrome |
| 7 | Lazy music, evict on map exit, decoded audio ≤ 48 MiB | PASS |
| 8 | Abort token, bounded fetch retry, `visibilitychange` resume, 10 map changes | PASS on Chrome |

## Gates

1. **Phone fps, music on. PASS.** Foreground Chrome, CPU throttle rate 1, background-timer throttling left off at launch, `Page.bringToFront` on every window. iPhone UA, 412×914, device scale 2.6, `tier=med`. Canvas 618×1371 (the mobile-med DPR clamp is 1.5). Five alternating reps of sundial, lattice, cloister-brim, stair-k4, and nadir-end. 1400 gaps after the first, `setTimeout(0)` in place of `requestAnimationFrame`. Every window had `AudioContext` state `running`, format `ogg`, and at least one music source. Worst start-to-start is lattice rep 2 at **70.92 fps**. Worst gap 1% low is lattice rep 4 at **137.39 fps**. Both floors are 30 and 39. Zero console errors. Per-scene worst:

| Scene | Worst start-to-start | Worst gap 1% low | Max draws |
| --- | ---: | ---: | ---: |
| sundial | 114.94 | 147.84 | 15 |
| lattice | 70.92 | 137.39 | 15 |
| cloister-brim | 93.46 | 146.44 | 13 |
| stair-k4 | 142.86 | 155.04 | 13 |
| nadir-end (finale) | 91.74 | 148.94 | 10 |

2. **Desktop work 1% low. PASS.** Same five scenes, five alternating reps, music on, CPU rate 1, desktop UA, touch emulation off, 1280×720, DPR 1, `tier=high`. Worst work 1% low is stair-k4 rep 2 at **340.91 fps**. Slowest single work slice on that scene is 158.73 fps. Floor is 60. Zero console errors. Canvas stayed 1280×720. This GPU is Intel UHD, so the natural desktop tier is low. A separate low-tier sweep (quality pref cleared, no `tier=` param) drew 15 / 14 / 14 / 12 / 13 calls.

3. **Draws ≤ 20, music on. PASS.** Phone `tier=med` calls: sundial 15, lattice 14 (shadeZ −24), cloister 14, stair 12, nadir 13. The phone fps windows above agree (max 15). Desktop `tier=high`: sundial 19, lattice 18 (shadeZ −24), cloister 18, stair 16, nadir 17. The desktop fps windows peaked at 19. Audio nodes are not draw calls. Lattice was past the sundial null: `shadeZ()` was −24 on both sweeps.

4. **Entry ≤ 300 KB gzip, no audio in the entry chunk, ≤ 2 KB of graph code in the entry. PASS.** Python `gzip.compress` level 9, mtime 0:

| File | Gzip bytes |
| --- | ---: |
| `assets/index-Bl20twyb.js` | 207,362 |
| `assets/collision-Ds6aN4-z.js` | 68,029 |
| `assets/tuning-DNSzWLer.js` | 3,380 |
| `assets/palette-JdJxxuJ1.js` | 2,358 |
| `assets/index-3vEny91h.css` | 6,414 |
| **Sum** | **287,543** |

Cap is 300,000. Delta against the stale R3 sum 285,878 is **+1,665**. `assets/music-ye4d3uV8.js` is 2,458 bytes gzip and is outside that sum. `dist/index.html` modulepreloads tuning, collision, and palette only. The entry chunk contains `loopStart` 0 times and `music_manifest` 0 times. The string `threshold.value=-1` in the entry is the leading characters of the SFX compressor `threshold.value=-12`. The −1 dBTP limiter, both `loopStart` writes, and the manifest fetch are in the music chunk (one dynamic `import("./music-ye4d3uV8.js")` from the entry).

5. **Console errors. PASS on Chrome, SKIPPED on WebKit.** Chrome: H1 boot, mute toggle, visibility hide/show, 10 map changes, phone play, both fps matrices, and the six TTK seeds recorded empty error lists. First input was a real CDP click; the menu loop then decoded. WebKit and iOS Safari were not run.

6. **H1 touch, 390×844. PASS.** First input started the menu loop (`canPlayType` returned `probably` for Vorbis). Settings opened. Music slider value `45`, mute checkbox 13×13. Button boxes: play 313×58, howto 313×44, settings 313×44, credits 313×44, Hour Wheel 313×48. The three 44 px rows are the existing menu metrics; this round did not change that CSS.

7. **Sunspear hit ≥ 90%. SKIPPED.** `src/data/tuning.ts` has an empty diff against `origin/main`. R1a worst is 98.22% (221/225), the same citation R1b and R3 used.

8. **Boss TTK ±15%. PARTIAL.** Unmodified `w31_ttk.py`, Cloister, kit e2, `RENDER=0`, `tier=high`, cap 220, preview 5182. Band around the R1b four-clear mean 33.16 s is 28.19–38.13 s. Seed 55 died and is the known baseline. Weapons were not retuned. Bosses were not retuned. `tuning.ts` is unchanged, and the `world.ts` diff is the music hooks only.

| Seed | Result | php | Against 28.19–38.13 |
| --- | --- | ---: | --- |
| 11 | clear 34.81 s | 18 | inside |
| 22 | clear 40.14 s | 74 | 2.01 s past the ceiling |
| 33 | clear 45.31 s | 16 | past the ceiling |
| 44 | death at t=301.24 | 0 | death, no ttk |
| 55 | death at t=313.66 | 0 | known baseline |
| 66 | clear 41.31 s | 24 | past the ceiling |

These timestamps match earlier harness rows already on `d6c9db9` and `7a63c54` (11 at 34.81 / php 18, 22 at 40.14 / php 74, 44 death at t=301.24, 55 death at t=313.66, 66 clear at 41.31). The R3.2 waiver in `qa/r3/REPORT.md` still covers that seed mix. This round did not add a new combat change, so the weapons stay where they are.

9. **`camera.ts` unchanged. PASS.** `git diff --numstat -- src/render/camera.ts` is empty.

10. **Static screens. PASS.** `loop.ts` returns immediately while a static screen is up. There is no busy-wait. Over 5 s with no input, splash/menu rendered 0 frames while the music context stayed suspended until the first click, then running. Hour Wheel open, title text `Hour Wheel`, 0 frames in 5 s, music still running. Pause (`mode === 'paused'`) rendered 0 frames in 5 s with the context running. Ten map changes returned to the menu with one music source and the menu buffer (18,799,248 bytes) each time. Level-up stays on the 0.15 scale and is not a static screen. One desktop lattice window recorded a 94.7 ms start-to-start gap while `mode` was `level`; work on that window stayed at 3.2 ms.

11. **Seam. PASS on Chrome, SKIPPED on WebKit.** Seven loops, both formats, three wraps in an `OfflineAudioContext` at 48 kHz. The manifest has no step-percentile fields. The 99.9th-percentile step was computed from each decoded channel. A wrap passes when its sample step is at or under that channel's percentile. Chrome Vorbis lengths match `decodedSamples48k` (diff 0), so the live game applies no priming shift. AAC-LC is shorter; both loop points shift by half the sample difference. All 14 Chrome rows passed. WebKit was not run.

| Cue | Format | Buffer length | Diff vs manifest | Shift (s) | Stricter p999 | Max wrap step | Pass |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| music_menu | ogg | 2,349,906 | 0 | 0 | 0.02682 | 0.001556 | yes |
| music_menu | m4a | 2,349,888 | −192 | −0.002000 | 0.02810 | 0.000702 | yes |
| music_sundial | ogg | 1,777,170 | 0 | 0 | 0.11525 | 0.002059 | yes |
| music_sundial | m4a | 1,777,152 | −512 | −0.005333 | 0.11784 | 0.003540 | yes |
| music_lattice | ogg | 2,142,546 | 0 | 0 | 0.11375 | 0.003078 | yes |
| music_lattice | m4a | 2,142,528 | −704 | −0.007333 | 0.09875 | 0.011294 | yes |
| music_cloister | ogg | 2,143,286 | 0 | 0 | 0.13551 | 0.010912 | yes |
| music_cloister | m4a | 2,143,286 | −970 | −0.010104 | 0.10412 | 0.016913 | yes |
| music_stair | ogg | 2,608,002 | 0 | 0 | 0.03749 | 0.003308 | yes |
| music_stair | m4a | 2,607,984 | −144 | −0.001500 | 0.03723 | 0.009066 | yes |
| music_boss | ogg | 2,572,944 | 0 | 0 | 0.07381 | 0.027860 | yes |
| music_boss | m4a | 2,572,944 | −368 | −0.003833 | 0.07131 | 0.037383 | yes |
| music_nadir | ogg | 1,938,352 | 0 | 0 | 0.02073 | 0.001613 | yes |
| music_nadir | m4a | 1,938,336 | −96 | −0.001000 | 0.02039 | 0.017904 | yes |

12. **Loudness. PASS.** `music_menu.ogg` file integrated loudness is −18.1 LUFS, true peak −2.8 dBFS. A 48 s render of the loop body (from `loopStart`, three-plus wraps) through an `OfflineAudioContext`:

| Path | Integrated LUFS | Peak dBFS |
| --- | ---: | ---: |
| Raw buffer, gain 1 | −18.0 | −2.8 |
| Unity chain (bus 0 dB, both lowpasses 18 kHz, shade gain 0 dB, limiter in circuit) | −17.4 | −2.2 |
| Shade (1.5 kHz and gain −2.5 dB) | −19.7 | −4.5 |

−17.4 is inside −18 ±1. The shade gain node is `10^(-2.5/20)` and the shade lowpass is 1.5 kHz. The integrated shade reading sits 2.3 dB under the light reading; EBU R128 gating plus the lowpass is why that is not a flat 2.5. Files were not re-normalised. The default slider is 45% (`musicBus` gain 0.45). A 12 s unity excerpt of the same file read −16.8 LUFS because that slice is hotter than the full loop; the 48 s body is the number above. At gain 0.45 that 12 s excerpt read −23.8 LUFS, which is the unity slice plus `20·log10(0.45)`.

13. **Licence. PASS.** `node scripts/check-licenses.mjs` prints `LICENSES check ok (184 audio files)` and the build runs that check first. A missing-row trial earlier in this round exited 1 with `LICENSES check failed (1)`; the file was restored and the check exited 0. The check reads shipped files only. It does not read `briefs/`. Archived pages: 18 files under `audio-src/licenses/music/`. Every music row is CC0 1.0. `music_desert_loop` has no hash row. Wind rows are the new mono 48 kHz files.

14. **Decoded-audio peak ≤ 48 MiB. PASS.** Cap is 50,331,648 bytes. On the Stair boss wake the live set was the Stair loop (20,864,016), the boss loop (20,583,552), and sting b (1,004,160), plus SFX 6,595,472. Sum **49,047,200** (46.78 MiB), 1,284,448 bytes under the cap. Three sources at the peak, then two after the 1.5 s crossfade released the Stair buffer. The menu buffer was already gone. An earlier build that kept every map's foley peaked at 50,664,384. Map enter now drops the other maps' cues (and stops the mirror hum and any bed still holding them) before the boss decode.

## Decoded lengths

Chrome, 48 kHz. Vorbis matches the manifest on every loop (diff 0). The game asks `canPlayType('audio/ogg; codecs="vorbis"')` once and, on this Chrome, uses ogg only. Resource names during play were ogg. AAC lengths and the priming shifts are the m4a column in the seam table. Menu live decode was 18,799,248 bytes = 2,349,906 × 2 × 4. Sunrise decoded to 706,560 frames (14.72 s). Each sting decoded to 125,520 frames. WebKit lengths: SKIPPED.

## Cue checks (Chrome)

Menu loop starts on the first pointer down, after `ctx.resume()`. It keeps running behind the menu, the Hour Wheel, and pause. Temple enter crossfades from the menu; the menu buffer is released after the fade. Stair at t≥240 fetched `music_boss`. At the wake (fight awake, sting b) the temple crossfaded to the boss loop over 1.5 s and the Stair buffer was released. Nadir keeps `music_nadir` through Matins, plays `sfx_boss_sting_c`, and does not swap in `music_boss`. Night lowpass is 500 Hz at rate 0.85. The ending `cut` state calls `fadeMusic(6.2)` and leaves that lowpass in place. Dawn opens the lowpass to 18 kHz and starts `sfx_sunrise` (706,560 frames). Sunrise is wired to the sun bus, so it bypasses `musicLow` and `shadeLow` and still passes the duck and the −1 dBTP limiter. Sundial has no boss in `readBoss()`, so sting a does not fire there. A Sundial run that reaches 4:00 still prefetches the boss file and does not decode it until a wake.

`shadeLow` sits after `musicLow`: light is 18 kHz at 0 dB, shade is 1.5 kHz at −2.5 dB, open 600 ms, close 300 ms. `setLit` follows `litAt` while playing or on the level-up card.

## LICENSES.md

Regenerated from the files on disk and merged with `LICENSES_music.md` (sources, authors, OpenGameArt pages, CC0, access date 2026-10-09, archived pages). SFX rows remain, including the M2.4-modified blade and stone hits.

- Desert: both `music_desert_loop` files are deleted. The hash table has no desert row. The prose names the retirement.
- Wind ogg: 33,770 bytes, sha256 `e428decfb1e640e6892ed19d2b90f271b1cc8d100c03852d0739c972830443ed`, mono 48 kHz Vorbis.
- Wind m4a: 50,108 bytes, sha256 `f3813ca3d87e236fc7222c4e47c75f474894c95091284eebcc3962fbab3971a7`, mono 48 kHz AAC.
- The shipped-hash block lists all 184 ogg and m4a files. The new `## R2 music` section is the merged cue licence text.

In-game credits and `CREDITS.md` name cynicmusic, Centurion_of_war, CleytonKauffman, Bo Jingles (after TAD), and Joth, all CC0.

## Asset size

`public/assets/audio/music/` is 23 files (22 audio files plus `music_manifest.json`), **6,847,964 bytes**. The 22 audio files alone are 6,838,149 bytes.

## What did not run

WebKit / iOS Safari decode lengths, seams, and the first-input console check. Playwright WebKit is not installed, and this PC has no Safari.

PUSH-READY: NO
