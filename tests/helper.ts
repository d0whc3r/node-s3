import { S3Wrapper } from '../src';

export function getRandomBucketName() {
  const rand = Math.random().toString(36).slice(2);
  return `s3-test-${rand}`;
}

export async function initBucket() {
  const bucket = getRandomBucketName();
  try {
    await new S3Wrapper({ bucket }).createBucket();
    console.log(`Created temporal test bucket "${bucket}"`);
    return bucket;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Error creating temporal test bucket "${bucket}": ${msg}`);
  }
}

export async function clearBucket(bucket: string) {
  try {
    await new S3Wrapper({ bucket }).removeBucket(true);
    console.log(`Deleted temporal test bucket "${bucket}"`);
  } catch (e) {
    console.log(`Error on delete temporal test bucket "${bucket}"`, e);
  }
}

export function wait(timeInSecs: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, timeInSecs * 1000);
  });
}
