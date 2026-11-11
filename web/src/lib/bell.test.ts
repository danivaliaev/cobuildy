import { describe, it, expect } from 'vitest'
import { ago } from '../components/Bell'

describe('ago', () => {
  const now = Date.UTC(2026, 10, 11, 12, 0, 0)
  it('formats relative time', () => {
    expect(ago(new Date(now - 20e3).toISOString(), now)).toBe('just now')
    expect(ago(new Date(now - 5 * 60e3).toISOString(), now)).toBe('5 min ago')
    expect(ago(new Date(now - 3 * 3600e3).toISOString(), now)).toBe('3 h ago')
    expect(ago(new Date(now - 2 * 86400e3).toISOString(), now)).toBe('2 d ago')
    expect(ago(new Date(now - 30 * 86400e3).toISOString(), now)).toMatch(/Oct/)
  })
})
