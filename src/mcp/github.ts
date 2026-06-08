import { Octokit } from '@octokit/rest';
import { PRFile, EnrichedFinding } from '../types';
import { logger } from '../utils/logger';
import { formatFindingComment, buildReviewSummary } from '../utils/formatter';
import { isMcpConfigured, callMcpTool, getMcpClient } from './client';

let octokit: Octokit;

export function initGitHub(): Octokit {
  octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
    request: { timeout: 10000 },
  });
  logger.info('GitHub client initialized');
  return octokit;
}

function getOctokit(): Octokit {
  if (!octokit) return initGitHub();
  return octokit;
}

function findTool(names: string[], patterns: string[]): string | undefined {
  for (const pattern of patterns) {
    const match = names.find(n => n.toLowerCase().includes(pattern.toLowerCase()));
    if (match) return match;
  }
  return undefined;
}

export async function getPRDetails(
  owner: string, repo: string, prNumber: number
): Promise<{
  title: string;
  body: string;
  headSha: string;
  headRef: string;
  baseRef: string;
  author: string;
}> {
  if (isMcpConfigured()) {
    try {
      const client = await getMcpClient('github');
      const toolsResult = await client.listTools();
      const toolNames = toolsResult.tools.map(t => t.name);
      
      const toolName = findTool(toolNames, ['get_pull_request', 'get_pr', 'pull_request']);
      if (toolName) {
        logger.info(`Using MCP tool ${toolName} for getPRDetails`);
        const result = await callMcpTool('github', toolName, {
          owner,
          repo,
          pr_number: prNumber,
          prNumber,
          pull_number: prNumber
        });
        
        const textContent = result.find((c: any) => c.type === 'text')?.text;
        if (textContent) {
          const data = JSON.parse(textContent);
          return {
            title: data.title || '',
            body: data.body || '',
            headSha: data.head?.sha || data.head_sha || '',
            headRef: data.head?.ref || data.head_ref || '',
            baseRef: data.base?.ref || data.base_ref || '',
            author: (data.user?.login || data.user || data.author || ''),
          };
        }
      }
    } catch (error: any) {
      logger.warn('Failed to fetch PR details via MCP, falling back to REST', { error: error.message });
    }
  }

  logger.info('Fetching PR details via REST', { owner, repo, prNumber });
  const client = getOctokit();
  const { data } = await client.pulls.get({
    owner, repo, pull_number: prNumber,
  });
  return {
    title: data.title,
    body: data.body || '',
    headSha: data.head.sha,
    headRef: data.head.ref,
    baseRef: data.base.ref,
    author: data.user.login,
  };
}

export async function getPRFiles(
  owner: string, repo: string, prNumber: number
): Promise<PRFile[]> {
  if (isMcpConfigured()) {
    try {
      const client = await getMcpClient('github');
      const toolsResult = await client.listTools();
      const toolNames = toolsResult.tools.map(t => t.name);
      
      const toolName = findTool(toolNames, ['list_pull_request_files', 'list_pr_files', 'get_pr_files', 'list_files']);
      if (toolName) {
        logger.info(`Using MCP tool ${toolName} for getPRFiles`);
        const result = await callMcpTool('github', toolName, {
          owner,
          repo,
          pr_number: prNumber,
          prNumber
        });
        
        const textContent = result.find((c: any) => c.type === 'text')?.text;
        if (textContent) {
          const parsed = JSON.parse(textContent);
          if (Array.isArray(parsed)) {
            return parsed.map((f: any) => ({
              filename: f.filename || f.path,
              status: f.status,
              additions: f.additions,
              deletions: f.deletions,
              patch: f.patch,
            }));
          }
        }
      }
    } catch (error: any) {
      logger.warn('Failed to fetch PR files via MCP, falling back to REST', { error: error.message });
    }
  }

  logger.info('Fetching PR files via REST', { owner, repo, prNumber });
  const client = getOctokit();

  const { data } = await client.pulls.listFiles({
    owner, repo, pull_number: prNumber, per_page: 100,
  });

  const files: PRFile[] = data.map(f => ({
    filename: f.filename,
    status: f.status as PRFile['status'],
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch,
  }));

  logger.info(`Fetched ${files.length} PR files`, { owner, repo, prNumber });
  return files;
}

export async function getFileContent(
  owner: string, repo: string, path: string, ref: string
): Promise<string> {
  if (isMcpConfigured()) {
    try {
      const client = await getMcpClient('github');
      const toolsResult = await client.listTools();
      const toolNames = toolsResult.tools.map(t => t.name);
      
      const toolName = findTool(toolNames, ['get_file_contents', 'get_file_content', 'read_file_content', 'get_file', 'read_file']);
      if (toolName) {
        logger.info(`Using MCP tool ${toolName} for getFileContent`);
        const result = await callMcpTool('github', toolName, {
          owner,
          repo,
          path,
          branch: ref,
          ref
        });
        
        const textContent = result.find((c: any) => c.type === 'text')?.text;
        if (textContent) {
          try {
            const parsed = JSON.parse(textContent);
            if (typeof parsed === 'object' && parsed !== null) {
              if (parsed.content) {
                if (parsed.encoding === 'base64') {
                  return Buffer.from(parsed.content, 'base64').toString('utf-8');
                }
                return parsed.content;
              }
            }
          } catch {
            return textContent;
          }
        }
      }
    } catch (error: any) {
      logger.warn('Failed to fetch file content via MCP, falling back to REST', { error: error.message });
    }
  }

  logger.debug('Fetching file content via REST', { owner, repo, path, ref });
  const client = getOctokit();

  try {
    const { data } = await client.repos.getContent({
      owner, repo, path, ref,
    });

    if ('content' in data && data.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    throw new Error(`No content found for ${path}`);
  } catch (error: any) {
    logger.error('Failed to fetch file content via REST', { path, error: error.message });
    throw error;
  }
}

export async function postReviewComment(
  owner: string, repo: string, prNumber: number,
  finding: EnrichedFinding
): Promise<void> {
  const body = formatFindingComment(finding);

  if (isMcpConfigured()) {
    try {
      const client = await getMcpClient('github');
      const toolsResult = await client.listTools();
      const toolNames = toolsResult.tools.map(t => t.name);
      
      const toolName = findTool(toolNames, ['create_pull_request_comment', 'create_review_comment', 'post_review_comment', 'create_comment']);
      if (toolName) {
        logger.info(`Using MCP tool ${toolName} for postReviewComment`);
        await callMcpTool('github', toolName, {
          owner,
          repo,
          pr_number: prNumber,
          prNumber,
          commit_id: finding.commitSha,
          commitSha: finding.commitSha,
          path: finding.filePath,
          filePath: finding.filePath,
          line: finding.lineNumber,
          lineNumber: finding.lineNumber,
          body
        });
        return;
      }
    } catch (error: any) {
      logger.warn('Failed to post review comment via MCP, falling back to REST', { error: error.message });
    }
  }

  logger.info('Posting review comment via REST', {
    owner, repo, prNumber,
    pattern: finding.pattern,
    file: finding.filePath,
    line: finding.lineNumber,
  });
  const client = getOctokit();

  try {
    await client.pulls.createReviewComment({
      owner, repo,
      pull_number: prNumber,
      commit_id: finding.commitSha,
      path: finding.filePath,
      line: finding.lineNumber,
      body,
    });
  } catch (error: any) {
    logger.warn('Inline comment failed, falling back to issue comment', {
      error: error.message,
      file: finding.filePath,
    });
    await client.issues.createComment({
      owner, repo,
      issue_number: prNumber,
      body,
    });
  }
}

export async function submitFinalReview(
  owner: string, repo: string, prNumber: number,
  findings: EnrichedFinding[]
): Promise<void> {
  const hasCritical = findings.some(f => f.severity === 'critical');
  const event = hasCritical ? 'REQUEST_CHANGES' as const : 'COMMENT' as const;
  const body = buildReviewSummary(findings);

  if (isMcpConfigured()) {
    try {
      const client = await getMcpClient('github');
      const toolsResult = await client.listTools();
      const toolNames = toolsResult.tools.map(t => t.name);
      
      const toolName = findTool(toolNames, ['create_pull_request_review', 'create_review', 'submit_review', 'submit_pull_request_review']);
      if (toolName) {
        logger.info(`Using MCP tool ${toolName} for submitFinalReview`);
        await callMcpTool('github', toolName, {
          owner,
          repo,
          pr_number: prNumber,
          prNumber,
          event,
          body
        });
        return;
      }
    } catch (error: any) {
      logger.warn('Failed to submit final review via MCP, falling back to REST', { error: error.message });
    }
  }

  logger.info('Submitting final review via REST', {
    owner, repo, prNumber,
    event,
    findingsCount: findings.length,
  });
  const client = getOctokit();

  await client.pulls.createReview({
    owner, repo,
    pull_number: prNumber,
    event,
    body,
  });
}

export async function getRepositoryDefaultBranch(
  owner: string, repo: string
): Promise<string> {
  if (isMcpConfigured()) {
    try {
      const client = await getMcpClient('github');
      const toolsResult = await client.listTools();
      const toolNames = toolsResult.tools.map(t => t.name);
      
      const toolName = findTool(toolNames, ['get_repository', 'get_repo']);
      if (toolName) {
        logger.info(`Using MCP tool ${toolName} for getRepositoryDefaultBranch`);
        const result = await callMcpTool('github', toolName, { owner, repo });
        const textContent = result.find((c: any) => c.type === 'text')?.text;
        if (textContent) {
          const data = JSON.parse(textContent);
          return data.default_branch || 'main';
        }
      }
    } catch (error: any) {
      logger.warn('Failed to fetch default branch via MCP, falling back to REST', { error: error.message });
    }
  }

  logger.info('Fetching repository details via REST', { owner, repo });
  const client = getOctokit();
  try {
    const { data } = await client.repos.get({ owner, repo });
    return data.default_branch || 'main';
  } catch (error: any) {
    logger.warn('Failed to fetch default branch via REST', { error: error.message });
    return 'main';
  }
}

export async function getRepoFiles(
  owner: string, repo: string, ref?: string
): Promise<PRFile[]> {
  const files: PRFile[] = [];
  const maxFiles = 50; // Use same safety ceiling as MAX_FILES_PER_PR
  
  async function traverse(currentPath: string) {
    if (files.length >= maxFiles) return;

    logger.info(`Traversing repository directory: ${currentPath || '(root)'}`);
    
    let contents: any;
    if (isMcpConfigured()) {
      try {
        const client = await getMcpClient('github');
        const toolsResult = await client.listTools();
        const toolNames = toolsResult.tools.map(t => t.name);
        
        const toolName = findTool(toolNames, ['get_file_contents', 'get_file_content', 'read_file_content', 'get_file', 'read_file']);
        if (toolName) {
          const result = await callMcpTool('github', toolName, {
            owner,
            repo,
            path: currentPath,
            ref,
            branch: ref
          });
          
          const textContent = result.find((c: any) => c.type === 'text')?.text;
          if (textContent) {
            contents = JSON.parse(textContent);
          }
        }
      } catch (error: any) {
        logger.warn(`Failed to fetch repo directory via MCP, falling back to REST`, { path: currentPath, error: error.message });
      }
    }

    if (!contents) {
      const client = getOctokit();
      try {
        const { data } = await client.repos.getContent({
          owner, repo, path: currentPath, ref
        });
        contents = data;
      } catch (error: any) {
        logger.warn(`Failed to fetch repo directory via REST: ${currentPath}`, { error: error.message });
        if (currentPath === '') {
          throw error;
        }
        return;
      }
    }

    if (Array.isArray(contents)) {
      for (const item of contents) {
        if (files.length >= maxFiles) break;

        if (item.type === 'dir') {
          const skipDirs = ['node_modules', '.git', 'dist', 'build', '.github', 'venv', '__pycache__', 'out', 'bin', 'obj', 'packages'];
          if (skipDirs.includes(item.name.toLowerCase())) {
            continue;
          }
          await traverse(item.path);
        } else if (item.type === 'file') {
          files.push({
            filename: item.path,
            status: 'added',
            additions: 0,
            deletions: 0
          });
        }
      }
    }
  }

  await traverse('');
  logger.info(`Finished traversing repository. Found ${files.length} files.`, { owner, repo });
  return files;
}

