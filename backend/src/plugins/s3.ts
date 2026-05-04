import {
    S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand,
    HeadBucketCommand, HeadObjectCommand, CreateBucketCommand,
} from '@aws-sdk/client-s3'
import { PutBucketCorsCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import fp from 'fastify-plugin'
import { loadEnv } from '../config/env.js'

let s3Client: S3Client | null = null
let bucketEnsured = false

export function getS3Client(): S3Client {
    if (s3Client) return s3Client
    const env = loadEnv()

    // Use custom endpoint only for MinIO / non-AWS S3-compatible stores.
    // For real AWS S3 set S3_ENDPOINT=https://s3.amazonaws.com (or leave blank).
    const isAwsS3 = !env.S3_ENDPOINT
        || env.S3_ENDPOINT === 'https://s3.amazonaws.com'
        || env.S3_ENDPOINT.includes('.amazonaws.com')

    s3Client = new S3Client({
        region: env.S3_REGION,
        endpoint: isAwsS3 ? undefined : env.S3_ENDPOINT,
        // forcePathStyle required for MinIO; harmless (but deprecated) for AWS
        forcePathStyle: !isAwsS3,
        credentials: {
            accessKeyId: env.S3_ACCESS_KEY,
            secretAccessKey: env.S3_SECRET_KEY,
        },
    })
    return s3Client
}

/**
 * Set bucket CORS so browsers can PUT directly via presigned URLs.
 * Called once during ensureBucket — safe to call on AWS S3 and MinIO.
 */
async function setBucketCors(bucket: string, allowedOrigins: string[]): Promise<void> {
    const client = getS3Client()
    try {
        await client.send(new PutBucketCorsCommand({
            Bucket: bucket,
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : ['*'],
                        AllowedMethods: ['PUT', 'GET', 'HEAD'],
                        AllowedHeaders: ['*'],
                        ExposeHeaders: ['ETag'],
                        MaxAgeSeconds: 3600,
                    },
                ],
            },
        }))
    } catch (err: any) {
        // Non-fatal — log and continue. MinIO and some S3-compatible stores
        // may not support PutBucketCors or it may need manual setup.
        console.warn('[S3] Could not set bucket CORS policy:', err?.message ?? err)
    }
}

/** Ensure the configured bucket exists — creates it on first call, then sets CORS. */
export async function ensureBucket(): Promise<void> {
    if (bucketEnsured) return
    const env = loadEnv()
    const client = getS3Client()

    try {
        await client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }))
        // 200 — bucket exists and we have access
    } catch (err: any) {
        const status: number | undefined = err?.$metadata?.httpStatusCode

        if (status === 301 || status === 403) {
            // 301 = bucket is in a different region (SDK will redirect on next call)
            // 403 = bucket exists but HeadBucket permission not granted — proceed anyway
            console.warn(`[S3] HeadBucket returned ${status} for "${env.S3_BUCKET}" — assuming bucket exists`)
        } else if (status === 404 || err?.name === 'NoSuchBucket' || err?.name === 'NotFound') {
            // Bucket truly doesn't exist — try to create it
            try {
                await client.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }))
            } catch (createErr: any) {
                if (createErr?.name !== 'BucketAlreadyOwnedByYou' && createErr?.name !== 'BucketAlreadyExists') {
                    throw createErr
                }
            }
        } else {
            // Network error, credential error, etc. — surface it so callers return 503
            throw err
        }
    }

    // Set CORS so presigned PUT URLs work from the browser — non-fatal if IAM lacks permission
    const allowedOrigins = env.CORS_ORIGINS === '*'
        ? ['*']
        : env.CORS_ORIGINS.split(',').map((o: string) => o.trim()).filter(Boolean)
    await setBucketCors(env.S3_BUCKET, allowedOrigins)

    bucketEnsured = true
}

/** Direct server-side PUT (use for backend-streamed multipart uploads). */
export async function uploadObject(
    key: string,
    body: Buffer | Uint8Array | string,
    contentType: string,
): Promise<void> {
    const env = loadEnv()
    await ensureBucket()
    await getS3Client().send(new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
    }))
}

export async function generateUploadUrl(
    key: string,
    contentType: string,
    expiresIn = 300,
): Promise<string> {
    const env = loadEnv()
    await ensureBucket()
    const command = new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        ContentType: contentType,
    })
    return getSignedUrl(getS3Client(), command, { expiresIn })
}

export async function generateDownloadUrl(key: string, expiresIn = 3600, fileName?: string): Promise<string> {
    const env = loadEnv()
    const command = new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        // Force inline display so PDFs and images render in the browser rather than downloading
        // RFC 5987 extended notation — handles non-ASCII and all special chars safely.
        ResponseContentDisposition: fileName
            ? `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`
            : 'inline',
    })
    return getSignedUrl(getS3Client(), command, { expiresIn })
}

export async function deleteObject(key: string): Promise<void> {
    const env = loadEnv()
    await getS3Client().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
}

export async function objectExists(key: string): Promise<boolean> {
    const env = loadEnv()
    try {
        await getS3Client().send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
        return true
    } catch (err: unknown) {
        const code = (err as { name?: string; $metadata?: { httpStatusCode?: number } })
        if (code?.name === 'NotFound' || code?.$metadata?.httpStatusCode === 404) return false
        throw err
    }
}

export function buildS3Key(tenantId: string, folder: string, fileName: string): string {
    return `tenants/${tenantId}/${folder}/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
}

/**
 * Convert a stored avatarUrl value to a presigned download URL.
 * Handles both new format (s3Key starting with 'tenants/') and old format
 * (full https:// public URL from before the presigned-URL migration).
 * Returns null for empty/unrecognised values.
 */
export async function resolveAvatarUrl(stored: string | null | undefined): Promise<string | null> {
    if (!stored) return null
    let key = stored
    if (stored.startsWith('http://') || stored.startsWith('https://')) {
        try {
            const url = new URL(stored)
            key = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname
        } catch {
            return null
        }
    }
    if (!key.startsWith('tenants/')) return null
    return generateDownloadUrl(key, 86400) // 24-hour presigned URL
}

const s3Plugin = fp(async (fastify) => {
    fastify.decorate('s3', {
        generateUploadUrl,
        generateDownloadUrl,
        deleteObject,
        buildS3Key,
        uploadObject,
        ensureBucket,
        objectExists,
        resolveAvatarUrl,
    })
})

export default s3Plugin
