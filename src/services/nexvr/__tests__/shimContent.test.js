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

import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { handleShimRequest } from '../shim';
import { NotificationSchema, NotificationType, PresenceStatus, ServerMessageSchema } from '../realtimeSchema';
import { realtime } from '../realtime';
import { getAccessToken, setTokens } from '../session';
import { watchState } from '../../watchState';
import { i18n } from '../../../plugins/i18n';
import en from '../../../localization/en.json';

beforeAll(() => i18n.global.setLocaleMessage('en', en));

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
    '/instances/123': { _id: '123', world: { _id: 'w1', name: 'Club', images: { primary: 'https://cdn/w1.png' } } },
    '/users/stranger': { id: 'stranger', displayName: 'Stranger', profileImageUrl: 'https://cdn/stranger.png' },
    '/groups/g1': { id: 'g1', name: 'Crew', iconUrl: 'https://cdn/g1.png' },
    '/groups/g1/membership': { status: 'invited' }
};

const groupActions = new Set([
    '/groups/g1/accept',
    '/groups/g1/leave',
    '/groups/g1/members/stranger/approve',
    '/groups/g1/members/stranger/decline'
]);

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
    if ((method === 'POST' && groupActions.has(path)) || (method === 'DELETE' && path === '/notifications/group')) {
        return { status: 204, data: '' };
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

    const typed = (id, type, kind, value) => ({
        ...notification(id, type, 'friend'),
        payload: { case: kind, value }
    });

    async function respond(id, responseType, execute = native) {
        const result = await handleShimRequest(
            {
                url: `https://nexvr.net/api/notifications/${id}/respond`,
                method: 'POST',
                body: JSON.stringify({ responseType, responseData: 'untrusted' })
            },
            execute
        );
        return { status: result.status, json: JSON.parse(result.data) };
    }

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

    test('the current NexVR wire format supplies readable requests and responses to the notification list', async () => {
        // Encoded with the NexVR web descriptor, independent of Nexy's decoder.
        const wire = Buffer.from(
            'EoMCCgJtZSL8AQoxCgdyZXF1ZXN0GgJtZSACQhQyMDI2LTExLTAxVDAwOjAwOjAwWloKCghzdHJhbmdlcgoyCghhY2NlcHRlZBoCbWUgBUIUMjAyNi0xMS0wMVQwMDowMDowMFpyCgoGZnJpZW5kEAEKMAoIZGVjbGluZWQaAm1lIAVCFDIwMjYtMTEtMDFUMDA6MDA6MDBacggKBmZyaWVuZAosCgRqb2luGgJtZSAEQhQyMDI2LTExLTAxVDAwOjAwOjAwWmoICgZmcmllbmQKMwoGaW52aXRlGgJtZSABQhQyMDI2LTExLTAxVDAwOjAwOjAwWlINCgZmcmllbmQSAzEyMw==',
            'base64'
        );
        realtime.handleServerMessage(fromBinary(ServerMessageSchema, wire));

        const { json } = await get('auth/user/notifications?n=100&offset=0');
        expect(json).toMatchObject([
            {
                id: 'request',
                type: 'friendRequest',
                senderUserId: 'stranger',
                senderUsername: 'Stranger',
                message: 'Sent you a friend request.'
            },
            { id: 'accepted', type: 'friendRequestResponse', message: 'Accepted your friend request.' },
            { id: 'declined', type: 'friendRequestResponse', message: 'Declined your friend request.' },
            { id: 'join', type: 'requestInvite', message: 'Requested an invite to your instance.' },
            { id: 'invite', type: 'invite', details: { worldId: 'w1:123', worldName: 'Club' } }
        ]);
    });

    test('a legacy wire notification keeps its server text when decoded', async () => {
        const legacyWire = toBinary(
            NotificationSchema,
            create(NotificationSchema, {
                ...notification('old', NotificationType.INVITE_REQUEST, 'friend'),
                title: 'Invite request',
                message: 'Can I join?'
            })
        );
        realtime.notifications = [fromBinary(NotificationSchema, legacyWire)];

        const { json } = await get('auth/user/notifications?n=100&offset=0');
        expect(json[0]).toMatchObject({ type: 'requestInvite', message: 'Invite request: Can I join?' });
    });

    test('dedicated notification types preserve event, moderation, and gift details', async () => {
        realtime.notifications = [
            typed('event', NotificationType.CALENDAR_EVENT_UPDATED, 'calendarEventUpdated', {
                eventTitle: 'Game Night'
            }),
            typed('notice', NotificationType.MODERATION_NOTICE, 'moderationNotice', {
                kind: { case: 'contentRemoved', value: { targetName: 'Example avatar', reason: 'Test reason' } }
            }),
            typed('group-notice', NotificationType.MODERATION_NOTICE, 'moderationNotice', {
                kind: { case: 'suspension', value: { targetType: 'group', targetId: 'g1' } }
            }),
            typed('gift', NotificationType.GIFT_RECEIVED, 'giftReceived', { tierName: 'Plus', months: 3 }),
            typed('cashout', NotificationType.CASHOUT_RESOLVED, 'cashoutResolved', {
                outcome: 'paid',
                note: 'Payment sent'
            })
        ];
        const { json } = await get('auth/user/notifications');
        expect(json).toMatchObject([
            { type: 'calendarEventUpdated', message: 'Updated “Game Night”.' },
            { type: 'moderationNotice', message: 'Moderators removed your Example avatar. Reason: Test reason' },
            { type: 'groupModerationNotice', details: { groupId: 'g1' } },
            { type: 'giftReceived', message: 'Sent you a gift of Plus (3 months).' },
            { type: 'cashoutResolved', message: 'Your cashout was paid. Payment sent' }
        ]);
    });

    test.each([
        ['groupInvite', 'nexvr.accept', '/groups/g1/accept'],
        ['groupInvite', 'nexvr.decline', '/groups/g1/leave'],
        ['groupJoinRequest', 'nexvr.accept', '/groups/g1/members/stranger/approve'],
        ['groupJoinRequest', 'nexvr.decline', '/groups/g1/members/stranger/decline'],
        ['groupJoinRequest', 'nexvr.dismiss', '/notifications/group']
    ])('%s handles %s using the active realtime payload', async (kind, action, path) => {
        const type = kind === 'groupInvite' ? NotificationType.GROUP_INVITE : NotificationType.GROUP_JOIN_REQUEST;
        realtime.notifications = [typed('group', type, kind, { groupId: 'g1', userId: 'stranger' })];
        const { json } = await get('auth/user/notifications');
        expect(json[0]).toMatchObject({
            type: kind === 'groupInvite' ? 'group.invite' : 'group.joinRequest',
            details: { groupId: 'g1', groupName: 'Crew' },
            responses: expect.arrayContaining([expect.objectContaining({ type: action })])
        });
        requested = [];
        expect((await respond('group', action)).status).toBe(200);
        expect(requested).toEqual(path.endsWith('/leave') ? ['/groups/g1/membership', path] : [path]);
    });

    test('declining an old invitation cannot leave a group the user already joined', async () => {
        realtime.notifications = [typed('group', NotificationType.GROUP_INVITE, 'groupInvite', { groupId: 'g1' })];
        const execute = vi.fn(async () => ({ status: 200, data: JSON.stringify({ status: 'active' }) }));
        expect((await respond('group', 'nexvr.decline', execute)).status).toBe(409);
        expect(execute).toHaveBeenCalledTimes(1);
        expect(execute.mock.calls[0][0]).toMatchObject({
            method: 'GET',
            url: 'https://nexvr.net/api/groups/g1/membership'
        });
    });

    test('a response for another account is rejected without changing group membership', async () => {
        realtime.notifications = [
            {
                ...typed('group', NotificationType.GROUP_INVITE, 'groupInvite', { groupId: 'g1' }),
                to: 'different-user'
            }
        ];
        expect((await respond('group', 'nexvr.accept')).status).toBe(404);
        expect(requested).toEqual([]);
    });

    test.each(['before refresh', 'during refresh', 'same session'])(
        'group action 401 recovery: %s',
        async (scenario) => {
            const first = { accessToken: 'access', refreshToken: 'refresh' };
            const second = { accessToken: 'new-account', refreshToken: 'new-refresh' };
            await setTokens(first);
            realtime.userId = 'me';
            const action = typed('group', NotificationType.GROUP_INVITE, 'groupInvite', { groupId: 'g1' });
            realtime.notifications = [action];
            const requests = [];
            const execute = async ({ url, headers }) => {
                const path = new URL(url).pathname;
                requests.push([path, headers.Authorization]);
                if (path === '/api/auth/refresh') {
                    if (scenario === 'during refresh') await setTokens(second);
                    return {
                        status: 200,
                        data: JSON.stringify({ accessToken: 'refreshed-access', refreshToken: 'rotated-refresh' })
                    };
                }
                if (headers.Authorization === 'Bearer access') {
                    if (scenario === 'before refresh') await setTokens(second);
                    return { status: 401, data: '{}' };
                }
                return { status: 204, data: '' };
            };
            try {
                const result = respond(action.id, 'nexvr.accept', execute);
                if (scenario === 'same session') {
                    expect((await result).status).toBe(200);
                } else {
                    await expect(result).rejects.toHaveProperty('name', 'StaleRequestError');
                    expect(await getAccessToken()).toBe(second.accessToken);
                }
                expect(requests).toEqual([
                    ['/api/groups/g1/accept', 'Bearer access'],
                    ...(scenario !== 'before refresh' ? [['/api/auth/refresh', undefined]] : []),
                    ...(scenario === 'same session' ? [['/api/groups/g1/accept', 'Bearer refreshed-access']] : [])
                ]);
            } finally {
                await setTokens(first);
            }
        }
    );

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

    test('a token-only switch drops a pending notification list and clears the old realtime snapshot', async () => {
        const original = { accessToken: 'access', refreshToken: 'refresh' };
        await setTokens(original);
        realtime.userId = 'me';
        const old = [notification('old-account', NotificationType.FRIEND_REQUEST, 'someone')];
        realtime.notifications = old;
        const pending = Promise.withResolvers();
        const fetchList = vi.spyOn(realtime, 'getNotifications').mockReturnValueOnce(pending.promise);
        try {
            const loginState = watchState.isLoggedIn;
            const request = get('auth/user/notifications');
            expect(fetchList).toHaveBeenCalledOnce();
            await setTokens({ accessToken: 'new-account', refreshToken: 'new-refresh' });
            expect(watchState.isLoggedIn).toBe(loginState);
            expect(realtime.notifications).toEqual([]);
            pending.resolve(old);
            expect((await request).json).toEqual([]);
            expect(requested).toEqual([]);
            expect((await get('auth/user/notifications')).json).toEqual([]);
        } finally {
            fetchList.mockRestore();
            await setTokens(original);
        }
    });
});
