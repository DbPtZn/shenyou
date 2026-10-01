import { Controller, Get, Inject, Req, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import type { Request, Response } from "express";
import { ENV, type Env } from "../config/env";
import { StorageService } from "./storage.service";

/**
 * 公共图片回源代理（封面图，开发态）。
 *
 * 链路：浏览器 / 手机 -> GET /images/<objectKey> -> 本控制器
 *   1. 校验 objectKey 属于公共前缀（covers/），其余一律 404
 *   2. 用 S3 SDK（带 AK/SK）从 RustFS 拉取并流式返回
 *
 * 封面是公开营销素材（发现页未登录即可见），不做 HMAC 签名；
 * 生产环境由真实 CDN 边缘承担（与 /audio 回源代理同策略）。
 */
@SkipThrottle()
@Controller("images")
export class ImageStreamController {
  constructor(
    private readonly storage: StorageService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get("*")
  async stream(@Req() req: Request, @Res() res: Response): Promise<void> {
    // req.path 不含 query，去掉前缀 /images/ 即 objectKey
    const objectKey = req.path.replace(/^\/images\//, "");

    if (!objectKey || !objectKey.startsWith("covers/")) {
      res.status(404).send("Not found");
      return;
    }

    try {
      const output = await this.storage.send(
        new GetObjectCommand({
          Bucket: this.env.S3_BUCKET,
          Key: objectKey,
        }),
      );

      // helmet 默认 CORP: same-origin 会拦截 Web 管理端（5174 → 3000）的跨源图片加载
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      // 公共封面：允许浏览器与 CDN 长缓存
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader(
        "Content-Type",
        output.ContentType && output.ContentType !== "application/octet-stream"
          ? output.ContentType
          : inferImageContentType(objectKey),
      );
      if (output.ContentLength !== undefined) {
        res.setHeader("Content-Length", output.ContentLength);
      }
      res.status(200);

      const body = output.Body as NodeJS.ReadableStream | undefined;
      if (!body) {
        res.end();
        return;
      }
      body.pipe(res);
      body.on("error", () => {
        if (!res.headersSent) {
          res.status(500).send("Stream error");
        }
      });
    } catch {
      if (!res.headersSent) {
        res.status(404).send("Image not found");
      }
    }
  }
}

/** 按文件扩展名推断图片 Content-Type（上传未指定时兜底） */
function inferImageContentType(objectKey: string): string {
  const ext = objectKey.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}
