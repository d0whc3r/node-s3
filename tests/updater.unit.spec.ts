import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compareSemver, normalizeVersion, resolveReleaseAssetName, selfUpdate } from '../cli/updater';

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('CLI self-updater (unit)', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!;
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('normalizes and compares semantic versions accurately', () => {
    expect(normalizeVersion('v1.5.0')).toBe('1.5.0');
    expect(compareSemver('1.10.0', '1.9.0')).toBe(1);
    expect(compareSemver('1.5.0', '1.5.0')).toBe(0);
    expect(compareSemver('1.4.9', '1.5.0')).toBe(-1);
    expect(compareSemver('2.0.0', '2.0.0-beta.1')).toBe(1);
    expect(compareSemver('2.0.0-alpha.1', '2.0.0-beta.1')).toBeLessThan(0);
  });

  it('resolves release asset names per platform/arch and rejects unsupported targets', () => {
    expect(resolveReleaseAssetName('node-s3', 'linux', 'x64')).toBe('node-s3-linux-x64');
    expect(resolveReleaseAssetName('node-s3', 'darwin', 'arm64')).toBe('node-s3-macos-arm64');
    expect(resolveReleaseAssetName('node-s3', 'win32', 'x64')).toBe('node-s3-win-x64.exe');
    expect(() => resolveReleaseAssetName('node-s3', 'freebsd', 'x64')).toThrow(/No prebuilt standalone binary/);
  });

  it('reports up-to-date when current version matches latest release', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ tag_name: 'v1.5.0', assets: [] }));
    const logger = { info: vi.fn(), warn: vi.fn() };

    const result = await selfUpdate({
      repo: 'd0whc3r/node-s3',
      binName: 'node-s3',
      npmPackage: '@d0whc3r/node-s3',
      currentVersion: '1.5.0',
      tag: '[node-s3]',
      isStandalone: true,
      fetchImpl: fetchMock as unknown as typeof fetch,
      logger
    });

    expect(result).toEqual({
      updated: false,
      upToDate: true,
      standalone: true,
      currentVersion: '1.5.0',
      latestVersion: '1.5.0'
    });
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Already up to date'));
  });

  it('does not overwrite Node binary when running via npm/Node (non-SEA)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ tag_name: 'v2.0.0', assets: [] }));
    const logger = { info: vi.fn(), warn: vi.fn() };

    const result = await selfUpdate({
      repo: 'd0whc3r/node-s3',
      binName: 'node-s3',
      npmPackage: '@d0whc3r/node-s3',
      currentVersion: '1.5.0',
      tag: '[node-s3]',
      isStandalone: false,
      fetchImpl: fetchMock as unknown as typeof fetch,
      logger
    });

    expect(result.updated).toBe(false);
    expect(result.standalone).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('npm install -g @d0whc3r/node-s3@latest'));
  });

  it('supports --dry-run without downloading or modifying binary', async () => {
    const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'updater-dry-'));
    tempDirs.push(workDir);
    const binPath = path.join(workDir, 'node-s3');
    await fsp.writeFile(binPath, 'old-binary', { mode: 0o755 });

    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        tag_name: 'v2.0.0',
        assets: [{ name: 'node-s3-linux-x64', browser_download_url: 'https://example.com/node-s3-linux-x64' }]
      })
    );
    const logger = { info: vi.fn(), warn: vi.fn() };

    const result = await selfUpdate({
      repo: 'd0whc3r/node-s3',
      binName: 'node-s3',
      npmPackage: '@d0whc3r/node-s3',
      currentVersion: '1.5.0',
      tag: '[node-s3]',
      dryRun: true,
      platform: 'linux',
      arch: 'x64',
      isStandalone: true,
      execPath: binPath,
      fetchImpl: fetchMock as unknown as typeof fetch,
      logger
    });

    expect(result.updated).toBe(false);
    expect(result.dryRun).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(binPath, 'utf8')).toBe('old-binary');
  });

  it('downloads and atomically replaces standalone binary', async () => {
    const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'updater-real-'));
    tempDirs.push(workDir);
    const binPath = path.join(workDir, 'node-s3');
    await fsp.writeFile(binPath, 'old-binary', { mode: 0o755 });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          tag_name: 'v2.1.0',
          assets: [{ name: 'node-s3-macos-arm64', browser_download_url: 'https://example.com/node-s3-macos-arm64' }]
        })
      )
      .mockResolvedValueOnce(new Response('new-binary-payload', { status: 200 }));
    const logger = { info: vi.fn(), warn: vi.fn() };

    const result = await selfUpdate({
      repo: 'd0whc3r/node-s3',
      binName: 'node-s3',
      npmPackage: '@d0whc3r/node-s3',
      currentVersion: '1.5.0',
      tag: '[node-s3]',
      platform: 'darwin',
      arch: 'arm64',
      isStandalone: true,
      execPath: binPath,
      fetchImpl: fetchMock as unknown as typeof fetch,
      logger
    });

    expect(result.updated).toBe(true);
    expect(result.latestVersion).toBe('2.1.0');
    expect(fs.readFileSync(binPath, 'utf8')).toBe('new-binary-payload');
    expect(fs.readdirSync(workDir)).toEqual(['node-s3']);
  });
});
