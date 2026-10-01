import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { BillingModule } from "../billing/billing.module";
import { AdminGuard } from "./admin.guard";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { AudioStreamController } from "./audio-stream.controller";
import { CdnUrlService } from "./cdn-url.service";
import { ChaptersController } from "./chapters.controller";
import { ChaptersService } from "./chapters.service";
import { FavoritesController } from "./favorites.controller";
import { FavoritesService } from "./favorites.service";
import { ImageStreamController } from "./image-stream.controller";
import { JourneysController } from "./journeys.controller";
import { JourneysService } from "./journeys.service";
import { PlaybackController } from "./playback.controller";
import { PlaybackService } from "./playback.service";
import { StorageService } from "./storage.service";

/** 内容域：旅程/章节/音频资产/断点续播/收藏 + 管理端维护接口 */
@Module({
  // JwtAuthGuard 依赖 JwtService，secret 在校验时传入（与 UsersModule 同模式）
  imports: [JwtModule.register({}), BillingModule],
  controllers: [
    JourneysController,
    ChaptersController,
    PlaybackController,
    FavoritesController,
    AdminController,
    AudioStreamController,
    ImageStreamController,
  ],
  providers: [
    JourneysService,
    ChaptersService,
    PlaybackService,
    FavoritesService,
    AdminService,
    StorageService,
    CdnUrlService,
    AdminGuard,
  ],
})
export class ContentModule {}
