# 内测发布流程：TestFlight 与 Google Play Internal Testing

> 用途：指导把 preview / production 构建送到内测渠道并邀请测试员。
> 前置事实：本仓库已配置 EAS（`apps/mobile/eas.json`），preview 产出内部分发包（Android 为 APK），production 产出上架包（Android AAB）。
> **云构建与商店操作均需账号负责人登录后人工执行**（本机无法代替）。

---

## 一、共同前置（两个平台都要办）

| # | 事项 | 状态 |
|---|---|---|
| 1 | 注册 Expo 账号并登录：`eas login`；首次执行 `eas: init` 关联项目 | 人工办理 |
| 2 | 隐私政策**托管网址**（商店列表强制要求，App 内页面不能替代）：将 `apps/mobile/app/legal/privacy.tsx` 的内容托管到官网/Notion 公开页，例如 `https://shenyou.app/privacy`；用户协议同址 `/terms` | 人工办理 |
| 3 | 补全法律文档【】项：运营主体全称、住所地、客服邮箱、云服务商名称 | 人工办理 |
| 4 | 在 App Store Connect / Play Console 配置订阅商品（月度/年度自动续期），商品 ID 与 RevenueCat 后台一致 | 人工办理 |
| 5 | RevenueCat 配置 Apple App Store Connect API Key 与 Google Play Service Credentials | 人工办理 |

---

## 二、iOS：TestFlight 内测

### 2.1 账号与商店后台

1. 加入 **Apple Developer Program**（99 美元/年），完成账号付款与身份核验（个人/公司）。
2. App Store Connect 中创建 App 记录：名称「神游」、主语言简体中文、Bundle ID `com.shenyou.app`（EAS 构建时会自动注册 App ID）。
3. **协议、税务和银行业务**：签署 Paid Apps 协议并填写税务/收款信息，否则内购商品无法售卖。
4. 配置自动续期订阅：订阅群组（如「神游会员」）下两个产品（月度、年度），填写本地化名称、描述、审核截图；订阅本地化信息中填写隐私政策与用户协议链接。

### 2.2 构建与上传

```bash
cd apps/mobile
# 真机内测包（preview channel，mock billing）
eas build --profile preview --platform ios
```

上传 TestFlight 二选一：

- `eas submit --profile preview --platform ios`（使用同一构建）；
- 或 EAS 构建页直接触发 Submit。

签名证书与描述文件由 EAS 托管（首次按提示登录 Apple 账号授权即可）。

### 2.3 TestFlight 后台处理

1. 构建上传后进入「正在处理」，通常 5～30 分钟；首次构建会被询问出口合规：**仅使用 HTTPS 标准加密**，属豁免范围（Expo 模板默认 `ITSAppUsesNonExemptEncryption=false`，TestFlight 不再逐次追问）。
2. 填写「测试信息」：Beta 版描述、反馈邮箱；若 App 需要登录，填写**演示账号与密码**（审核与测试员需要）。

### 2.4 添加测试员

| 方式 | 对象 | 上限 | 是否需 Beta 审核 |
|---|---|---|---|
| **内部测试**（App Store Connect 用户） | 开发/运营内部成员 | 最多 100 人 | 否，立即可测 |
| **外部测试**（公开链接/邮件组） | 种子用户 | 最多 10,000 人 | 首次需通过 **Beta App Review** |

- 内部测试：用户和访问 → 添加为 App Store Connect 用户（勾选技术/营销等角色即可）→ TestFlight → 内部测试组添加。
- 外部测试：创建群组 → 启用「公开链接」（可设人数上限）→ 首次提交需 Beta 审核（通常 1～2 天），审核按 App Store 3.1.2 等标准执行。
- 测试员通过 TestFlight App 安装；**每个构建有效期 90 天**，到期需上传新构建。

### 2.5 建议首批测试安排

内部组 5～10 人 + 外部组 30～50 人种子用户，跑 `docs/release/release-checklist.md` 全部冒烟用例，重点收集后台播放、订阅与崩溃情况。

---

## 三、Android：Google Play Internal Testing

### 3.1 账号与首次上架准备

1. 注册 **Google Play Console**（一次性 25 美元），完成身份验证。
2. **新注册个人开发者注意（2024 年起政策）**：申请正式发布前，须先完成至少 **14 天封闭测试、12 名测试员主动加入**的测试要求；**internal testing 轨道可立即分发**，但不能替代该生产前置测试（正式生产前需另跑 closed testing）。
3. 创建应用：名称「神游」、语言简体中文、应用（非游戏）、免费。
4. 完成后台声明项（internal track 首次发布前大部分即被要求）：
   - **App 内容**：隐私政策网址；
   - **应用访问权限**：声明全部功能需登录 → 提供演示账号密码；
   - **广告**：否；
   - **内容分级**：填写分级问卷（助眠音频通常 Everyone）；
   - **目标受众群体**：成年人（不面向儿童）；
   - **数据安全（Data Safety）**：按下表填报；
   - **金融功能**：声明含付费数字内容（订阅），说明支付经 Google Play 结算。
5. Play Console → 订阅：创建「神游会员」订阅及月度/年度基础方案，价格与 App Store 对齐。

### 3.2 Google Play「数据安全」填报口径（与 App Store 标签一致）

- Collected：Email/Phone（账号注册时按实际）、User IDs、Purchase history、App activity（播放进度/收藏）；
- 全部：transmitted over encrypted network、user can request deletion；用途仅 App functionality；
- Not shared / no advertising；不含位置、通讯录、麦克风、文件、设备标识符。

### 3.3 构建（Play 要求 AAB）

```bash
cd apps/mobile
# 商店包：AAB + production channel（真实 IAP）；内部轨道同样使用此构建
eas build --profile production --platform android
eas submit --profile production --platform android
```

`eas.json` 已预置 `submit.production.android.track = "internal"`，提交后直接进入 internal testing 轨道。
（仅做内部功能分发、不上 Play 时，可用 `eas build --profile preview --platform android` 产出 APK 直装，但该包使用 mock billing，不可用于付费验证。）

### 3.4 测试员与分发

1. Play Console → 测试 → **Internal testing** → 创建新版本，上传 AAB 后发布（internal 轨道无人工审核，通常数分钟内生效）。
2. 测试员标签页按**邮箱名单**添加，上限 **100 人**；测试员须用该邮箱的 Google 账号接受邀请。
3. 测试员通过专属 opt-in 链接在 Google Play 安装，可直接购买订阅（**真实扣款**；如需测试购买不扣款，将测试员 Google 账号加入 **License testing**，购买走测试卡，订阅周期加速）。
4. 正式升轨：internal → closed（满足 14 天/12 人要求）→ production，逐轨提升即可。

---

## 四、状态汇总

- 配置与构建命令：**已提供**（eas.json / app.json / 本文档）。
- 商店注册、协议税务、商品创建、云构建执行、测试员名单：**待账号负责人人工办理**。
- 真机冒烟验收依据 `docs/release/release-checklist.md`，结果回填该文档。
