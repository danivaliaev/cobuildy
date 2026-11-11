import { describe, it, expect } from 'vitest'
import { checkFile, mimeOf, sizeText } from './docs'

describe('data room files', () => {
  it('accepts only the allowed types', () => {
    expect(mimeOf('Nota Simple.PDF')).toBe('application/pdf')
    expect(mimeOf('budget.xlsx')).toContain('spreadsheetml')
    expect(mimeOf('virus.exe')).toBeNull()
    expect(mimeOf('noextension')).toBeNull()
  })
  it('checks size and emptiness', () => {
    expect(checkFile({ name: 'a.pdf', size: 1000 })).toBeNull()
    expect(checkFile({ name: 'a.pdf', size: 0 })).toMatch(/empty/)
    expect(checkFile({ name: 'a.pdf', size: 26 * 1024 * 1024 })).toMatch(/25 MB/)
    expect(checkFile({ name: 'a.zip', size: 10 })).toMatch(/Allowed/)
  })
  it('prints sizes', () => {
    expect(sizeText(2048)).toBe('2 KB'); expect(sizeText(5 * 1024 * 1024)).toBe('5.0 MB'); expect(sizeText(null)).toBe('')
  })
})
