# Amy 帳簿

手機優先嘅個人 / 屋企理財 dashboard。純 HTML + CSS + JavaScript，冇 framework、冇 build step，放上 GitHub Pages 就用得。

- 數據來源：你自己嘅 Google Apps Script Web App
- **Repo 入面冇任何 URL、key 或者真實數據。** Web App URL 同 key 只會喺第一次開 App 時輸入，存喺部機嘅 localStorage。
- 冇 analytics、冇 tracking、冇外部字體或 CDN。`index.html` 有 Content-Security-Policy，只准連去 `script.google.com` 同 `script.googleusercontent.com`。

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html` | 頁面結構、iPhone 主畫面設定 |
| `style.css` | 設計（light / dark 跟系統） |
| `app.js` | 讀數據、cache、畫面、demo 數據 |
| `manifest.json` | App 名稱「Amy 帳簿」、standalone |
| `icons/` | `icon.svg` 原圖，加 192 / 512 / apple-touch-icon（180）PNG |

## Demo 模式（唔使 URL 同 key）

喺網址後面加：

| 網址 | 睇乜 |
|---|---|
| `?demo` | Amy 身份：先顯示「上次數據・更新中…」，之後換上新數據。轉去上個月會見到 household error |
| `?demo=lai` | Lai 身份（只有屋企，冇 tab） |
| `?demo=offline` | 背景更新失敗：「上次數據・未能更新」加再試掣 |
| `?demo=error` | Key 錯誤畫面 |

Demo 數據全部係虛構，亦唔會讀寫你部機儲存咗嘅 URL、key 或者 cache。

## 加入 iPhone 主畫面

1. 用 **Safari** 打開你嘅 GitHub Pages 網址（例如 `https://你嘅帳號.github.io/amy-dashboard/`）。記住唔好用 `?demo` 嘅網址加。
2. 撳底部嘅「分享」掣（有向上箭咀嘅方格）。
3. 揀「加入主畫面」，名稱會自動填「Amy 帳簿」，撳「加入」。
4. 喺主畫面打開，冇網址列。第一次會叫你輸入 Web App URL 同 key。

> 加咗落主畫面嘅 App 同 Safari 嘅儲存係分開嘅，所以喺主畫面 App 入面要再輸入一次 URL 同 key。

## 換 key / 換 URL / 登出

- 撳右上角 ⚙️ 打開設定：
  - **換 key**：喺「換 key」輸入新 key，撳「儲存並重新載入」（留空就唔改）。
  - **換 URL**：改「Web App URL」，撳「儲存並重新載入」。
  - **登出**：清走 key 同所有 cache（URL 會保留，方便下次登入）。
- 換 key 或者 URL 都會清走所有 cache。
- 如果 key 錯咗（server 回應 `ok:false`），App 會自動清走 key，返回輸入畫面。

## 數據同 cache 點運作

- 本月嘅回應會按身份（amy / lai）分開 cache 喺部機。
- 打開 App 時會即刻顯示 cache，頂部顯示「上次數據・dd-MM HH:mm・更新中…」，同時喺背景攞新數據。
- 背景更新失敗會顯示「未能更新」同「再試」掣。
- 舊月份唔會 cache。睇舊月份時，戶口餘額係而家嘅數，budget 係該月。
- 向下拉，或者撳左上角 ↻，都可以重新整理。App 由背景返嚟而又超過 5 分鐘，會自動更新。

## Apps Script 要求

- 部署做 Web App，「執行身分」揀你自己，「存取權」揀「任何人」。
- 接收 `POST`，body 係 `{"action":"dashboard","key":"…","month":"yyyy-MM"}`（`month` 可以冇）。
- App 用 `Content-Type: text/plain;charset=utf-8` 嚟避免 CORS preflight。

## 喺電腦本機預覽

需要 Python（Windows 已經裝咗）。喺呢個資料夾開 PowerShell：

```bash
python -m http.server 8080
```

之後用瀏覽器開 <http://localhost:8080/?demo>。想睇真實數據就開 <http://localhost:8080/>。停止 server 撳 `Ctrl + C`。

## 更新

改完檔案 push 上 GitHub，過 1–2 分鐘 GitHub Pages 就會更新。iPhone 上面完全關咗個 App 再開，就會攞到新版本。如果見唔到新版本，可以喺設定 sheet 登出再登入，或者喺 Safari 清除網站資料。

## 更改 icon

改 `icons/icon.svg`，再轉做 512×512、192×192 同 180×180 嘅 PNG，覆蓋 `icons/` 入面三個 PNG 檔。
