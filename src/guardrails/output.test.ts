import { validateCodeSuggestion } from './output';

// Suppress logger output during tests
jest.mock('../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

describe('validateCodeSuggestion', () => {
  describe('empty / blank fix rejection', () => {
    it('should block an empty string fix', () => {
      const result = validateCodeSuggestion('', 'file.py');

      expect(result.passed).toBe(false);
      expect(result.action).toBe('block');
      expect(result.reason).toBe('Empty fix suggestion');
    });

    it('should block a whitespace-only fix', () => {
      const result = validateCodeSuggestion('   \n\t  ', 'file.js');

      expect(result.passed).toBe(false);
      expect(result.action).toBe('block');
      expect(result.reason).toBe('Empty fix suggestion');
    });

    it('should block null-ish (undefined coerced) content', () => {
      // The function checks !fix, so passing undefined/null would also be blocked
      const result = validateCodeSuggestion(undefined as unknown as string, 'file.ts');

      expect(result.passed).toBe(false);
      expect(result.action).toBe('block');
    });
  });

  describe('hallucination pattern detection', () => {
    it('should block short suggestions containing "..."', () => {
      const fix = 'do_something(...)';
      const result = validateCodeSuggestion(fix, 'file.py');

      expect(result.passed).toBe(false);
      expect(result.action).toBe('block');
      expect(result.reason).toContain('hallucination');
    });

    it('should block short suggestions containing "your_xxx_here"', () => {
      const fix = 'api_key = your_api_key_here';
      const result = validateCodeSuggestion(fix, 'file.py');

      expect(result.passed).toBe(false);
      expect(result.action).toBe('block');
      expect(result.reason).toContain('hallucination');
    });

    it('should block short suggestions containing "INSERT_XXX_HERE"', () => {
      const fix = 'token = INSERT_TOKEN_HERE';
      const result = validateCodeSuggestion(fix, 'file.py');

      expect(result.passed).toBe(false);
      expect(result.action).toBe('block');
      expect(result.reason).toContain('hallucination');
    });

    it('should block short suggestions with TODO/FIXME', () => {
      const fix = '# TODO: implement this';
      const result = validateCodeSuggestion(fix, 'file.py');

      expect(result.passed).toBe(false);
      expect(result.action).toBe('block');
      expect(result.reason).toContain('hallucination');
    });

    it('should allow long code with "..." inside a comment', () => {
      const fix = `
def process_data(data):
    # This function handles various cases...
    # It processes all items in the list and returns a dict
    result = {}
    for item in data:
        result[item.id] = item.value
    return result
`.trim();
      // This is > 50 chars, so hallucination check should NOT trigger
      const result = validateCodeSuggestion(fix, 'file.py');

      expect(result.passed).toBe(true);
      expect(result.action).toBe('allow');
    });

    it('should allow long code with TODO in a large block', () => {
      const fix = `
function fetchUser(id) {
    // TODO: add caching layer for performance
    const response = await fetch('/api/users/' + id, { signal: AbortSignal.timeout(5000) });
    return response.json();
}
`.trim();
      const result = validateCodeSuggestion(fix, 'file.js');

      expect(result.passed).toBe(true);
    });
  });

  describe('Python validation', () => {
    it('should allow valid Python code', () => {
      const fix = `
def retry_with_backoff(func, retries=3):
    for attempt in range(retries):
        try:
            return func()
        except Exception as e:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)
`.trim();
      const result = validateCodeSuggestion(fix, 'main.py');

      expect(result.passed).toBe(true);
      expect(result.action).toBe('allow');
    });

    it('should block Python code with severely mismatched parentheses', () => {
      // Need > 3 mismatch per line to trigger
      const fix = 'result = func((((((x))))))))))))';
      const result = validateCodeSuggestion(fix, 'main.py');

      expect(result.passed).toBe(false);
      expect(result.action).toBe('block');
      expect(result.reason).toContain('Mismatched parentheses');
    });

    it('should allow Python with balanced parentheses', () => {
      const fix = 'result = func(a, (b, c), [d, e])';
      const result = validateCodeSuggestion(fix, 'main.py');

      expect(result.passed).toBe(true);
    });
  });

  describe('JavaScript/TypeScript validation (bracket matching)', () => {
    it('should allow valid JavaScript with nested brackets', () => {
      const fix = `
const config = {
  timeout: 5000,
  retries: 3,
  headers: {
    "Content-Type": "application/json"
  }
};
`.trim();
      const result = validateCodeSuggestion(fix, 'config.js');

      expect(result.passed).toBe(true);
      expect(result.action).toBe('allow');
    });

    it('should allow valid TypeScript code', () => {
      const fix = `
function processItems(items: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item] = (counts[item] || 0) + 1;
  }
  return counts;
}
`.trim();
      const result = validateCodeSuggestion(fix, 'utils.ts');

      expect(result.passed).toBe(true);
    });

    it('should validate .jsx files through JavaScript path', () => {
      const fix = 'const el = React.createElement("div", null, "hello");';
      const result = validateCodeSuggestion(fix, 'App.jsx');

      expect(result.passed).toBe(true);
    });

    it('should validate .tsx files through JavaScript path', () => {
      const fix = 'const Component = () => { return (<div>Hello</div>); };';
      const result = validateCodeSuggestion(fix, 'App.tsx');

      expect(result.passed).toBe(true);
    });

    it('should catch mismatched curly braces', () => {
      const fix = 'function foo() { if (true) { return 1; }';
      const result = validateCodeSuggestion(fix, 'main.js');

      expect(result.passed).toBe(false);
      expect(result.action).toBe('block');
      expect(result.reason).toContain('Unclosed brackets');
    });

    it('should catch a closing bracket without an opener', () => {
      const fix = 'const x = 1; }';
      const result = validateCodeSuggestion(fix, 'main.js');

      expect(result.passed).toBe(false);
      expect(result.action).toBe('block');
      expect(result.reason).toContain('Mismatched bracket');
    });

    it('should catch mismatched bracket types', () => {
      const fix = 'const arr = [1, 2, 3)';
      const result = validateCodeSuggestion(fix, 'main.js');

      expect(result.passed).toBe(false);
      expect(result.action).toBe('block');
    });
  });

  describe('Java validation', () => {
    it('should allow valid Java code', () => {
      const fix = `
public void process(List<String> items) {
    for (String item : items) {
        System.out.println(item);
    }
}
`.trim();
      const result = validateCodeSuggestion(fix, 'Main.java');

      expect(result.passed).toBe(true);
    });

    it('should catch unclosed braces in Java', () => {
      const fix = 'public void foo() { if (true) {';
      const result = validateCodeSuggestion(fix, 'Main.java');

      expect(result.passed).toBe(false);
      expect(result.action).toBe('block');
    });
  });

  describe('Go validation', () => {
    it('should allow valid Go code', () => {
      const fix = `
func main() {
    result, err := doSomething()
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(result)
}
`.trim();
      const result = validateCodeSuggestion(fix, 'main.go');

      expect(result.passed).toBe(true);
    });
  });

  describe('unknown language fallback', () => {
    it('should validate brackets for unknown extensions', () => {
      const fix = 'fn process() { let x = [1, 2]; }';
      const result = validateCodeSuggestion(fix, 'main.rs');

      expect(result.passed).toBe(true);
    });

    it('should catch mismatched brackets in unknown extensions', () => {
      const fix = 'fn process() { let x = [1, 2]; }}';
      const result = validateCodeSuggestion(fix, 'main.rs');

      expect(result.passed).toBe(false);
    });
  });

  describe('strings and comments do not cause false positives', () => {
    it('should ignore brackets inside double-quoted strings', () => {
      const fix = 'const msg = "Hello {world} [test] (ok)";';
      const result = validateCodeSuggestion(fix, 'main.js');

      expect(result.passed).toBe(true);
      expect(result.action).toBe('allow');
    });

    it('should ignore brackets inside single-quoted strings', () => {
      const fix = "const msg = 'array [0] is {value}';";
      const result = validateCodeSuggestion(fix, 'main.js');

      expect(result.passed).toBe(true);
    });

    it('should ignore brackets inside template literals', () => {
      const fix = 'const msg = `result is {${value}}`;';
      const result = validateCodeSuggestion(fix, 'main.js');

      expect(result.passed).toBe(true);
    });

    it('should ignore brackets inside line comments', () => {
      const fix = `
function foo() {
  // this is a comment with unbalanced { [ (
  return 42;
}
`.trim();
      const result = validateCodeSuggestion(fix, 'main.js');

      expect(result.passed).toBe(true);
    });

    it('should ignore brackets inside block comments', () => {
      const fix = `
function bar() {
  /* unmatched brackets { [ ( here */
  return 0;
}
`.trim();
      const result = validateCodeSuggestion(fix, 'main.js');

      expect(result.passed).toBe(true);
    });

    it('should handle escaped characters in strings correctly', () => {
      const fix = 'const s = "escaped \\" quote { inside";';
      const result = validateCodeSuggestion(fix, 'main.js');

      expect(result.passed).toBe(true);
    });
  });
});
