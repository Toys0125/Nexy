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

import { handleShimRequest } from '../shim';
import { NotificationType, PresenceStatus } from '../realtimeSchema';
import { realtime } from '../realtime';
import { watchState } from '../../watchState';

const avatar = (id, publicity, versions = []) => ({
    id,
    name: id,
    description: '',
    owner: 'me',
    publicity,
    imageUrl: `https://cdn/${id}.png`,
    versions,
    currentVersion: versions.at(-1)?.versionNumber ?? null
});

const version = (versionNumber, uploadedAt, platforms) => ({
    versionNumber,
    label: '',
    package: { url: '', decryptionKey: '', size: 0, uploadedAt, uploadedBy: 'me', platforms }
});

const responses = {
    '/avatars/own/list': [
        avatar('a1', 'public', [
            version('1', '2026-01-01T00:00:00Z', ['pc']),
            version('2', '2026-02-01T00:00:00Z', ['pc', 'android'])
        ]),
        avatar('a2', 'private'),
        avatar('a3', 'private')
    ],
    '/avatars/shared': [{ ...avatar('s1', 'private'), owner: 'friend' }],
    '/avatars/a1': avatar('a1', 'public'),
    '/worlds/': [{ _id: 'w1', name: 'Club', owner: 'me', visibility: 'public', stats: {} }],
    '/worlds/w1': { _id: 'w1', name: 'Club', owner: 'me', images: { primary: 'https://cdn/w1.png' } },
    '/users/stranger': { id: 'stranger', displayName: 'Stranger', profileImageUrl: 'https://cdn/stranger.png' },
    '/groups/g1': { id: 'g1', name: 'Crew', iconUrl: 'https://cdn/g1.png' }
};

/** @type {string[]} */
let requested = [];

/** @type {any[]} */
let patches = [];

/** @type {((path: string) => void) | null} */
let onRequest = null;

const native = async ({ url, method, body }) => {
    const parsed = new URL(url);
    requested.push(`${parsed.pathname.replace(/^\/api/, '')}${parsed.search}`);
    const path = parsed.pathname.replace(/^\/api/, '');
    onRequest?.(path);
    if (method === 'PATCH') {
        const patch = JSON.parse(body);
        patches.push(patch);
        return { status: 200, data: JSON.stringify({ ...avatar('a1', 'private'), ...patch }) };
    }
    if (path in responses) {
        return { status: 200, data: JSON.stringify(responses[path]) };
    }
    return { status: 404, data: JSON.stringify({ message: 'Not found' }) };
};

async function get(path) {
    const res = await handleShimRequest({ url: `https://nexvr.net/api/${path}`, method: 'GET' }, native);
    return { status: res.status, json: JSON.parse(res.data) };
}

async function put(path, body) {
    const res = await handleShimRequest(
        { url: `https://nexvr.net/api/${path}`, method: 'PUT', body: JSON.stringify(body) },
        native
    );
    return { status: res.status, json: JSON.parse(res.data) };
}

beforeEach(() => {
    requested = [];
    patches = [];
    realtime.userId = 'me';
    realtime.friends = new Map([
        ['me', { userId: 'me', displayName: 'Nexy', status: PresenceStatus.ONLINE }],
        ['friend', { userId: 'friend', displayName: 'Friend', status: PresenceStatus.ONLINE }]
    ]);
});

describe('NexVR avatar routes', () => {
    test('own avatars are listed, paged and mapped from the current version', async () => {
        const { status, json } = await get('avatars?n=2&offset=0&releaseStatus=all&user=me');
        expect(status).toBe(200);
        expect(json.map((a) => a.id)).toEqual(['a1', 'a2']);
        expect(json[0]).toMatchObject({
            authorId: 'me',
            authorName: 'Nexy',
            releaseStatus: 'public',
            thumbnailImageUrl: 'https://cdn/a1.png',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-02-01T00:00:00Z',
            version: 2
        });
        expect(json[0].unityPackages.map((p) => p.platform)).toEqual(['standalonewindows', 'android']);

        const next = (await get('avatars?n=2&offset=2&releaseStatus=all&user=me')).json;
        expect(next.map((a) => a.id)).toEqual(['a3']);
    });

    test('release status filters own avatars', async () => {
        const { json } = await get('avatars?n=50&offset=0&releaseStatus=private&userId=me');
        expect(json.map((a) => a.id)).toEqual(['a2', 'a3']);
    });

    test("someone else's avatars are an empty list, not a request", async () => {
        const { status, json } = await get('avatars?n=50&offset=0&userId=friend');
        expect(status).toBe(200);
        expect(json).toEqual([]);
        expect(requested).toEqual([]);
    });

    test('licensed avatars are the ones shared with the caller', async () => {
        const { json } = await get('avatars/licensed?n=100&offset=0');
        expect(json.map((a) => a.id)).toEqual(['s1']);
        expect(json[0].authorName).toBe('Friend');
    });

    test('a single avatar is fetched by id', async () => {
        const { json } = await get('avatars/a1');
        expect(json.id).toBe('a1');
        expect(requested).toEqual(['/avatars/a1']);
    });

    test('saving an avatar patches name, description and release status', async () => {
        const { json } = await put('avatars/a1', { id: 'a1', name: 'New', releaseStatus: 'public' });
        expect(requested).toEqual(['/avatars/own/a1']);
        expect(patches).toEqual([{ name: 'New', publicity: 'public' }]);
        expect(json).toMatchObject({ id: 'a1', name: 'New', releaseStatus: 'public' });
    });

    test('saving only fields NexVR lacks answers 501 without a request', async () => {
        const { status } = await put('avatars/a1', { id: 'a1', tags: ['content_sex'] });
        expect(status).toBe(501);
        expect(requested).toEqual([]);
    });
});

describe('NexVR world search', () => {
    test('own worlds are listed by creator', async () => {
        const { json } = await get('worlds?n=50&offset=0&releaseStatus=all&user=me');
        expect(json.map((w) => w.id)).toEqual(['w1']);
        expect(requested).toEqual(['/worlds/?creator=me']);
    });

    test('your own id asks for creator=me, so private worlds are included', async () => {
        realtime.userId = 'u1';
        await get('worlds?n=50&offset=0&userId=u1');
        await get('worlds?n=50&offset=0&userId=friend');
        expect(requested).toEqual(['/worlds/?creator=me', '/worlds/?creator=friend']);
    });
});

describe('NexVR notifications', () => {
    const notification = (id, type, from, data = {}) => ({
        id,
        type,
        from,
        to: 'me',
        title: '',
        message: '',
        data,
        createdAt: '2026-11-01T00:00:00Z'
    });

    afterEach(() => {
        realtime.notifications = [];
        onRequest = null;
    });

    test("a stranger's friend request carries their name and picture", async () => {
        realtime.notifications = [notification('n1', NotificationType.FRIEND_REQUEST, 'stranger')];
        const { json } = await get('auth/user/notifications?n=100&offset=0');
        expect(json[0]).toMatchObject({
            type: 'friendRequest',
            senderUsername: 'Stranger',
            senderUserIcon: 'https://cdn/stranger.png'
        });
    });

    test("an invite is filled in with the world's name and thumbnail", async () => {
        realtime.notifications = [
            notification('n2', NotificationType.INVITE, 'friend', { worldId: 'w1', instanceId: '123' })
        ];
        const { json } = await get('auth/user/notifications?n=100&offset=0');
        expect(json[0].senderUsername).toBe('Friend');
        expect(json[0].details).toMatchObject({ worldName: 'Club', imageUrl: 'https://cdn/w1.png' });
    });

    test("a group notification is filled in with the group's name and icon", async () => {
        realtime.notifications = [notification('n3', NotificationType.GROUP_INVITE, 'friend', { groupId: 'g1' })];
        const { json } = await get('auth/user/notifications?n=100&offset=0');
        expect(json[0].details).toMatchObject({ groupName: 'Crew', imageUrl: 'https://cdn/g1.png' });
    });

    test('a picture the notification carries is kept', async () => {
        realtime.notifications = [
            notification('n4', NotificationType.GROUP_INVITE, 'friend', {
                groupId: 'g1',
                imageUrl: 'https://cdn/own.png'
            })
        ];
        const { json } = await get('auth/user/notifications?n=100&offset=0');
        expect(json[0].details.imageUrl).toBe('https://cdn/own.png');
    });

    test('a list that loads across a sign-out is dropped, not handed to the next account', async () => {
        realtime.notifications = [notification('n5', NotificationType.FRIEND_REQUEST, 'someone')];
        onRequest = () => {
            onRequest = null;
            watchState.isLoggedIn = !watchState.isLoggedIn;
        };
        const { json } = await get('auth/user/notifications?n=100&offset=0');
        expect(json).toEqual([]);
    });
});
