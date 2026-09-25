export type FeatureStatus = 'shipped' | 'partial' | 'planned'

export interface FeatureRow {
  area: string
  feature: string
  status: FeatureStatus
  since: string
}

export const FEATURES: FeatureRow[] = [
  { area: 'Shadow-Clock', feature: '60s orbiting sun beam', status: 'shipped', since: 'M1' },
  { area: 'Shadow-Clock', feature: 'Pillar shadows that sweep the floor', status: 'shipped', since: 'M1' },
  { area: 'Shadow-Clock', feature: 'Exposed ×2 and Armored ×0.5', status: 'shipped', since: 'M1' },
  { area: 'Shadow-Clock', feature: 'Shade-to-light stagger', status: 'shipped', since: 'M1' },
  { area: 'Shadow-Clock', feature: 'Wide Noon beam', status: 'shipped', since: 'M1' },
  { area: 'Shadow-Clock', feature: 'Onboarding toast and EXPOSED pop', status: 'shipped', since: 'M2' },
  { area: 'Shadow-Clock', feature: 'Twin Suns, Sunstruck, Shadowstep', status: 'planned', since: 'M3' },
  { area: 'Combat & Weapons', feature: 'Noon Cut dash-slash', status: 'shipped', since: 'M1' },
  { area: 'Combat & Weapons', feature: 'Sunspear auto-fire', status: 'shipped', since: 'M1' },
  { area: 'Combat & Weapons', feature: 'Halo Discs', status: 'shipped', since: 'M1' },
  { area: 'Combat & Weapons', feature: 'Might, Haste, Swiftness, Vitality, Lodestone', status: 'shipped', since: 'M1' },
  { area: 'Combat & Weapons', feature: 'Heliograph, Scarab, Stakes, Prism', status: 'planned', since: 'M3' },
  { area: 'Combat & Weapons', feature: 'Remaining passives, evolutions, Sun Chests', status: 'planned', since: 'M2' },
  { area: 'Enemies', feature: 'Dusk Mite horde', status: 'shipped', since: 'M1' },
  { area: 'Enemies', feature: 'Shade Hound lunge', status: 'shipped', since: 'M1' },
  { area: 'Enemies', feature: 'Veilcaster, Crawler, Moth, Gloamling, elites, the Gloam', status: 'planned', since: 'M2' },
  { area: 'Run/Progression', feature: 'XP shards and level-up pick of 3', status: 'shipped', since: 'M1' },
  { area: 'Run/Progression', feature: '5:00 day held', status: 'shipped', since: 'M1' },
  { area: 'Run/Progression', feature: '10:00 run, Gilt shop, daily seed', status: 'planned', since: 'M2' },
  { area: 'Controls', feature: 'Keyboard, mouse, and touch', status: 'shipped', since: 'M1' },
  { area: 'Controls', feature: 'Flick Noon Cut, recentering stick, haptics hook', status: 'shipped', since: 'M2' },
  { area: 'Controls', feature: 'Gamepad', status: 'planned', since: 'M2' },
  { area: 'Graphics/Performance', feature: 'Floor shader and merged temple', status: 'shipped', since: 'M1' },
  { area: 'Graphics/Performance', feature: 'Instanced hordes and adaptive tiers', status: 'shipped', since: 'M1' },
  { area: 'Graphics/Performance', feature: 'Dynamic resolution, vsync target, tier benchmark', status: 'shipped', since: 'M2' },
  { area: 'Graphics/Performance', feature: 'ACES tonemap, beam edge, sun disc, art slots', status: 'shipped', since: 'M2' },
  { area: 'Graphics/Performance', feature: 'Temple art, toon rim, bloom, blob shadows', status: 'shipped', since: 'M2.1' },
  { area: 'Graphics/Performance', feature: 'Sela, Dusk Mite, and Shade Hound silhouettes', status: 'shipped', since: 'M2.1' },
  { area: 'Graphics/Performance', feature: 'Bloom composite tone map, sRGB, and half-res bloom', status: 'shipped', since: 'M2.2' },
  { area: 'Graphics/Performance', feature: 'M2 camera, move look-ahead, dune ring and haze', status: 'shipped', since: 'M2.2' },
  { area: 'Graphics/Performance', feature: '10s 1% low and dynres step-down under load', status: 'shipped', since: 'M2.2' },
  { area: 'Combat & Weapons', feature: 'Solar Flare, Noon Bell, Long Day, and Searing Light', status: 'shipped', since: 'M2.2' },
  { area: 'Controls', feature: 'Screen shake and haptics settings', status: 'shipped', since: 'M2.1' },
  { area: 'Platform/Ads', feature: 'Feature Map and GitHub Pages', status: 'shipped', since: 'M1' },
  { area: 'Platform/Ads', feature: 'Ads provider interface (Noop only)', status: 'partial', since: 'M1' },
  { area: 'Platform/Ads', feature: 'Sampled audio, music, and mixer', status: 'shipped', since: 'M2.2' },
  { area: 'Platform/Ads', feature: 'Real ad SDK and portal build', status: 'planned', since: 'M3' },
]
