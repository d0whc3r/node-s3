import crypto from 'node:crypto';
import { Transform, TransformCallback } from 'node:stream';
import { Config } from './config';

const MAGIC = Buffer.from('NS3E', 'ascii');
const FORMAT_VERSION = 0x01;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + 1 + SALT_LENGTH + IV_LENGTH;

export function createEncryptStream(passphrase: string): Transform {
  if (!passphrase) {
    throw new Error(`${Config.TAG} Encryption key must be a non-empty string`);
  }

  let cipher: crypto.CipherGCM | null = null;

  const initCipher = (cb: (err?: Error | null) => void) => {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    crypto.scrypt(passphrase, salt, KEY_LENGTH, (err, key) => {
      if (err) {
        cb(err);
        return;
      }
      cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      stream.push(Buffer.concat([MAGIC, Buffer.from([FORMAT_VERSION]), salt, iv]));
      cb();
    });
  };

  const stream = new Transform({
    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      const processChunk = () => {
        try {
          const encrypted = cipher!.update(chunk);
          if (encrypted.length > 0) {
            this.push(encrypted);
          }
          callback();
        } catch (err) {
          callback(err instanceof Error ? err : new Error(String(err)));
        }
      };

      if (!cipher) {
        initCipher((err) => {
          if (err) {
            callback(err);
            return;
          }
          processChunk();
        });
      } else {
        processChunk();
      }
    },
    flush(callback: TransformCallback) {
      const finish = () => {
        try {
          const finalChunk = cipher!.final();
          if (finalChunk.length > 0) {
            this.push(finalChunk);
          }
          this.push(cipher!.getAuthTag());
          callback();
        } catch (err) {
          callback(err instanceof Error ? err : new Error(String(err)));
        }
      };

      if (!cipher) {
        initCipher((err) => {
          if (err) {
            callback(err);
            return;
          }
          finish();
        });
      } else {
        finish();
      }
    }
  });

  return stream;
}

export function createDecryptStream(passphrase: string): Transform {
  if (!passphrase) {
    throw new Error(`${Config.TAG} Decryption key must be a non-empty string`);
  }

  let headerBuffer: Buffer = Buffer.alloc(0);
  let tailBuffer: Buffer = Buffer.alloc(0);
  let decipher: crypto.DecipherGCM | null = null;

  return new Transform({
    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      const processEncrypted = (data: Buffer) => {
        try {
          const combined = tailBuffer.length > 0 ? Buffer.concat([tailBuffer, data]) : data;
          if (combined.length > AUTH_TAG_LENGTH) {
            const toDecrypt = combined.subarray(0, combined.length - AUTH_TAG_LENGTH);
            tailBuffer = combined.subarray(combined.length - AUTH_TAG_LENGTH);
            const decrypted = decipher!.update(toDecrypt);
            if (decrypted.length > 0) {
              this.push(decrypted);
            }
          } else {
            tailBuffer = combined;
          }
          callback();
        } catch (err) {
          callback(err instanceof Error ? err : new Error(String(err)));
        }
      };

      if (decipher) {
        processEncrypted(chunk);
        return;
      }

      headerBuffer = headerBuffer.length > 0 ? Buffer.concat([headerBuffer, chunk]) : chunk;
      if (headerBuffer.length < HEADER_LENGTH) {
        callback();
        return;
      }

      const magic = headerBuffer.subarray(0, MAGIC.length);
      if (!magic.equals(MAGIC)) {
        callback(new Error(`${Config.TAG} Invalid encrypted stream header`));
        return;
      }

      const version = headerBuffer[MAGIC.length];
      if (version !== FORMAT_VERSION) {
        callback(new Error(`${Config.TAG} Unsupported encryption format version: ${version}`));
        return;
      }

      const saltStart = MAGIC.length + 1;
      const ivStart = saltStart + SALT_LENGTH;
      const salt = headerBuffer.subarray(saltStart, ivStart);
      const iv = headerBuffer.subarray(ivStart, HEADER_LENGTH);
      const remainder = headerBuffer.subarray(HEADER_LENGTH);
      headerBuffer = Buffer.alloc(0);

      crypto.scrypt(passphrase, salt, KEY_LENGTH, (err, key) => {
        if (err) {
          callback(err);
          return;
        }
        decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        processEncrypted(remainder);
      });
    },
    flush(callback: TransformCallback) {
      if (!decipher) {
        callback(new Error(`${Config.TAG} Encrypted stream is truncated or empty`));
        return;
      }
      if (tailBuffer.length !== AUTH_TAG_LENGTH) {
        callback(new Error(`${Config.TAG} Encrypted stream is missing authentication tag`));
        return;
      }
      try {
        decipher.setAuthTag(tailBuffer);
        const finalChunk = decipher.final();
        if (finalChunk.length > 0) {
          this.push(finalChunk);
        }
        callback();
      } catch (err) {
        callback(new Error(`${Config.TAG} Decryption failed: invalid key or corrupted data`, { cause: err }));
      }
    }
  });
}
