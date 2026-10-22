# worldluz · 織界

暖色世界觀白板，支援人物、組織、地點、任務、伏筆、自由便條、圖片、樹狀排列與提及連結。

網站：https://luz940401.github.io/worldluz/

## 使用

1. 開啟網站，點「登入同步」，以電子郵件的登入連結登入。
2. 第一次連結帳號時，選擇「使用本機版本並上傳」。另一台新裝置登入後會下載同一份世界。
3. 等右上角顯示「已同步」再切換裝置。兩台都有修改時會要求選版本，不會直接覆寫。
4. 舊本機版的資料不會自動搬到新網址。先在舊版「匯出備份」，再於網站「匯入備份」。

目前採用 Supabase 預設郵件服務，登入請使用此 Supabase 組織成員的電子郵件。若要開放其他人，須先設定自訂 SMTP。所有帳號的世界資料依使用者分開保存。

## 開發與驗證

```sh
npm ci
npm test
npm run build
npm run test:ui
```

UI 測試使用電腦已安裝的 Edge。`npm run build` 產生 `_site/`，GitHub Actions 將其部署到 Pages。只部署網頁檔案，不包含備份、測試產物或私人的世界資料。

瀏覽器使用 IndexedDB 保存本機副本。雲端每個帳號保存一個世界（含壓縮圖片），每次上傳上限 20 MB；資料較大時可減少圖片並匯出備份。同步是單人跨裝置使用，並非多人同時協作。開著的頁面離線時仍可編輯，重新開啟網站需要網路。

## 安全與部署

- `config.js` 只包含可公開的 URL 與 publishable key，禁止放入 service-role/secret key。
- Supabase 資料表啟用 RLS，只允許使用者讀取自己的資料。
- 寫入透過受限 RPC，使用登入者身分與原子版本比較避免覆寫新版本。
- SQL 位於 `supabase/migrations/`。登入 Site URL 必須設為正式網站網址。
- 如需不同專案，可在 GitHub Actions repository variables 設定 `SUPABASE_URL` 及 `SUPABASE_PUBLISHABLE_KEY`，建置時覆蓋公開設定。
- Supabase 官方說明：[電子郵件登入](https://supabase.com/docs/guides/auth/auth-email-passwordless)、[預設郵件限制](https://supabase.com/docs/guides/auth/auth-smtp)。
