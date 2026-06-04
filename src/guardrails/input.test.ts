import { scrubSecrets, validateInputSize } from './input';

// Suppress logger output during tests
jest.mock('../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

describe('scrubSecrets', () => {
  describe('AWS Access Key detection', () => {
    it('should detect and redact an AKIA AWS access key', () => {
      const content = 'const key = "AKIAIOSFODNN7EXAMPLE";';
      const result = scrubSecrets(content);

      expect(result.action).toBe('redact');
      expect(result.content).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(result.content).toContain('[REDACTED_AWS_ACCESS_KEY]');
      expect(result.passed).toBe(true);
      expect(result.reason).toContain('AWS Access Key');
    });

    it('should detect ASIA (temporary credentials) prefix', () => {
      const content = 'aws_key = "ASIAZ5EXAMPLE1234567"';
      const result = scrubSecrets(content);

      expect(result.action).toBe('redact');
      expect(result.content).toContain('[REDACTED_AWS_ACCESS_KEY]');
    });

    it('should detect AWS secret key with equals sign', () => {
      const content = 'aws_secret_access_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY1"';
      const result = scrubSecrets(content);

      expect(result.action).toBe('redact');
      expect(result.content).toContain('[REDACTED_AWS_SECRET_KEY]');
    });

    it('should detect AWS secret key with colon separator', () => {
      const content = 'secret_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY1"';
      const result = scrubSecrets(content);

      expect(result.action).toBe('redact');
      expect(result.content).toContain('[REDACTED_AWS_SECRET_KEY]');
    });
  });

  describe('GitHub Token detection', () => {
    it('should detect and redact ghp_ tokens', () => {
      const content = 'token = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkl"';
      const result = scrubSecrets(content);

      expect(result.action).toBe('redact');
      expect(result.content).not.toContain('ghp_');
      expect(result.content).toContain('[REDACTED_GITHUB_TOKEN]');
    });

    it('should detect and redact gho_ tokens', () => {
      const content = 'GITHUB_TOKEN=gho_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkl';
      const result = scrubSecrets(content);

      expect(result.action).toBe('redact');
      expect(result.content).toContain('[REDACTED_GITHUB_TOKEN]');
    });

    it('should detect github_pat_ tokens', () => {
      const token = 'github_pat_' + 'A'.repeat(82);
      const content = `const pat = "${token}"`;
      const result = scrubSecrets(content);

      expect(result.action).toBe('redact');
      expect(result.content).toContain('[REDACTED_GITHUB_CLASSIC_TOKEN]');
    });
  });

  describe('OpenAI API Key detection', () => {
    it('should detect and redact sk- prefixed API keys', () => {
      const content = 'OPENAI_API_KEY="sk-proj1234567890ABCDEFGHIJKLMNOPabcde"';
      const result = scrubSecrets(content);

      expect(result.action).toBe('redact');
      expect(result.content).not.toContain('sk-');
      expect(result.content).toContain('[REDACTED_OPENAI_API_KEY]');
    });
  });

  describe('Slack Token detection', () => {
    it('should detect and redact xoxb- bot tokens', () => {
      const content = 'SLACK_TOKEN = "xoxb-123456789012-abcdefghij"';
      const result = scrubSecrets(content);

      expect(result.action).toBe('redact');
      expect(result.content).not.toContain('xoxb-');
      expect(result.content).toContain('[REDACTED_SLACK_TOKEN]');
    });

    it('should detect xoxp- user tokens', () => {
      const content = 'token = "xoxp-1234567890-abcdefghij"';
      const result = scrubSecrets(content);

      expect(result.action).toBe('redact');
      expect(result.content).toContain('[REDACTED_SLACK_TOKEN]');
    });

    it('should detect xoxa- app tokens', () => {
      const content = 'token = "xoxa-1234567890-abcdefghij"';
      const result = scrubSecrets(content);

      expect(result.action).toBe('redact');
      expect(result.content).toContain('[REDACTED_SLACK_TOKEN]');
    });
  });

  describe('Connection String detection', () => {
    it('should detect and redact postgres:// connection strings', () => {
      const content = 'DATABASE_URL="postgres://admin:secretpass@db.example.com:5432/mydb"';
      const result = scrubSecrets(content);

      expect(result.action).toBe('redact');
      expect(result.content).not.toContain('secretpass');
      expect(result.content).toContain('[REDACTED_CONNECTION_STRING]');
    });

    it('should detect and redact mongodb:// connection strings', () => {
      const content = 'MONGO_URI="mongodb://user:password@cluster0.example.net:27017/testdb"';
      const result = scrubSecrets(content);

      expect(result.action).toBe('redact');
      expect(result.content).not.toContain('password');
      expect(result.content).toContain('[REDACTED_CONNECTION_STRING]');
    });

    it('should detect mysql:// connection strings', () => {
      const content = 'DB_URL = "mysql://root:mypassword@localhost:3306/app"';
      const result = scrubSecrets(content);

      expect(result.action).toBe('redact');
      expect(result.content).toContain('[REDACTED_CONNECTION_STRING]');
    });

    it('should detect redis:// connection strings', () => {
      const content = 'REDIS_URL="redis://default:redispass@redis.example.com:6379/0"';
      const result = scrubSecrets(content);

      expect(result.action).toBe('redact');
      expect(result.content).toContain('[REDACTED_CONNECTION_STRING]');
    });
  });

  describe('Private Key Block detection', () => {
    it('should detect and redact RSA private key blocks', () => {
      const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQ...\n-----END RSA PRIVATE KEY-----';
      const result = scrubSecrets(content);

      expect(result.action).toBe('redact');
      expect(result.content).toContain('[REDACTED_PRIVATE_KEY_BLOCK]');
    });

    it('should detect generic private key blocks', () => {
      const content = '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBg...\n-----END PRIVATE KEY-----';
      const result = scrubSecrets(content);

      expect(result.action).toBe('redact');
      expect(result.content).toContain('[REDACTED_PRIVATE_KEY_BLOCK]');
    });

    it('should detect EC private key blocks', () => {
      const content = '-----BEGIN EC PRIVATE KEY-----\nMHQCAQEE...\n-----END EC PRIVATE KEY-----';
      const result = scrubSecrets(content);

      expect(result.action).toBe('redact');
      expect(result.content).toContain('[REDACTED_PRIVATE_KEY_BLOCK]');
    });
  });

  describe('Generic API Key detection', () => {
    it('should detect api_key assignments', () => {
      const content = 'api_key = "ABCDEFGHIJKLMNOPQRSTuvwx"';
      const result = scrubSecrets(content);

      expect(result.action).toBe('redact');
      expect(result.content).toContain('[REDACTED_GENERIC_API_KEY]');
    });

    it('should detect api-secret assignments', () => {
      const content = 'api-secret: "0123456789ABCDEFghijklmno"';
      const result = scrubSecrets(content);

      expect(result.action).toBe('redact');
      expect(result.content).toContain('[REDACTED_GENERIC_API_KEY]');
    });
  });

  describe('JWT Token detection', () => {
    it('should detect and redact JWT tokens', () => {
      const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url');
      const payload = Buffer.from('{"sub":"1234567890","name":"Test"}').toString('base64url');
      const signature = 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const jwt = `${header}.${payload}.${signature}`;
      const content = `Authorization: Bearer ${jwt}`;
      const result = scrubSecrets(content);

      expect(result.action).toBe('redact');
      expect(result.content).toContain('[REDACTED_JWT_TOKEN]');
    });
  });

  describe('clean code passthrough', () => {
    it('should pass through clean Python code unchanged', () => {
      const content = `
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

result = fibonacci(10)
print(result)
`;
      const result = scrubSecrets(content);

      expect(result.action).toBe('allow');
      expect(result.content).toBe(content);
      expect(result.passed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should pass through clean JavaScript code unchanged', () => {
      const content = `
const express = require('express');
const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(3000);
`;
      const result = scrubSecrets(content);

      expect(result.action).toBe('allow');
      expect(result.content).toBe(content);
    });

    it('should not flag short strings that partially match patterns', () => {
      const content = 'const status = "ok"; // skipping secrets';
      const result = scrubSecrets(content);

      expect(result.action).toBe('allow');
      expect(result.content).toBe(content);
    });
  });

  describe('multiple secrets in one file', () => {
    it('should detect and redact all secrets in content with multiple leaks', () => {
      const content = [
        'AWS_KEY = "AKIAIOSFODNN7EXAMPLE"',
        'GITHUB_TOKEN = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkl"',
        'DATABASE_URL = "postgres://admin:pass123@db.example.com:5432/mydb"',
        '-----BEGIN PRIVATE KEY-----',
      ].join('\n');

      const result = scrubSecrets(content);

      expect(result.action).toBe('redact');
      expect(result.passed).toBe(true);
      expect(result.content).toContain('[REDACTED_AWS_ACCESS_KEY]');
      expect(result.content).toContain('[REDACTED_GITHUB_TOKEN]');
      expect(result.content).toContain('[REDACTED_CONNECTION_STRING]');
      expect(result.content).toContain('[REDACTED_PRIVATE_KEY_BLOCK]');
      // All originals should be gone
      expect(result.content).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(result.content).not.toContain('ghp_');
      expect(result.content).not.toContain('pass123');
    });

    it('should report count of occurrences in the reason', () => {
      const content = [
        'key1 = "AKIAIOSFODNN7EXAMPLE"',
        'key2 = "AKIAIOSFODNN7EXAMPL2"',
      ].join('\n');

      const result = scrubSecrets(content);

      expect(result.reason).toContain('AWS Access Key');
      expect(result.reason).toContain('2 occurrences');
    });
  });

  describe('result shape', () => {
    it('should include originalContent and redactedContent when redacting', () => {
      const content = 'key = "AKIAIOSFODNN7EXAMPLE"';
      const result = scrubSecrets(content);

      expect(result).toHaveProperty('originalContent', content);
      expect(result).toHaveProperty('redactedContent');
      expect(result.redactedContent).not.toBe(content);
    });

    it('should not include originalContent or redactedContent when allowing', () => {
      const content = 'const x = 42;';
      const result = scrubSecrets(content);

      expect(result.originalContent).toBeUndefined();
      expect(result.redactedContent).toBeUndefined();
    });
  });
});

describe('validateInputSize', () => {
  it('should block content exceeding the default max size', () => {
    const oversized = 'x'.repeat(100001);
    const result = validateInputSize(oversized);

    expect(result.passed).toBe(false);
    expect(result.action).toBe('block');
    expect(result.reason).toContain('Input too large');
    expect(result.reason).toContain('100001');
  });

  it('should allow content within the default max size', () => {
    const content = 'x'.repeat(100000);
    const result = validateInputSize(content);

    expect(result.passed).toBe(true);
    expect(result.action).toBe('allow');
    expect(result.reason).toBeUndefined();
  });

  it('should allow empty content', () => {
    const result = validateInputSize('');

    expect(result.passed).toBe(true);
    expect(result.action).toBe('allow');
  });

  it('should respect a custom max size', () => {
    const content = 'x'.repeat(501);
    const result = validateInputSize(content, 500);

    expect(result.passed).toBe(false);
    expect(result.action).toBe('block');
    expect(result.reason).toContain('501');
    expect(result.reason).toContain('500');
  });

  it('should allow content exactly at the limit', () => {
    const content = 'x'.repeat(500);
    const result = validateInputSize(content, 500);

    expect(result.passed).toBe(true);
    expect(result.action).toBe('allow');
  });
});
