import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import fp from 'fastify-plugin'
import { loadEnv } from '../config/env.js'

let s3Client: S3Client | null = null

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

export async function generateUploadUrl(
    key: string,
    contentType: string,
    expiresIn = 300,
): Promise<string> {
    const env = loadEnv()
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
    })
})

export default s3Plugin
