# M2.1 measured timings

Machine: this PC, Intel UHD Graphics (0x0000A7A8), ANGLE D3D11. Phone numbers are Chrome emulation, not a handset. Vsync snapped to 6.94 ms (144 Hz).

## Idle death (no movement, cards auto-picked, openContact 0.75, openSeconds 30)

| seed | death |
| --- | --- |
| 101 | 80.3 s |
| 202 | 70.9 s |
| 303 | 51.9 s |

## First level-up while kiting (WASD square)

| seed | first level-up |
| --- | --- |
| 41 | 11.85 s |
| 42 | 10.92 s |
| 43 | 12.08 s |

## Other measured numbers

- Title transfer, cache disabled, 1920×1080: 400,649 bytes.
- Card atlas `cards_atlas.webp`: 13,228 bytes. Icons drawn at 64 px.
- Prompt contrast on `title_1920.png`: 12.13:1 (text 233,210,166 on plate 22,21,41).
- Clock text vs nearby pixel on the shade closeup: 13.71:1.
- Lit gold 239,210,98 vs lit floor 74,43,16: 8.55:1. Umbral-like pixels averaged 25,20,35 (mean 26.7).
- Cream `#F6E7C8` pixels in the three corner shots: 0%.
- Corner camp from 3:01 for 30.4 s: xp/s 1.0, level 1 → 8. The sim then stopped on a level-up.
- Desktop High, 400 bench mites, DPR 1: avg 146 fps, draws 13, ratio 1.00. Same scene at 4× CPU earlier: avg 118 fps, draws 18.
- Phone emulation 412×915 @2.625, iPhone UA, Med, 6× CPU, 250 mites: avg 119 fps, ratio 1.35–1.45 (cap 1.5), draws 18.
- Dynres at DPR 1.25, tier max 1.25: before 1.20, after Spawn 50×4 at 6× CPU 1.15, 8 s after throttle removed 1.05.
- 60 s fight SFX counts: spear 74, hit 158, exposed 30, armored 126, kill 32, cut 9, xp 80, level 4, hurt 20, shimmer 46, ui 5, death 1, win 0. A separate clear at 5:00 incremented win to 1.
- Tris: mite 110, hound 120, Sela 246.
