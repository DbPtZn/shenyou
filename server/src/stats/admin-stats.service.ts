import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import type { AdminStatsOverview, AdminStatsTopJourney, SubscriptionStatus } from "@shenyou/shared";
import { Redis } from "ioredis";
import { ENV, type Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

/** 看板总览缓存：键含版本号，结构变更时 bump 版本避免读到旧形态 */
const STATS_CACHE_KEY = "admin:stats:overview:v1";
/** 统计结果缓存 TTL（秒）：大表聚合较重，5 分钟内的看板访问走缓存 */
const STATS_CACHE_TTL_SEC = 300;
/** 热门场景排行条数 */
const TOP_JOURNEYS_LIMIT = 10;
/** 完播判定：播放进度达到章节时长的 90%（MVP 口径，见 shared adminStatsPlaybackSchema 注释） */
const COMPLETION_THRESHOLD = 0.9;

interface PlaybackAggRow {
  totalPlays: number;
  uniqueListeners: number;
  completedCount: number;
  activeLast7d: number;
  activeLast30d: number;
}

interface TopJourneyRow {
  journeyId: string;
  title: string;
  coverUrl: string | null;
  status: AdminStatsTopJourney["status"];
  isFree: boolean;
  playCount: number;
  uniqueListeners: number;
  completedCount: number;
}

/**
 * 数据看板统计：聚合 PlaybackHistory / User / Entitlement / BillingEventLog。
 * 大表聚合走原生 SQL（单趟聚合 + FILTER），结果写 Redis 缓存（默认 5 分钟）；
 * Redis 故障仅降级为实时计算并告警，不影响接口可用性。
 */
@Injectable()
export class AdminStatsService implements OnModuleDestroy {
  private readonly logger = new Logger(AdminStatsService.name);
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) env: Env,
  ) {
    // lazyConnect：首次使用时才建连，避免与 BullMQ 连接竞争拖慢启动
    this.redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  }

  /**
   * 看板总览。默认读缓存；forceRefresh 时重算并回填缓存。
   * generatedAt 为统计实际生成时间（缓存命中时保持原值，供前端展示数据时效）。
   */
  async getOverview(forceRefresh: boolean): Promise<AdminStatsOverview> {
    if (!forceRefresh) {
      const cached = await this.readCache();
      if (cached) return cached;
    }
    const overview = await this.computeOverview();
    await this.writeCache(overview);
    return overview;
  }

  private async computeOverview(): Promise<AdminStatsOverview> {
    const [playbackRows, topJourneyRows, totalUsers, statusGroups, eventGroups] =
      await Promise.all([
        this.prisma.$queryRaw<PlaybackAggRow[]>`
          SELECT
            COUNT(*)::int AS "totalPlays",
            COUNT(DISTINCT ph."userId")::int AS "uniqueListeners",
            COUNT(*) FILTER (
              WHERE c."durationSec" > 0 AND ph."positionSec" >= c."durationSec" * ${COMPLETION_THRESHOLD}
            )::int AS "completedCount",
            COUNT(*) FILTER (WHERE ph."updatedAt" >= NOW() - INTERVAL '7 days')::int AS "activeLast7d",
            COUNT(*) FILTER (WHERE ph."updatedAt" >= NOW() - INTERVAL '30 days')::int AS "activeLast30d"
          FROM "PlaybackHistory" ph
          JOIN "Chapter" c ON c.id = ph."chapterId"
        `,
        this.prisma.$queryRaw<TopJourneyRow[]>`
          SELECT
            j.id AS "journeyId",
            j.title,
            j."coverUrl",
            j.status::text AS "status",
            j."isFree",
            COUNT(*)::int AS "playCount",
            COUNT(DISTINCT ph."userId")::int AS "uniqueListeners",
            COUNT(*) FILTER (
              WHERE c."durationSec" > 0 AND ph."positionSec" >= c."durationSec" * ${COMPLETION_THRESHOLD}
            )::int AS "completedCount"
          FROM "PlaybackHistory" ph
          JOIN "Chapter" c ON c.id = ph."chapterId"
          JOIN "Journey" j ON j.id = c."journeyId"
          GROUP BY j.id, j.title, j."coverUrl", j.status, j."isFree"
          ORDER BY "playCount" DESC, "uniqueListeners" DESC
          LIMIT ${TOP_JOURNEYS_LIMIT}
        `,
        this.prisma.user.count(),
        this.prisma.user.groupBy({
          by: ["subscriptionStatus"],
          _count: { _all: true },
        }),
        this.prisma.billingEventLog.groupBy({
          by: ["eventType"],
          _count: { _all: true },
        }),
      ]);

    const playback = playbackRows[0] ?? {
      totalPlays: 0,
      uniqueListeners: 0,
      completedCount: 0,
      activeLast7d: 0,
      activeLast30d: 0,
    };

    const byStatus: Record<SubscriptionStatus, number> = {
      free: 0,
      trial: 0,
      active: 0,
      expired: 0,
      canceled: 0,
    };
    for (const group of statusGroups) {
      if (group.subscriptionStatus in byStatus) {
        byStatus[group.subscriptionStatus as SubscriptionStatus] = group._count._all;
      }
    }
    const payingUsers = byStatus.trial + byStatus.active;

    const eventCount = (eventType: string) =>
      eventGroups.find((g) => g.eventType === eventType)?._count._all ?? 0;

    return {
      generatedAt: new Date().toISOString(),
      cacheTtlSec: STATS_CACHE_TTL_SEC,
      playback: {
        totalPlays: playback.totalPlays,
        uniqueListeners: playback.uniqueListeners,
        completedCount: playback.completedCount,
        completionRate:
          playback.totalPlays > 0 ? playback.completedCount / playback.totalPlays : 0,
        activeLast7d: playback.activeLast7d,
        activeLast30d: playback.activeLast30d,
      },
      subscription: {
        totalUsers,
        byStatus,
        payingUsers,
        conversionRate: totalUsers > 0 ? payingUsers / totalUsers : 0,
        initialPurchaseEvents: eventCount("INITIAL_PURCHASE"),
        renewalEvents: eventCount("RENEWAL"),
      },
      topJourneys: topJourneyRows.map((row) => ({
        journeyId: row.journeyId,
        title: row.title,
        coverUrl: row.coverUrl,
        status: row.status,
        isFree: row.isFree,
        playCount: row.playCount,
        uniqueListeners: row.uniqueListeners,
        completionRate: row.playCount > 0 ? row.completedCount / row.playCount : 0,
      })),
    };
  }

  /** 读缓存：解析失败/连接失败均视为未命中（降级实时计算），不抛错 */
  private async readCache(): Promise<AdminStatsOverview | null> {
    try {
      const raw = await this.redis.get(STATS_CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as AdminStatsOverview;
    } catch (error) {
      this.logger.warn({ err: error }, "看板统计缓存读取失败，降级为实时计算");
      return null;
    }
  }

  /** 写缓存：失败仅告警，不影响响应 */
  private async writeCache(overview: AdminStatsOverview): Promise<void> {
    try {
      await this.redis.set(STATS_CACHE_KEY, JSON.stringify(overview), "EX", STATS_CACHE_TTL_SEC);
    } catch (error) {
      this.logger.warn({ err: error }, "看板统计缓存写入失败");
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
