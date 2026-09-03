import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { LedgerScreen } from '../../src/screens/LedgerScreen.jsx';
import { listLots, earningsTotals } from '../../src/db/repos/lots.js';
import { LanguageContext } from '../../src/i18n/LanguageContext.js';

jest.mock('../../src/db/repos/lots.js');

describe('LedgerScreen', () => {
  it('loads lots and totals, displays them correctly', async () => {
    listLots.mockResolvedValue([
      { id: 'l1', categoryCode: 'CABLE', quantity: 10, unit: 'kg', estimatedValue: 500, handoverStatus: 'PENDING', createdAt: '2026-09-01T00:00:00Z' },
      { id: 'l2', categoryCode: 'PCB', quantity: 5, unit: 'kg', estimatedValue: 200, finalTotal: 250, handoverStatus: 'CONFIRMED', createdAt: '2026-08-31T00:00:00Z' }
    ]);
    earningsTotals.mockResolvedValue({ week: 250, month: 250 });
    
    const db = {};
    
    const { getByText, getAllByText } = render(
      <LanguageContext.Provider value={{ lang: 'mr' }}>
        <LedgerScreen db={db} />
      </LanguageContext.Provider>
    );
    
    await waitFor(() => {
      // Check totals
      expect(getAllByText('₹ 250').length).toBeGreaterThan(0);
      
      // Check lot 1 (pending)
      expect(getByText('₹500')).toBeTruthy();
      expect(getByText('बाकी')).toBeTruthy();
      
      // Check lot 2 (confirmed, should show finalTotal)
      expect(getByText('₹250')).toBeTruthy();
      expect(getByText('मिळाले')).toBeTruthy();
    });
  });
});
