import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AcceptScreen } from '../../src/screens/AcceptScreen.jsx';
import { createLot } from '../../src/db/repos/lots.js';
import { createAcceptance } from '../../src/db/repos/acceptances.js';
import { LanguageContext } from '../../src/i18n/LanguageContext.js';

jest.mock('../../src/db/repos/lots.js');
jest.mock('../../src/db/repos/acceptances.js');

describe('AcceptScreen', () => {
  it('creates lot and acceptance on accept', async () => {
    createLot.mockResolvedValue({ id: 'lot1' });
    createAcceptance.mockResolvedValue({});
    
    const db = {};
    const draft = { unit: 'kg' };
    const recycler = { id: 'r1', name: 'Test Recycler', rate: 100, estimatedValue: 500, distanceKm: 2 };
    
    const { getByText } = render(
      <LanguageContext.Provider value={{ lang: 'mr' }}>
        <AcceptScreen db={db} draft={draft} recycler={recycler} onDone={() => {}} />
      </LanguageContext.Provider>
    );
    
    fireEvent.press(getByText('स्वीकार करा'));
    
    await waitFor(() => {
      expect(createLot).toHaveBeenCalledWith(db, draft);
      expect(createAcceptance).toHaveBeenCalledWith(db, expect.objectContaining({
        lotId: 'lot1',
        recyclerId: 'r1',
        rate: 100,
        unit: 'kg'
      }));
      expect(getByText('तुम्ही आत्ता जाऊ शकता.')).toBeTruthy();
    });
  });
});
