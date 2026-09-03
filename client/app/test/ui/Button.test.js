import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Button } from '../../src/ui/Button.jsx';

describe('Button', () => {
  it('renders the title text', () => {
    const { getByText } = render(<Button title="Test" onPress={() => {}} />);
    expect(getByText('Test')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const handler = jest.fn();
    const { getByText } = render(<Button title="Press me" onPress={handler} />);
    fireEvent.press(getByText('Press me'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const handler = jest.fn();
    const { getByText } = render(
      <Button title="Disabled" onPress={handler} disabled />
    );
    fireEvent.press(getByText('Disabled'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('renders the danger variant without error', () => {
    const { getByText } = render(
      <Button title="Delete" onPress={() => {}} variant="danger" />
    );
    expect(getByText('Delete')).toBeTruthy();
  });

  it('renders the primary variant by default', () => {
    const { getByText } = render(
      <Button title="Save" onPress={() => {}} />
    );
    expect(getByText('Save')).toBeTruthy();
  });
});
