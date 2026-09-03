/**
 * E2E: Lot lifecycle API — geotag capture, GET /public/lots, two-sided handover
 *
 * Prerequisites:
 *   1. Express API:  cd server/api && npm start          (PORT=3001)
 *   2. Next.js console: cd client/console && npm run dev (PORT=3000)
 *
 * Coverage:
 *   - POST /public/lots stores collectionLat / collectionLng
 *   - GET  /public/lots returns lots filtered by device_id with derived status
 *   - POST /handover/:lot_id/confirm stores handoverLat / handoverLng
 *   - Status progression: PENDING → AWAITING_CONFIRM → CONFIRMED
 */

import { test, expect } from '@playwright/test';
import {
  prisma,
  truncateAll,
  makeRecycler,
  makeCategory,
  makeCollector,
  makeLot,
} from '../../../../server/api/test/helpers/db.js';
import { hashPassword } from '../../../../server/api/src/lib/password.js';
import { uuidv7 } from '@bhaav/core/ids';

const API = 'http://localhost:4000';
const DEVICE_ID = 'test-device-playwright-001';

test.describe('Lot lifecycle — geotag + GET /public/lots', () => {
  test.beforeEach(async () => {
    await truncateAll();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('POST /public/lots stores collectionLat and collectionLng', async ({ request }) => {
    const recycler   = await makeRecycler();
    const category   = await makeCategory({ code: 'CABLE' });
    const collectorId = uuidv7();

    const res = await request.post(`${API}/public/lots`, {
      data: {
        collectorId,
        categoryCode:   'CABLE',
        unit:           'KG',
        quantity:       3.5,
        condition:      'GOOD',
        recyclerId:     recycler.id,
        acceptedRate:   200,
        deviceId:       DEVICE_ID,
        estimatedValue: 700,
        collectionTs:   new Date().toISOString(),
        collectionLat:  19.4174,
        collectionLng:  72.8286,
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.lotId).toBeTruthy();

    const lot = await prisma.lot.findUnique({ where: { id: body.lotId } });
    expect(lot).toBeTruthy();
    expect(lot.collectionLat).toBeCloseTo(19.4174, 3);
    expect(lot.collectionLng).toBeCloseTo(72.8286, 3);
  });

  test('GET /public/lots returns lots for device with PENDING status', async ({ request }) => {
    const recycler    = await makeRecycler();
    const category    = await makeCategory({ code: 'PCB' });
    const collectorId = uuidv7();

    // Submit a lot
    const postRes = await request.post(`${API}/public/lots`, {
      data: {
        collectorId,
        categoryCode:   'PCB',
        unit:           'KG',
        quantity:       1.2,
        condition:      'FAIR',
        recyclerId:     recycler.id,
        acceptedRate:   350,
        deviceId:       DEVICE_ID,
        estimatedValue: 420,
        collectionTs:   new Date().toISOString(),
        collectionLat:  19.4174,
        collectionLng:  72.8286,
      },
    });
    expect(postRes.status()).toBe(201);
    const { lotId } = await postRes.json();

    // Fetch lots for this device
    const getRes = await request.get(`${API}/public/lots?device_id=${DEVICE_ID}`);
    expect(getRes.status()).toBe(200);
    const { lots } = await getRes.json();

    expect(Array.isArray(lots)).toBe(true);
    expect(lots.length).toBeGreaterThanOrEqual(1);

    const lot = lots.find((l) => l.lotId === lotId);
    expect(lot).toBeTruthy();
    expect(lot.status).toBe('PENDING');
    expect(lot.categoryCode).toBe('PCB');
    expect(lot.quantity).toBeCloseTo(1.2, 1);
    expect(lot.collectionLat).toBeCloseTo(19.4174, 3);
    expect(lot.collectionLng).toBeCloseTo(72.8286, 3);
  });

  test('status progresses PENDING → AWAITING_CONFIRM → CONFIRMED', async ({ request }) => {
    // Seed recycler + account for authenticated calls
    const recycler = await makeRecycler({ name: 'Test Recycler' });
    const passwordHash = await hashPassword('demo1234');
    await prisma.recyclerAccount.create({
      data: { recyclerId: recycler.id, email: 'test@bhaav.test', passwordHash },
    });
    const category  = await makeCategory({ code: 'BATTERY' });
    const collector = await makeCollector();

    // 1. Submit lot via public endpoint (simulates collector app)
    const postRes = await request.post(`${API}/public/lots`, {
      data: {
        collectorId:    collector.id,
        categoryCode:   'BATTERY',
        unit:           'KG',
        quantity:       5,
        condition:      'GOOD',
        recyclerId:     recycler.id,
        acceptedRate:   180,
        deviceId:       DEVICE_ID,
        estimatedValue: 900,
        collectionTs:   new Date().toISOString(),
        collectionLat:  19.4174,
        collectionLng:  72.8286,
      },
    });
    expect(postRes.status()).toBe(201);
    const { lotId } = await postRes.json();

    // Confirm status is PENDING
    let getRes = await request.get(`${API}/public/lots?device_id=${DEVICE_ID}`);
    let { lots } = await getRes.json();
    expect(lots.find((l) => l.lotId === lotId)?.status).toBe('PENDING');

    // 2. Recycler acknowledges acceptance
    await prisma.acceptance.update({
      where: { id: (await prisma.acceptance.findFirst({ where: { lotId } })).id },
      data: { recyclerResponse: 'ACKNOWLEDGED' },
    });

    // 3. Recycler creates handover (authenticated)
    const loginRes = await request.post(`${API}/auth/login`, {
      data: { email: 'test@bhaav.test', password: 'demo1234' },
    });
    expect(loginRes.ok()).toBeTruthy();

    const handoverRes = await request.post(`${API}/handover`, {
      data: { lot_id: lotId, inspected_condition: 'GOOD' },
    });
    expect(handoverRes.ok()).toBeTruthy();

    // Status should now be AWAITING_CONFIRM
    getRes = await request.get(`${API}/public/lots?device_id=${DEVICE_ID}`);
    ({ lots } = await getRes.json());
    expect(lots.find((l) => l.lotId === lotId)?.status).toBe('AWAITING_CONFIRM');

    // 4. Collector confirms with handover geotag
    const confirmRes = await request.post(`${API}/handover/${lotId}/confirm`, {
      data: { handoverLat: 19.4180, handoverLng: 72.8290 },
    });
    expect(confirmRes.status()).toBe(200);

    // Verify lat/lng stored in DB
    const handover = await prisma.handover.findUnique({ where: { lotId } });
    expect(handover.status).toBe('CONFIRMED');
    expect(handover.handoverLat).toBeCloseTo(19.4180, 3);
    expect(handover.handoverLng).toBeCloseTo(72.8290, 3);
    expect(handover.collectorConfirmedAt).toBeTruthy();

    // Status should now be CONFIRMED
    getRes = await request.get(`${API}/public/lots?device_id=${DEVICE_ID}`);
    ({ lots } = await getRes.json());
    expect(lots.find((l) => l.lotId === lotId)?.status).toBe('CONFIRMED');
    expect(lots.find((l) => l.lotId === lotId)?.referenceCode).toBeTruthy();
  });

  test('GET /public/lots returns 400 without device_id', async ({ request }) => {
    const res = await request.get(`${API}/public/lots`);
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('device_id_required');
  });

  test('GET /public/lots returns empty array for unknown device', async ({ request }) => {
    const res = await request.get(`${API}/public/lots?device_id=unknown-device-xyz`);
    expect(res.status()).toBe(200);
    const { lots } = await res.json();
    expect(lots).toEqual([]);
  });
});
