import { composeNumber } from '../../src/audio/numbers.js';

describe('composeNumber — number-to-clip-name composition', () => {
  describe('single digits', () => {
    it('returns ["zero"] for 0', () => {
      expect(composeNumber(0, 'mr')).toEqual(['zero']);
    });

    it('returns ["one"] for 1', () => {
      expect(composeNumber(1, 'mr')).toEqual(['one']);
    });

    it('returns ["nine"] for 9', () => {
      expect(composeNumber(9, 'hi')).toEqual(['nine']);
    });
  });

  describe('tens', () => {
    it('returns ["ten"] for 10', () => {
      expect(composeNumber(10, 'mr')).toEqual(['ten']);
    });

    it('returns ["twenty"] for 20', () => {
      expect(composeNumber(20, 'hi')).toEqual(['twenty']);
    });

    it('returns ["ninety"] for 90', () => {
      expect(composeNumber(90, 'mr')).toEqual(['ninety']);
    });
  });

  describe('compound two-digit numbers', () => {
    it('returns ["twenty", "three"] for 23', () => {
      expect(composeNumber(23, 'mr')).toEqual(['twenty', 'three']);
    });

    it('returns ["forty", "five"] for 45', () => {
      expect(composeNumber(45, 'hi')).toEqual(['forty', 'five']);
    });

    it('returns ["ninety", "nine"] for 99', () => {
      expect(composeNumber(99, 'mr')).toEqual(['ninety', 'nine']);
    });
  });

  describe('hundreds', () => {
    it('returns ["one", "hundred"] for 100', () => {
      expect(composeNumber(100, 'mr')).toEqual(['one', 'hundred']);
    });

    it('returns ["five", "hundred"] for 500', () => {
      expect(composeNumber(500, 'hi')).toEqual(['five', 'hundred']);
    });

    it('returns ["one", "hundred", "ten", "five"] for 115', () => {
      expect(composeNumber(115, 'mr')).toEqual(['one', 'hundred', 'ten', 'five']);
    });

    it('returns ["three", "hundred", "forty", "two"] for 342', () => {
      expect(composeNumber(342, 'hi')).toEqual(['three', 'hundred', 'forty', 'two']);
    });
  });

  describe('thousands', () => {
    it('returns ["one", "thousand"] for 1000', () => {
      expect(composeNumber(1000, 'mr')).toEqual(['one', 'thousand']);
    });

    it('returns ["one", "thousand", "five", "hundred"] for 1500', () => {
      expect(composeNumber(1500, 'hi')).toEqual(['one', 'thousand', 'five', 'hundred']);
    });

    it('returns correct clips for 2345', () => {
      expect(composeNumber(2345, 'mr')).toEqual([
        'two', 'thousand',
        'three', 'hundred',
        'forty', 'five',
      ]);
    });
  });

  describe('language parameter', () => {
    it('produces the same clip names for mr and hi (same logical tokens)', () => {
      expect(composeNumber(23, 'mr')).toEqual(composeNumber(23, 'hi'));
    });

    it('defaults to mr when lang is omitted', () => {
      expect(composeNumber(7)).toEqual(['seven']);
    });
  });

  describe('edge cases', () => {
    it('handles floats by flooring', () => {
      expect(composeNumber(23.9, 'mr')).toEqual(['twenty', 'three']);
    });

    it('handles negative numbers by taking absolute value', () => {
      expect(composeNumber(-5, 'mr')).toEqual(['five']);
    });
  });
});
