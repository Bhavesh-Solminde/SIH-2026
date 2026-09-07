import React from 'react';
import { render } from '@testing-library/react-native';
import { RecyclerAuthBadge } from '../../src/components/RecyclerAuthBadge.jsx';

/**
 * Task 9 — per-recycler authorisation evidence.
 *
 * The old per-row chip was a bare "✓ अधिकृत" tick, which says nothing a
 * collector couldn't already assume (the row is on screen, so it's
 * authorised — that's the whole complaint this task exists to fix). This
 * badge must show checkable evidence — the MPCB registration number and
 * the validity date — when the API provides them, and degrade to the old
 * tick (never a blank or broken row) when it doesn't.
 */
describe('RecyclerAuthBadge', () => {
  it('shows the MPCB registration number and validity date when both are present', () => {
    const utils = render(
      <RecyclerAuthBadge registrationNo="MPCB/EW/2024/0456" validityTo="2027-03-31T00:00:00.000Z" />
    );
    const rendered = JSON.stringify(utils.toJSON());
    expect(rendered).toContain('MPCB/EW/2024/0456');
    expect(rendered).toContain('2027-03-31');
  });

  it('falls back to the plain tick when registrationNo is missing', () => {
    const utils = render(<RecyclerAuthBadge registrationNo={null} validityTo="2027-03-31" />);
    const rendered = JSON.stringify(utils.toJSON());
    expect(rendered).toContain('अधिकृत');
    expect(rendered).not.toContain('2027-03-31');
  });

  it('falls back to the plain tick when validityTo is missing', () => {
    const utils = render(<RecyclerAuthBadge registrationNo="MPCB/EW/2024/0456" validityTo={null} />);
    const rendered = JSON.stringify(utils.toJSON());
    expect(rendered).toContain('अधिकृत');
    expect(rendered).not.toContain('MPCB/EW/2024/0456');
  });

  it('falls back to the plain tick when neither field is present, without crashing', () => {
    const utils = render(<RecyclerAuthBadge />);
    expect(JSON.stringify(utils.toJSON())).toContain('अधिकृत');
  });
});
