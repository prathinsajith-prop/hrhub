import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { loadEnv } from '../env.js'

let cached: S3Client | null = null

function getS3Client(): S3Client {
    if (cached) return cached
    const env = loadEnv()
    cached = new S3Client({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
        // Path-style addressing is required for MinIO and works fine with S3.
        forcePathStyle: !env.S3_ENDPOINT.includes('amazonaws.com'),
        // AWS SDK v3.730+ bakes a CRC32 checksum into every request, including
        // presigned PUT URLs (x-amz-checksum-crc32=AAAAAA== — the CRC of empty
        // content). The browser can't satisfy that on a direct upload, so S3
        // rejects the PUT and the failure surfaces as a CORS error. Opting back
        // into the pre-v3.730 behaviour drops the param from the signed URL while
        // still hashing server-side uploads that send a body the SDK can read.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
    })
    return cached
}

/**
 * Generate a time-limited download URL for an S3 object. The browser can hit this
 * URL directly with no auth header — the signature in the query string is the auth.
 */
export async function generateDownloadUrl(
    s3Key: string,
    expiresIn = 3600,
    fileName?: string,
): Promise<string> {
    const env = loadEnv()
    const cmd = new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: s3Key,
        // Force the browser to download with a sensible filename rather than inline-displaying.
        ResponseContentDisposition: fileName
            ? `attachment; filename="${encodeURIComponent(fileName)}"`
            : undefined,
    })
    return getSignedUrl(getS3Client(), cmd, { expiresIn })
}

/**
 * Generate a short-lived presigned PUT URL the browser uploads to directly.
 * Bypasses our backend for the byte transfer — much faster for large files
 * and removes upload-size limits from the Fastify request body.
 */
export async function generateUploadUrl(
    s3Key: string,
    contentType: string,
    expiresIn = 300,
): Promise<string> {
    const env = loadEnv()
    const cmd = new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: s3Key,
        ContentType: contentType,
    })
    return getSignedUrl(getS3Client(), cmd, { expiresIn })
}

/**
 * Direct server-side PUT — the backend streams the bytes to S3 itself. Used by
 * the multipart upload route so the browser never PUTs to S3 directly (which
 * would need bucket CORS for the portal origin). The SDK hashes the body here,
 * so no presigned-URL checksum concerns apply.
 */
export async function uploadObject(
    s3Key: string,
    body: Buffer | Uint8Array,
    contentType: string,
): Promise<void> {
    const env = loadEnv()
    await getS3Client().send(new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: s3Key,
        Body: body,
        ContentType: contentType,
    }))
}

/**
 * Build a tenant-scoped S3 key. The `tenants/${tenantId}/` prefix is the
 * cross-tenant security boundary — every key check downstream asserts this
 * prefix matches the requesting user's tenant.
 */
export function buildS3Key(tenantId: string, folder: string, fileName: string): string {
    return `tenants/${tenantId}/${folder}/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
}

/** HEAD an S3 object to confirm the browser actually completed the PUT. */
export async function objectExists(s3Key: string): Promise<boolean> {
    const env = loadEnv()
    try {
        await getS3Client().send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: s3Key }))
        return true
    } catch (err: unknown) {
        const e = err as { name?: string; $metadata?: { httpStatusCode?: number } }
        if (e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404) return false
        throw err
    }
}
