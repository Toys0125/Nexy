import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    execute: vi.fn()
}));

vi.mock('../../sqlite.js', () => ({
    default: {
        execute: mocks.execute,
        executeNonQuery: vi.fn()
    }
}));
vi.mock('../index.js', () => ({
    dbVars: {
        maxTableSize: 500,
        searchTableSize: 2,
        userId: 'me',
        userPrefix: ''
    }
}));

import { gameLog } from '../gameLog.js';

describe('gameLog.getMyTopWorlds', () => {
    beforeEach(() => {
        mocks.execute.mockReset();
    });

    test('adds an exclude clause when a home world id is provided', async () => {
        mocks.execute.mockImplementation(async (callback, _sql, _params) => {
            callback(['wrld_1', 'World One', 3, 9000]);
            return undefined;
        });

        const result = await gameLog.getMyTopWorlds(30, 5, 'time', 'wrld_home');

        expect(result).toEqual([
            {
                worldId: 'wrld_1',
                worldName: 'World One',
                visitCount: 3,
                totalTime: 9000
            }
        ]);
        expect(mocks.execute).toHaveBeenCalledTimes(1);
        expect(mocks.execute.mock.calls[0][1]).toContain('AND world_id != @excludeWorldId');
        expect(mocks.execute.mock.calls[0][2]).toMatchObject({
            '@limit': 5,
            '@daysOffset': '-30 days',
            '@excludeWorldId': 'wrld_home'
        });
    });
});

describe('game log query ordering before row limits', () => {
    let db;

    beforeEach(() => {
        db = new DatabaseSync(':memory:');
        db.exec(`
            CREATE TABLE gamelog_join_leave (
                id INTEGER PRIMARY KEY, created_at TEXT, type TEXT,
                display_name TEXT, location TEXT, user_id TEXT, time INTEGER
            );
            INSERT INTO gamelog_join_leave VALUES
                (1, '2026-11-05T22:00:00.000Z', 'OnPlayerLeft', 'Player', 'world:instance', 'a', 1000),
                (2, '2026-11-05T22:00:00.000Z', 'OnPlayerJoined', 'Player', 'world:instance', 'b', 0),
                (3, '2026-11-05T22:00:00.000Z', 'OnPlayerJoined', 'Player', 'world:instance', 'c', 0);
        `);
        mocks.execute.mockImplementation(async (callback, sql, params) => {
            const statement = db.prepare(sql);
            statement.setReturnArrays(true);
            for (const row of statement.all(params)) {
                callback(row);
            }
        });
    });

    afterEach(() => db.close());

    test.each(['location', 'lookup', 'search'])('%s retains priority rows at the limit', async (query) => {
        const filters = ['OnPlayerJoined', 'OnPlayerLeft'];
        const read = () => {
            switch (query) {
                case 'location':
                    return gameLog.getGameLogByLocation('world:instance', filters);
                case 'lookup':
                    return gameLog.lookupGameLogDatabase(filters, [], 2);
                default:
                    return gameLog.searchGameLogDatabase('Player', filters, [], 2);
            }
        };
        expect((await read()).map((row) => row.rowId)).toEqual([1, 3]);

        // Later insertions with older timestamps must not displace newer entries.
        db.exec(`INSERT INTO gamelog_join_leave VALUES
            (4, '2026-11-05T21:00:00.000Z', 'OnPlayerLeft', 'Player', 'world:instance', 'd', 1000)`);
        expect((await read()).map((row) => row.rowId)).toEqual([1, 3]);
    });
});
