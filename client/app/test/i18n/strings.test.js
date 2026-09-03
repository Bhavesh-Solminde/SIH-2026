import strings from '../../src/i18n/strings.js';

describe('strings — localisation string table', () => {
  it('exports both mr and hi language objects', () => {
    expect(strings).toHaveProperty('mr');
    expect(strings).toHaveProperty('hi');
  });

  it('mr and hi have the same keys', () => {
    const mrKeys = Object.keys(strings.mr).sort();
    const hiKeys = Object.keys(strings.hi).sort();
    expect(mrKeys).toEqual(hiKeys);
  });

  describe('Marathi (mr) strings', () => {
    it('has a home_title string', () => {
      expect(typeof strings.mr.home_title).toBe('string');
      expect(strings.mr.home_title.length).toBeGreaterThan(0);
    });

    it('has condition strings for good, fair, poor', () => {
      expect(typeof strings.mr.condition_good).toBe('string');
      expect(typeof strings.mr.condition_fair).toBe('string');
      expect(typeof strings.mr.condition_poor).toBe('string');
    });

    it('has all 8 category strings', () => {
      expect(typeof strings.mr.category_cable).toBe('string');
      expect(typeof strings.mr.category_pcb).toBe('string');
      expect(typeof strings.mr.category_panel).toBe('string');
      expect(typeof strings.mr.category_crt).toBe('string');
      expect(typeof strings.mr.category_battery).toBe('string');
      expect(typeof strings.mr.category_motor).toBe('string');
      expect(typeof strings.mr.category_plastic).toBe('string');
      expect(typeof strings.mr.category_other).toBe('string');
    });
  });

  describe('Hindi (hi) strings', () => {
    it('has a home_title string', () => {
      expect(typeof strings.hi.home_title).toBe('string');
      expect(strings.hi.home_title.length).toBeGreaterThan(0);
    });

    it('home_new_lot differs between mr and hi', () => {
      // They should be in different scripts/words
      expect(strings.mr.home_new_lot).not.toBe(strings.hi.home_new_lot);
    });

    it('category_other is present and non-empty in hi', () => {
      expect(strings.hi.category_other.length).toBeGreaterThan(0);
    });
  });
});
