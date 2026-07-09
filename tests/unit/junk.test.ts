import { describe, expect, it } from 'vitest'
import { classifyJunk } from '../../src/main/mail/junk'

describe('junk classifier (conservative)', () => {
  it('flags obvious spam', () => {
    expect(classifyJunk('CONGRATULATIONS YOU WON a $1000 gift card!!!', 'x@rewards.click', 'Claim your prize now, act now').isJunk).toBe(true)
    expect(classifyJunk('Your account has been suspended', 'security@paypa1.com', 'Verify your account or lose access. Confirm your identity.').isJunk).toBe(true)
    expect(classifyJunk('Unclaimed funds waiting', null, 'A Nigerian prince wishes to wire transfer your inheritance.').isJunk).toBe(true)
  })

  it('leaves legitimate mail alone', () => {
    expect(classifyJunk('Q3 launch timeline — need your sign-off', 'maya@northwind.studio', 'Sharing the updated launch plan.').isJunk).toBe(false)
    expect(classifyJunk('Your invoice for June is ready', 'receipts@stripe.com', 'Invoice INV-2041 for £1,290.00 has been issued.').isJunk).toBe(false)
    // a single spammy word alone is not enough
    expect(classifyJunk('You won the bid on the auction', 'sam@bramblewood.org', 'Well done.').isJunk).toBe(false)
  })

  it('reports a score and reasons', () => {
    const v = classifyJunk('WIN a PRIZE!!!', 'a@spam.xyz', 'claim your reward')
    expect(v.score).toBeGreaterThanOrEqual(3)
    expect(v.reasons.length).toBeGreaterThan(0)
  })
})
