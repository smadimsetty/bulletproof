// apps/mobile/lib/social/media.test.ts
jest.mock('../supabase', () => ({ supabase: {} }));
jest.mock('../session', () => ({ getMyId: jest.fn() }));
jest.mock('./images', () => ({ prepareJpeg: jest.fn(), uploadLocalJpeg: jest.fn(), forgetSignedUrl: jest.fn() }));
import { photoFailureMessage } from './media';

describe('photoFailureMessage', () => {
  it('is null when everything uploaded', () => {
    expect(photoFailureMessage(0)).toBeNull();
  });
  it('pluralizes', () => {
    expect(photoFailureMessage(1)).toBe("Saved, but 1 photo didn't upload — add it from the workout.");
    expect(photoFailureMessage(3)).toBe("Saved, but 3 photos didn't upload — add them from the workout.");
  });
});
