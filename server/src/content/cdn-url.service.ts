import { Inject, Injectable } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { ENV, type Env } from "../config/env";

export interface SignedPlaybackUrl {
  url: string;
  expiresAt: Date;
}

/**
 * CDN 播放地址签名：URL = CDN_BASE_URL/objectKey?expires=&signature=。
 * 签名内容绑定 objectKey + 过期时间 + 用户 id（HMAC-SHA256），
 * CDN 边缘按同一密钥校验，过期或转借他人即失效（CLAUDE.md §5）。
 */
@Injectable()
export class CdnUrlService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  signPlaybackUrl(objectKey: string, userId: string): SignedPlaybackUrl {
    const expires = Math.floor(Date.now() / 1000) + this.env.CDN_URL_TTL_SEC;
    const signature = createHmac("sha256", this.env.CDN_SIGNING_SECRET)
      .update(`${objectKey}\n${expires}\n${userId}`)
      .digest("hex");
    const base = this.env.CDN_BASE_URL.replace(/\/+$/, "");
    return {
      // uid 一并放入 URL，供回源端点验签（生产 CDN 边缘按同一规则校验）
      url: `${base}/${objectKey}?expires=${expires}&signature=${signature}&uid=${userId}`,
      expiresAt: new Date(expires * 1000),
    };
  }
}
