import { S3Wrapper } from '../src';

/**
 * Get a random name for a bucket
 * @returns {string}
 */
export function getRandomBucketName() {
  const rand = Math.random().toString(36).slice(2);
  return `s3-test-${rand}`;
}

/**
 * Create a random bucket
 * @returns {Promise<string>}
 */
export async function initBucket() {
  const bucket = getRandomBucketName();
  try {
    await new S3Wrapper({ bucket }).createBucket();
    console.log(`Created temporal test bucket "${bucket}"`);
    return bucket;
  } catch (e) {
    throw new Error(`Error creating temporal test bucket "${bucket}": ${e.message}`);
  }
}

/**
 * Remove the previous created bucket
 * @param {string} bucket
 */
export async function clearBucket(bucket: string) {
  try {
    await new S3Wrapper({ bucket }).removeBucket(true);
    console.log(`Deleted temporal test bucket "${bucket}"`);
  } catch (e) {
    console.log(`Error on delete temporal test bucket "${bucket}"`, e);
  }
}

/**
 * Wait function
 * @param {number} timeInSecs
 * @returns {Promise<unknown>}
 */
export function wait(timeInSecs: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, timeInSecs * 1000);
  });
}
