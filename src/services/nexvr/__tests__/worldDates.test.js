import { toNexVRWorld } from '../mappers';

const version = (versionNumber, uploadedAt) => ({ versionNumber, package: { uploadedAt } });

describe('NexVR world upload dates', () => {
    test('keeps the first upload date separate from the selected version, regardless of array order', () => {
        const world = toNexVRWorld({
            currentVersion: 'selected',
            versions: [
                version('newest', '2026-11-08T00:00:00Z'),
                version('first', '2026-09-01T00:00:00Z'),
                version('selected', '2026-10-01T00:00:00Z')
            ]
        });

        expect(world.created_at).toBe('2026-09-01T00:00:00Z');
        expect(world.updated_at).toBe('2026-10-01T00:00:00Z');
        // Upload timestamps do not establish when a world became public.
        expect(world.publicationDate).toBe('');
    });

    test('uploading another version does not change the first upload date', () => {
        const versions = [version('first', '2026-09-01T00:00:00Z')];
        const before = toNexVRWorld({ versions });
        const after = toNexVRWorld({ versions: [...versions, version('next', '2026-11-01T00:00:00Z')] });

        expect(after.created_at).toBe(before.created_at);
        expect(after.updated_at).toBe('2026-11-01T00:00:00Z');
    });

    test('compares upload instants across time zones and ignores unavailable timestamps', () => {
        const world = toNexVRWorld({
            versions: [
                version('missing', undefined),
                version('invalid', 'not-a-date'),
                version('later', '2026-09-01T00:30:00Z'),
                version('first', '2026-09-01T01:00:00+02:00')
            ]
        });

        expect(world.created_at).toBe('2026-09-01T01:00:00+02:00');
    });

    test.each([{}, { versions: [] }, { versions: [version('missing', ''), version('invalid', 'none')] }])(
        'leaves the first upload date empty when no valid timestamp is available: %j',
        (world) => {
            expect(toNexVRWorld(world).created_at).toBe('');
        }
    );
});
