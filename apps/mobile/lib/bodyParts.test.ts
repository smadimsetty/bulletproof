import { bodyPartLabel } from './bodyParts';

test('bodyPartLabel', () => {
  expect(bodyPartLabel('lumbar_spine')).toBe('Lower back');
  expect(bodyPartLabel('lower_back')).toBe('Lower back');
  expect(bodyPartLabel('thoracic_spine')).toBe('Upper back');
  expect(bodyPartLabel('ankle')).toBe('Ankles');
  expect(bodyPartLabel('upper_traps')).toBe('Upper traps');
});
