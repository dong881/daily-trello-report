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
const GEMINI_API_TOKEN        = getRequiredProperty("GEMINI_API_KEY"); // 新增 Gemini Token
// 非必要參數
const SEND_MSG_URL            = getOptionalProperty("SEND_MSG_URL");

const NEED_TO_DELAY = 0;
const NEED_TO_SEND_MSG = NEED_TO_DELAY;

const LAB_MEETING_DAY   = 3;  // 週三
const LAB_MEETING_START = "09:00";
const LAB_MEETING_END   = "11:00";

const SHORT_TERM_GOAL = `
- Complete the introduction section of the thesis.

- **Milestone**
  - Checkpoint 1: Introduction ORAN.
  - Checkpoint 2: Introduction FAPI/nFAPI.
- Final deliverable: Installation manual by link.
`;

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

  const requestBody = {
    "filter": {
      "and": [
        { "property": "Status", "status": { "equals": "In progress" } },
        { "property": "Assign", "people": { "contains": ASSIGNEE_UUID } }
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
      return data.results.map(page => {
        if (page.properties?.Name?.title && page.id) {
          const title = page.properties.Name.title.map(part => part.text.content).join('');
          const summary = page.properties.Summary?.rich_text?.length
            ? page.properties.Summary.rich_text.map(part => part.text.content).join(' ')
            : 'No summary';
          const link = `https://ntust-bmwlab.notion.site/${page.id.replace(/-/g, '')}`;
          return { title, summary, link };
        } else {
          return null;
        }
      }).filter(Boolean);
    }
    return [];
  } catch (error) {
    Logger.log(`Error in fetchNotionTasks: ${error}`);
    return [];
  }
}

/**
 * 時間轉換：分鐘轉 HH:MM 格式
 */
function minutesToHHMM(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * 產生今日的 time slots（以 1 小時為單位）
 * Lunch: 12:00~13:00
 * Lab meeting day: 14:00~16:00 為 meeting block
 */
function generateDailySlots(todayDayOfWeek, meetingDay) {
  const start = 9 * 60;
  const end = 17 * 60;
  const lunchStart = 12 * 60;
  const lunchEnd = 13 * 60;
  const meetingStart = 9 * 60;
  const meetingEnd = 11 * 60;

  const slots = [];
  let t = start;
  while (t < end) {
    if (t === lunchStart) {
      slots.push({ startMins: lunchStart, endMins: lunchEnd, display: `${minutesToHHMM(lunchStart)}~${minutesToHHMM(lunchEnd)} Lunch Break` });
      t = lunchEnd;
      continue;
    }
    if (todayDayOfWeek === meetingDay && t === meetingStart) {
      slots.push({ startMins: meetingStart, endMins: meetingEnd, display: `${minutesToHHMM(meetingStart)}~${minutesToHHMM(meetingEnd)} BMW lab meeting` });
      t = meetingEnd;
      continue;
    }
    slots.push({ startMins: t, endMins: t + 60, display: null });
    t += 60;
  }
  return slots;
}

/**
 * 清理 Gemini 回傳文字，去除多餘字串
 */
function sanitizeGeminiText(text) {
  return text.replace(/^Here is.*\n/i, '').trim();
}

/**
 * 簡單驗證 Gemini output 格式是否合理（1小時slot時間格式是否與slots對應）
 */
function validateGeminiPlan(planText, slots) {
  const lines = planText.split('\n').filter(l => l.trim());
  if (lines.length !== slots.length) return false;
  // 簡單檢查時間格式
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!lines[i].startsWith(`${minutesToHHMM(slot.startMins)}~${minutesToHHMM(slot.endMins)}`)) return false;
  }
  return true;
}

/**
 * 使用 Gemini API 產生計畫
 */
function generatePlanViaGemini(tasks, meetingDay, meetingStart, meetingEnd, todayDayOfWeek) {
  if (!GEMINI_API_TOKEN) {
    Logger.log("GEMINI_API_TOKEN not set, skipping Gemini call.");
    return null;
  }

  const taskList = tasks.map(t => `Title: ${t.title}\nSummary: ${t.summary}\nLink: ${t.link}`).join("\n\n");

  const prompt = `
  You are an assistant that creates a highly specific 1-hour-granularity daily schedule for an engineer/researcher.
  Working hours: 09:00 to 17:00. Lunch: 12:00~13:00 (single block). If today is lab meeting day, include a single meeting block from ${meetingStart} to ${meetingEnd} (do not split).
  You must output lines in this exact format ONLY, one per line:
  HH:MM~HH:MM Description → Link (if related to Notion task)
  or
  HH:MM~HH:MM Description  (if no link)
  - Use 1-hour slots (e.g., 09:00~10:00, 10:00~11:00).
  - **If a time slot appears multiple times (for example, "09:00~11:00 09:00~11:00 BMW lab meeting" or "12:00~13:00 12:00~13:00 Lunch Break"), include it ONLY ONCE in the schedule. Remove all duplicates regardless of how many times they appear in the input. There must never be any repeated slot in your output.**
  - Each slot MUST contain a specific, actionable micro-task derived from the Notion pages below. A Notion page can be split into multiple slots, but each hour's content must be different (e.g., "read & extract X", "implement step Y", "run test Z", "analyze results", "write doc").
  - DO NOT use generic catch-all lines like "General administration", "email review", "Daily progress review", "planning for tomorrow", "Misc tasks", "buffer", or similar vagueness.
  - If it's necessary to split a Notion task across multiple hours, ensure each hour's task is unique and denotes which part (e.g., "(part 1/3)"). For directly assigned slot-time tasks, do NOT override, subdivide, or duplicate the time they occupy.
  - Base every line on the Notion pages below; include the Notion link if the slot is derived from a Notion page.
  Return only the listed schedule lines (no introduction, no trailing commentary).

  Here are the Notion pages (Title / Summary / Link):
  ${taskList}

  Now produce the lines for today's schedule.
  `;


  const GEMINI_MODEL = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_TOKEN}`;
  const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
  const options = { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());
    Logger.log("Gemini raw response: " + JSON.stringify(json).substring(0,1000));
    const planText = json?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    return planText ? planText.trim() : null;
  } catch (err) {
    Logger.log("Error calling Gemini: " + err);
    return null;
  }
}

/**
 * 從 Notion 筆記產生 micro tasks（拆解任務以用於 fallback）
 * 簡單模擬拆分每筆任務為 3 個不同小任務。
 */
function buildMicroTasksFromNotion(tasks) {
  const microTasks = [];
  tasks.forEach(task => {
    microTasks.push({ text: `Read and analyze introduction for "${task.title}" (part 1/3)`, link: task.link });
    microTasks.push({ text: `Implement main logic for "${task.title}" (part 2/3)`, link: task.link });
    microTasks.push({ text: `Write summary report for "${task.title}" (part 3/3)`, link: task.link });
  });
  return microTasks;
}

/**
 * fallback 時，將 micro tasks 分配到各時間 slot（1 小時一格）
 */
function assignMicroTasksToSlots(slots, tasks) {
  const pool = buildMicroTasksFromNotion(tasks);
  const assigned = [];
  let poolIdx = 0;

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot.display) {
      assigned.push({ time: `${minutesToHHMM(slot.startMins)}~${minutesToHHMM(slot.endMins)}`, desc: slot.display, link: null });
      continue;
    }
    if (poolIdx >= pool.length) {
      // pool 用盡後，放一些結尾或小調整任務
      const pick = tasks[(i - pool.length) % Math.max(1, tasks.length)];
      const text = `Polish documentation or prepare short slides for "${pick.title}" (finalizing)`;
      assigned.push({ time: `${minutesToHHMM(slot.startMins)}~${minutesToHHMM(slot.endMins)}`, desc: text, link: pick.link });
    } else {
      const m = pool[poolIdx];
      assigned.push({ time: `${minutesToHHMM(slot.startMins)}~${minutesToHHMM(slot.endMins)}`, desc: m.text, link: m.link });
      poolIdx++;
    }
  }

  // 避免重複敘述，重複文字加 (continue / refine)
  const seen = {};
  for (let i = 0; i < assigned.length; i++) {
    const key = assigned[i].desc;
    if (seen[key]) {
      assigned[i].desc = assigned[i].desc + " (continue / refine)";
    } else {
      seen[key] = true;
    }
  }
  return assigned;
}

/**
 * 產生完整的每日計劃（嘗試用 Gemini 產生，失敗則 fallback）
 */
function generateHourlyPlan(tasks, meetingDay, meetingStart, meetingEnd, todayDayOfWeek) {
  const slots = generateDailySlots(todayDayOfWeek, meetingDay);
  const geminiRaw = generatePlanViaGemini(tasks, meetingDay, meetingStart, meetingEnd, todayDayOfWeek);

  if (geminiRaw) {
    const cleaned = sanitizeGeminiText(geminiRaw);
    if (validateGeminiPlan(cleaned, slots)) {
      Logger.log("Using Gemini plan (validated).");
      return cleaned;
    } else {
      Logger.log("Gemini output did not pass validation -> fallback to deterministic generator.");
    }
  } else {
    Logger.log("No Gemini output -> fallback to deterministic generator.");
  }
  const assignments = assignMicroTasksToSlots(slots, tasks);
  const lines = assignments.map(a => a.link ? `${a.time} ${a.desc} → ${a.link}` : `${a.time} ${a.desc}`);
  return lines.join("\n");
}

/**
 * 傳送訊息（例如 LINE）
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
 * 判斷是否為台灣假日
 */
function GetHolidays(date) {
  const calendars = CalendarApp.getAllCalendars();
  for (const calendar of calendars) {
    if (calendar.getName().includes('Holidays in Taiwan')) {
      const events = calendar.getEventsForDay(date);
      if (events.length > 0) return true;
    }
  }
  return false;
}

/**
 * 主程式
 */
function autoTrello() {
  var today = new Date();
  // if (GetHolidays(today)) {
  //   Logger.log("今日為國定假日，autoTrello 結束執行。");
  //   return;
  // }
  var formattedDate = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy/MM/dd');
  var dayOfWeek = today.getDay();
  var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  // 跳過週六與週日
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    Logger.log("今天是週末，autoTrello 不執行。");
    return;
  }
  
  var tasks = fetchNotionTasks();
  if (tasks.length === 0) {
    Logger.log("今日無待辦任務，autoTrello 結束。");
    return;
  }

  var hourlyPlan = generateHourlyPlan(tasks, LAB_MEETING_DAY, LAB_MEETING_START, LAB_MEETING_END, dayOfWeek);

  var text = `
**${formattedDate} (${dayNames[dayOfWeek]})**
- ---
- **Short-term goal:**
\t${SHORT_TERM_GOAL}
- **Daily Hourly Plan:**
${hourlyPlan}
`;

  try {
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

    if (NEED_TO_DELAY) delayRandom();

    var res = UrlFetchApp.fetch(trelloUrl, options);
    Logger.log("Trello API 回應碼: " + res.getResponseCode());

    var jsonResponse = JSON.parse(res.getContentText());
    var commentURL = TRELLO_COMMENT_BASE_URL + "#comment-" + jsonResponse.id;
    if (NEED_TO_SEND_MSG) SEND_MSG(commentURL);
    Logger.log("生成的 Comment URL: " + commentURL);
  } catch (error) {
    Logger.log("Error in autoTrello: " + error);
  }
}

/**
 * 延遲隨機時間 (示範用)
 */
function delayRandom() {
  Utilities.sleep(Math.floor(Math.random() * 3000) + 2000);
}
