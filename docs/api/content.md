# 神游 API · 内容域接口文档（移动端阶段使用）

> Base URL：`http://localhost:3000`（开发）；所有接口（除标注外）需 `Authorization: Bearer <accessToken>`。
>
> 统一响应结构：
> - 成功：`{ "code": 0, "message": "ok", "requestId": "...", "data": ... }`
> - 失败：`{ "code": <错误码>, "message": "<中文用户文案>", "requestId": "..." }`（HTTP 状态码语义化，无堆栈）
>
> 相关错误码：`1001` 参数校验失败 / `1002` 未登录 / `1003` 无权限 / `1004` 路由不存在 / `2001` access token 过期 / `3001` 内容不存在或已下架 / `4001` 需要订阅。

## 1. 旅程列表

`GET /journeys?page=1&pageSize=20&tag=雨夜`

| 参数 | 类型 | 说明 |
|---|---|---|
| page | int | 从 1 开始，默认 1 |
| pageSize | int | 1–50，默认 20 |
| tag | string? | 按单个标签筛选 |

只返回 `published` 的旅程。`data`：

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "雨夜京都小巷",
      "subtitle": "穿过石板路与木屋的细雨声",
      "coverUrl": null,
      "tags": ["雨夜", "京都"],
      "isFree": false,
      "totalDurationSec": 1800,
      "chapterCount": 1
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

## 2. 旅程详情

`GET /journeys/:id`

`data`：列表字段 + `chapters[]`（按 index 升序，含 `stops` 站点时间轴）+ `isFavorited`。

```json
{
  "id": "uuid",
  "title": "雨夜京都小巷",
  "chapters": [
    {
      "id": "uuid",
      "index": 1,
      "title": "第一章 入巷",
      "subtitle": "雨点落在油纸伞上",
      "durationSec": 1800,
      "stops": [{ "timeSec": 0, "title": "巷口", "subtitle": "雨声渐起" }]
    }
  ],
  "isFavorited": false
}
```

- `stops` 用于详情页时间轴与播放页站点进度；`timeSec` 为该站点起始时刻（秒）。
- 未发布/不存在 → `404 / 3001`。

## 3. 播放地址签发

`GET /chapters/:id/play`

可选查询参数：

- `mixPreset`：`default` / `relax`，按预置混音版本取成品（D1：default 40/35/25、relax 25/50/25）。不传时取最新 ready 成品。
  - 非法值 → `400 / 1001`「混音版本不存在」；relax 成品缺失 → `404 / 3001`「放松混音还在准备中，稍后再来试试」。

按用户与内容状态签发带过期的签名 CDN URL：

```json
{
  "chapterId": "uuid",
  "journeyId": "uuid",
  "url": "https://cdn.example.com/audio/.../xxx.m4a?expires=1790549382&signature=...",
  "expiresAt": "2026-09-27T22:49:42.000Z",
  "durationSec": 1800,
  "mixPreset": "default",
  "positionSec": 120
}
```

- `url` 签名绑定 objectKey + 过期时间 + 用户 id，转借他人或过期即失效；到期后重新调用本接口获取。
- `positionSec` 为该用户在此章节的上次播放位置（无记录为 0），客户端直接从这里起播。
- 付费旅程（`isFree=false`）且用户订阅非 `trial/active` → `403 / 4001`「该旅程为会员专属内容，订阅后即可畅听」。
- 音频未 ready → `404 / 3001`「音频还在准备中，请稍后再试」。

## 4. 断点续播

### 上报进度

`PUT /playback/:chapterId`

```json
{ "positionSec": 120 }
```

幂等 upsert；**节流由客户端负责**（建议每 5–10 秒或暂停/退出时上报一次）。返回 `{ chapterId, positionSec, updatedAt }`。

### 查询上次位置

`GET /playback?journeyId=<uuid>`

- 传 `journeyId`：返回该旅程下各章节的上次位置；
- 不传：返回当前用户全部播放记录（按 `updatedAt` 倒序）。

`data` 为数组：

```json
[
  {
    "chapterId": "uuid",
    "positionSec": 120,
    "updatedAt": "2026-09-27T21:50:00.795Z",
    "chapter": { "journeyId": "uuid", "index": 1, "title": "第一章 入巷" }
  }
]
```

## 5. 收藏

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/journeys/:id/favorite` | 收藏（幂等），返回 `{ journeyId, favorited: true }` |
| DELETE | `/journeys/:id/favorite` | 取消收藏（幂等） |
| GET | `/favorites` | 我的收藏列表（只含已发布旅程，按收藏时间倒序） |

## 6. 管理端接口（运营后台用，需 admin 角色）

均需登录且 `role=admin`，否则 `403 / 1003`。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/admin/journeys` | 创建旅程（draft）。Body：`{ title, subtitle?, coverUrl?, tags?, isFree? }` |
| PATCH | `/admin/journeys/:id` | 更新旅程；发布：`{ "status": "published" }` |
| POST | `/admin/journeys/:id/chapters` | 添加章节。Body：`{ index?, title, subtitle?, stops? }`，不传 index 自动排到末尾 |
| POST | `/admin/chapters/:chapterId/audio-assets` | 创建音频资产并签发预签名直传 URL。Body：`{ trackType, mixPreset?, fileName }` |
| POST | `/admin/audio-assets/:assetId/ready` | 上传完成回调。Body：`{ durationSec, sizeBytes? }` |

音频上传流程（直传，不经过服务端带宽）：

1. 调 `audio-assets` 创建资产，得到 `{ assetId, objectKey, uploadUrl, uploadExpiresInSec }`；
2. 客户端 `PUT uploadUrl`（binary body）直传对象存储；
3. 上传完成后调 `ready` 回调：资产置 `ready`；`mixed` 成品会同步章节时长并事务内重算旅程 `totalDurationSec`。

## 7. 认证接口（阶段 2 已交付，简要）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/register` | `{ account(手机号/邮箱), password, nickname? }` → `{ user, tokens }` |
| POST | `/auth/login` | 同上；限流 5 次/分钟 |
| POST | `/auth/refresh` | `{ refreshToken }`，一次一换 |
| POST | `/auth/logout` | 吊销全部 refresh token |
| GET | `/users/me` | 当前用户资料 |

access token 15 分钟，refresh token 30 天；401 且 `code=2001` 时用 refresh 换新后重试一次。
