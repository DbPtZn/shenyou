# App Store 隐私标签（Privacy "Nutrition Label"）逐题答案

> 用途：在 App Store Connect → 应用 →「App 隐私」中逐项填报。
> 填报口径：**最小化采集**。下表答案已与 App 真实数据流核对（账号系统、播放进度、RevenueCat 订阅状态）。
> 所有条目均为 **Linked to User（与用户身份关联）**、**Not Used for Tracking（不用于追踪）**、**No IDFA（不使用广告标识符）**。

---

## 0. 前提题

| 题目 | 答案 |
|---|---|
| Does your app collect or transmit data that is linked to the user's identity? | **Yes**（账号体系，数据与账号关联） |
| Do you or your third-party partners use tracking (as defined by App Store)? | **No** |
| Does your app use the advertising identifier (IDFA)? | **No**（不声明 ATT，不弹窗） |

说明：RevenueCat 按 Apple 定义不属于 tracking（不用于第三方广告、不做跨 App 追踪）；支付数据由 Apple 处理，本 App 不接触。

## 1. 需要声明的数据类型（共 4 类）

### 1.1 Contact Info（联系方式）

| 数据项 | 是否收集 | 用途（Purposes） |
|---|---|---|
| Email Address | ✅ 收集（邮箱注册用户） | App Functionality（登录/账号） |
| Phone Number | ✅ 收集（手机号注册用户） | App Functionality（登录/账号） |
| Name | ❌ 不收集（昵称非真实姓名） | — |
| Physical Address / Other | ❌ 不收集 | — |

### 1.2 Identifiers（标识符）

| 数据项 | 是否收集 | 用途 |
|---|---|---|
| User ID | ✅ 收集（服务端账号 ID；同步给 RevenueCat 做权益绑定） | App Functionality |
| Device ID | ❌ 不收集（不采集设备广告标识符；不声明 IDFA） | — |

### 1.3 Purchases（购买）

| 数据项 | 是否收集 | 用途 |
|---|---|---|
| Purchase History | ✅ 收集（订阅状态/到期时间，由 RevenueCat 回传） | App Functionality（会员权益判断） |

支付卡信息由 Apple App Store 处理，本 App 不收集 Financial Info。

### 1.4 Usage Data（使用数据）

| 数据项 | 是否收集 | 用途 |
|---|---|---|
| Product Interaction | ✅ 收集（章节播放进度、收藏记录，用于断点续播） | App Functionality |
| Advertising Data / Other Usage Data | ❌ 不收集 | — |

## 2. 明确「不收集」的类型（审查时如被问及）

Health & Fitness（不采集健康数据；音频内容非健康服务）、Financial Info、Location、Sensitive Info、Contacts、User Content（**不使用麦克风，不录音**；无照片/视频/客户支持附件）、Browsing History、Search History、Diagnostics（不上传崩溃诊断与设备日志）。

## 3. 每项数据的三个勾选项（逐屏操作指引）

对上述 4 类数据，每一项均按以下填写：

1. **Collection**：Yes, collected and linked to the user's identity.
2. **Purposes**：仅勾选 **App Functionality**（不勾选 Analytics、Product Personalization、Advertising 等）。
3. **Tracking**：No, not used for tracking.
4. **Linked to Identity**：Yes。

## 4. 复审触发条件

以下变更发生时必须更新隐私标签，否则可能被拒/下架：

- 增加任何分析/崩溃上报 SDK（如 Sentry、PostHog）→ 需新增 Diagnostics/Usage Data；
- 接入广告 SDK 或使用 IDFA → Tracking 改为 Yes 并补 ATT 弹窗（当前架构不允许，需另行评审）；
- 增加用户生成内容上传、客服系统等 → 对应补 User Content。

---

**状态**：答案已提供，可直接填报；由账号负责人在 App Store Connect 中人工提交。
