# Google Apps Script - Notion & Trello Integration

## 繁體中文版 (Traditional Chinese Version)

### 介紹
此 Google Apps Script 用於自動從 Notion 擷取任務，根據計劃配置每日事務表，並將對應的資訊上傳至 Trello 作為註解。如果有設定 SEND_MSG_URL，可以將資訊送送至 LINE 等平台。

### 環境配置
1. 開啟 Google Apps Script (https://script.google.com/)
2. 將此代碼貼上
3. 設定 **Script Properties**
   - **NOTION_TOKEN**: Notion API Token
   - **DATABASE_ID**: Notion 數據庫 ID
   - **ASSIGNEE_UUID_Ming**: Ming 在 Notion 中的系統 UUID
   - **TRELLO_API_KEY** & **TRELLO_API_TOKEN**: Trello API Key & Token
   - **TRELLO_COMMENT_BASE_URL**: Trello 註解基礎 URL
   - (**選填**) **SEND_MSG_URL**: LINE 或其他通知機制的網站 URL

### 執行步驟
1. 執行 `fetchAssigneeUUID()` 以擷取 Notion 用戶 UUID
2. 執行 `fetchNotionTasks()` 以擷取 Ming 待辦的任務
3. 執行 `autoTrello()` 自動產生每日計劃並將資訊送至 Trello

---

## English Version

### Introduction
This Google Apps Script automatically fetches tasks from Notion, generates a daily schedule, and posts the corresponding details as a comment on Trello. If `SEND_MSG_URL` is set, notifications can be sent via LINE or other platforms.

### Environment Setup
1. Open Google Apps Script (https://script.google.com/)
2. Paste the provided script
3. Configure **Script Properties**
   - **NOTION_TOKEN**: Notion API Token
   - **DATABASE_ID**: Notion Database ID
   - **ASSIGNEE_UUID_Ming**: Ming's system UUID in Notion
   - **TRELLO_API_KEY** & **TRELLO_API_TOKEN**: Trello API Key & Token
   - **TRELLO_COMMENT_BASE_URL**: Trello Comment Base URL
   - (**Optional**) **SEND_MSG_URL**: Webhook URL for LINE or other notification services

### Execution Steps
1. Run `fetchAssigneeUUID()` to get the Notion user UUID
2. Run `fetchNotionTasks()` to fetch Ming's assigned tasks
3. Run `autoTrello()` to automatically generate a daily plan and post details to Trello

---

### Notes / 備註
- 請確保 Notion API 中已啟用對應的認證權限。
- 在 Google Apps Script 執行 API 請求時，有可能需要符合 Google 的 OAuth 規約。
- 執行此代碼前，請先確認已經在 Script Properties 設定上述所有必要參數。

