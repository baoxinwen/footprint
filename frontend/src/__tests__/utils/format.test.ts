import { describe, it, expect } from 'vitest'
import { formatDateRange, formatDateCN } from '../../utils/format'

describe('formatDateRange', () => {
  it('formats date range with tilde separator', () => {
    expect(formatDateRange('2025-10-01', '2025-10-03')).toBe('2025-10-01 ~ 2025-10-03')
  })

  it('handles same start and end date', () => {
    expect(formatDateRange('2025-01-01', '2025-01-01')).toBe('2025-01-01 ~ 2025-01-01')
  })
})

describe('formatDateCN', () => {
  it('formats date in Chinese style', () => {
    const result = formatDateCN('2025-10-01')
    expect(result).toContain('2025')
    expect(result).toContain('10')
    expect(result).toContain('1')
    expect(result).toContain('年')
    expect(result).toContain('月')
    expect(result).toContain('日')
  })

  it('handles different dates', () => {
    const result = formatDateCN('2024-01-15')
    expect(result).toContain('2024')
    expect(result).toContain('1')
    expect(result).toContain('15')
  })
})
