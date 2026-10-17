# 校訊即時通(school-news-quick-look)

> 本 App 非學校官方工具，內容轉載自學校官網，以官網為準。

一個免費、非商業的手機網頁 App(PWA),讓家長打開就能讀到臺北市國小首頁的主要公告。

- **資料**:GitHub Actions 定期讀取各校官網首頁的主要公告，轉成統一格式的 JSON。
- **網站**:GitHub Pages 提供 App 與資料，不另外架伺服器、不需登入、不收集個資、不做分析追蹤。
- **原文**:每則公告都附學校官網的原文連結，附件直接連到學校的原檔。

網址:https://worl2160.github.io/school-news-quick-look/

學校若希望不被收錄，請開 issue,我們會從名單移除。

## 開發

需要 Node.js 22 以上。

```bash
npm ci
npm test
```

```bash
node src/fetch/main.js --out out/data --only 313601       # 抓一所學校試跑
node src/schools/build.js --csv <教育部名錄 CSV> --out schools/taipei.json   # 重建學校名單(每學年一次)
```

排程寫在 `.github/workflows/update.yml`。排程與手動執行一律重新讀取學校網站;合併 PR 時預設沿用線上現有資料，只有 PR 加上 `refetch` 標籤才會重新讀取。GitHub 會停用 60 天沒有活動的公開 repo 的排程，請定期有 commit 或手動執行。
