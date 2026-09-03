import { sync } from '../../src/screens/SyncEngine.js';

describe('SyncEngine', () => {
  let dbMock;
  let fetchMock;
  let originalFetch;

  beforeEach(() => {
    dbMock = {
      outbox: {
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      }
    };

    fetchMock = jest.fn();
    originalFetch = global.fetch;
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends outbox items and marks them synced', async () => {
    dbMock.outbox.findMany.mockResolvedValue([
      { id: 'ob1', entityType: 'lot', entityId: 'lot1', payload: '{"foo": "bar"}' }
    ]);
    dbMock.outbox.count.mockResolvedValue(0);
    
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ applied: ['lot1'], rejected: [] })
    });

    const stats = await sync('http://localhost', dbMock);
    
    expect(stats.applied).toBe(1);
    expect(stats.rejected).toBe(0);
    expect(stats.pending).toBe(0);
    
    expect(fetchMock).toHaveBeenCalledWith('http://localhost/sync/push', expect.any(Object));
    expect(dbMock.outbox.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['ob1'] } },
      data: { syncedAt: expect.any(String) }
    });
  });
});
