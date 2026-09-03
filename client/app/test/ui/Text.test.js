import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from '../../src/ui/Text.jsx';

describe('Text', () => {
  it('renders body text with correct content', () => {
    const { getByText } = render(<Text>Hello world</Text>);
    expect(getByText('Hello world')).toBeTruthy();
  });

  it('renders heading variant without error', () => {
    const { getByText } = render(<Text variant="heading">Title</Text>);
    expect(getByText('Title')).toBeTruthy();
  });

  it('renders label variant without error', () => {
    const { getByText } = render(<Text variant="label">Label text</Text>);
    expect(getByText('Label text')).toBeTruthy();
  });

  it('renders body variant by default', () => {
    const { getByText } = render(<Text>Default body</Text>);
    expect(getByText('Default body')).toBeTruthy();
  });
});
