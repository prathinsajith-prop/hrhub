import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import fp from 'fastify-plugin'
import { loadEnv } from '../config/env.js'

let s3Client: S3Client | null = null
let bucketEnsured = false

export function getS3Client(): S3Client {
    if (s3Client) return s3Client
    const env = loadEnv()
    s3Client = new S3Client({
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT !== 'https://s3.amazonaws.com' ? env.S3_ENDPOINT : undefined,
        forcePathStyle: true, // required for MinIO
        credentials: {
            accessKeyId: env.S3_ACCESS_KEY,
            secretAccessKey: env.S3_SECRET_KEY,
        },
    })
    return s3Client
}

/** Ensure the configured bucket exists in MinIO/S3 — creates it on first call. */
export async function ensureBucket(): Promise<void> {
    if (bucketEnsured) return
    const env = loadEnv()
    const client = getS3Client()
    try {
        await client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }))
    } catch {
        try {
            await client.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }))
        } catch (err: any) {
            // Race or already-exists error — ignore
            if (err?.name !== 'BucketAlreadyOwnedByYou' && err?.name !== 'BucketAlreadyExists') {
                throw err
            }
        }
    }
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

export async function generateDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    const env = loadEnv()
    const command = new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key })
    return getSignedUrl(getS3Client(), command, { expiresIn })
}

export async function deleteObject(key: string): Promise<void> {
    const env = loadEnv()
    await getS3Client().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
}

export function buildS3Key(tenantId: string, folder: string, fileName: string): string {
    return `tenants/${tenantId}/${folder}/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
}

const s3Plugin = fp(async (fastify) => {
    fastify.decorate('s3', {
        generateUploadUrl,
        generateDownloadUrl,
        deleteObject,
        buildS3Key,
        uploadObject,
        ensureBucket,
    })
})

export default s3Plugin
