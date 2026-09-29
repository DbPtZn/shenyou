# 神游 App · AI 编程提示词体系

这套提示词用于指导 AI 编程助手（Claude Code / CodeBuddy / Cursor 等）逐步开发神游 App（Expo + RN + NestJS monorepo）。

## 文件清单

| 文件 | 用途 | 怎么用 |
|---|---|---|
| `CLAUDE.md` | **项目宪法**：技术栈锁定、架构规则、音频领域铁律、AI 工作流与禁区 | 放到 monorepo **根目录**。Claude Code / CodeBuddy 会自动读取；Cursor 用户请复制一份为 `AGENTS.md` 或 `.cursorrules`；其他 AI 工具则把它作为每次会话的第一条消息粘贴 |
| `phase-prompts.md` | **阶段任务提示词**（8 个阶段，从脚手架到上架） | 每个阶段新开一个干净会话，复制对应阶段整段提示词发给 AI |
| `prototype-guide.md` | **原型导读**：《神游APP产品原型.html》的 AI 友好规格翻译——路由映射、交互规则、Design Tokens、架构决策点 | 与原型 HTML 一起放入 monorepo `docs/`；CLAUDE.md 已引用 |
| `prototype/神游APP产品原型.html` | 高保真交互原型（视觉与交互的唯一事实来源） | 放入 monorepo `docs/prototype/`；浏览器可打开预览，支持 `#page-xxx` 锚点直达 |

## 推荐工作节奏

1. **一个阶段一个新会话**：保持上下文干净，AI 不会被上一阶段的中间过程干扰。
2. **先过验收清单再进下一阶段**：每个阶段提示词末尾都有验收清单，全部打勾才算完成。
3. **音频功能必须真机验证**：Expo SDK 55 起 `expo-audio` 不在 Expo Go 中运行，必须走 development build（`npx expo run:ios` / `run:android` 或 EAS Build）装到真机测试。

## 通用会话开场白模板

```
我在开发神游 App（Expo + RN + NestJS monorepo，助眠音频产品）。
当前处于阶段 N「阶段名」。项目根目录的 CLAUDE.md 是项目宪法，请先完整阅读并遵守。
本次任务：[从 phase-prompts.md 复制对应阶段正文]
```

## 使用前需你确认的三个决策点

宪法中已给出默认值，如需调整请在开始前修改 `CLAUDE.md`：

1. **订阅方案**：默认 RevenueCat（iOS + Google Play 通吃，有免费额度）；若只发 iOS 且想省依赖，可改为直连 StoreKit 2。
2. **TTS / 音乐模型厂商**：宪法只锁定了「适配器接口 + Mock 先行」，具体厂商你在阶段 6 时通过环境变量接入。
3. **首发渠道**：默认 App Store + Google Play 先行，国内安卓商店（需软著/企业资质）后置。
4. **音景调音台实现路线**（导读决策 D1，影响播放架构）：默认「服务端按预置比例预混多版本、客户端切换版本」；若要做客户端三轨同步播放，需先修改导读与阶段 5 提示词。
