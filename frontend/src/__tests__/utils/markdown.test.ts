import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../../utils/markdown'

describe('renderMarkdown', () => {
  it('renders basic markdown', () => {
    const result = renderMarkdown('# Hello\n\nWorld')
    expect(result).toContain('<h1>')
    expect(result).toContain('Hello')
    expect(result).toContain('<p>')
    expect(result).toContain('World')
  })

  it('renders bold text', () => {
    const result = renderMarkdown('**bold**')
    expect(result).toContain('<strong>')
    expect(result).toContain('bold')
  })

  it('renders italic text', () => {
    const result = renderMarkdown('*italic*')
    expect(result).toContain('<em>')
    expect(result).toContain('italic')
  })

  it('renders lists', () => {
    const result = renderMarkdown('- item 1\n- item 2')
    expect(result).toContain('<ul>')
    expect(result).toContain('<li>')
  })

  it('renders code blocks', () => {
    const result = renderMarkdown('```js\nconsole.log("hi")\n```')
    expect(result).toContain('<code')
    expect(result).toContain('console.log')
  })

  it('renders links', () => {
    const result = renderMarkdown('[link](https://example.com)')
    expect(result).toContain('<a')
    expect(result).toContain('href="https://example.com"')
  })

  it('renders images', () => {
    const result = renderMarkdown('![alt](https://example.com/img.jpg)')
    expect(result).toContain('<img')
    expect(result).toContain('src="https://example.com/img.jpg"')
  })

  it('escapes script tags (html:false)', () => {
    // MarkdownIt with html:false escapes HTML tags to entities
    const result = renderMarkdown('<script>alert("xss")</script>')
    expect(result).not.toContain('<script>')
    // The tag is escaped to &lt;script&gt; which is safe
    expect(result).toContain('&lt;script&gt;')
  })

  it('escapes raw HTML tags (html:false)', () => {
    const result = renderMarkdown('<img src=x onerror="alert(1)">')
    // html:false escapes the tag, so it's rendered as text
    expect(result).not.toContain('<img')
    expect(result).toContain('&lt;img')
  })

  it('renders markdown links correctly', () => {
    const result = renderMarkdown('[example](https://example.com)')
    expect(result).toContain('href="https://example.com"')
  })

  it('handles empty input', () => {
    const result = renderMarkdown('')
    expect(result).toBe('')
  })

  it('handles plain text without markdown', () => {
    const result = renderMarkdown('just plain text')
    expect(result).toContain('<p>')
    expect(result).toContain('just plain text')
  })

  it('renders blockquotes', () => {
    const result = renderMarkdown('> quote')
    expect(result).toContain('<blockquote>')
  })

  it('renders tables', () => {
    const result = renderMarkdown('| A | B |\n|---|---|\n| 1 | 2 |')
    expect(result).toContain('<table>')
  })
})
