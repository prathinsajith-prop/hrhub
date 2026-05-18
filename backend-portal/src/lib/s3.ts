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
