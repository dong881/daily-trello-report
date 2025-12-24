/*********************************
 * Multi-API + Smart Linking + Periodic Slot
 * Language: Apps Script (GAS JavaScript)
 * Version: 2.5 (Bubble List Format Update)
 *********************************/

// ==== Script Properties ====
const TRELLO_API_KEY          = getRequiredProperty("TRELLO_API_KEY");
const TRELLO_API_TOKEN        = getRequiredProperty("TRELLO_API_TOKEN");
const TRELLO_COMMENT_BASE_URL = getRequiredProperty("TRELLO_COMMENT_BASE_URL");
const GEMINI_API_TOKEN        = getRequiredProperty("GEMINI_API_KEY");
const SEND_MSG_URL            = getOptionalProperty("SEND_MSG_URL");
const MING_NOTE_API_BASE      = "https://ming-note.vercel.app/api/daily-report";

// ==== Periodic Meeting/Slot Config ====
const LAB_MEETING_DAY     = 3; // Wednesday
const LAB_MEETING_START   = "09:00";
const LAB_MEETING_END     = "11:00";
const labMeetingStart     = 9 * 60;
const labMeetingEnd       = 11 * 60;

const PROF_RAY_MEETING_DAY = 1; // Monday
const PROF_RAY_MEETING_START_MINS = 14 * 60;
const PROF_RAY_MEETING_END_MINS = 15 * 60;
const PROF_RAY_MEETING_DISPLAY = "Meeting with Prof. Ray to discuss the thesis";

const SHORT_TERM_GOAL = `
- Begin drafting the research motivation, challenges, and contributions of the thesis.
- Milestone:
  - Checkpoint 1: research motivation
  - Checkpoint 2: research challenges
  - Checkpoint 3: research contributions
- Final deliverable: Installation manual by link.
`;

// ==== Util: Script Properties ====
function getRequiredProperty(key) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    Logger.log("ERROR: Script Property '" + key + "' is not set.");
    throw new Error("Missing required Script Property: " + key);
  }
  return value;
}
function getOptionalProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

// ==== MODIFIED: Fetch Daily Report Notes from API (with emoji filter) ====
function fetchTasksFromNoteAPI(days = 3, status = "all", tags = null) {
  let url = `${MING_NOTE_API_BASE}?days=${days}`;
  console.log(url);
  if (status !== 'all') url += `&status=${status}`;
  if (tags && tags.length) url += `&tags=${encodeURIComponent(tags.join(','))}`;
  try {
    let response = UrlFetchApp.fetch(url);
    let data = JSON.parse(response.getContentText());
    if (data.success && Array.isArray(data.data)) {
      
      // **MODIFICATION**: Regex to remove common emojis
      const emojiRegex = /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g;

      return data.data
        .filter(note => !(note.note && note.note.startsWith("notes/Meeting-Minutes/")))
        .map(note => {
          let base = {
            title: note.noteName || "",
            summary: note.metadata.summary || "No summary",
            link: note.noteLink || "",
            sections: note.sections || [],
            tags: note.metadata.tags || []
          };
          
          if (base.sections.length) {
            base.sections = base.sections.map(s => {
              // **MODIFICATION**: Clean emojis from section links
              let cleanedLink = s.link || base.link;
              if (cleanedLink) {
                cleanedLink = cleanedLink.replace(emojiRegex, '');
                // Also remove hyphen after hash, e.g. #📋-overview -> #-overview -> #overview
                cleanedLink = cleanedLink.replace(/#-/g, '#');
              }
              return {
                title: s.title || "",
                link: cleanedLink // Use the cleaned link
              };
            });
          }
          return base;
        });
    }
    return [];
  } catch (error) {
    Logger.log("Error in fetchTasksFromNoteAPI: " + error);
    return [];
  }
}

// ==== Slot Utility ====
function minutesToHHMM(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// ==== Daily Slots ====
function generateDailySlots(todayDayOfWeek) {
  const slots = [];
  const start = 9 * 60, end = 17 * 60;
  const lunchStart = 12 * 60, lunchEnd = 13 * 60;
  let t = start;
  while (t < end) {
    if (t === lunchStart) {
      slots.push({ startMins: lunchStart, endMins: lunchEnd, display: "Lunch Break" });
      t = lunchEnd; continue;
    }
    if (todayDayOfWeek === LAB_MEETING_DAY && t === labMeetingStart) {
      slots.push({ startMins: labMeetingStart, endMins: labMeetingEnd, display: "BMW lab meeting" });
      t = labMeetingEnd; continue;
    }
    if (todayDayOfWeek === PROF_RAY_MEETING_DAY && t === PROF_RAY_MEETING_START_MINS) {
      slots.push({
        startMins: PROF_RAY_MEETING_START_MINS,
        endMins: PROF_RAY_MEETING_END_MINS,
        display: PROF_RAY_MEETING_DISPLAY
      });
      t = PROF_RAY_MEETING_END_MINS; continue;
    }
    slots.push({ startMins: t, endMins: t + 60, display: null });
    t += 60;
  }
  return slots;
}

// ==== Micro-task + Smart Linking Fallback ====
// 產生 micro-tasks (含筆記本、含章節); 為 output 搜尋對應 link。
function buildMicroTasksFromAPI(notes) {
  let microTasks = [];
  notes.forEach(note => {
    if (note.sections && note.sections.length > 0) {
      note.sections.forEach(section => {
        microTasks.push({
          text: `${section.title} of ${note.title}`,
          link: section.link,
          match: [section.title, note.title]
        });
      });
    } else {
      microTasks.push({
        text: `Read "${note.title}" content`,
        link: note.link,
        match: [note.title]
      });
    }
  });
  return microTasks;
}

// ==== MODIFIED: attachRelevantLink (Append link at the end) ====
// 核心：match output to optimal link（LLM或fallback都用這個包）
function attachRelevantLink(planText, notes) {
  // 1. 建立所有 section 和 note 連結的 quick 查表
  let candidates = [];
  notes.forEach(note => {
    // 優先加入 Sections
    if (note.sections && note.sections.length) {
      note.sections.forEach(sec => {
        if (sec.title && sec.link) { // 確保有標題和連結
          candidates.push({ title: sec.title, link: sec.link });
        }
      });
    }
    // 加入 Note 本身 (作為 fallback)
    if (note.title && note.link) {
      candidates.push({ title: note.title, link: note.link });
    }
  });

  // 2. 依標題長度排序 (最長的優先匹配，以提高準確性)
  candidates.sort((a, b) => b.title.length - a.title.length);

  // 3. 處理每一行 plan
  return planText.split('\n').map(line => {
    let trimmedLine = line.trim();
    
    // 只處理 "HH:MM~HH:MM ......" 類型的行
    if (!trimmedLine.match(/^\d{2}:\d{2}~\d{2}:\d{2}/)) {
      return line; // 非任務行 (例如標題或空行)
    }

    // 檢查是否已經有 [Link](...)
    if (trimmedLine.match(/\[.*?\]\(.*?\)/)) {
      return line; // 已經有連結，不再處理
    }
    
    // 檢查是否為固定行程 (e.g., Lunch, Meeting) 或空行
    if (!trimmedLine.match(/^\d{2}:\d{2}~\d{2}:\d{2}\s+.+/)) {
        return line; // 空的 slot，不用加 link
    }

    // 尋找最匹配的 candidate
    for (let cand of candidates) {
      // 檢查標題是否存在於行內 (不分大小寫)
      if (cand.title && cand.title.length > 1 && trimmedLine.toLowerCase().includes(cand.title.toLowerCase())) {
        // 找到了！在行尾加上連結
        // trim() 確保沒有多餘的尾隨空格
        return `${line.trim()} [Link](${cand.link})`;
      }
    }
    
    // 沒找到匹配的 candidate
    return line;
  }).join('\n');
}


// ==== MODIFIED: generatePlanViaGeminiAll (Objective Prompt) ====
function generatePlanViaGeminiAll(tasks, slots) {
  if (!GEMINI_API_TOKEN) return null;
  
  const slotTemplate = slots.map(slot =>
    `${minutesToHHMM(slot.startMins)}~${minutesToHHMM(slot.endMins)}${slot.display ? " " + slot.display : ""}`
  ).join("\n");

  const taskList = tasks.map(t => {
    let noteInfo = `Note Title: ${t.title}\nNote Summary: ${t.summary}\nNote Link: ${t.link}`;
    if (t.sections && t.sections.length > 0) {
      const sectionList = t.sections.map(s => `- Section: "${s.title}" (Link: ${s.link})`).join("\n");
      noteInfo += `\nAvailable Sections:\n${sectionList}`;
    }
    return noteInfo;
  }).join("\n\n");

  // **MODIFICATION**: New objective prompt
  const prompt = `
You are a highly efficient scheduling assistant. Your task is to plan a day for an engineering graduate student using simple, direct, and objective statements.

**Crucial Instruction 1: Task Description:**
- You MUST use actionable, direct statements. (e.g., "Draft the...", "Review the...", "Continue outlining...").
- DO NOT use the first person (e.g., "I will...", "I'll...", "My plan is...").
- Your goal is to create a logical flow for the day, where tasks build upon each other.
- Base these tasks primarily on the **Available Sections** provided for each note.

- GOOD: "09:00~10:00 Draft the 'research motivation' section for the thesis."
- GOOD: "10:00~11:00 Outline the 'research challenges' based on the completed motivation."
- BAD: "09:00~10:00 research motivation" (This is too short)
- BAD: "09:00~10:00 I will draft the research motivation." (This is first-person)

**Crucial Instruction 2: Strict Formatting (Absolutely Required):**
You MUST output exactly one line for *every* slot provided in the "Slot list." The total number of output lines MUST equal the total number of slot lines.
- Keep fixed events (meetings, lunch) exactly as they are.
- If there are not enough API items/sections to fill, you MUST still output the time range for that slot, but leave the description blank. (e.g., "16:00~17:00")
- DO NOT add any extra text, headers, summaries, or conversational lines before or after the plan. Your output must start *immediately* with the first time slot.
- Prohibited: Repeating content, placeholder words ('buffer', 'admin'), or summarizing lines.

Slot list:
${slotTemplate}

API items (Notes and their Available Sections):
${taskList}

Now generate today's hourly plan, in ENGLISH, starting with the first slot.
One line per slot, in order.
Use the template:
HH:MM~HH:MM [Direct, objective task for this hour]
Or
HH:MM~HH:MM [description of fixed event]
Or
HH:MM~HH:MM      (for empty slots need to merge with last slot time)
  `.replace(/^\s+/gm, '');

  const GEMINI_MODEL = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_TOKEN}`;
  const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
  const options = { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());
    const planText = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return planText.trim();
  } catch (err) {
    // Log the actual response text if it's not JSON
    if (err.message && err.message.includes("not valid JSON")) {
        Logger.log("Gemini API did not return valid JSON. Response text: " + err);
    } else {
        Logger.log("Error calling Gemini: " + err);
    }
    return null;
  }
}

// ==== MODIFIED: assignMicroTasksToSlots (Append link at the end) ====
function assignMicroTasksToSlots(slots, notes) {
  const microTasks = buildMicroTasksFromAPI(notes);
  const assigned = [];
  let poolIdx = 0;
  
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot.display) {
      assigned.push({ time: `${minutesToHHMM(slot.startMins)}~${minutesToHHMM(slot.endMins)}`, desc: slot.display, link: null });
      continue;
    }
    if (poolIdx >= microTasks.length) {
      assigned.push({ time: `${minutesToHHMM(slot.startMins)}~${minutesToHHMM(slot.endMins)}`, desc: "" });
    } else {
      const task = microTasks[poolIdx];
      assigned.push({ 
        time: `${minutesToHHMM(slot.startMins)}~${minutesToHHMM(slot.endMins)}`,
        desc: task.text,
        match: task.match,
        link: task.link
      });
      poolIdx++;
    }
  }
  
  // 避免重複
  const seen = {};
  for (let i = 0; i < assigned.length; i++) {
    if (assigned[i].desc && seen[assigned[i].desc]) {
      assigned[i].desc += " (continue/refine)";
    } else if (assigned[i].desc) {
      seen[assigned[i].desc] = true;
    }
  }

  // **MODIFICATION**: form lines (append link at the end)
  return assigned.map(a => {
    if (!a.desc) {
      return a.time; // 空白時段
    }
    if (a.link) {
      // 直接在後面加上 [Link]
      return `${a.time} ${a.desc} [Link](${a.link})`;
    }
    // 沒有 link (例如固定行程)
    return `${a.time} ${a.desc}`;
  });
}


// ==== Compose the hourly plan: LLM then fallback + smart link + BUBBLE LIST FORMAT ====
function generateHourlyPlanAll(tasks, todayDayOfWeek) {
  const slots = generateDailySlots(todayDayOfWeek);
  let planRaw = generatePlanViaGeminiAll(tasks, slots);
  let planLines = [];
  
  if (planRaw) {
    planLines = planRaw.split('\n').filter(l => l.match(/^\d{2}:\d{2}~\d{2}:\d{2}/));
  }
  
  let finalPlanLines = [];

  // 若格式數目OK，進行智能連結
  if (planLines.length === slots.length) {
    Logger.log("Using Gemini plan. Attaching links...");
    // attachRelevantLink returns a single string, we split it back to array
    const linkedText = attachRelevantLink(planLines.join('\n'), tasks);
    finalPlanLines = linkedText.split('\n');
  } else {
    // fallback deterministic
    Logger.log(`Gemini plan failed or invalid. Using fallback.`);
    finalPlanLines = assignMicroTasksToSlots(slots, tasks);
  }

  // **IMPORTANT MODIFICATION**: Convert lines to Bubble List Format
  // Add tab + bullet point to each line
  return finalPlanLines.map(line => `\t- ${line}`).join('\n');
}

// ==== MODIFIED: Main autoTrello Scheduler (Retry logic + Format) ====
function autoTrello() {
  var today = new Date();
  var formattedDate = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy/MM/dd');
  var dayOfWeek = today.getDay();
  var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    Logger.log("Today is weekend, autoTrello does not execute.");
    return;
  }

  // **MODIFICATION**: Retry logic if no tasks are found
  let daysToFetch = 3; // Start with 3 days
  const maxFetchDays = 10; // Safety break after 10 days
  var tasks = [];

  while (tasks.length === 0 && daysToFetch <= maxFetchDays) {
    Logger.log(`Fetching tasks for the last ${daysToFetch} days...`);
    tasks = fetchTasksFromNoteAPI(daysToFetch, 'all'); // 不包 tags param

    if (tasks.length === 0) {
      Logger.log(`No API notes found for ${daysToFetch} days. Trying ${daysToFetch + 1} days...`);
      daysToFetch++;
    }
  }

  // After loop, check if tasks are still empty
  if (tasks.length === 0) {
    Logger.log(`No API notes found even after checking ${maxFetchDays} days. autoTrello ends.`);
    return;
  }
  
  Logger.log(`Successfully fetched ${tasks.length} notes from the last ${daysToFetch} days.`);
  
  var hourlyPlan = generateHourlyPlanAll(tasks, dayOfWeek);
  
  // **MODIFICATION**: Use the exact requested text template
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
    var res = UrlFetchApp.fetch(trelloUrl, options);
    Logger.log("Trello API response: " + res.getResponseCode());
    var jsonResponse = JSON.parse(res.getContentText());
    var commentURL = TRELLO_COMMENT_BASE_URL + "#comment-" + jsonResponse.id;
    // if (SEND_MSG_URL) SEND_MSG(commentURL);
    Logger.log("Generated Comment URL: " + commentURL);
  } catch (error) {
    Logger.log("Error in autoTrello: " + error);
  }
}

// ==== Send Msg if set ====
function SEND_MSG(MsgStr) {
  if (!SEND_MSG_URL) {
    Logger.log("SEND_MSG_URL not set. Skipped.");
    return;
  }
  try {
    var encodedMsg = encodeURIComponent(MsgStr);
    var url = SEND_MSG_URL + encodedMsg;
    UrlFetchApp.fetch(url);
    Logger.log("Message sent: " + MsgStr);
  } catch (error) {
    Logger.log("Error in SEND_MSG: " + error);
  }
}