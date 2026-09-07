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

// ---------------------------------------------------------------------------
// composeDigits — the form actually used for money on screen.
//
// composeNumber() is bounded at 9999 and produces a grammatical sentence the
// listener then has to convert back into the figure printed in front of them.
// Reading the digits is unbounded and can be checked character by character
// against the display, which is the only verification a collector who cannot
// read the amount actually has.
// ---------------------------------------------------------------------------
import { composeDigits } from '../../src/audio/numbers.js';

describe('composeDigits — digit-by-digit composition', () => {
  it('reads a single digit as itself', () => {
    expect(composeDigits(7)).toEqual(['seven']);
  });

  it('reads 0 as ["zero"]', () => {
    expect(composeDigits(0)).toEqual(['zero']);
  });

  it('reads 20 as "two zero", not "twenty"', () => {
    expect(composeDigits(20)).toEqual(['two', 'zero']);
  });

  it('reads a five-figure amount digit by digit', () => {
    // ₹43,910 → "four three nine one zero"
    expect(composeDigits(43910)).toEqual(['four', 'three', 'nine', 'one', 'zero']);
  });

  it('goes past composeNumber\'s 9999 ceiling without losing digits', () => {
    expect(composeDigits(1234567)).toEqual([
      'one', 'two', 'three', 'four', 'five', 'six', 'seven',
    ]);
  });

  it('rounds a decimal amount to whole rupees', () => {
    expect(composeDigits(129.6)).toEqual(['one', 'three', 'zero']);
  });

  it('reads a negative as its magnitude', () => {
    expect(composeDigits(-45)).toEqual(['four', 'five']);
  });

  it('treats a non-numeric value as zero rather than emitting undefined clips', () => {
    expect(composeDigits(undefined)).toEqual(['zero']);
    expect(composeDigits(NaN)).toEqual(['zero']);
  });

  it('only ever emits clip names the clip pack defines for 0-9', () => {
    const DIGITS = new Set([
      'zero', 'one', 'two', 'three', 'four',
      'five', 'six', 'seven', 'eight', 'nine',
    ]);
    for (const n of [0, 5, 90, 407, 9999, 100000, 8675309]) {
      for (const clip of composeDigits(n)) {
        expect(DIGITS.has(clip)).toBe(true);
      }
    }
  });
});
