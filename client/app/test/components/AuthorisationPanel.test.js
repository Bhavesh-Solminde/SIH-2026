import React from 'react';
import { render } from '@testing-library/react-native';
import { AuthorisationPanel } from '../../src/components/AuthorisationPanel.jsx';

/**
 * Task 9 — the authorisation-evidence panel.
 *
 * A tick on every recycler carries zero information because the list is
 * already filtered to VALID. These tests pin down the thing that IS
 * informative: the panel must render live counts from the API response
 * (never literals baked into the component), must carry the source date,
 * and must never phrase a lapsed listing as unlawful.
 */
describe('AuthorisationPanel', () => {
  it('renders the counts from the API response, not hardcoded literals', () => {
    const utils = render(
      <AuthorisationPanel
        authorisation={{
          listed: 161, valid: 74, lapsed: 87, hiddenFromApp: 87,
          source: { fetchedOn: '2026-08-31' },
        }}
      />
    );
    const rendered = JSON.stringify(utils.toJSON());
    expect(rendered).toContain('161');
    expect(rendered).toContain('74');
    expect(rendered).toContain('87');
  });

  it('reflects a different API response with different numbers — proves it is not literal text', () => {
    const utils = render(
      <AuthorisationPanel
        authorisation={{
          listed: 10, valid: 3, lapsed: 7, hiddenFromApp: 7,
          source: { fetchedOn: '2026-01-01' },
        }}
      />
    );
    const rendered = JSON.stringify(utils.toJSON());
    expect(rendered).toContain('10');
    expect(rendered).toContain('3');
    expect(rendered).toContain('7');
    expect(rendered).not.toContain('161');
  });

  it('shows when the list was last refreshed — a count with no date is unverifiable', () => {
    const utils = render(
      <AuthorisationPanel
        authorisation={{
          listed: 161, valid: 74, lapsed: 87, hiddenFromApp: 87,
          source: { fetchedOn: '2026-08-31' },
        }}
      />
    );
    expect(JSON.stringify(utils.toJSON())).toContain('2026-08-31');
  });

  it('never implies a lapsed facility is unlawful (README ground rule 1: LAPSED_IN_LIST != unlawful)', () => {
    const utils = render(
      <AuthorisationPanel
        authorisation={{
          listed: 161, valid: 74, lapsed: 87, hiddenFromApp: 87,
          source: { fetchedOn: '2026-08-31' },
        }}
      />
    );
    const rendered = JSON.stringify(utils.toJSON());
    // Marathi/English words that would overclaim what a lapsed listing means.
    expect(rendered).not.toMatch(/बेकायदेशीर/); // "illegal"
    expect(rendered).not.toMatch(/बंदी/);        // "banned"
    expect(rendered).not.toMatch(/illegal/i);
    expect(rendered).not.toMatch(/unauthoris/i);
    expect(rendered).not.toMatch(/unlawful/i);
    expect(rendered).not.toMatch(/banned/i);
  });

  it('renders nothing when there is no data yet — never an error state', () => {
    const utils = render(<AuthorisationPanel authorisation={null} />);
    expect(utils.toJSON()).toBeNull();
  });

  it('renders nothing when the list has never been seeded (listed: 0)', () => {
    const utils = render(
      <AuthorisationPanel authorisation={{ listed: 0, valid: 0, lapsed: 0, hiddenFromApp: 0 }} />
    );
    expect(utils.toJSON()).toBeNull();
  });
});
