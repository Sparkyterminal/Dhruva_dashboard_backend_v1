/**
 * Everyday Expenses bill storage (private S3 bucket, direct browser upload).
 * Bucket name comes from env BILLS_BUCKET (created by serverless.yml).
 *
 * Controllers call these through the module object (billStorage.headBill(...)) so tests
 * can replace them.
 */
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const URL_EXPIRES_IN = 300; // seconds

let client = null;
function s3() {
  if (!client) {
    client = new S3Client({ region: process.env.BILLS_BUCKET_REGION || process.env.AWS_REGION || 'ap-south-1' });
  }
  return client;
}

function bucket() {
  return process.env.BILLS_BUCKET || '';
}

function isConfigured() {
  return !!bucket();
}

/**
 * Presigned PUT that pins Content-Type and Content-Length (both are signed headers, so the
 * browser must send exactly these values).
 */
async function presignPut({ key, contentType, size }) {
  const cmd = new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    ContentType: contentType,
    ContentLength: size,
  });
  return getSignedUrl(s3(), cmd, {
    expiresIn: URL_EXPIRES_IN,
    signableHeaders: new Set(['content-type', 'content-length']),
  });
}

async function presignGet({ key }) {
  const cmd = new GetObjectCommand({ Bucket: bucket(), Key: key });
  return getSignedUrl(s3(), cmd, { expiresIn: URL_EXPIRES_IN });
}

/** Returns { exists, size, contentType }. */
async function headBill(key) {
  try {
    const r = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { exists: true, size: r.ContentLength, contentType: r.ContentType || null };
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode;
    if (status === 404 || err?.name === 'NotFound' || err?.name === 'NoSuchKey') return { exists: false };
    throw err;
  }
}

/** Best effort: never throws. */
async function deleteBills(keys) {
  if (!isConfigured()) return;
  await Promise.all(
    (keys || []).map((key) =>
      s3()
        .send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
        .catch((err) => console.warn('billStorage.deleteBills:', key, err.message))
    )
  );
}

module.exports = {
  URL_EXPIRES_IN,
  isConfigured,
  presignPut,
  presignGet,
  headBill,
  deleteBills,
};
