// apps/mobile/lib/social/followState.test.ts
import { followButtonLabel, sanitizeSearchQuery } from './followState';

describe('followButtonLabel', () => {
  it('maps status and reciprocity to a label', () => {
    expect(followButtonLabel('none', false)).toBe('Follow');
    expect(followButtonLabel('none', true)).toBe('Follow back');
    expect(followButtonLabel('pending', false)).toBe('Requested');
    expect(followButtonLabel('accepted', true)).toBe('Following');
  });
});

describe('sanitizeSearchQuery', () => {
  it('removes filter-grammar and wildcard characters', () => {
    expect(sanitizeSearchQuery('  a,b(c)%d*  ')).toBe('a b c d');
    expect(sanitizeSearchQuery('so_han')).toBe('so_han');
  });
  it('can come out empty', () => {
    expect(sanitizeSearchQuery(' ,() ')).toBe('');
  });
});
