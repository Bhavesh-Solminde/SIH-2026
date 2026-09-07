import strings, { LANGS } from '../../src/i18n/strings.js';

describe('strings — localisation catalogue (key-major)', () => {
  const keys = Object.keys(strings);

  it('exports mr, hi and en as the supported languages', () => {
    expect(LANGS).toEqual(['mr', 'hi', 'en']);
  });

  it('has at least one key', () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  it('every key has a non-empty string for every language', () => {
    const missing = [];
    for (const key of keys) {
      for (const lang of LANGS) {
        const value = strings[key][lang];
        if (typeof value !== 'string' || value.length === 0) {
          missing.push(`${key}.${lang}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('has no language object with extra keys not in LANGS', () => {
    const stray = [];
    for (const key of keys) {
      for (const lang of Object.keys(strings[key])) {
        if (!LANGS.includes(lang)) stray.push(`${key}.${lang}`);
      }
    }
    expect(stray).toEqual([]);
  });

  describe('spot checks', () => {
    it('has a home_title string in all three languages', () => {
      expect(strings.home_title.mr).toBe('भाव संग्राहक');
      expect(strings.home_title.hi).toBe('भाव संग्राहक');
      expect(strings.home_title.en).toBe('Bhaav Collector');
    });

    it('has condition strings for good, fair, poor', () => {
      expect(typeof strings.condition_good.mr).toBe('string');
      expect(typeof strings.condition_fair.mr).toBe('string');
      expect(typeof strings.condition_poor.mr).toBe('string');
    });

    it('has all 8 category strings', () => {
      for (const cat of ['cable', 'pcb', 'panel', 'crt', 'battery', 'motor', 'plastic', 'other']) {
        expect(typeof strings[`category_${cat}`].mr).toBe('string');
      }
    });

    it('home_new_lot differs between mr and hi', () => {
      expect(strings.home_new_lot.mr).not.toBe(strings.home_new_lot.hi);
    });

    it('category_other is present and non-empty in hi', () => {
      expect(strings.category_other.hi.length).toBeGreaterThan(0);
    });
  });

  describe('catalogue usage — dead keys and unknown references', () => {
    // Every key that should exist as t('literal_key') across the app. Three
    // call shapes need separate handling:
    //
    //  1. A direct literal:            t('home_title')
    //  2. A computed template key:     t(`condition_${cond}`)
    //  3. A lookup-map indirection:    STATUS_LABEL_KEY = { PENDING: 'handover_pending' }
    //                                  ... t(STATUS_LABEL_KEY[status])
    //
    // (3) is caught by a plain substring scan, since the key name still
    // appears as a literal string in the map. (2) is not — the literal in
    // source is the STATIC PREFIX ('condition_'), not the full key — so
    // those prefixes are extracted directly from every `` `prefix_${ ``
    // occurrence in source and any catalogue key starting with one is
    // treated as referenced.
    const fs = require('fs');
    const path = require('path');
    const APP_ROOT = path.resolve(__dirname, '../..');

    function listSourceFiles(dir, out = []) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (['node_modules', 'generated', 'generated-node'].includes(entry.name)) continue;
          listSourceFiles(full, out);
        } else if (/\.(js|jsx)$/.test(entry.name) && full !== path.join(APP_ROOT, 'src/i18n/strings.js')) {
          out.push(full);
        }
      }
      return out;
    }

    const files = [
      path.join(APP_ROOT, 'App.js'),
      ...listSourceFiles(path.join(APP_ROOT, 'src')),
    ];
    const sources = files.map((f) => fs.readFileSync(f, 'utf8'));
    const combined = sources.join('\n');

    // `` `condition_${ `` -> 'condition_'
    const dynamicPrefixes = [...combined.matchAll(/`([a-zA-Z0-9_]+_)\$\{/g)].map((m) => m[1]);

    // t('requests_pending', { count: ... }) resolves through _one/_other,
    // never the bare key itself — so a direct-call scan correctly never
    // "sees" requests_pending_one/_other, and a bare-key scan would wrongly
    // flag 'requests_pending' as unknown even though it resolves fine via
    // the plural mechanism. Collect the base names passed alongside a
    // `count` param so both checks below can special-case them.
    const pluralBaseKeys = new Set(
      [...combined.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_]+)['"]\s*,\s*\{\s*count\b/g)].map((m) => m[1])
    );

    // Present in the original 68-key catalogue before this i18n sweep and
    // not called anywhere, directly or dynamically. Left in place rather
    // than deleted unilaterally — removing catalogue entries is a product
    // decision (they may be reserved for a screen/button not yet built,
    // e.g. a generic "save"), not something this translation-completeness
    // pass should decide on its own. Allowlisted explicitly so a genuinely
    // NEW dead key (the actual regression this test guards against) still
    // fails loudly instead of blending into a list nobody reads.
    const KNOWN_UNUSED_LEGACY_KEYS = new Set([
      'home_subtitle', 'camera_retake', 'camera_confirm', 'camera_permission',
      'subcategory_mixed', 'quantity_placeholder', 'value_unit',
      'earnings_today', 'price_board_updated',
      'ok', 'save', 'error_generic', 'retry', 'inaction_note',
    ]);

    it('every direct t(\'key\') call site references a key that exists', () => {
      const callPattern = /\bt\(\s*['"]([a-zA-Z0-9_]+)['"]/g;
      const unknown = new Set();
      let match;
      while ((match = callPattern.exec(combined))) {
        const key = match[1];
        if (strings[key] === undefined && !pluralBaseKeys.has(key)) unknown.add(key);
      }
      expect([...unknown]).toEqual([]);
    });

    it('every catalogue key is referenced somewhere in the app (no NEW dead keys)', () => {
      const dead = keys.filter((key) => {
        if (KNOWN_UNUSED_LEGACY_KEYS.has(key)) return false;
        if (combined.includes(`'${key}'`) || combined.includes(`"${key}"`) || combined.includes(`\`${key}\``)) return false;
        if (dynamicPrefixes.some((prefix) => key.startsWith(prefix))) return false;
        const pluralBase = key.replace(/_(one|other)$/, '');
        if (pluralBase !== key && pluralBaseKeys.has(pluralBase)) return false;
        return true;
      });
      expect(dead).toEqual([]);
    });
  });

  describe('plural keys', () => {
    it('requests_pending ships both _one and _other variants with a {count} placeholder', () => {
      expect(strings.requests_pending_one.en).toContain('{count}');
      expect(strings.requests_pending_other.en).toContain('{count}');
      expect(strings.requests_pending_one.en).not.toBe(strings.requests_pending_other.en);
    });
  });
});
