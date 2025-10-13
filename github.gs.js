/*********************************
 *  Multi-API + Smart Linking + Periodic Slot
 *  Language: Apps Script (GAS JavaScript)
 *********************************/

// ==== Script Properties ====
const TRELLO_API_KEY           = getRequiredProperty("TRELLO_API_KEY");
const TRELLO_API_TOKEN         = getRequiredProperty("TRELLO_API_TOKEN");
const TRELLO_COMMENT_BASE_URL  = getRequiredProperty("TRELLO_COMMENT_BASE_URL");
const GEMINI_API_TOKEN         = getRequiredProperty("GEMINI_API_KEY");
const SEND_MSG_URL             = getOptionalProperty("SEND_MSG_URL");
const MING_NOTE_API_BASE       = "https://ming-note.vercel.app/api/daily-report";

// ==== Periodic Meeting/Slot Config ====
const LAB_MEETING_DAY   = 3; // Wednesday
const LAB_MEETING_START = "09:00";
const LAB_MEETING_END   = "11:00";
const labMeetingStart   = 9 * 60;
const labMeetingEnd     = 11 * 60;

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

// ==== Fetch Daily Report Notes from API ====
function fetchTasksFromNoteAPI(days = 1, status = "all", tags = null) {
  let url = `${MING_NOTE_API_BASE}?days=${days}`;
  if (status !== 'all') url += `&status=${status}`;
  if (tags && tags.length) url += `&tags=${encodeURIComponent(tags.join(','))}`;
  try {
    let response = UrlFetchApp.fetch(url);
    let data = JSON.parse(response.getContentText());
    if (data.success && Array.isArray(data.data)) {
      // 為每一筆 note 展開所有 section，形成 "可連結資料"
      return data.data.map(note => {
        // 主筆記本身可以點（無 section 時使用）
        let base = {
          title: note.noteName || "",
          summary: note.metadata.summary || "No summary",
          link: note.noteLink || "",
          sections: note.sections || [],
          tags: note.metadata.tags || []
        };
        // 每個 section 也保留標題、超連結
        if (base.sections.length) {
          base.sections = base.sections.map(s => ({
            title: s.title || "",
            link: s.link || base.link
          }));
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

// 核心：match output to optimal link（LLM或fallback都用這個包）
function attachRelevantLink(planText, notes) {
  // 先建立所有 section 連結的 quick 查表
  let candidates = [];
  notes.forEach(note => {
    if (note.sections && note.sections.length) {
      note.sections.forEach(sec => {
        candidates.push({ title: sec.title, link: sec.link });
      });
    }
    if (note.title && note.link) {
      candidates.push({ title: note.title, link: note.link });
    }
  });

  // 每行處理：如有標題相關字串即加 link → [text](link)
  return planText.split('\n').map(line => {
    let trimmed = line.trim();
    let assigned = false;
    // 只對 "HH:MM~HH:MM ......" 類型處理
    if (!trimmed.match(/^\d{2}:\d{2}~\d{2}:\d{2}/)) return line;
    // 對每個 candidate, 最長標題優先
    for (let cand of candidates.sort((a,b)=>b.title.length-a.title.length)) {
      if (cand.title && trimmed.toLowerCase().includes(cand.title.toLowerCase()) && cand.link) {
        // 規則：只替出現關鍵字內容加 link，不蓋全部行
        const anchor = `[${cand.title}](${cand.link})`;
        // 用 title 第一次出現的位置替換
        const re = new RegExp(cand.title, "i");
        let lined = line.replace(re, anchor);
        assigned = true;
        return lined;
      }
    }
    return line;
  }).join('\n');
}

// ==== Gemini LLM Generate Hourly Plan, plain, then attach link ====
function generatePlanViaGeminiAll(tasks, slots) {
  if (!GEMINI_API_TOKEN) return null;
  const slotTemplate = slots.map(slot=>
    `${minutesToHHMM(slot.startMins)}~${minutesToHHMM(slot.endMins)}${slot.display ? " " + slot.display : ""}`
  ).join("\n");
  const taskList = tasks.map(t=>`Title: ${t.title}\nSummary: ${t.summary}\nLink: ${t.link}`).join("\n\n");
  const prompt = `
You are an assistant who schedules highly specific 1-hour tasks for an engineering graduate student based on daily API notes/tasks.
Today's available time slots are listed in order (see below).
Some slots are already fixed for recurring events (meetings, lunch, routine events); their contents must be kept as is.
You must assign the remaining open slots by distributing the provided API note items as concretely as possible without vague/general lines.
Each line must correspond to ONE slot in the given order, and the total lines must equal the number of slots.
You may split an API task into several micro-actions across several hours, but each slot's content must differ and be actionable.
If there are not enough API note items to fill, leave the remaining slots BLANK (write just the time range).
Prohibited: Adding extra slots, repeating the same content, using placeholder words like 'buffer', 'review', 'admin', or summarizing lines.
Output only the lines, nothing else, and in the same line order as the time slots.

Slot list:
${slotTemplate}

API items (Title / Summary / Link):
${taskList}

Now generate today's hourly plan lines in ENGLISH, one for each slot, in order.
Use the template:
HH:MM~HH:MM Description (refer to API task title/section if possible)
Or
HH:MM~HH:MM [description of fixed event]
Or
HH:MM~HH:MM        (leave blank if no item to assign)
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
    Logger.log("Error calling Gemini: " + err);
    return null;
  }
}

// ==== Microtask fallback (text, smart-link) ====
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
      assigned.push({ time: `${minutesToHHMM(slot.startMins)}~${minutesToHHMM(slot.endMins)}`,
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
    if (assigned[i].desc && seen[assigned[i].desc]) assigned[i].desc += " (continue/refine)";
    else if (assigned[i].desc) seen[assigned[i].desc] = true;
  }
  // form lines
  return assigned.map(a =>
    a.desc
      ? (a.link && a.match && (a.match.some(str => a.desc.includes(str))) ?
        `${a.time} [${a.desc}](${a.link})` :
        `${a.time} ${a.desc}`
        )
      : `${a.time}`
  );
}

// ==== Compose the hourly plan: LLM then fallback + smart link ====
function generateHourlyPlanAll(tasks, todayDayOfWeek) {
  const slots = generateDailySlots(todayDayOfWeek);
  let planRaw = generatePlanViaGeminiAll(tasks, slots);
  let planLines = [];
  if (planRaw) planLines = planRaw.split('\n').filter(l=>l.match(/^\d{2}:\d{2}~\d{2}:\d{2}/));
  // 若格式數目OK，進行智能連結
  if (planLines.length === slots.length)
    return attachRelevantLink(planLines.join('\n'), tasks);
  // fallback deterministic
  return assignMicroTasksToSlots(slots, tasks).join('\n');
}

// ==== Main autoTrello Scheduler ====
function autoTrello() {
  var today = new Date();
  var formattedDate = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy/MM/dd');
  var dayOfWeek = today.getDay();
  var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    Logger.log("Today is weekend, autoTrello does not execute.");
    return;
  }
  var tasks = fetchTasksFromNoteAPI(3, 'in-progress'); // 不包 tags param
  if (tasks.length === 0) {
    Logger.log("No API notes today. autoTrello ends.");
    return;
  }
  var hourlyPlan = generateHourlyPlanAll(tasks, dayOfWeek);
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
