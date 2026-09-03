import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { HandoverScreen } from '../../src/screens/HandoverScreen.jsx';
import { confirmHandover } from '../../src/db/repos/handovers.js';
import { LanguageContext } from '../../src/i18n/LanguageContext.js';

jest.mock('../../src/db/repos/handovers.js');
jest.mock('../../src/audio/index.js', () => ({
  play: jest.fn()
}));

describe('HandoverScreen', () => {
  it('confirms handover when correct is pressed', async () => {
    confirmHandover.mockResolvedValue({});
    
    const db = {};
    const lot = { id: 'lot123' };
    
    const { getByText, queryByText } = render(
      <LanguageContext.Provider value={{ lang: 'mr' }}>
        <HandoverScreen db={db} lot={lot} simulatedRecyclerAmount={1000} onDone={() => {}} />
      </LanguageContext.Provider>
    );
    
    fireEvent.press(getByText('Simulate Recycler Scan'));
    
    expect(getByText('₹ 1000')).toBeTruthy();
    
    fireEvent.press(getByText('बरोबर'));
    
    await waitFor(() => {
      expect(confirmHandover).toHaveBeenCalledWith(db, {
        lotId: 'lot123',
        agree: true,
        protest: false
      });
      expect(getByText('झाले')).toBeTruthy(); // done string in mr
    });
  });

  it('protests handover when wrong is pressed', async () => {
    confirmHandover.mockResolvedValue({});
    
    const db = {};
    const lot = { id: 'lot123' };
    
    const { getByText } = render(
      <LanguageContext.Provider value={{ lang: 'mr' }}>
        <HandoverScreen db={db} lot={lot} simulatedRecyclerAmount={1000} onDone={() => {}} />
      </LanguageContext.Provider>
    );
    
    fireEvent.press(getByText('Simulate Recycler Scan'));
    fireEvent.press(getByText('चूक'));
    
    await waitFor(() => {
      expect(confirmHandover).toHaveBeenCalledWith(db, {
        lotId: 'lot123',
        agree: false,
        protest: true
      });
    });
  });
});
