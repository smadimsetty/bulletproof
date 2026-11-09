// apps/mobile/lib/social/commentRules.test.ts
import { COMMENT_MAX, commentError } from './commentRules';

describe('commentError', () => {
  it('rejects empty / whitespace', () => {
    expect(commentError('   ')).not.toBeNull();
  });
  it('rejects over the limit but accepts the limit', () => {
    expect(commentError('x'.repeat(COMMENT_MAX + 1))).not.toBeNull();
    expect(commentError('x'.repeat(COMMENT_MAX))).toBeNull();
  });
});
