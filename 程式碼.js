/**
 * 取得必要的 Script Property，若未設定則記錄錯誤並拋出例外
 */
function getRequiredProperty(key) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    Logger.log("ERROR: Script Property '" + key + "' is not set. 請至 專案 > Script Properties 設定此參數。");
    throw new Error("Missing required Script Property: " + key);
  }
  return value;
}

/**
 * 取得非必要的 Script Property（若不存在則回傳 null）
 */
function getOptionalProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

// 從 Script Properties 載入必要參數
const NOTION_TOKEN            = getRequiredProperty("NOTION_TOKEN");
const DATABASE_ID             = getRequiredProperty("DATABASE_ID");
const ASSIGNEE_UUID           = getRequiredProperty("ASSIGNEE_UUID");
const TRELLO_API_KEY          = getRequiredProperty("TRELLO_API_KEY");
const TRELLO_API_TOKEN        = getRequiredProperty("TRELLO_API_TOKEN");
const TRELLO_COMMENT_BASE_URL = getRequiredProperty("TRELLO_COMMENT_BASE_URL");
// 非必要參數
const SEND_MSG_URL            = getOptionalProperty("SEND_MSG_URL");

// const SHORT_TERM_GOAL = `
// 	- Install and test the OAI nfapi version.

// 		- Validate OAI UE + OAI L1 + nFAPI + OAI L2:
// 			- ~~ **(Done)** Checkpoint 1: Installation and testing completed.~~ 
// 			  → https://ntust-bmwlab.notion.site/Reproduction-OAI-nfapi-M-plane-split2-6-7-2-1b21009831438095a4adc1a6b54f195f?pvs=4
// 			- **(DL:4/8)** Checkpoint 2: M-plane testing completed.

// 		- **(DL:4/10)** Final deliverable: Installation manual. 
// 		  → https://ntust-bmwlab.notion.site/OAI-nFAPI-E2E-1b91009831438099982fc89b740eec59?pvs=4

// 	- Integrate OAI L1 + nFAPI + OSC L2.

// 		- Document testing progress. 
// 		  → https://ntust-bmwlab.notion.site/12110098314381aabfc5d15f23cc7596?v=12110098314381c69d2a000c00139d5b&pvs=4

// 		- Integration OSC DU High and OAI Layer 1 
//       → [Status diagrams](https://viewer.diagrams.net/?tags=%7B%7D&lightbox=1&highlight=0000ff&edit=_blank&layers=1&nav=1&title=nFAPI.drawio&page-id=Cxh7rBsZIl-cHQLJRT6X&dark=auto#Uhttps%3A%2F%2Fdrive.google.com%2Fuc%3Fid%3D1iXXPESGsNy2uM2wCgplps3eCRtnXG8Ts%26export%3Ddownload)
// 		  → https://ntust-bmwlab.notion.site/nfapi-E2E-Note-1a0100983143804f8659e2c5edd5b2bc?pvs=4

// 	- Thesis proposal. 
// 	  → https://ntust-bmwlab.notion.site/Thesis-proposal-17e1009831438094a6f5d2c555a4ae3b?pvs=4
// `;
const NEED_TO_DELAY = 1;
const NEED_TO_SEND_MSG = NEED_TO_DELAY;

const SHORT_TERM_GOAL = `
 	- Demo OAI nfapi version (OAI UE + OAI L1 + nFAPI + OAI L2)

 	- Milestone\n

    \t- Checkpoint 1: [Installation](https://www.notion.so/ntust-bmwlab/OAI-E2E-RFsim-nFAPI-1b91009831438099982fc89b740eec59?pvs=4#1b9100983143819f936bd8924ae94a76) and [testing](https://www.notion.so/ntust-bmwlab/OAI-E2E-RFsim-nFAPI-1b91009831438099982fc89b740eec59?pvs=4#1b910098314381fa8bb8f04c1a3983b8) completed.

 		- Checkpoint 2: M-plane testing completed.

 	- Final deliverable: Installation manual.
`;

/**
 * 從 Notion 取得資料庫內容並列出每個分頁中指定人員（Assign 欄位）的 UUID
 */
function fetchAssigneeUUID() {
  const url = `https://api.notion.com/v1/databases/${DATABASE_ID}/query`;
  const headers = {
    "Authorization": `Bearer ${NOTION_TOKEN}`,
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28"
  };

  const options = {
    "method": "post",
    "headers": headers,
    "muteHttpExceptions": true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const data = JSON.parse(response.getContentText());
    Logger.log(`API Response: ${JSON.stringify(data)}`);
    
    if (data.results && Array.isArray(data.results)) {
      data.results.forEach(page => {
        if (page.properties && page.properties.Assign && page.properties.Assign.people) {
          page.properties.Assign.people.forEach(person => {
            Logger.log(`Person Name: ${person.name}, UUID: ${person.id}`);
          });
        }
      });
    }
  } catch (error) {
    Logger.log(`Error in fetchAssigneeUUID: ${error}`);
  }
}

/**
 * 從 Notion 取得狀態為 "In progress" 且分配給 ASSIGNEE_UUID 的任務
 */
function fetchNotionTasks() {
  const url = `https://api.notion.com/v1/databases/${DATABASE_ID}/query`;
  const headers = {
    "Authorization": `Bearer ${NOTION_TOKEN}`,
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28"
  };

  // 過濾條件：狀態為 In progress，且分配給指定使用者
  const requestBody = {
    "filter": {
      "and": [
        {
          "property": "Status",
          "status": { "equals": "In progress" }
        },
        {
          "property": "Assign",
          "people": { "contains": ASSIGNEE_UUID }
        }
      ]
    }
  };

  const options = {
    "method": "post",
    "headers": headers,
    "payload": JSON.stringify(requestBody),
    "muteHttpExceptions": true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const data = JSON.parse(response.getContentText());
    Logger.log(`API Response: ${JSON.stringify(data)}`);
    
    if (data.results && Array.isArray(data.results)) {
      const tasks = data.results.map(page => {
        if (page.properties && page.properties.Name && page.properties.Name.title && page.id) {
          // 組合標題內容
          const titleParts = page.properties.Name.title.map(part => part.text.content).join('');
          // 取得摘要內容，若無則預設為 'No summary'
          const summary = page.properties.Summary && page.properties.Summary.rich_text
            ? page.properties.Summary.rich_text.map(part => part.text.content).join(' ')
            : 'No summary';
          // 生成自定義連結
          const customUrl = `https://ntust-bmwlab.notion.site/${page.id.replace(/-/g, '')}`;
          return `Summary: ${summary}\n\t\t- ${titleParts} → ${customUrl}`;
        } else {
          return 'No title or URL';
        }
      });
      Logger.log(tasks);
      return tasks;
    } else {
      Logger.log('No results found or invalid response structure');
      return [];
    }
  } catch (error) {
    Logger.log(`Error in fetchNotionTasks: ${error}`);
    return [];
  }
}

/**
 * 發送訊息（例如傳送 LINE 訊息）
 * 若未設定 SEND_MSG_URL 則不執行發送
 */
function SEND_MSG(MsgStr) {
  if (!SEND_MSG_URL) {
    Logger.log("SEND_MSG_URL 未設定，將略過傳送訊息。");
    return;
  }
  try {
    const encodedMsg = encodeURIComponent(MsgStr);
    const url = SEND_MSG_URL + encodedMsg;
    UrlFetchApp.fetch(url);
    Logger.log("訊息已傳送: " + MsgStr);
  } catch (error) {
    Logger.log("Error in SEND_MSG: " + error);
  }
}

/**
 * 根據開始/結束時間、任務清單以及剩餘時段數，計算並分配任務時間區間
 */
function generateTimeSlots(startHour, endHour, tasks, remainingCalls) {
  let result = "";
  let segmentTaskCount = remainingCalls > 0 ? Math.floor(tasks.length / (remainingCalls + 1)) : tasks.length;
  
  if (segmentTaskCount <= 0) return result;
  
  const totalHours = endHour - startHour;
  const timePerTask = totalHours / segmentTaskCount;
  let currentTime = startHour;
  const lines = [];
  
  for (let i = 0; i < segmentTaskCount; i++) {
    let nextTime = currentTime + timePerTask;
    lines.push(`\t- ${formatRoundedTime(currentTime)}～${formatRoundedTime(nextTime)} ${tasks[i]}\n`);
    currentTime = nextTime;
  }
  
  // 移除已分配的任務
  tasks.splice(0, segmentTaskCount);
  result = lines.join("");
  return result;
}

/**
 * 將小時（含小數）格式化為 hh:mm（例如 11.5 轉換成 11:30）
 */
function formatRoundedTime(time) {
  let hours = Math.floor(time);
  let minutes = Math.round((time - hours) * 60 / 10) * 10;
  if (minutes === 60) {
    hours += 1;
    minutes = 0;
  }
  return `${padZero(hours)}:${padZero(minutes)}`;
}

function padZero(number) {
  return number < 10 ? "0" + number : number;
}

/**
 * 隨機延遲（例如延遲 0 至 120 秒，非必要）
 */
function delayRandom() {
  var minDelay = 0;
  var maxDelay = 120000;
  var randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
  Logger.log("延遲時間 (毫秒): " + randomDelay);
  Utilities.sleep(randomDelay);
  Logger.log("延遲完成，繼續執行...");
}

/**
 * 判斷指定日期是否為台灣國定假日
 */
function GetHolidays(date) {
  const calendars = CalendarApp.getAllCalendars();
  for (const calendar of calendars) {
    if (calendar.getName().includes('Holidays in Taiwan')) {
      const events = calendar.getEventsForDay(date);
      if (events.length > 0) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 主程式：依據今日日期與任務清單產生每日計劃，並將結果以 Trello 卡片留言方式發送，
 * 同時透過 SEND_MSG 傳送訊息（若有設定 SEND_MSG_URL）。
 */
function autoTrello() {
  var today = new Date();
  if (GetHolidays(today)) {
    Logger.log("今日為國定假日，autoTrello 結束執行。");
    return;
  }
  var formattedDate = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy/MM/dd');
  var dayOfWeek = today.getDay();
  var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var tasks = fetchNotionTasks();
  
  var text = `
**${formattedDate} (${dayNames[dayOfWeek]})**
- ---
- **Short-term goal:**
\t ${SHORT_TERM_GOAL}
- **Daily plan:**
`;
  
  switch (dayOfWeek) {
    case 1: // Monday
      Logger.log("Today is Monday");
      text += generateTimeSlots(9, 11.5, tasks, 1);
      text += "\t- 11:30~12:30 Lunch Break\n";
      text += generateTimeSlots(12.5, 13.2, tasks, 0);
      text += "\t- 13:20~16:20 【Course】Thesis Seminar (II) RB-105\n";
      break;
    case 2: // Tuesday
      Logger.log("Today is Tuesday");
      text += "\t- 08:10~11:10 【Course】Multimedia Wireless Networks IB-602-1\n";
      text += "\t- 11:10~12:10 Lunch Break\n";
      text += generateTimeSlots(12.5, 13.2, tasks, 0);
      text += "\t- 13:20~16:20 【Course】Computer Networks IB-713\n";
      text += "\t- 16:20~19:00 【Course】Generative AI: Text and Image Synthesis Principles and Practice\n";
      break;
    case 3: // Wednesday
      Logger.log("Today is Wednesday");
      text += "\t- 09:10~12:10 【Course】Artificial Intelligence and Deep Learning MA-303\n";
      text += "\t- 14:00~16:00 【Meeting】 BMW lab meeting\n";
      text += generateTimeSlots(16, 17, tasks, 0);
      break;
    case 4: // Thursday
      Logger.log("Today is Thursday");
      text += generateTimeSlots(9, 11.5, tasks, 1);
      text += "\t- 11:30~12:30 Lunch Break\n";
      text += generateTimeSlots(12.5, 17, tasks, 0);
      break;
    case 5: // Friday
      Logger.log("Today is Friday");
      text += "\t- 09:10~12:10 【Course】Advanced Mobile Communication System IB-602-2\n";
      text += "\t- 11:30~12:30 Lunch Break\n";
      text += generateTimeSlots(12.5, 17, tasks, 0);
      break;
    default:
      Logger.log("週末或未定義時段，autoTrello 結束執行。");
      return;
  }
  
  try {
    // Trello API 留言 URL（此處卡片 ID 為固定值）
    var trelloUrl = 'https://api.trello.com/1/cards/CIIouy8k/actions/comments';
    var payload = {
      text: text,
      key: TRELLO_API_KEY,
      token: TRELLO_API_TOKEN
    };
    
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      headers: { 'Accept': 'application/json' }
    };
    
    // 若需要隨機延遲，可啟用以下程式碼
    if(NEED_TO_DELAY) delayRandom();
    
    var res = UrlFetchApp.fetch(trelloUrl, options);
    Logger.log("Trello API 回應碼: " + res.getResponseCode());
    
    var jsonResponse = JSON.parse(res.getContentText());
    var commentURL = TRELLO_COMMENT_BASE_URL + "#comment-" + jsonResponse.id;
    if(NEED_TO_SEND_MSG) SEND_MSG(commentURL);
    Logger.log("生成的 Comment URL: " + commentURL);
  } catch (error) {
    Logger.log("Error in autoTrello: " + error);
  }
}
