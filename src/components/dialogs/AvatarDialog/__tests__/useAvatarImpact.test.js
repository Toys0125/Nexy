import { flushPromises } from '@vue/test-utils';
import { computed, effectScope, ref } from 'vue';

import { useAvatarImpact } from '../useAvatarImpact';

test('looks up each avatar version and ignores ratings returned after switching avatars', async () => {
    const earlier = Promise.withResolvers();
    const rating = { versionNumber: 'second', platform: 'PC', rulesetVersion: 1, level: 'low' };
    const getRatings = vi
        .fn()
        .mockReturnValueOnce(earlier.promise)
        .mockResolvedValueOnce(JSON.stringify([rating]));
    vi.stubGlobal('AppApi', { GetNexVRAvatarImpact: getRatings });
    const avatar = ref({ versions: [{ versionNumber: 'first' }, { versionNumber: 'older' }] });
    const scope = effectScope();
    const ratings = scope.run(() => useAvatarImpact(computed(() => avatar.value)));

    try {
        expect(getRatings).toHaveBeenNthCalledWith(1, ['first', 'older']);
        avatar.value = { versions: [{ versionNumber: 'second' }] };
        await flushPromises();
        expect(getRatings).toHaveBeenNthCalledWith(2, ['second']);
        expect(ratings.value).toEqual([rating]);

        earlier.resolve('[]');
        await flushPromises();
        expect(ratings.value).toEqual([rating]);

        avatar.value = null;
        expect(ratings.value).toBeNull();
    } finally {
        scope.stop();
        vi.unstubAllGlobals();
    }
});
