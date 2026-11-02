# PROGRESS — Amy 帳簿

接手嘅 session 請先睇晒呢份，再睇 `README.md`。最後更新：2026-11-02。

## 項目係乜

手機優先嘅個人理財 dashboard，放 GitHub Pages（repo：`amy-dashboard`），加入 iPhone 主畫面當 App 用。
數據嚟自 Amy 自己嘅 Google Apps Script Web App。介面用繁體中文（廣東話用字）。

## 已完成 ✅

- `index.html`：setup 畫面（輸入 URL 同 key）、主畫面、設定 sheet。有 CSP、iOS meta（apple-mobile-web-app-capable、status bar `default`、theme-color 分 light / dark）。
- `style.css`：設計 token，light / dark 跟系統。用 safe area、`overscroll-behavior: none`。卡片、圓環、skeleton、sheet 都寫好。
- `app.js`：
  - fetch POST（只用 `text/plain;charset=utf-8`，25 秒 timeout，用 reqId 丟棄舊回應）
  - 本月 cache、月份切換、向下拉重新整理、tab、戶口分組收埋 / 展開（記住狀態）
  - budget 圓環同排序、屋企畫面、demo 數據
- `manifest.json`：「Amy 帳簿」，standalone。
- `icons/`：`icon.svg`（粉紅底、白色錢幣、貓掌）、`icon-512.png`（用 Edge headless 截圖）、`icon-192.png`、`apple-touch-icon.png`（由 512 縮細）。
- `README.md`：本機預覽、加入 iPhone 主畫面、換 key / URL、demo 網址、更新方法。
- `.gitignore`
- Demo 模式喺內置瀏覽器 375×812 測過，light / dark 都睇過：`?demo`、`?demo=lai`、`?demo=offline`、`?demo=error`、上個月嘅 household error。console 冇錯誤。
- 真實登入流程用假 URL 試過：連唔到就唔存 key，只存 URL。

## 而家去到邊

所有 code 已經寫好，但**未上 GitHub**。Amy 屋企部電腦冇裝 git，所以下一步係建立 repo `amy-dashboard`、push，再開 GitHub Pages。

## 未做 / 待確認 ⏳

1. **用真實 Apps Script 測試**：至今只測過 demo。要確認以下幾點：
   - 回應欄位同假設一致
   - Apps Script 會 redirect 去 `script.googleusercontent.com`，而 CSP 已經准咗呢個網域
   - `generatedAt` 格式係 `yyyy-MM-dd HH:mm`
2. **`personal.summary.debt` 嘅正負號**：未知係正數定負數。而家用 `Math.abs()` 顯示做「信用卡欠款」，淨資產直接用 `net`。
3. **`ok:false` 一律當 key 錯誤處理**（清 key、返回輸入畫面）。如果 server 有其他錯誤（例如月份錯）都會用 `ok:false` 回應，就要再分開處理。
4. **GitHub Pages 開好之後**，要喺 iPhone Safari 測：加入主畫面、safe area、向下拉重新整理、dark mode。
5. Icon 嘅 manifest `maskable` 用緊同一張 512 圖，主要圖案喺中間 80% 範圍內，應該冇問題，但未喺 Android 驗證過（主要用家係 iPhone）。

## 傾過嘅決定（唔好改，除非 Amy 話）

**Repo 同私隱**
- Repo 絕對唔可以有 key、Web App URL、真實數據。
- **URL 同 key 都係第一次開 App 時輸入**，存 localStorage（`amyb.url`、`amyb.key`）。設定 sheet 入面可以改 URL、換 key、登出。
- 冇 analytics、tracking、外部字體或 CDN。CSP `connect-src` 只准 `script.google.com` 同 `script.googleusercontent.com`。

**API**
- POST body：`{action:"dashboard", key, month?}`。本月就唔傳 `month`。
- Header 只有 `Content-Type: text/plain;charset=utf-8`，唔加其他 header。

**Key 同身份**
- `ok:false`：清走 key 同所有 cache，返回輸入畫面，顯示 `message`，URL 保留。
- role `amy`：有「個人 / 屋企」tab。role `lai`：只有屋企，冇 tab。

**Cache 規則**
- 只 cache `isCurrentMonth = true` 嘅回應，按 role 分開存（`amyb.cache.amy`、`amyb.cache.lai`）。
- 開 App 即刻顯示 cache，同時背景 fetch，新數據到就換上。
- 顯示 cache 期間，頂部寫「上次數據・dd-MM HH:mm・更新中…」。背景 fetch 失敗就變「上次數據・dd-MM HH:mm・未能更新」加再試掣。
- 「更新於」如果唔係今日，要連日期顯示（dd-MM HH:mm）。
- 登出、換 key、換 URL 都會清走所有 cache。
- 日期一律用香港時間（Asia/Hong_Kong）。

**月份**
- 唔可以揀未來月份，**冇下限**。
- 睇舊月份時，要註明「戶口餘額係而家嘅數，budget 係該月」。

**冇 service worker**：避免更新之後 iPhone 一直用舊版。如果要離線功能，要再問 Amy。

**畫面**
- 金額格式 `HK$13,580.68`，負數 `-HK$1,200.00`，負數用 `--neg` 顏色。
- 戶口分組次序：Cash、Bank、E-wallet、Saving Pot、Credit Card、其他。中文標籤：現金、銀行、電子錢包、Saving Pot、信用卡、其他。
- Budget 顏色：已用 < 80% 藍色，80–100% 橙色，> 100% 粉紅 / 紅色，圓環滿圈。
- Budget 排序：超支嘅排最前，之後按已用 % 由高至低。
- 屋企 budget：`period === "Monthly"` 用圓環卡，其他 period 放「其他支出」列表。

**其他**
- Demo 模式（`?demo`）唔使 URL，唔會讀寫真實嘅 key 或 cache（demo 嘅 cache 只放喺記憶體）。
- 設計：參考 iOS 理財 App，重點色粉紅 `#FF8FA3`、藍 `#6B9BFF`，系統字體。
- 我自己額外加咗兩樣，Amy 冇反對：CSP，同埋 App 由背景返嚟超過 5 分鐘會自動 refresh。

## 檔案地圖（app.js）

| 部分 | 內容 |
|---|---|
| 頂部 | 常數、`store`（localStorage 包 try/catch）、香港時間工具、`money()` |
| API 同 cache | `apiFetch`、`readCache`、`writeCache`、`clearCaches`、`showCacheIfAny` |
| 載入同登入 | `load`、`applyResponse`、`goMonth`、`signOut`、`onSetupSubmit`、`onSettingsSubmit` |
| 畫面 | `render` → `renderHeader`（status line 邏輯喺 `statusHTML`）、`renderContent` → `renderPersonal`、`renderHousehold` |
| 互動 | `setupPullToRefresh`、`bindEvents` |
| Demo | `demoResponse`、`demoFetch` |
| 啟動 | `boot` |
