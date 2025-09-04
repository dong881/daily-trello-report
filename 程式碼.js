// /**
//  * 取得必要的 Script Property，若未設定則記錄錯誤並拋出例外
//  */
// function getRequiredProperty(key) {
//   var value = PropertiesService.getScriptProperties().getProperty(key);
//   if (!value) {
//     Logger.log("ERROR: Script Property '" + key + "' is not set. 請至 專案 > Script Properties 設定此參數。");
//     throw new Error("Missing required Script Property: " + key);
//   }
//   return value;
// }

// /**
//  * 取得非必要的 Script Property（若不存在則回傳 null）
//  */
// function getOptionalProperty(key) {
//   return PropertiesService.getScriptProperties().getProperty(key);
// }

// // 從 Script Properties 載入必要參數
// const NOTION_TOKEN            = getRequiredProperty("NOTION_TOKEN");
// const DATABASE_ID             = getRequiredProperty("DATABASE_ID");
// const ASSIGNEE_UUID           = getRequiredProperty("ASSIGNEE_UUID");
// const TRELLO_API_KEY          = getRequiredProperty("TRELLO_API_KEY");
// const TRELLO_API_TOKEN        = getRequiredProperty("TRELLO_API_TOKEN");
// const TRELLO_COMMENT_BASE_URL = getRequiredProperty("TRELLO_COMMENT_BASE_URL");
// // 非必要參數
// const SEND_MSG_URL            = getOptionalProperty("SEND_MSG_URL");

// // const SHORT_TERM_GOAL = `
// //     - Measure End-to-End Time (RTT) and Traffic (Throughput)

// //     - Milestone
// //       - ✅ Checkpoint 1: [Installing](https://ntust-bmwlab.notion.site/OAI-E2E-SuperMicro-Metanoia-JuraRU-monolithic-1e310098314380a6ae9cc4dc9b639b7b?pvs=4"‌") the OAI **monolithic** version (MTK UE + MetaNoia Jura RU + OAI L1 + **FAPI** + OAI L2) and [testing](https://www.notion.so/ntust-bmwlab/OAI-E2E-SuperMicro-Metanoia-JuraRU-monolithic-1e310098314380a6ae9cc4dc9b639b7b?pvs=4#1e3100983143811d9e80ed7c086963c6 "‌") completed.
// //       - ✅ Checkpoint 2: [Installing](https://ntust-bmwlab.notion.site/OAI-E2E-SuperMicro-Metanoia-Jura-RU-nFAPI-TwoMachine-1e3100983143800bb931f18fb6c365cb?pvs=4 "‌") the OAI **nFAPI** version (MTK UE + MetaNoia Jura RU + OAI L1 + **nFAPI** + OAI L2) in t**wo machine** and [testing](https://www.notion.so/ntust-bmwlab/OAI-E2E-SuperMicro-Metanoia-Jura-RU-nFAPI-TwoMachine-1e3100983143800bb931f18fb6c365cb?pvs=4#1e3100983143819bb25bde0617c32fbd "‌") completed.
// //         - [issues and solution](https://www.notion.so/ntust-bmwlab/OAI-E2E-SuperMicro-Metanoia-Jura-RU-nFAPI-TwoMachine-1e3100983143800bb931f18fb6c365cb?pvs=4#1ea1009831438053b67cdb29c0ccbcaa "‌")
// //       - ✅ Checkpoint 3: [Develop an automated data collection script](https://github.com/bmw-ece-ntust/Ming-E2E-Network-Measurement/tree/master?tab=readme-ov-file#e2e-network-measurement)
// //       - ✅ Checkpoint 4: [Develop Python code for data analysis and visualization](https://github.com/bmw-ece-ntust/Ming-E2E-Network-Measurement/tree/master?tab=readme-ov-file#data-analysis)
// //     - Final deliverable: Installation manual by link.
// // `;

// const NEED_TO_DELAY = 0;
// const NEED_TO_SEND_MSG = NEED_TO_DELAY;

// const SHORT_TERM_GOAL = `
//     - Complete the introduction section of the thesis.

//     - **Milestone**
//       - Checkpoint 1: Introduction ORAN.
//       - Checkpoint 2: Introduction FAPI/nFAPI.
//     - Final deliverable: Installation manual by link.
// `;

// /**
//  * 從 Notion 取得資料庫內容並列出每個分頁中指定人員（Assign 欄位）的 UUID
//  */
// function fetchAssigneeUUID() {
//   const url = `https://api.notion.com/v1/databases/${DATABASE_ID}/query`;
//   const headers = {
//     "Authorization": `Bearer ${NOTION_TOKEN}`,
//     "Content-Type": "application/json",
//     "Notion-Version": "2022-06-28"
//   };

//   const options = {
//     "method": "post",
//     "headers": headers,
//     "muteHttpExceptions": true
//   };

//   try {
//     const response = UrlFetchApp.fetch(url, options);
//     const data = JSON.parse(response.getContentText());
//     Logger.log(`API Response: ${JSON.stringify(data)}`);
    
//     if (data.results && Array.isArray(data.results)) {
//       data.results.forEach(page => {
//         if (page.properties && page.properties.Assign && page.properties.Assign.people) {
//           page.properties.Assign.people.forEach(person => {
//             Logger.log(`Person Name: ${person.name}, UUID: ${person.id}`);
//           });
//         }
//       });
//     }
//   } catch (error) {
//     Logger.log(`Error in fetchAssigneeUUID: ${error}`);
//   }
// }

// /**
//  * 從 Notion 取得狀態為 "In progress" 且分配給 ASSIGNEE_UUID 的任務
//  */
// function fetchNotionTasks() {
//   const url = `https://api.notion.com/v1/databases/${DATABASE_ID}/query`;
//   const headers = {
//     "Authorization": `Bearer ${NOTION_TOKEN}`,
//     "Content-Type": "application/json",
//     "Notion-Version": "2022-06-28"
//   };

//   // 過濾條件：狀態為 In progress，且分配給指定使用者
//   const requestBody = {
//     "filter": {
//       "and": [
//         {
//           "property": "Status",
//           "status": { "equals": "In progress" }
//         },
//         {
//           "property": "Assign",
//           "people": { "contains": ASSIGNEE_UUID }
//         }
//       ]
//     }
//   };

//   const options = {
//     "method": "post",
//     "headers": headers,
//     "payload": JSON.stringify(requestBody),
//     "muteHttpExceptions": true
//   };

//   try {
//     const response = UrlFetchApp.fetch(url, options);
//     const data = JSON.parse(response.getContentText());
//     Logger.log(`API Response: ${JSON.stringify(data)}`);
    
//     if (data.results && Array.isArray(data.results)) {
//       const tasks = data.results.map(page => {
//         if (page.properties && page.properties.Name && page.properties.Name.title && page.id) {
//           // 組合標題內容
//           const titleParts = page.properties.Name.title.map(part => part.text.content).join('');
//           // 取得摘要內容，若無則預設為 'No summary'
//           const summary = page.properties.Summary && page.properties.Summary.rich_text
//             ? page.properties.Summary.rich_text.map(part => part.text.content).join(' ')
//             : 'No summary';
//           // 生成自定義連結
//           const customUrl = `https://ntust-bmwlab.notion.site/${page.id.replace(/-/g, '')}`;
//           return `Summary: ${summary}\n\t\t- ${titleParts} → ${customUrl}`;
//         } else {
//           return 'No title or URL';
//         }
//       });
//       Logger.log(tasks);
//       return tasks;
//     } else {
//       Logger.log('No results found or invalid response structure');
//       return [];
//     }
//   } catch (error) {
//     Logger.log(`Error in fetchNotionTasks: ${error}`);
//     return [];
//   }
// }

// /**
//  * 發送訊息（例如傳送 LINE 訊息）
//  * 若未設定 SEND_MSG_URL 則不執行發送
//  */
// function SEND_MSG(MsgStr) {
//   if (!SEND_MSG_URL) {
//     Logger.log("SEND_MSG_URL 未設定，將略過傳送訊息。");
//     return;
//   }
//   try {
//     const encodedMsg = encodeURIComponent(MsgStr);
//     const url = SEND_MSG_URL + encodedMsg;
//     UrlFetchApp.fetch(url);
//     Logger.log("訊息已傳送: " + MsgStr);
//   } catch (error) {
//     Logger.log("Error in SEND_MSG: " + error);
//   }
// }

// /**
//  * 根據開始/結束時間、任務清單以及剩餘時段數，計算並分配任務時間區間
//  */
// function generateTimeSlots(startHour, endHour, tasks, remainingCalls) {
//   let result = "";
//   let segmentTaskCount = remainingCalls > 0 ? Math.floor(tasks.length / (remainingCalls + 1)) : tasks.length;
  
//   if (segmentTaskCount <= 0) return result;
  
//   const totalHours = endHour - startHour;
//   const timePerTask = totalHours / segmentTaskCount;
//   let currentTime = startHour;
//   const lines = [];
  
//   for (let i = 0; i < segmentTaskCount; i++) {
//     let nextTime = currentTime + timePerTask;
//     lines.push(`\t- ${formatRoundedTime(currentTime)}～${formatRoundedTime(nextTime)} ${tasks[i]}\n`);
//     currentTime = nextTime;
//   }
  
//   // 移除已分配的任務
//   tasks.splice(0, segmentTaskCount);
//   result = lines.join("");
//   return result;
// }

// /**
//  * 將小時（含小數）格式化為 hh:mm（例如 11.5 轉換成 11:30）
//  */
// function formatRoundedTime(time) {
//   let hours = Math.floor(time);
//   let minutes = Math.round((time - hours) * 60 / 10) * 10;
//   if (minutes === 60) {
//     hours += 1;
//     minutes = 0;
//   }
//   return `${padZero(hours)}:${padZero(minutes)}`;
// }

// function padZero(number) {
//   return number < 10 ? "0" + number : number;
// }

// /**
//  * 隨機延遲（例如延遲 0 至 120 秒，非必要）
//  */
// function delayRandom() {
//   var minDelay = 0;
//   var maxDelay = 240000;
//   var randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
//   Logger.log("延遲時間 (毫秒): " + randomDelay);
//   Utilities.sleep(randomDelay);
//   Logger.log("延遲完成，繼續執行...");
// }

// /**
//  * 判斷指定日期是否為台灣國定假日
//  */
// function GetHolidays(date) {
//   const calendars = CalendarApp.getAllCalendars();
//   for (const calendar of calendars) {
//     if (calendar.getName().includes('Holidays in Taiwan')) {
//       const events = calendar.getEventsForDay(date);
//       if (events.length > 0) {
//         return true;
//       }
//     }
//   }
//   return false;
// }

// /**
//  * 主程式：依據今日日期與任務清單產生每日計劃，並將結果以 Trello 卡片留言方式發送，
//  * 同時透過 SEND_MSG 傳送訊息（若有設定 SEND_MSG_URL）。
//  */
// function autoTrello() {
//   var today = new Date();
//   if (GetHolidays(today)) {
//     Logger.log("今日為國定假日，autoTrello 結束執行。");
//     return;
//   }
//   var formattedDate = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy/MM/dd');
//   var dayOfWeek = today.getDay();
//   var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
//   var tasks = fetchNotionTasks();
  
//   var text = `
// **${formattedDate} (${dayNames[dayOfWeek]})**
// - ---
// - **Short-term goal:**
// \t ${SHORT_TERM_GOAL}
// - **Daily plan:**
// `;
  
//   switch (dayOfWeek) {
//     case 1: // Monday
//       Logger.log("Today is Monday");
//       text += generateTimeSlots(9, 17, tasks, 0);
//       break;
//     case 2: // Tuesday
//       Logger.log("Today is Tuesday");
//       text += generateTimeSlots(9, 17, tasks, 0);
//       break;
//     case 3: // Wednesday
//       Logger.log("Today is Wednesday");
//       text += generateTimeSlots(9, 12, tasks, 1);
//       text += "\t- 14:00~16:00 【Meeting】 BMW lab meeting\n";
//       text += generateTimeSlots(16, 17, tasks, 0);
//       break;
//     case 4: // Thursday
//       Logger.log("Today is Thursday");
//       text += generateTimeSlots(9, 17, tasks, 0);
//       break;
//     case 5: // Friday
//       Logger.log("Today is Friday");
//       text += generateTimeSlots(9, 17, tasks, 0);
//       break;
//     default:
//       Logger.log("週末或未定義時段，autoTrello 結束執行。");
//       return;
//   }
  
//   try {
//     // Trello API 留言 URL（此處卡片 ID 為固定值）
//     var trelloUrl = 'https://api.trello.com/1/cards/CIIouy8k/actions/comments';
//     var payload = {
//       text: text,
//       key: TRELLO_API_KEY,
//       token: TRELLO_API_TOKEN
//     };
    
//     var options = {
//       method: 'post',
//       contentType: 'application/json',
//       payload: JSON.stringify(payload),
//       headers: { 'Accept': 'application/json' }
//     };
    
//     // 若需要隨機延遲，可啟用以下程式碼
//     if(NEED_TO_DELAY) delayRandom();
    
//     var res = UrlFetchApp.fetch(trelloUrl, options);
//     Logger.log("Trello API 回應碼: " + res.getResponseCode());
    
//     var jsonResponse = JSON.parse(res.getContentText());
//     var commentURL = TRELLO_COMMENT_BASE_URL + "#comment-" + jsonResponse.id;
//     if(NEED_TO_SEND_MSG) SEND_MSG(commentURL);
//     Logger.log("生成的 Comment URL: " + commentURL);
//   } catch (error) {
//     Logger.log("Error in autoTrello: " + error);
//   }
// }
