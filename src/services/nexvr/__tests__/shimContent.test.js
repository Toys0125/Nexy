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
import { PresenceStatus } from '../realtimeSchema';
import { realtime } from '../realtime';

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
    '/worlds/': [{ _id: 'w1', name: 'Club', owner: 'me', visibility: 'public', stats: {} }]
};

/** @type {string[]} */
let requested = [];

const native = async ({ url }) => {
    const parsed = new URL(url);
    requested.push(`${parsed.pathname.replace(/^\/api/, '')}${parsed.search}`);
    const path = parsed.pathname.replace(/^\/api/, '');
    if (path in responses) {
        return { status: 200, data: JSON.stringify(responses[path]) };
    }
    return { status: 404, data: JSON.stringify({ message: 'Not found' }) };
};

async function get(path) {
    const res = await handleShimRequest({ url: `https://nexvr.net/api/${path}`, method: 'GET' }, native);
    return { status: res.status, json: JSON.parse(res.data) };
}

beforeEach(() => {
    requested = [];
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
});

describe('NexVR world search', () => {
    test('own worlds are listed by creator', async () => {
        const { json } = await get('worlds?n=50&offset=0&releaseStatus=all&user=me');
        expect(json.map((w) => w.id)).toEqual(['w1']);
        expect(requested).toEqual(['/worlds/?creator=me']);
    });
});
