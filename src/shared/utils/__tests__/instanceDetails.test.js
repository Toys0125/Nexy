import { getInstanceContentLabel, sameInstanceLocation } from '../instanceDetails';

describe('instance metadata', () => {
    test.each([
        ['sfw', 'SFW'],
        ['nsfw', 'NSFW'],
        ['nsfw_plus', 'ERP'],
        [undefined, ''],
        ['future-mode', '']
    ])('content mode %s displays as %s', (contentMode, label) => {
        expect(getInstanceContentLabel({ $nexvr: { contentMode } })).toBe(label);
    });
    test('an age gate does not imply a content mode', () => {
        expect(getInstanceContentLabel({ ageGate: true })).toBe('');
        expect(getInstanceContentLabel(null)).toBe('');
    });
    test('presence and API locations identify the same instance despite different access tags', () => {
        expect(sameInstanceLocation('world:instance~region(ca)', 'world:instance~friends(owner)~region(ca)')).toBe(
            true
        );
        expect(sameInstanceLocation('world:other', 'world:instance')).toBe(false);
        expect(sameInstanceLocation('other:instance', 'world:instance')).toBe(false);
        expect(sameInstanceLocation('private', 'private')).toBe(false);
        expect(sameInstanceLocation('', '')).toBe(false);
    });
});
