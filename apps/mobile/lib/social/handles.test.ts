// apps/mobile/lib/social/handles.test.ts
import { displayNameError, handleError, normalizeHandle } from './handles';

describe('normalizeHandle', () => {
  it('trims, lowercases and strips a leading @', () => {
    expect(normalizeHandle('  @Sohan_M ')).toBe('sohan_m');
  });
});

describe('handleError', () => {
  it('rejects too-short and invalid-character handles', () => {
    expect(handleError('ab')).not.toBeNull();
    expect(handleError('has space')).not.toBeNull();
    expect(handleError('a'.repeat(21))).not.toBeNull();
    expect(handleError('Upper')).not.toBeNull();
  });
  it('accepts valid handles', () => {
    expect(handleError('sohan_m')).toBeNull();
    expect(handleError('abc')).toBeNull();
  });
});

describe('displayNameError', () => {
  it('requires 1-40 characters', () => {
    expect(displayNameError('   ')).not.toBeNull();
    expect(displayNameError('x'.repeat(41))).not.toBeNull();
    expect(displayNameError('Sohan')).toBeNull();
  });
});
