/** 可购买方案标识（paywall 上的月度/年度） */
export type PurchasePlan = 'monthly' | 'yearly';

/** 购买结果 */
export interface PurchaseResult {
  /** 购买完成后权益是否有效 */
  isActive: boolean;
  /** 用户在商店弹窗中取消（未支付），不视为错误 */
  userCancelled: boolean;
}

/** 恢复购买结果 */
export interface RestoreResult {
  isActive: boolean;
}

/** 方案展示信息（价格必须来自商店，禁止客户端硬编码真实价格） */
export interface PlanDisplayInfo {
  plan: PurchasePlan;
  /** 完整价格文案，如 "¥25" */
  priceText: string;
  /** 周期文案，如 "/月" */
  periodText: string;
  /** 年度折算文案，如 "约 ¥3.2/周" */
  perWeekText?: string | undefined;
  /** 节省文案，如 "节省 44%" */
  savingsText?: string | undefined;
}

/** 权益变更回调（原生续费/退款/过期事件） */
export type EntitlementChangeListener = (isActive: boolean) => void;

/**
 * 订阅购买服务（适配器接口）：
 * 真实实现 RevenueCatPurchases（react-native-purchases），
 * 本地开发实现 MockPurchases（服务端沙盒模拟，Expo Go 可用）。
 * 与管线 provider 同构：通过 factory 按 env 选择。
 */
export interface PurchasesService {
  /** App 启动时配置一次（真实实现读平台 API key） */
  configure(): void;
  /** 登录后绑定本系统 userId（RC app_user_id） */
  login(appUserId: string): Promise<void>;
  /** 退出登录（回到匿名身份） */
  logout(): Promise<void>;
  /** 可购买方案的展示信息（价格/周期/节省） */
  getPlans(): Promise<PlanDisplayInfo[]>;
  /** 发起购买 */
  purchase(plan: PurchasePlan): Promise<PurchaseResult>;
  /** 恢复购买（App Store 审核硬要求） */
  restore(): Promise<RestoreResult>;
  /** 订阅权益原生变更监听 */
  addEntitlementChangeListener(listener: EntitlementChangeListener): void;
}
