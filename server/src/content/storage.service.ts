import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Inject, Injectable } from "@nestjs/common";
import { createReadStream, statSync } from "node:fs";
import { ENV, type Env } from "../config/env";

/**
 * 对象存储服务：S3 兼容（本地 RustFS，生产 OSS/R2 换 endpoint）。
 * 只负责签发预签名直传 URL，文件不经过后端（CLAUDE.md §5）。
 */
@Injectable()
export class StorageService {
  /** 服务端内部调用 S3 API 用的客户端（走 localhost） */
  private readonly client: S3Client;
  /** 生成对外预签名 URL 用的客户端（走 S3_PUBLIC_ENDPOINT，供手机访问） */
  private readonly presignClient: S3Client;

  constructor(@Inject(ENV) private readonly env: Env) {
    const credentials = {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    };
    const baseConfig = {
      region: env.S3_REGION,
      credentials,
      // MinIO/RustFS 等自建存储必须走 path-style
      forcePathStyle: true,
    } as const;

    this.client = new S3Client({ ...baseConfig, endpoint: env.S3_ENDPOINT });
    // 预签名 URL 里的 host 取自 endpoint，因此单独建一个用公网可达地址的客户端
    this.presignClient = new S3Client({
      ...baseConfig,
      endpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT,
    });
  }

  /** 签发 PUT 直传 URL，有效期见 S3_PRESIGN_TTL_SEC */
  createPresignedUploadUrl(objectKey: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.env.S3_BUCKET, Key: objectKey }),
      { expiresIn: this.env.S3_PRESIGN_TTL_SEC },
    );
  }

  /**
   * 签发 GET 预签名下载 URL（开发态播放用，替代 CDN 签名）。
   * RustFS 私有桶也能直接播放，不依赖 bucket anonymous 策略；
   * 使用 presignClient 确保 URL host 是手机可达的地址。
   */
  createPresignedDownloadUrl(objectKey: string): Promise<string> {
    return getSignedUrl(
      this.presignClient,
      new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: objectKey }),
      { expiresIn: this.env.CDN_URL_TTL_SEC },
    );
  }

  /** 直接向 S3 发送命令（供音频流式回源使用） */
  send(command: GetObjectCommand) {
    return this.client.send(command);
  }

  /**
   * 服务端直传本地文件到 S3（AI 管线产物上传用）。
   * 返回 objectKey 与文件大小。
   */
  async uploadFile(objectKey: string, filePath: string, contentType: string): Promise<{ objectKey: string; sizeBytes: number }> {
    const sizeBytes = statSync(filePath).size;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: objectKey,
        Body: createReadStream(filePath),
        ContentType: contentType,
        ContentLength: sizeBytes,
      }),
    );
    return { objectKey, sizeBytes };
  }
}
