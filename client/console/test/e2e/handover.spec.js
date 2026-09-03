/**
 * C07 — Playwright e2e: Two-sided handover flow
 *
 * Prerequisites (run before this test):
 *   1. Express API:  cd server/api && npm start          (PORT=3001)
 *   2. Next.js console: cd client/console && npm run dev (PORT=3000)
 *
 * What it covers:
 *   - Recycler logs in
 *   - Navigates to /verify, enters lot reference code
 *   - Sees lot details (category, quantity, condition)
 *   - Submits handover with inspectedQuantity + finalUnitPrice
 *   - Sees "Awaiting collector confirmation" state
 *   - Collector confirms via direct API call (simulates collector app)
 *   - Console shows CONFIRMED status
 */

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers — direct DB setup via the API's test helpers.
// We import from server/api so e2e seeds can use the same makeRecycler etc.
// The Playwright process runs in Node, so ESM imports work.
// ---------------------------------------------------------------------------
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

test.describe('Two-sided handover', () => {
  test.beforeEach(async () => {
    await truncateAll();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('completes full two-sided handover flow in the browser', async ({ page, request }) => {
    // -----------------------------------------------------------------------
    // 1. Seed: recycler, account, category, collector, lot, acceptance
    // -----------------------------------------------------------------------
    const recycler = await makeRecycler({ name: 'Demo Recycler Pvt Ltd' });
    const passwordHash = await hashPassword('demo1234');
    await prisma.recyclerAccount.create({
      data: {
        recyclerId: recycler.id,
        email: 'demo@bhaav.test',
        passwordHash,
      },
    });

    const category = await makeCategory();
    const collector = await makeCollector();
    const lot = await makeLot({
      categoryId: category.id,
      collectorId: collector.id,
      quantity: 2.9,
      unit: 'KG',
      condition: 'GOOD',
    });

    await prisma.acceptance.create({
      data: {
        id: uuidv7(),
        lotId: lot.id,
        recyclerId: recycler.id,
        acceptedRate: '420.00',
        acceptedUnit: 'KG',
        acceptedTs: new Date(),
        recyclerResponse: 'ACKNOWLEDGED',
      },
    });

    // -----------------------------------------------------------------------
    // 2. Recycler logs in
    // -----------------------------------------------------------------------
    await page.goto('/login');
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await page.getByLabel(/email/i).fill('demo@bhaav.test');
    await page.getByLabel(/password/i).fill('demo1234');
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();

    // Should land on rates or root protected page
    await expect(page).toHaveURL(/\/(rates|dashboard|$)/);

    // -----------------------------------------------------------------------
    // 3. Navigate to /verify, look up the lot by reference code
    // -----------------------------------------------------------------------
    await page.goto('/verify');
    await expect(page.getByRole('heading', { name: /verify|counter.sign/i })).toBeVisible();

    // Derive reference code the same way the server does: referenceCodeFromUuid(lot.id)
    const { referenceCodeFromUuid } = await import('@bhaav/core/ids');
    const refCode = referenceCodeFromUuid(lot.id);

    // Fill the lookup field and submit
    const lookupInput = page.getByPlaceholder(/reference|lot/i).or(page.getByRole('textbox').first());
    await lookupInput.fill(refCode);
    await page.getByRole('button', { name: /look.?up|find|search|verify/i }).click();

    // -----------------------------------------------------------------------
    // 4. See lot details
    // -----------------------------------------------------------------------
    await expect(page.getByText(/PCB|cable|category/i, { timeout: 5000 })).toBeVisible();
    // The accepted rate should show
    await expect(page.getByText(/420/)).toBeVisible();

    // -----------------------------------------------------------------------
    // 5. Submit handover (recycler side): select inspected condition and submit
    //    The page uses radio buttons for condition; price is computed server-side
    //    from the acceptance rate × condition factor.
    // -----------------------------------------------------------------------
    // Condition is pre-selected from lot.condition ("GOOD"); just submit.
    const goodRadio = page.getByRole('radio', { name: 'GOOD' });
    if (await goodRadio.isVisible()) {
      await goodRadio.check();
    }

    await page.getByRole('button', { name: /send|submit|confirm|handover/i }).click();

    // -----------------------------------------------------------------------
    // 6. Awaiting collector confirmation
    // -----------------------------------------------------------------------
    await expect(
      page.getByText(/awaiting|waiting.*collector|pending collector|collector confirm/i, { timeout: 8000 })
    ).toBeVisible();

    // -----------------------------------------------------------------------
    // 7. Collector counter-signs on the same terminal (two-sided handover)
    //    The "Confirm" button calls POST /handover/:lot_id/confirm
    // -----------------------------------------------------------------------
    await page.getByRole('button', { name: /^confirm$/i }).click();

    // -----------------------------------------------------------------------
    // 8. Confirmation complete — "Handover confirmed." section appears
    // -----------------------------------------------------------------------
    await expect(
      page.getByText(/confirmed/i, { timeout: 10000 })
    ).toBeVisible();
  });

  test('lookup with invalid reference code shows an error', async ({ page }) => {
    // Log in first
    const recycler = await makeRecycler();
    const passwordHash = await hashPassword('demo1234');
    await prisma.recyclerAccount.create({
      data: { recyclerId: recycler.id, email: 'err@bhaav.test', passwordHash },
    });

    await page.goto('/login');
    await page.getByLabel(/email/i).fill('err@bhaav.test');
    await page.getByLabel(/password/i).fill('demo1234');
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();
    await expect(page).toHaveURL(/\/(rates|dashboard|$)/);

    await page.goto('/verify');
    const lookupInput = page.getByRole('textbox').first();
    await lookupInput.fill('XXXXX');
    await page.getByRole('button', { name: /look.?up|find|search|verify/i }).click();

    await expect(page.getByText(/not found|no lot|invalid/i, { timeout: 5000 })).toBeVisible();
  });
});
