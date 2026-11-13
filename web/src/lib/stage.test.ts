import { describe, it, expect } from 'vitest'
import data from './fields.json'
import { STAGES } from './funnel'
import { FK, applyUpdates, chipsFor, emptyFields } from './profile'

describe('current stage', () => {
  it('uses the same stages as the funnel, per project type', () => {
    const opts = (data as { stageOptions: Record<string, string[]> }).stageOptions
    for (const k of Object.keys(STAGES)) expect(opts[k]).toEqual(STAGES[k as keyof typeof STAGES].map(s => s.label))
  })
  it('offers the stages of the chosen project type', () => {
    const f = applyUpdates(emptyFields(), [{ key: 'a_strategy', status: 'filled', display: 'Work in progress' }]).next
    expect(chipsFor(FK.a_stage, f).map(c => c.label)).toEqual(['Construction started', 'Construction partially completed', 'Near completion'])
  })
  it('clears a stage that does not fit a changed project type', () => {
    let f = applyUpdates(emptyFields(), [{ key: 'a_strategy', status: 'filled', display: 'Work in progress' }, { key: 'a_stage', status: 'filled', display: 'Near completion' }]).next
    f = applyUpdates(f, [{ key: 'a_strategy', status: 'filled', display: 'Land development' }]).next
    expect(f.a_stage.st).toBe('empty')
  })
  it('fills land control from the stage when it is not known yet', () => {
    const f = applyUpdates(emptyFields(), [{ key: 'a_strategy', status: 'filled', display: 'Land development' }, { key: 'a_stage', status: 'filled', display: 'Land reserved' }]).next
    expect(f.l_own).toMatchObject({ st: 'filled', v: 'Reserved (option)' })
    const g = applyUpdates(emptyFields(), [{ key: 'a_stage', status: 'filled', display: 'Land identified' }]).next
    expect(g.l_own).toMatchObject({ st: 'partial', v: 'Identified, not yet secured' })
  })
})
