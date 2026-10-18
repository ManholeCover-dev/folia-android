# Android 内置音乐后端版本

本移植基于 [Folia-major](https://github.com/chthollyphile/folia-major) 0.7.20，安卓外壳参考 [Folia-Sonnet](https://github.com/chthollyphile/folia-sonnet)。这是非官方移植，保留上游项目的许可证和署名。APK 同时包含界面、Node.js 运行环境、网易云、酷狗与 QQ 音乐接口库，使用音乐功能不需要另外部署服务器。

移植基线提交：`0a33f3836935bf0db88b2e341b02d295da96fb33`。本次保存源码时保留了该提交之前的上游历史。

## 本版本范围

- 网易云：复用现有搜索、登录、歌曲、歌单和歌词界面，并保留桌面端的扫码登录修复。
- 酷狗：复用现有 provider，内置稳定设备身份与设备注册逻辑。
- QQ 音乐：复用桌面版的搜索、歌单、歌词和播放流程，内置同版本的 Node 后端，提供 QQ 与微信扫码入口。设备身份与加密登录会话放在应用私有目录，升级保留；原生请求通道传递会话，账号权限仍由平台决定。
- 歌词、封面和匿名搜索代理也在手机内运行。
- 登录状态沿用应用自己的 provider 存储，运行文件放在应用私有目录。
- 后端只监听 `127.0.0.1` 的随机端口，每次进程启动生成新的访问令牌；界面通过原生插件调用，不开放局域网服务。

这是实验性安卓移植。后台/锁屏连续播放、通知栏媒体控制、本地目录扫描仍待适配。波点、YouTube Music、Spotify 和 AI 主题服务尚未移植进手机后端。AI 在线模型仍需要用户配置相应服务和凭据。

在线平台的登录、风控及歌曲播放权限仍由平台决定。匿名搜索成功不代表所有歌曲都能匿名播放。

## 构建

需要 Node.js 24、JDK 21、Android SDK 36、Build Tools 36.0.0、NDK 28.2.13676358 和 CMake 3.22.1。

Windows 可把缺少的工具下载到仓库相邻的 `.android-tools/`，不修改系统环境变量：

```powershell
./packaging/android/provisionWindows.ps1
```

若自己维护安卓 SDK，可在 `android/local.properties` 中设置 `sdk.dir`，并设置 `JAVA_HOME`。SDK 许可证需要接受；脚本会复用本机现有 SDK 的许可证记录。

```powershell
npm ci --ignore-scripts
npm run build:android:debug
```

输出目录：`android/app/build/outputs/apk/debug/`。`app-arm64-v8a-debug.apk` 用于 ARM64 手机，`app-x86_64-debug.apk` 用于模拟器。调试签名由 Android 构建工具生成。

本次提供的安装包是调试版。自行在其他电脑重建时，调试签名通常不同，可能无法直接覆盖已有安装；需要持续更新时应在本地妥善保存签名密钥。密钥、登录信息、SDK 和下载的运行环境不随源码上传。

第三个预览版的 Android `versionCode` 为 3，继续使用之前版本的应用标识和本机调试签名，可直接覆盖安装。保留应用数据即可保留已有平台登录；请勿先卸载旧版。

## 运行环境来源

采用社区项目 [fogtape/nodejs-mobile](https://github.com/fogtape/nodejs-mobile) 的 `24.22.0-0` **预发布构建**，对应未正式发布的 Node 上游提案。下载版本、地址和 SHA-256 固定在 `packaging/android/fetchRuntime.mjs`，包含 Android 16 KB 内存页支持；它不等同于 Node.js Mobile 官方稳定版。

音乐接口依赖单独锁定在 `packaging/android/backend/package-lock.json`，APK 不包含 Electron、桌面系统集成或桌面原生音频分析模块。`prepareBackend.mjs` 将所需源码和依赖写入生成目录，同时生成内容摘要清单，应用升级时按摘要安装新后端，用户数据独立保存。

## 维护入口

- 安卓原生启动及请求通道：`android/app/src/main/java/top/izuna/foliamajor/`。
- Node 原生桥接：`android/app/src/main/cpp/`。
- 精简后端及打包脚本：`packaging/android/`。
- QQ 内嵌路由和会话持久化：`packaging/android/backend/qq/index.cjs`。它挂载锁定版本的 Node 路由，不加载会另开监听端口的包入口；升级依赖时须核对内部路径及扫码、会话契约。
- QQ 安卓音频地址：`src/services/onlineMusic/qq/qqAndroidPlayback.ts`。仅在安卓将 QQ 返回的 HTTP CDN 音频地址换为对应 HTTPS 地址，保留签名参数；HTTPS WebView 无法直接播放这些 HTTP 地址，不能将浏览器报的格式错误直接认作 FLAC 不受支持。
- 界面请求通道：`src/services/android/backendFetch.ts`。
- 安卓系统栏和安全区域：`src/components/app/android/`。

```powershell
npm run typecheck
npm run test:unit -- test/unit/android test/unit/onlineMusic/qqTransport.test.ts test/unit/onlineMusic/qqProvider.test.ts test/unit/onlineMusic/omniArchitecture.test.ts
npm run android:backend
node test/manual/androidBackendSmoke.mjs
```

最后一项检查会发送匿名只读请求，不打印登录 Cookie 或令牌。更多账号、机型以及后台播放仍需单独验证。

## 本机验证记录

- TypeScript 类型检查通过，安卓请求通道、代理和相关桌面适配回归通过。
- ARM64 与 x86_64 调试 APK 均成功构建；ARM64 包签名和 16 KB 对齐检查通过。
- Android 37 x86_64 模拟器已确认 APK 内的 Node.js 24.22.0 启动成功。
- 在应用界面搜索网易云歌曲、加载歌词并播放，音频进度正常推进；所测歌曲由平台限制为试听，界面正确显示了试听提示。
- 2026-10-18，用户在真机确认网易云账号登录、歌词显示和前台有声播放正常；此前的无声现象在断开手机与电脑的 USB 连接后消失，本次未修改播放代码。
- 酷狗匿名搜索及歌词接口成功；所测播放请求返回设备验证错误 20028，尚未完成真实账号登录和播放验证。
- QQ 适配相关 164 项单元测试通过，另以独立进程验证会话加密密钥在重启后保持不变。
- 在 APK 的原生通道中确认 QQ 与微信二维码均能生成、匿名歌曲和专辑搜索返回结果、歌词接口返回歌词。匿名样本未返回播放地址，不据此推断歌曲已下架或账号权限。
- 2026-10-18，用户真机确认 QQ 登录、歌单与封面正常；播放失败定位为 QQ 返回 HTTP 音频地址。在同一台 Android 16 / WebView 153 设备将同一 FLAC 地址改为 HTTPS 后可正常解码和播放，用户确认有声。第三个预览版将这一处理写入播放流程，不降低音质。
- 修复 APK 已在该真机覆盖安装，登录状态保留；重新选曲时地址自动使用 HTTPS，另一首 FLAC 歌曲正常播放超过十秒且媒体元素无错误。包含此次修复的相关单元测试共 172 项通过，类型检查通过。
