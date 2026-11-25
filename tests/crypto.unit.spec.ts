import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { describe, expect, it } from 'vitest';
import { createDecryptStream, createEncryptStream } from '../src/crypto';

async function collect(stream: AsyncIterable<Buffer>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe('crypto (AES-256-GCM streaming)', () => {
  it('round-trips text, binary, multi-chunk, and empty buffers', async () => {
    const key = 'strong-test-passphrase';
    const payloads = [Buffer.from('Hello, node-s3 encrypted world!', 'utf8'), crypto.randomBytes(128 * 1024), Buffer.alloc(0)];

    for (const payload of payloads) {
      const encryptedChunks: Buffer[] = [];
      await pipeline(Readable.from([payload]), createEncryptStream(key), async (src) => {
        for await (const c of src) encryptedChunks.push(Buffer.from(c));
      });
      const encrypted = Buffer.concat(encryptedChunks);
      expect(encrypted.subarray(0, 4).toString('ascii')).toBe('NS3E');

      // Feed in small chunks to exercise streaming header/tail handling
      const smallChunks: Buffer[] = [];
      for (let i = 0; i < encrypted.length; i += 7) {
        smallChunks.push(encrypted.subarray(i, i + 7));
      }

      const decrypted = await collect(Readable.from(smallChunks).pipe(createDecryptStream(key)));
      expect(decrypted.equals(payload)).toBe(true);
    }
  });

  it('fails decryption with wrong passphrase', async () => {
    const encChunks: Buffer[] = [];
    await pipeline(Readable.from([Buffer.from('secret data')]), createEncryptStream('right-key'), async (src) => {
      for await (const c of src) encChunks.push(Buffer.from(c));
    });

    await expect(
      pipeline(Readable.from([Buffer.concat(encChunks)]), createDecryptStream('wrong-key'), async (src) => {
        for await (const _c of src) {
          // drain
        }
      })
    ).rejects.toThrowError(/Decryption failed/);
  });

  it('fails decryption on invalid header or truncated stream', async () => {
    await expect(
      pipeline(Readable.from([Buffer.from('NOT_VALID_HEADER_BYTES_LONG_ENOUGH_FOR_CHECK')]), createDecryptStream('k'), async (src) => {
        for await (const _c of src) {
          // drain
        }
      })
    ).rejects.toThrowError(/Invalid encrypted stream header/);

    await expect(
      pipeline(Readable.from([Buffer.from('NS3E')]), createDecryptStream('k'), async (src) => {
        for await (const _c of src) {
          // drain
        }
      })
    ).rejects.toThrowError(/truncated/);
  });

  it('rejects empty passphrase', () => {
    expect(() => createEncryptStream('')).toThrowError(/non-empty/);
    expect(() => createDecryptStream('')).toThrowError(/non-empty/);
  });
});
