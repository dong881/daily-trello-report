/*********************************
 * Multi-API + Smart Linking + Graduate Student Logic
 * Language: Apps Script (GAS JavaScript)
 * Version: 12.0 (Formatted Issue #10 Sync)
 *********************************/

// ==== 1. Script Properties (Secrets) ====
// 請確保在專案設定中設定以下變數
const GITHUB_API_TOKEN      = getRequiredProperty("GITHUB_API_TOKEN").trim();
const TRELLO_API_KEY        = getRequiredProperty("TRELLO_API_KEY").replace(/\s/g, '').trim();
const TRELLO_API_TOKEN      = getRequiredProperty("TRELLO_API_TOKEN").replace(/\s/g, '').trim();
const GEMINI_API_TOKEN      = getRequiredProperty("GEMINI_API_KEY").trim();

// Trello 相關設定
const TRELLO_COMMENT_BASE_URL = getRequiredProperty("TRELLO_COMMENT_BASE_URL").trim();
const TRELLO_CARD_ID          = "CIIouy8k"; 

// ==== 2. GitHub Issue Config ====
const GITHUB_OWNER            = "bmw-ece-ntust";
const GITHUB_REPO_NAME        = "progress-plan";

// Issue IDs
const MAIN_PROGRESS_ISSUE_ID  = "374"; // 原本的日報 Issue
const THESIS_LOG_ISSUE_ID     = "10";  // 每週一同步推送的 Thesis Log Issue

// ==== 3. Thesis / Notes Config ====
const MING_NOTE_API_BASE      = "https://ming-note.vercel.app/api/daily-report";
const GITHUB_THESIS_REPO_URL  = "https://github.com/bmw-ece-ntust/ming-note/blob/ming-v1.0.0/";
const MEETING_MINUTES_PATH    = "notes/Meeting-Minutes/";

// ==== 4. Schedule & Meeting Config ====
const LAB_MEETING_DAY     = 3; // Wednesday
const LAB_MEETING_START   = "09:00";
const LAB_MEETING_END     = "11:00";
const labMeetingStart     = 9 * 60;
const labMeetingEnd       = 11 * 60;
const LAB_MEETING_WEEK_PARITY = 0; // 0 = Even Weeks, 1 = Odd Weeks

const PROF_RAY_MEETING_DAY = 1; // Monday (Trigger Day)
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

// ==========================================
// ====    MAIN EXECUTION FUNCTION       ====
// ==========================================
function mainDailyUpdate() {
  // UNIFIED DATE: Call new Date() once here and pass it down
  const today = new Date(); 
  
  var formattedDate = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy/MM/dd');
  var dayOfWeek = today.getDay();
  var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  if (dayOfWeek === 0 || dayOfWeek === 6) { Logger.log("Weekend, skipping."); return; }

  // 1. Fetch Tasks
  let daysToFetch = 3; 
  const maxFetchDays = 10;
  var tasks = [];
  while (tasks.length === 0 && daysToFetch <= maxFetchDays) {
    tasks = fetchTasksFromNoteAPI(daysToFetch, 'all'); 
    if (tasks.length === 0) daysToFetch++;
  }
  if (tasks.length === 0) {
    Logger.log("No tasks found in API.");
    return;
  }
  
  // 2. Generate Plan Content
  var hourlyPlan = generateHourlyPlanAll(tasks, today); 
  if (!hourlyPlan || hourlyPlan.length < 5) {
    Logger.log("Failed to generate a valid plan.");
    return;
  }

  // 3. Construct Final Text (Markdown)
  var finalText = `
**${formattedDate} (${dayNames[dayOfWeek]})**
- ---
- **Short-term goal:**
\t${SHORT_TERM_GOAL}
- **Daily Hourly Plan:**
${hourlyPlan}
`;

  Logger.log("=== GENERATED CONTENT ===\n" + finalText);

  // ----------------------------------------------------
  // 4. Push to External Services
  // ----------------------------------------------------
  
  // (A) GitHub Issues - Main Progress Report (Issue #374)
  postToGitHubIssue(MAIN_PROGRESS_ISSUE_ID, finalText);

  // (B) GitHub Issues - Thesis Log Sync (Issue #10) - TRIGGER CHECK
  if (dayOfWeek === PROF_RAY_MEETING_DAY) {
      Logger.log(">>> Triggering Meeting Day Sync (Issue #10)...");
      const weekNum = getWeekNumber(today);
      const yyyymmddForLink = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyyMMdd');
      
      // Full URL construction
      const meetingFullUrl = `${GITHUB_THESIS_REPO_URL}${MEETING_MINUTES_PATH}week${weekNum}-${yyyymmddForLink}.md`;
      
      // Construct Formatted Message for Issue #10
      const issue10Content = `## Week ${weekNum} (${formattedDate}-${dayNames[dayOfWeek]}) Meeting minute\n\n -> ${meetingFullUrl}`;

      // Post to Issue #10
      postToGitHubIssue(THESIS_LOG_ISSUE_ID, issue10Content);
  }

  // (C) Trello - Backup (Independent Function)
  sendToTrello(finalText);
}

// ==========================================
// ====    SENDER FUNCTIONS (Modularized)====
// ==========================================

/**
 * 模組化 GitHub 發送函式
 * @param {string} issueId - 目標 Issue 編號 (例如 "374" 或 "10")
 * @param {string} bodyContent - 留言內容
 */
function postToGitHubIssue(issueId, bodyContent) {
  Logger.log(`>>> Starting GitHub Push to Issue #${issueId}...`);
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO_NAME}/issues/${issueId}/comments`;
  
  const payload = { 'body': bodyContent };
  const options = {
    'method': 'post',
    'contentType': 'application/json',
    'headers': {
      'Authorization': 'Bearer ' + GITHUB_API_TOKEN,
      'Accept': 'application/vnd.github.v3+json'
    },
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === 201) {
      const responseBody = JSON.parse(response.getContentText());
      Logger.log(`✅ GitHub Issue #${issueId} 成功！連結: ${responseBody.html_url}`);
    } else {
      Logger.log(`❌ GitHub Issue #${issueId} 失敗。代碼: ${responseCode} | 訊息: ${response.getContentText()}`);
    }
  } catch (e) {
    Logger.log(`❌ GitHub Issue #${issueId} 例外錯誤: ${e.toString()}`);
  }
}

/**
 * 發送訊息到 Trello Card (獨立功能)
 */
function sendToTrello(text) {
  Logger.log(">>> Starting Trello Push...");
  try {
    var safeKey = TRELLO_API_KEY.replace(/[^a-zA-Z0-9]/g, "");
    var safeToken = TRELLO_API_TOKEN.replace(/[^a-zA-Z0-9]/g, "");
    var trelloUrl = `https://api.trello.com/1/cards/${TRELLO_CARD_ID}/actions/comments?key=${safeKey}&token=${safeToken}`;

    var options = { 
      method: 'post', 
      contentType: 'application/json', 
      payload: JSON.stringify({text: text}), 
      headers: { 'Accept': 'application/json' },
      muteHttpExceptions: true
    };
    
    var res = UrlFetchApp.fetch(trelloUrl, options);
    var code = res.getResponseCode();

    if (code === 200) {
       var jsonResponse = JSON.parse(res.getContentText());
       Logger.log("✅ Trello 成功！連結: " + TRELLO_COMMENT_BASE_URL + "#comment-" + jsonResponse.id);
    } else {
       Logger.log("❌ Trello 失敗。代碼: " + code + " | 訊息: " + res.getContentText());
    }
  } catch (error) {
    Logger.log("❌ Trello 例外錯誤: " + error);
  }
}


// ==========================================
// ====    CORE GENERATION LOGIC         ====
// ==========================================

// ==== Util: Script Properties ====
function getRequiredProperty(key) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw new Error("Missing Property: " + key);
  return value;
}
function getOptionalProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

// ==== Util: Logic Helpers ====
function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function githubSlugify(text) {
  if (!text) return "";
  return text.toLowerCase()
    .replace(/[^a-z0-9 -]/g, '') 
    .trim().replace(/\s+/g, '-');
}

function normalizeString(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function minutesToHHMM(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// ==== Fetch Data ====
function fetchTasksFromNoteAPI(days = 3, status = "all", tags = null) {
  let url = `${MING_NOTE_API_BASE}?days=${days}`;
  if (status !== 'all') url += `&status=${status}`;
  if (tags && tags.length) url += `&tags=${encodeURIComponent(tags.join(','))}`;
  try {
    let response = UrlFetchApp.fetch(url);
    let data = JSON.parse(response.getContentText());
    if (data.success && Array.isArray(data.data)) {
      const emojiRegex = /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF])/g;
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
              let cleanedLink = s.link || base.link;
              if (cleanedLink) cleanedLink = cleanedLink.replace(emojiRegex, '').replace(/#-/g, '#');
              return { title: s.title || "", link: cleanedLink };
            });
          }
          return base;
        });
    }
    return [];
  } catch (error) {
    Logger.log("Error fetching API: " + error);
    return [];
  }
}

// ==== Slots Generation ====
function generateDailySlots(today) {
  const dayOfWeek = today.getDay();
  const slots = [];
  const start = 9 * 60, end = 17 * 60;
  const lunchStart = 12 * 60, lunchEnd = 13 * 60;
  
  const currentWeekNum = getWeekNumber(today);
  const isLabMeetingWeek = (currentWeekNum % 2 === LAB_MEETING_WEEK_PARITY);

  let t = start;
  while (t < end) {
    if (t === lunchStart) {
      slots.push({ startMins: lunchStart, endMins: lunchEnd, display: "Lunch Break" });
      t = lunchEnd; continue;
    }
    if (dayOfWeek === LAB_MEETING_DAY && t === labMeetingStart && isLabMeetingWeek) {
      slots.push({ startMins: labMeetingStart, endMins: labMeetingEnd, display: "BMW lab meeting" });
      t = labMeetingEnd; continue;
    }
    if (dayOfWeek === PROF_RAY_MEETING_DAY && t === PROF_RAY_MEETING_START_MINS) {
      slots.push({ startMins: PROF_RAY_MEETING_START_MINS, endMins: PROF_RAY_MEETING_END_MINS, display: PROF_RAY_MEETING_DISPLAY });
      t = PROF_RAY_MEETING_END_MINS; continue;
    }
    slots.push({ startMins: t, endMins: t + 60, display: null });
    t += 60;
  }
  return slots;
}

// ==== Link Matching ====
function attachRelevantLink(planText, notes, today) {
  let candidates = [];
  notes.forEach(note => {
    if (note.title && note.link) candidates.push({ title: note.title, link: note.link });
    if (note.sections) {
      note.sections.forEach(sec => {
        if (sec.title) {
          let deepLink = sec.link || (note.link + "#" + githubSlugify(sec.title));
          candidates.push({ title: sec.title, link: deepLink });
        }
      });
    }
  });

  candidates.sort((a, b) => b.title.length - a.title.length);

  return planText.split('\n').map(line => {
    let trimmed = line.trim();
    if (!trimmed.match(/^\d{2}:\d{2}~\d{2}:\d{2}/)) return line;
    if (trimmed.match(/\[.*?\]\(.*?\)/)) return line; 

    if (trimmed.includes("Prof. Ray") || trimmed.includes(PROF_RAY_MEETING_DISPLAY)) {
      const weekNum = getWeekNumber(today);
      const yyyymmdd = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyyMMdd');
      return `${trimmed} [Link](${GITHUB_THESIS_REPO_URL}${MEETING_MINUTES_PATH}week${weekNum}-${yyyymmdd}.md)`;
    }
    
    const normLine = normalizeString(trimmed);
    for (let cand of candidates) {
      if (cand.title.length > 3 && normLine.includes(normalizeString(cand.title))) {
        return `${trimmed} [Link](${cand.link})`;
      }
    }
    return line;
  }).join('\n');
}

// ==== Gemini Generation ====
function generatePlanViaGeminiAll(tasks, slots) {
  if (!GEMINI_API_TOKEN) return null;
  
  const slotTemplate = slots.map((s, i) =>
    `Slot ${i + 1}: ${minutesToHHMM(s.startMins)}~${minutesToHHMM(s.endMins)}${s.display ? " (FIXED_EVENT: " + s.display + ")" : " (EMPTY)"}`
  ).join("\n");

  const taskList = tasks.map(t => {
    let info = `[Note] Title: ${t.title} | Tags: ${t.tags.join(", ")} | Summary: ${t.summary}`;
    if (t.sections && t.sections.length) info += "\n" + t.sections.map(s => `  - Sub-topic: "${s.title}"`).join("\n");
    return info;
  }).join("\n\n");

  const prompt = `
You are a daily scheduler.
**INSTRUCTIONS:**
1. Fill exactly ${slots.length} time slots based on the "Time Slots" list below.
2. **Fixed Events:** If a slot says "(FIXED_EVENT: X)", output "HH:MM~HH:MM X".
3. **Empty Slots:** Fill with a task from "Task List".
4. **Action Tags:** Use [Update], [Refactor], [Analyze], [Debug], [Implement], [Optimize], [Plan].
5. **Wording:** Use the **EXACT** Note Title or Sub-topic Title.

**Time Slots:**
${slotTemplate}

**Task List:**
${taskList}

**OUTPUT (Exactly ${slots.length} lines):**
  `.trim();

  const models = ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
  for (let m of models) {
    let res = callGeminiAPI(m, prompt);
    if (res && res.split('\n').filter(l => l.match(/^\d{2}:\d{2}/)).length >= slots.length) return res;
    Utilities.sleep(1000);
  }
  return null;
}

function callGeminiAPI(model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_TOKEN}`;
  const payload = { 
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.6, maxOutputTokens: 8192 }
  };
  try {
    const res = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
    return JSON.parse(res.getContentText())?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  } catch (e) { return null; }
}

function generateHourlyPlanAll(tasks, today) {
  const slots = generateDailySlots(today);
  let planRaw = generatePlanViaGeminiAll(tasks, slots);
  let planLines = [];
  
  if (planRaw) {
    planLines = planRaw.replace(/\*\*/g, "").replace(/```/g, "").trim().split('\n')
      .map(l => l.trim()).filter(l => l.match(/^\d{2}:\d{2}~\d{2}:\d{2}/));
  }
  
  let finalLines = (planLines.length === slots.length) 
    ? attachRelevantLink(planLines.join('\n'), tasks, today).split('\n')
    : slots.map(s => s.display ? `${minutesToHHMM(s.startMins)}~${minutesToHHMM(s.endMins)} ${s.display}` : `${minutesToHHMM(s.startMins)}~${minutesToHHMM(s.endMins)}`);
    
  return finalLines.map(line => `\t- ${line}`).join('\n');
}