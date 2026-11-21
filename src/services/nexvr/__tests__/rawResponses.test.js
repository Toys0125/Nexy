vi.mock('../../appConfig', () => ({
    AppDebug: { endpointDomain: 'https://nexvr.net/api', websocketDomain: '', debugWebRequests: false }
}));
vi.mock('../../config', () => ({
    // a stored session, so authed routes don't read as signed out
    default: {
        getString: async () => JSON.stringify({ accessToken: 'access', refreshToken: 'refresh' }),
        setString: async () => {},
        remove: async () => {}
    }
}));

import { create } from '@bufbuild/protobuf';

import { FriendPresenceSchema, PresenceStatus } from '../realtimeSchema';
import {
    getAvatarFileDetails,
    getRawPresence,
    getRawResponse,
    keepRawResponse,
    presentSections
} from '../rawResponses';
import { handleShimRequest } from '../shim';
import { realtime } from '../realtime';
import { maskEmail, toNexVRCurrentUser, toNexVRUser } from '../mappers';
import { watchState } from '../../watchState';

const avatar = {
    id: 'a1',
    name: 'Example Avatar',
    owner: 'u1',
    publicity: 'private',
    currentVersion: '2',
    versions: [
        {
            versionNumber: '2',
            package: {
                url: 'https://nexvr.net/api/files/avatars/a1/2?t=example',
                decryptionKey: 'avatar-owner-key',
                uploadedAt: '2026-11-20T15:30:00Z',
                platforms: ['pc']
            }
        }
    ]
};

const world = {
    _id: 'w1',
    name: 'Example World',
    owner: 'u1',
    visibility: 'public',
    platforms: ['pc', 'android'],
    currentVersion: '2',
    versions: [
        {
            versionNumber: '2',
            label: '',
            package: {
                url: 'https://cdn.example.com/worlds/w1/v2.BEE',
                decryptionKey: 'creator-only-key',
                size: 123456,
                platforms: ['pc', 'android'],
                uploadedAt: '2026-11-01T00:00:00Z',
                uploadedBy: 'u1',
                buildInfo: null
            }
        }
    ]
};

const native = async ({ url, method }) => {
    const path = new URL(url).pathname.replace(/^\/api/, '');
    if (path === '/users/u1') {
        return { status: 200, data: JSON.stringify({ id: 'u1', username: 'u1', displayName: 'One', socialRank: 'C' }) };
    }
    if (path === '/avatars/a1') {
        return { status: 200, data: JSON.stringify(avatar) };
    }
    if (path === '/worlds/w1') {
        return { status: 200, data: JSON.stringify(world) };
    }
    if (path === '/auth/login' && method === 'POST') {
        return {
            status: 200,
            data: JSON.stringify({ accessToken: 'secret', refreshToken: 'secret', user: { id: 'me' } })
        };
    }
    return { status: 404, data: JSON.stringify({ message: 'Not found' }) };
};

describe('raw NexVR responses for the JSON tabs', () => {
    test('GET responses are kept by path exactly as the server sent them', async () => {
        await handleShimRequest({ url: 'https://nexvr.net/api/users/u1', method: 'GET' }, native);
        // the raw profile, not the VRChat-shaped copy (which would have tags, userIcon, ...)
        expect(getRawResponse('/users/u1')).toEqual({ id: 'u1', username: 'u1', displayName: 'One', socialRank: 'C' });
    });

    test('avatar JSON exposes the BEE URL and reserves the key for the owner’s file details', async () => {
        realtime.userId = 'u1';
        watchState.isLoggedIn = true;
        const response = await handleShimRequest({ url: 'https://nexvr.net/api/avatars/a1', method: 'GET' }, native);

        expect(JSON.parse(response.data)).toHaveProperty('unityPackages');
        const rawAvatar = getRawResponse('/avatars/a1');
        expect(rawAvatar).not.toHaveProperty('unityPackages');
        const { url, uploadedAt } = avatar.versions[0].package;
        expect(rawAvatar.versions[0].package).toEqual({ url, uploadedAt, platforms: ['pc'] });
        expect(getAvatarFileDetails('a1', 'u1')).toMatchObject({
            currentVersion: '2',
            versions: [{ versionNumber: '2', url, uploadedAt, decryptionKey: 'avatar-owner-key' }]
        });
        expect(getAvatarFileDetails('a1', 'u2')).toBeUndefined();

        watchState.isLoggedIn = false;
        expect(getRawResponse('/avatars/a1')).toBeUndefined();
        expect(getAvatarFileDetails('a1', 'u1')).toBeUndefined();
    });

    test('an avatar response fetched by another account never supplies owner file details', async () => {
        realtime.userId = 'u2';
        await handleShimRequest({ url: 'https://nexvr.net/api/avatars/a1', method: 'GET' }, native);

        expect(getRawResponse('/avatars/a1').versions[0].package).not.toHaveProperty('decryptionKey');
        expect(getAvatarFileDetails('a1', 'u1')).toBeUndefined();
        expect(getAvatarFileDetails('a1', 'u2')).toBeUndefined();
    });

    test('a late avatar response cannot repopulate file details after logout', async () => {
        realtime.userId = 'u1';
        watchState.isLoggedIn = true;
        const request = handleShimRequest({ url: 'https://nexvr.net/api/avatars/a1', method: 'GET' }, (init) => {
            if (new URL(init.url).pathname === '/api/avatars/a1') watchState.isLoggedIn = false;
            return native(init);
        });

        await request;
        expect(getRawResponse('/avatars/a1')).toBeUndefined();
        expect(getAvatarFileDetails('a1', 'u1')).toBeUndefined();
    });

    test('world JSON keeps the NexVR BEE location and omits the decryption key', async () => {
        const response = await handleShimRequest({ url: 'https://nexvr.net/api/worlds/w1', method: 'GET' }, native);

        const mappedWorld = JSON.parse(response.data);
        expect(mappedWorld.unityPackages).toMatchObject([
            { platform: 'standalonewindows', assetUrl: '' },
            { platform: 'android', assetUrl: '' }
        ]);

        const rawWorld = getRawResponse('/worlds/w1');
        expect(rawWorld).toMatchObject({
            _id: 'w1',
            currentVersion: '2',
            versions: [{ versionNumber: '2', package: { url: world.versions[0].package.url } }]
        });
        expect(rawWorld).not.toHaveProperty('unityPackages');
        expect(rawWorld.versions[0].package).not.toHaveProperty('decryptionKey');
    });

    test('world details without versions are kept as received', () => {
        const details = { _id: 'w2', platforms: ['pc'] };
        keepRawResponse('/worlds/w2', details);
        expect(getRawResponse('/worlds/w2')).toEqual(details);
    });

    test('responses carrying session tokens are never kept', () => {
        keepRawResponse('/auth/login', { accessToken: 'secret' });
        keepRawResponse('/auth/refresh', { accessToken: 'secret' });
        expect(getRawResponse('/auth/login')).toBeUndefined();
        expect(getRawResponse('/auth/refresh')).toBeUndefined();
    });

    test('the account email is masked before it is kept', () => {
        keepRawResponse('/auth/me', { id: 'me', primaryEmail: 'someone@example.com', emailVerified: true });
        expect(getRawResponse('/auth/me')).toEqual({ id: 'me', primaryEmail: 's****@e****.com', emailVerified: true });
        expect(JSON.stringify(getRawResponse('/auth/me'))).not.toContain('someone@');
    });

    test('the cache is capped, dropping the oldest path first', () => {
        for (let i = 0; i < 310; i++) {
            keepRawResponse(`/cap/${i}`, i);
        }
        expect(getRawResponse('/cap/0')).toBeUndefined();
        expect(getRawResponse('/cap/309')).toBe(309);
    });

    test('presence is shown in protobuf JSON, with enum names', () => {
        realtime.friends = new Map([
            [
                'f1',
                create(FriendPresenceSchema, {
                    userId: 'f1',
                    status: PresenceStatus.JOIN_ME,
                    friendsSince: '2026-01-01T00:00:00Z'
                })
            ]
        ]);
        expect(getRawPresence('f1')).toMatchObject({
            userId: 'f1',
            status: 'PRESENCE_STATUS_JOIN_ME',
            friendsSince: '2026-01-01T00:00:00Z'
        });
        expect(getRawPresence('stranger')).toBeUndefined();
    });

    test('sections with nothing to show are left out', () => {
        expect(presentSections({ user: { id: 'u1' }, presence: undefined })).toEqual({ user: { id: 'u1' } });
    });
});

test('a friend fetched by profile carries when the friendship began', () => {
    const user = toNexVRUser(
        { id: 'f1', username: 'f1' },
        { userId: 'f1', status: PresenceStatus.ONLINE, friendsSince: '2026-02-03T00:00:00Z' }
    );
    expect(user.$friendsSince).toBe('2026-02-03T00:00:00Z');
});

test('the signed-in account only ever exposes a masked email', () => {
    expect(maskEmail('someone@example.com')).toBe('s****@e****.com');
    expect(maskEmail('a@localhost')).toBe('a****@l****');
    expect(maskEmail('')).toBe('');
    expect(maskEmail('not-an-email')).toBe('');
    const me = toNexVRCurrentUser({ id: 'me', username: 'me', primaryEmail: 'someone@example.com' }, new Map());
    expect(me.obfuscatedEmail).toBe('s****@e****.com');
    expect(JSON.stringify(me)).not.toContain('someone@');
});
