import {
  isAnalyzableFile,
  getFileLanguage,
  ANALYZABLE_EXTENSIONS,
  SKIP_PATTERNS,
} from './index';

describe('isAnalyzableFile', () => {
  describe('returns true for analyzable source files', () => {
    const analyzableFiles = [
      'app.py',
      'server.js',
      'handler.ts',
      'Component.jsx',
      'Component.tsx',
      'Main.java',
      'main.go',
      'app.rb',
      'lib.rs',
      'Program.cs',
      'index.php',
      'Main.kt',
      'build.kts',
      'App.scala',
      'ViewController.swift',
      'module.mjs',
      'config.cjs',
    ];

    it.each(analyzableFiles)('should return true for "%s"', (filename) => {
      expect(isAnalyzableFile(filename)).toBe(true);
    });
  });

  describe('returns false for test files', () => {
    const testFiles = [
      'app.test.ts',
      'handler.test.js',
      'component.spec.js',
      'service.spec.ts',
      'test_helper.py',
    ];

    it.each(testFiles)('should return false for "%s"', (filename) => {
      expect(isAnalyzableFile(filename)).toBe(false);
    });
  });

  describe('returns false for __tests__ directories', () => {
    it('should skip files under __tests__/', () => {
      expect(isAnalyzableFile('__tests__/helper.ts')).toBe(false);
    });

    it('should skip nested __tests__ paths', () => {
      expect(isAnalyzableFile('src/__tests__/utils.js')).toBe(false);
    });
  });

  describe('returns false for node_modules paths', () => {
    it('should skip node_modules files', () => {
      expect(isAnalyzableFile('node_modules/express/index.js')).toBe(false);
    });

    it('should skip deeply nested node_modules', () => {
      expect(isAnalyzableFile('project/node_modules/@types/node/index.d.ts')).toBe(false);
    });
  });

  describe('returns false for vendor paths', () => {
    it('should skip vendor/ directory files', () => {
      expect(isAnalyzableFile('vendor/github.com/pkg/errors/errors.go')).toBe(false);
    });
  });

  describe('returns false for generated / non-source files', () => {
    const skippableFiles = [
      'types.d.ts',
      'global.d.ts',
      'bundle.min.js',
      'app.bundle.js',
      'package-lock.json',
      'yarn.lock',
      'Gemfile.lock',
      'source.js.map',
    ];

    it.each(skippableFiles)('should return false for "%s"', (filename) => {
      expect(isAnalyzableFile(filename)).toBe(false);
    });
  });

  describe('returns false for migration and fixture directories', () => {
    it('should skip migration files', () => {
      expect(isAnalyzableFile('migrations/001_create_users.py')).toBe(false);
    });

    it('should skip fixture files', () => {
      expect(isAnalyzableFile('fixtures/test_data.py')).toBe(false);
    });

    it('should skip mock directories', () => {
      expect(isAnalyzableFile('mocks/api.ts')).toBe(false);
      expect(isAnalyzableFile('mock/service.ts')).toBe(false);
    });
  });

  describe('returns false for config and env files', () => {
    it('should skip .config. files', () => {
      expect(isAnalyzableFile('jest.config.ts')).toBe(false);
    });

    it('should skip .env files', () => {
      expect(isAnalyzableFile('.env')).toBe(false);
      expect(isAnalyzableFile('.env.local')).toBe(false);
    });
  });

  describe('returns false for non-analyzable extensions', () => {
    const nonAnalyzable = [
      'README.md',
      'image.png',
      'data.json',
      'style.css',
      'template.html',
      'Dockerfile',
      'Makefile',
    ];

    it.each(nonAnalyzable)('should return false for "%s"', (filename) => {
      expect(isAnalyzableFile(filename)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle paths with forward slashes', () => {
      expect(isAnalyzableFile('src/services/api.ts')).toBe(true);
    });

    it('should handle mixed case extensions', () => {
      // The function lowercases the extension
      expect(isAnalyzableFile('Main.PY')).toBe(true);
      expect(isAnalyzableFile('App.Js')).toBe(true);
    });
  });
});

describe('getFileLanguage', () => {
  describe('returns correct language for each extension', () => {
    const extensionMap: Array<[string, string]> = [
      ['app.py', 'python'],
      ['server.js', 'javascript'],
      ['handler.ts', 'typescript'],
      ['Component.jsx', 'javascript'],
      ['Component.tsx', 'typescript'],
      ['Main.java', 'java'],
      ['main.go', 'go'],
      ['app.rb', 'ruby'],
      ['lib.rs', 'rust'],
      ['Program.cs', 'csharp'],
      ['index.php', 'php'],
      ['Main.kt', 'kotlin'],
      ['build.kts', 'kotlin'],
      ['App.scala', 'scala'],
      ['ViewController.swift', 'swift'],
    ];

    it.each(extensionMap)(
      'should return correct language for "%s"',
      (filename, expectedLang) => {
        expect(getFileLanguage(filename)).toBe(expectedLang);
      }
    );
  });

  describe('returns "unknown" for unsupported extensions', () => {
    const unknownFiles = ['README.md', 'data.json', 'style.css', 'Makefile'];

    it.each(unknownFiles)('should return "unknown" for "%s"', (filename) => {
      expect(getFileLanguage(filename)).toBe('unknown');
    });
  });

  describe('handles edge cases', () => {
    it('should handle file with no extension', () => {
      expect(getFileLanguage('Dockerfile')).toBe('unknown');
    });

    it('should handle file paths with directories', () => {
      expect(getFileLanguage('src/utils/helper.ts')).toBe('typescript');
    });
  });
});

describe('ANALYZABLE_EXTENSIONS', () => {
  it('should be a Set containing all expected extensions', () => {
    const expected = [
      '.py', '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
      '.java', '.go', '.rb', '.rs', '.cs', '.php',
      '.kt', '.kts', '.scala', '.swift',
    ];
    for (const ext of expected) {
      expect(ANALYZABLE_EXTENSIONS.has(ext)).toBe(true);
    }
  });

  it('should not contain non-source extensions', () => {
    expect(ANALYZABLE_EXTENSIONS.has('.md')).toBe(false);
    expect(ANALYZABLE_EXTENSIONS.has('.json')).toBe(false);
    expect(ANALYZABLE_EXTENSIONS.has('.css')).toBe(false);
  });
});

describe('SKIP_PATTERNS', () => {
  it('should have a reasonable number of skip patterns defined', () => {
    expect(SKIP_PATTERNS.length).toBeGreaterThanOrEqual(10);
  });

  it('should all be RegExp instances', () => {
    for (const pattern of SKIP_PATTERNS) {
      expect(pattern).toBeInstanceOf(RegExp);
    }
  });
});
