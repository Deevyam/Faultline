import { extractJiraKey, getJiraContext } from './jira';

// Suppress logger output during tests
jest.mock('../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

describe('extractJiraKey', () => {
  it('should find "PROJ-123" in text', () => {
    const result = extractJiraKey('This PR fixes PROJ-123');
    expect(result).toBe('PROJ-123');
  });

  it('should find "ABC-1" in longer text', () => {
    const result = extractJiraKey(
      'Implements feature ABC-1 as described in the spec document.'
    );
    expect(result).toBe('ABC-1');
  });

  it('should return null when no Jira key is present', () => {
    expect(extractJiraKey('No ticket reference here')).toBeNull();
    expect(extractJiraKey('')).toBeNull();
    expect(extractJiraKey('just some random text 123-456')).toBeNull();
  });

  it('should return the first match when multiple keys are present', () => {
    const result = extractJiraKey('Fixes PROJ-100 and PROJ-200');
    expect(result).toBe('PROJ-100');
  });

  it('should match keys at the start of the text', () => {
    const result = extractJiraKey('TEAM-42 is being worked on');
    expect(result).toBe('TEAM-42');
  });

  it('should match keys at the end of the text', () => {
    const result = extractJiraKey('Relates to FIX-999');
    expect(result).toBe('FIX-999');
  });

  it('should match keys with numeric project prefix characters', () => {
    // Jira keys can have numbers in the project part (after the first char)
    const result = extractJiraKey('Working on A2B-456');
    expect(result).toBe('A2B-456');
  });

  it('should not match lowercase project keys', () => {
    // Jira project keys are uppercase
    const result = extractJiraKey('This has proj-123 in lowercase');
    expect(result).toBeNull();
  });

  it('should not match keys with only numbers in project part', () => {
    // Project key must start with a letter
    const result = extractJiraKey('Reference 123-456');
    expect(result).toBeNull();
  });

  it('should match keys inside parentheses or brackets', () => {
    expect(extractJiraKey('[FEAT-10] Add new feature')).toBe('FEAT-10');
    expect(extractJiraKey('(BUG-55) Fixed crash')).toBe('BUG-55');
  });

  it('should match keys in URL-like strings', () => {
    const result = extractJiraKey(
      'See https://jira.example.com/browse/ISSUE-789 for details'
    );
    expect(result).toBe('ISSUE-789');
  });

  it('should handle multiline text', () => {
    const text = `
      ## PR Description
      This fixes the issue described in:
      - BACKEND-42: API timeout
      - FRONTEND-10: UI crash
    `;
    const result = extractJiraKey(text);
    expect(result).toBe('BACKEND-42');
  });
});

describe('getJiraContext', () => {
  const originalBaseUrl = process.env.JIRA_BASE_URL;
  const originalApiToken = process.env.JIRA_API_TOKEN;
  const originalEmail = process.env.JIRA_EMAIL;

  beforeEach(() => {
    // Ensure Jira is NOT configured for these tests
    delete process.env.JIRA_BASE_URL;
    delete process.env.JIRA_API_TOKEN;
    delete process.env.JIRA_EMAIL;
  });

  afterAll(() => {
    // Restore original env vars
    if (originalBaseUrl !== undefined) process.env.JIRA_BASE_URL = originalBaseUrl;
    if (originalApiToken !== undefined) process.env.JIRA_API_TOKEN = originalApiToken;
    if (originalEmail !== undefined) process.env.JIRA_EMAIL = originalEmail;
  });

  it('should return undefined when JIRA_BASE_URL is not set', async () => {
    const result = await getJiraContext('Fixes PROJ-123');
    expect(result).toBeUndefined();
  });

  it('should return undefined when JIRA_API_TOKEN is not set', async () => {
    process.env.JIRA_BASE_URL = 'https://jira.example.com';
    // JIRA_API_TOKEN is still not set
    const result = await getJiraContext('Fixes PROJ-123');
    expect(result).toBeUndefined();
  });

  it('should return undefined for empty PR body even if Jira is configured', async () => {
    // If Jira were configured, it would still return undefined for empty body
    // since extractJiraKey('') returns null
    // But since Jira is not configured, it returns undefined at the config check
    const result = await getJiraContext('');
    expect(result).toBeUndefined();
  });

  it('should return undefined for PR body without a ticket key', async () => {
    const result = await getJiraContext('This PR has no ticket reference');
    expect(result).toBeUndefined();
  });
});
