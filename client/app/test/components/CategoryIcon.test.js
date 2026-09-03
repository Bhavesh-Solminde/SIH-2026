import React from 'react';
import { render } from '@testing-library/react-native';
import { CategoryIcon, CATEGORY_IDS } from '../../src/components/CategoryIcon.jsx';

const CATEGORY_CODES = ['CABLE', 'PCB', 'PANEL', 'CRT', 'BATTERY', 'MOTOR', 'PLASTIC', 'OTHER'];

describe('CategoryIcon', () => {
  it('exports all 8 category IDs', () => {
    expect(CATEGORY_IDS).toHaveLength(8);
    expect(CATEGORY_IDS).toEqual(expect.arrayContaining(CATEGORY_CODES));
  });

  CATEGORY_CODES.forEach((code) => {
    it(`renders ${code} icon without error`, () => {
      const { getByTestId } = render(<CategoryIcon categoryId={code} size={48} />);
      expect(getByTestId(`icon-${code}`)).toBeTruthy();
    });
  });

  it('renders with a custom size', () => {
    const { getByTestId } = render(<CategoryIcon categoryId="PCB" size={64} />);
    expect(getByTestId('icon-PCB')).toBeTruthy();
  });

  it('renders with a custom color override', () => {
    const { getByTestId } = render(
      <CategoryIcon categoryId="BATTERY" size={48} color="#FF0000" />
    );
    expect(getByTestId('icon-BATTERY')).toBeTruthy();
  });

  it('falls back to OTHER icon for unknown categoryId', () => {
    const { getByTestId } = render(
      <CategoryIcon categoryId="UNKNOWN_THING" size={48} />
    );
    // Should fall back to the OTHER icon
    expect(getByTestId('icon-OTHER')).toBeTruthy();
  });
});
