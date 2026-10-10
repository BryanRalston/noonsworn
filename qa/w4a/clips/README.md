# W4a clip harness

Both the BEFORE set (base `b70fc90`) and the AFTER set (`index-D1Fj2Xe7.js`) use this page, then the same in-page setup.

- Desktop: `http://127.0.0.1:5182/noonsworn/?dev=1&seed=11&map=sundial&tier=high`
- Phone: `http://127.0.0.1:5182/noonsworn/?dev=1&seed=11&map=sundial&tier=med`

The URL does not start the run by itself. After `w2` is ready the harness calls `seedRun(11)` on Sundial, then:

- level 13, player at `(0, 0)`, `invuln` 40
- sun `theta0` 0.9, `dir` 1, `time` 55, then frozen
- `noonsworn.music` 45, `noonsworn.sfx` 90, `noonsworn.shake` 1
- one weapon: that weapon at rank 5, the other seven at 0, evolution on only for `*_evo`
- full kit: all eight at rank 5, multitude 2, reach 5, might 4, haste 2, wide 2, and evolutions on for `fullkit_evo`
- a ring of mites at radius `6.2 + (i % 6) * 0.85`. Single weapons spawn 36. The full kit spawns 200.

Phone clips are 390×844 with `deviceScaleFactor` 1 and one touch point. That is the clip viewport. The phone frame-rate gate is a different setup: 412×914, DPR 2.6, `tier=med`.

Capture is CDP `Page.startScreencast` plus an `AudioContext` tap into `MediaRecorder`, muxed with ffmpeg VP9 + Opus. `canvas.captureStream` is not used.

Quiet phone frames that could not hold 4 Mbps were re-encoded with `noise=alls=4:allf=t+u`. The grain is only in the file. The game audio was copied.

- Before: `flare_r5_before_phone.webm`, `bell_evo_before_phone.webm`
- After: `flare_r5_after_phone.webm`, `flare_evo_after_phone.webm`, `bell_evo_after_phone.webm`, `helio_evo_after_phone.webm`

Side-by-sides are before on the left and after on the right, at 2 Mbps desktop and 1.5 Mbps phone, with the after clip's audio. They are under the primary bitrate floor on purpose. `contact_sheet.jpg` is six frames (0.8, 2.0, 3.4, 4.8, 6.2, 7.6 s), before row over after row, desk then phone, for every subject.

Primary clips meet 8–12 s, VP9, Opus, desktop ≥ 6 Mbps at 1280×720, phone ≥ 4 Mbps at 390×844. The webms are about 641 MB together and are not committed.
