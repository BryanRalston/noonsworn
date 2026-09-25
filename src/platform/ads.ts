import { TUNING } from '../data/tuning'

export type AdResult = 'rewarded' | 'skipped' | 'unavailable'
export type RewardPlacement = 'revive' | 'reroll' | 'doubleGilt'

export interface AdsProvider {
  init(): Promise<void>
  gameplayStart(): void
  gameplayStop(): void
  showMidroll(): Promise<void>
  showRewarded(placement: RewardPlacement): Promise<AdResult>
  happyTime?(): void
}

export class NoopAds implements AdsProvider {
  fake: boolean
  running = false
  last: AdResult = 'unavailable'

  constructor(fake: boolean) {
    this.fake = fake
  }

  async init(): Promise<void> {}

  gameplayStart() {
    this.running = true
  }

  gameplayStop() {
    this.running = false
  }

  async showMidroll(): Promise<void> {}

  async showRewarded(_placement: RewardPlacement): Promise<AdResult> {
    if (!this.fake) {
      this.last = 'unavailable'
      return 'unavailable'
    }
    await new Promise((resolve) => window.setTimeout(resolve, TUNING.adsFakeMs))
    this.last = 'rewarded'
    return 'rewarded'
  }
}
