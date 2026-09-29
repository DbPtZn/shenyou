import { Controller, Get, Inject, Query, Req, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { ENV, type Env } from "../config/env";
import { StorageService } from "./storage.service";

/**
 * 音频流式回源（开发态 CDN 代理）。
 *
 * 播放链路：手机 -> GET /audio/<objectKey>?expires=&signature=&uid= -> 本控制器
 *   1. 校验 HMAC 签名（objectKey + expires + userId），防转借
 *   2. 校验过期时间
 *   3. 用 S3 SDK（带 AK/SK）从 RustFS 拉取并流式返回，支持 Range 拖动
 *
 * 生产环境由真实 CDN 边缘承担此职责（CDN_BASE_URL 指向 CDN，此处不生效）。
 */
@SkipThrottle()
@Controller("audio")
export class AudioStreamController {
  constructor(
    private readonly storage: StorageService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get("*")
  async stream(
    @Req() req: Request,
    @Res() res: Response,
    @Query("expires") expires?: string,
    @Query("signature") signature?: string,
    @Query("uid") uid?: string,
  ): Promise<void> {
    // 从路径提取 objectKey：/audio/audio/xxx/yyy.m4a -> audio/xxx/yyy.m4a
    // req.path 不含 query，去掉前缀 /audio/ 即可
    const objectKey = req.path.replace(/^\/audio\//, "");

    // ── 鉴权 ──
    if (!objectKey || !expires || !signature || !uid) {
      res.status(400).send("Missing parameters");
      return;
    }

    const expected = createHmac("sha256", this.env.CDN_SIGNING_SECRET)
      .update(`${objectKey}\n${expires}\n${uid}`)
      .digest("hex");

    const sigBuf = Buffer.from(signature, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      res.status(403).send("Invalid signature");
      return;
    }

    const expiresAt = parseInt(expires, 10);
    if (Number.isNaN(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
      res.status(410).send("URL expired");
      return;
    }

    // ── 从 S3 流式拉取 ──
    try {
      const range = req.headers.range;
      const output = await this.storage.send(
        new GetObjectCommand({
          Bucket: this.env.S3_BUCKET,
          Key: objectKey,
          Range: range,
        }),
      );

      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader(
        "Content-Type",
        output.ContentType && output.ContentType !== "application/octet-stream"
          ? output.ContentType
          : inferContentType(objectKey),
      );
      if (output.ContentLength !== undefined) {
        res.setHeader("Content-Length", output.ContentLength);
      }
      if (output.ContentRange) {
        res.setHeader("Content-Range", output.ContentRange);
        res.status(206);
      } else {
        res.status(200);
      }

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
        res.status(404).send("Audio not found");
      }
    }
  }
}

/** 按文件扩展名推断 Content-Type（上传未指定时兜底） */
function inferContentType(objectKey: string): string {
  const ext = objectKey.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "mp3":
      return "audio/mpeg";
    case "m4a":
    case "aac":
      return "audio/mp4";
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    case "flac":
      return "audio/flac";
    default:
      return "application/octet-stream";
  }
}
