import { PATTERNS, getPatternSpec, getPatternName, PatternSpec } from './patterns';
import { PatternType } from '../types';

const ALL_PATTERN_IDS: PatternType[] = [
  'MISSING_TIMEOUT',
  'MISSING_RETRY',
  'NON_IDEMPOTENT',
  'SILENT_EXCEPTION',
  'UNBOUNDED_POOL',
  'RATE_LIMIT_UNHANDLED',
  'CASCADE_UNGUARDED',
  'NO_DEAD_LETTER',
];

describe('PATTERNS', () => {
  it('should define exactly 8 patterns', () => {
    expect(PATTERNS).toHaveLength(8);
  });

  it('should contain all expected pattern IDs', () => {
    const ids = PATTERNS.map((p) => p.id);
    for (const expected of ALL_PATTERN_IDS) {
      expect(ids).toContain(expected);
    }
  });

  it('should have all unique IDs (no duplicates)', () => {
    const ids = PATTERNS.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have all unique names', () => {
    const names = PATTERNS.map((p) => p.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  describe('each pattern has required fields', () => {
    it.each(PATTERNS.map((p) => [p.id, p] as [string, PatternSpec]))(
      '%s should have all required fields',
      (_id, pattern) => {
        expect(pattern.id).toBeDefined();
        expect(typeof pattern.id).toBe('string');
        expect(pattern.name).toBeDefined();
        expect(typeof pattern.name).toBe('string');
        expect(pattern.name.length).toBeGreaterThan(0);
        expect(pattern.description).toBeDefined();
        expect(typeof pattern.description).toBe('string');
        expect(pattern.description.length).toBeGreaterThan(0);
        expect(['critical', 'high', 'medium']).toContain(pattern.defaultSeverity);
        expect(['line', 'function', 'service-wide']).toContain(pattern.defaultBlastRadius);
        expect(Array.isArray(pattern.keywords)).toBe(true);
        expect(pattern.keywords.length).toBeGreaterThan(0);
      }
    );
  });

  describe('each pattern has at least one example with bad and good code', () => {
    it.each(PATTERNS.map((p) => [p.id, p] as [string, PatternSpec]))(
      '%s should have at least one example',
      (_id, pattern) => {
        expect(pattern.examples).toBeDefined();
        expect(Array.isArray(pattern.examples)).toBe(true);
        expect(pattern.examples.length).toBeGreaterThanOrEqual(1);

        for (const example of pattern.examples) {
          expect(example.bad).toBeDefined();
          expect(typeof example.bad).toBe('string');
          expect(example.bad.length).toBeGreaterThan(0);

          expect(example.good).toBeDefined();
          expect(typeof example.good).toBe('string');
          expect(example.good.length).toBeGreaterThan(0);

          expect(example.language).toBeDefined();
          expect(typeof example.language).toBe('string');
          expect(example.language.length).toBeGreaterThan(0);
        }
      }
    );

    it('bad and good examples should be different', () => {
      for (const pattern of PATTERNS) {
        for (const example of pattern.examples) {
          expect(example.bad).not.toBe(example.good);
        }
      }
    });
  });

  describe('specific pattern validations', () => {
    it('MISSING_TIMEOUT should have multiple language examples', () => {
      const spec = PATTERNS.find((p) => p.id === 'MISSING_TIMEOUT');
      expect(spec!.examples.length).toBeGreaterThanOrEqual(3);
      const languages = spec!.examples.map((e) => e.language);
      expect(languages).toContain('python');
      expect(languages).toContain('javascript');
      expect(languages).toContain('go');
    });

    it('SILENT_EXCEPTION should have python and javascript examples', () => {
      const spec = PATTERNS.find((p) => p.id === 'SILENT_EXCEPTION');
      const languages = spec!.examples.map((e) => e.language);
      expect(languages).toContain('python');
      expect(languages).toContain('javascript');
    });

    it('critical patterns should have service-wide blast radius by default', () => {
      const criticalPatterns = PATTERNS.filter((p) => p.defaultSeverity === 'critical');
      for (const p of criticalPatterns) {
        expect(p.defaultBlastRadius).toBe('service-wide');
      }
    });
  });
});

describe('getPatternSpec', () => {
  it.each(ALL_PATTERN_IDS)(
    'should return the correct spec for "%s"',
    (id) => {
      const spec = getPatternSpec(id);
      expect(spec).toBeDefined();
      expect(spec!.id).toBe(id);
      expect(spec!.name).toBeDefined();
      expect(spec!.description).toBeDefined();
    }
  );

  it('should return undefined for an unknown pattern ID', () => {
    const spec = getPatternSpec('NONEXISTENT_PATTERN' as PatternType);
    expect(spec).toBeUndefined();
  });

  it('should return the same object as in the PATTERNS array', () => {
    for (const pattern of PATTERNS) {
      const spec = getPatternSpec(pattern.id);
      expect(spec).toBe(pattern); // strict reference equality
    }
  });
});

describe('getPatternName', () => {
  const expectedNames: Array<[PatternType, string]> = [
    ['MISSING_TIMEOUT', 'Missing Timeout'],
    ['MISSING_RETRY', 'Missing Retry/Backoff'],
    ['NON_IDEMPOTENT', 'Non-Idempotent Write'],
    ['SILENT_EXCEPTION', 'Silent Exception Swallow'],
    ['UNBOUNDED_POOL', 'Unbounded Connection Pool'],
    ['RATE_LIMIT_UNHANDLED', 'Unhandled Rate Limit'],
    ['CASCADE_UNGUARDED', 'Unguarded Cascade'],
    ['NO_DEAD_LETTER', 'No Dead Letter Queue'],
  ];

  it.each(expectedNames)(
    'should return "%s" for pattern ID "%s"',
    (id, expectedName) => {
      expect(getPatternName(id)).toBe(expectedName);
    }
  );

  it('should return the raw ID string for an unknown pattern', () => {
    const unknownId = 'UNKNOWN_PATTERN' as PatternType;
    expect(getPatternName(unknownId)).toBe('UNKNOWN_PATTERN');
  });

  it('should return human-readable names (not uppercase/snake_case)', () => {
    for (const id of ALL_PATTERN_IDS) {
      const name = getPatternName(id);
      // Names should contain spaces and start with uppercase
      expect(name).toMatch(/^[A-Z]/);
      expect(name).toContain(' ');
      // Should not be the raw ID
      expect(name).not.toBe(id);
    }
  });
});
