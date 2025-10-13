// /*********************************
//  *  Multi-Notion + Periodic Slot
//  *  LLM Prompt: All English Output
//  *  Language: Apps Script (GAS JavaScript)
//  *********************************/

// // ==== Script Properties: API Keys & ID ====
// const NOTION_TOKEN            = getRequiredProperty("NOTION_TOKEN");
// const DATABASE_ID             = getRequiredProperty("DATABASE_ID"); // Main database
// const ASSIGNEE_UUID           = getRequiredProperty("ASSIGNEE_UUID");

// const TRELLO_API_KEY          = getRequiredProperty("TRELLO_API_KEY");
// const TRELLO_API_TOKEN        = getRequiredProperty("TRELLO_API_TOKEN");
// const TRELLO_COMMENT_BASE_URL = getRequiredProperty("TRELLO_COMMENT_BASE_URL");
// const GEMINI_API_TOKEN        = getRequiredProperty("GEMINI_API_KEY");
// const SEND_MSG_URL            = getOptionalProperty("SEND_MSG_URL");

// // ==== Extend: List all Notion database ids ====
// const NOTION_DATABASE_IDS = [
//   getRequiredProperty("DATABASE_ID"),
//   getOptionalProperty("SECOND_NOTION_DATABASE_ID"),
//   getOptionalProperty("THIRD_NOTION_DATABASE_ID"),
//   // Add more with Script Properties if needed
// ].filter(Boolean);

// // ==== Periodic Meeting/Slot Config (customize as needed) ====
// const LAB_MEETING_DAY   = 3; // Wednesday
// const LAB_MEETING_START = "09:00";
// const LAB_MEETING_END   = "11:00";
// const labMeetingStart   = 9 * 60;
// const labMeetingEnd     = 11 * 60;

// const PROF_RAY_MEETING_DAY = 1; // Monday
// const PROF_RAY_MEETING_START_MINS = 14 * 60;
// const PROF_RAY_MEETING_END_MINS = 15 * 60;
// const PROF_RAY_MEETING_DISPLAY = "Meeting with Prof. Ray to discuss the thesis";

// const SHORT_TERM_GOAL = `
// - Begin drafting the research motivation, challenges, and contributions of the thesis.
// - Milestone:
//   - Checkpoint 1: research motivation
//   - Checkpoint 2: research challenges
//   - Checkpoint 3: research contributions
// - Final deliverable: Installation manual by link.
// `;

// // ==== Util: Script Properties ====
// function getRequiredProperty(key) {
//   var value = PropertiesService.getScriptProperties().getProperty(key);
//   if (!value) {
//     Logger.log("ERROR: Script Property '" + key + "' is not set.");
//     throw new Error("Missing required Script Property: " + key);
//   }
//   return value;
// }
// function getOptionalProperty(key) {
//   return PropertiesService.getScriptProperties().getProperty(key);
// }

// // ==== Fetch All Notion Tasks from Multiple Databases ====
// function fetchNotionTasksFromAllDatabases(databaseIdList) {
//   let allTasks = [];
//   for (const dbId of databaseIdList) {
//     const tasks = fetchNotionTasksByDb(dbId);
//     allTasks = allTasks.concat(tasks);
//   }
//   return allTasks;
// }
// function fetchNotionTasksByDb(databaseId) {
//   const url = `https://api.notion.com/v1/databases/${databaseId}/query`;
//   const headers = {
//     "Authorization": `Bearer ${NOTION_TOKEN}`,
//     "Content-Type": "application/json",
//     "Notion-Version": "2022-06-28"
//   };
//   const requestBody = {
//     "filter": {
//       "and": [
//         { "property": "Status", "status": { "equals": "In progress" } },
//         { "property": "Assign", "people": { "contains": ASSIGNEE_UUID } }
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
//     if (data.results && Array.isArray(data.results)) {
//       return data.results.map(page => {
//         if (page.properties?.Name?.title && page.id) {
//           const title = page.properties.Name.title.map(part => part.text.content).join('');
//           const summary = page.properties.Summary?.rich_text?.length
//             ? page.properties.Summary.rich_text.map(part => part.text.content).join(' ')
//             : 'No summary';
//           const link = `https://ntust-bmwlab.notion.site/${page.id.replace(/-/g, '')}`;
//           return { title, summary, link };
//         } else {
//           return null;
//         }
//       }).filter(Boolean);
//     }
//     return [];
//   } catch (error) {
//     Logger.log(`Error in fetchNotionTasksByDb: ${error}`);
//     return [];
//   }
// }

// // ==== Utility: Time Slot conversion ====
// function minutesToHHMM(mins) {
//   const h = Math.floor(mins / 60);
//   const m = mins % 60;
//   return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
// }

// // ==== Generate the Daily Slots, Filling Periodic Events First ====
// function generateDailySlots(todayDayOfWeek) {
//   const slots = [];
//   const start = 9 * 60, end = 17 * 60;
//   const lunchStart = 12 * 60, lunchEnd = 13 * 60;
//   let t = start;
//   while (t < end) {
//     // Lunch
//     if (t === lunchStart) {
//       slots.push({ startMins: lunchStart, endMins: lunchEnd, display: "Lunch Break" });
//       t = lunchEnd; continue;
//     }
//     // Lab meeting (fix on the day)
//     if (todayDayOfWeek === LAB_MEETING_DAY && t === labMeetingStart) {
//       slots.push({ startMins: labMeetingStart, endMins: labMeetingEnd, display: "BMW lab meeting" });
//       t = labMeetingEnd; continue;
//     }
//     // Prof Ray meeting (Monday only)
//     if (todayDayOfWeek === PROF_RAY_MEETING_DAY && t === PROF_RAY_MEETING_START_MINS) {
//       slots.push({
//         startMins: PROF_RAY_MEETING_START_MINS,
//         endMins: PROF_RAY_MEETING_END_MINS,
//         display: PROF_RAY_MEETING_DISPLAY
//       });
//       t = PROF_RAY_MEETING_END_MINS; continue;
//     }
//     // You can add other periodic routines here (sports, laundry, ceremony, etc)
//     slots.push({ startMins: t, endMins: t + 60, display: null });
//     t += 60;
//   }
//   return slots;
// }

// // ==== Gemini LLM Call: All in ENGLISH and slot-based prompt ====
// function generatePlanViaGeminiAll(tasks, slots) {
//   if (!GEMINI_API_TOKEN) {
//     Logger.log("GEMINI_API_TOKEN not set, skipping Gemini call.");
//     return null;
//   }
//   const slotTemplate = slots.map(slot=>
//     `${minutesToHHMM(slot.startMins)}~${minutesToHHMM(slot.endMins)}${slot.display ? " " + slot.display : ""}`
//   ).join("\n");
//   const taskList = tasks.map(t => `Title: ${t.title}\nSummary: ${t.summary}\nLink: ${t.link}`).join("\n\n");

//   // --- English prompt, strict slot-by-slot output ----
//   const prompt = `
// You are an assistant who schedules highly specific 1-hour tasks for an engineering graduate student based on Notion tasks/notes. 
// Today's available time slots are listed in order (see below). 
// Some slots are already fixed for recurring events (meetings, lunch, routine events); their contents must be kept as is.
// You must assign the remaining open slots by distributing the provided Notion tasks/notes as concretely as possible without vague/general lines. 
// Each line must correspond to ONE slot in the given order, and the total lines must equal the number of slots.
// You may split a Notion task into several micro-actions across several hours, but each slot's content must differ and be actionable.
// If there are not enough Notion tasks to fill, leave the remaining slots BLANK (write just the time range).
// Prohibited: Adding extra slots, repeating the same content, using placeholder words like 'buffer', 'review', 'admin', or summarizing lines.
// Output only the lines, nothing else, and in the same line order as the time slots.

// Slot list:
// ${slotTemplate}

// Notion items (Title / Summary / Link):
// ${taskList}

// Now generate today's hourly plan lines in ENGLISH, one for each slot, in order. 
// Use the template:
// HH:MM~HH:MM Description → Link (if related to a Notion task)
// Or
// HH:MM~HH:MM [description of fixed event]
// Or
// HH:MM~HH:MM        (leave blank if no item to assign)
//         `.replace(/^\s+/gm, ''); // preserve indentation for prompt clarity

//   const GEMINI_MODEL = "gemini-2.5-flash";
//   const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_TOKEN}`;
//   const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
//   const options = { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true };

//   try {
//     const response = UrlFetchApp.fetch(url, options);
//     const json = JSON.parse(response.getContentText());
//     Logger.log("Gemini raw response: " + JSON.stringify(json).substring(0,1000));
//     const planText = json?.candidates?.[0]?.content?.parts?.[0]?.text || null;
//     return planText ? planText.trim() : null;
//   } catch (err) {
//     Logger.log("Error calling Gemini: " + err);
//     return null;
//   }
// }

// /** Fallback: deterministic microtask fill **/
// function buildMicroTasksFromNotion(tasks) {
//   const microTasks = [];
//   tasks.forEach(task => {
//     microTasks.push({ text: `Read and analyze introduction for "${task.title}" (part 1/3)`, link: task.link });
//     microTasks.push({ text: `Implement main logic for "${task.title}" (part 2/3)`, link: task.link });
//     microTasks.push({ text: `Write summary report for "${task.title}" (part 3/3)`, link: task.link });
//   });
//   return microTasks;
// }
// function assignMicroTasksToSlots(slots, tasks) {
//   const pool = buildMicroTasksFromNotion(tasks);
//   const assigned = [];
//   let poolIdx = 0;
//   for (let i = 0; i < slots.length; i++) {
//     const slot = slots[i];
//     if (slot.display) {
//       assigned.push({ time: `${minutesToHHMM(slot.startMins)}~${minutesToHHMM(slot.endMins)}`, desc: slot.display, link: null });
//       continue;
//     }
//     if (poolIdx >= pool.length) {
//       assigned.push({ time: `${minutesToHHMM(slot.startMins)}~${minutesToHHMM(slot.endMins)}`, desc: "", link: null });
//     } else {
//       const m = pool[poolIdx];
//       assigned.push({ time: `${minutesToHHMM(slot.startMins)}~${minutesToHHMM(slot.endMins)}`, desc: m.text, link: m.link });
//       poolIdx++;
//     }
//   }
//   // Avoid dup descs
//   const seen = {};
//   for (let i = 0; i < assigned.length; i++) {
//     const key = assigned[i].desc;
//     if (key && seen[key]) {
//       assigned[i].desc = key + " (continue/refine)";
//     } else if (key) {
//       seen[key] = true;
//     }
//   }
//   return assigned;
// }

// // ==== Compose the hourly plan: LLM then fallback ====
// function generateHourlyPlanAll(tasks, todayDayOfWeek) {
//   const slots = generateDailySlots(todayDayOfWeek);
//   const geminiRaw = generatePlanViaGeminiAll(tasks, slots);
//   if (geminiRaw) {
//     const lines = geminiRaw.split('\n').filter(l=>l.trim().match(/^\d{2}:\d{2}~\d{2}:\d{2}/));
//     if (lines.length === slots.length) {
//       Logger.log("Using Gemini plan (validated).");
//       return lines.join('\n');
//     }
//   }
//   const assignments = assignMicroTasksToSlots(slots, tasks);
//   const lines = assignments.map(a => a.link
//     ? `${a.time} ${a.desc} → ${a.link}`
//     : (a.desc ? `${a.time} ${a.desc}` : `${a.time}`)
//   );
//   return lines.join("\n");
// }

// // ==== Main autoTrello Scheduler ====
// function autoTrello() {
//   var today = new Date();
//   var formattedDate = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy/MM/dd');
//   var dayOfWeek = today.getDay();
//   var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
//   if (dayOfWeek === 0 || dayOfWeek === 6) {
//     Logger.log("Today is weekend, autoTrello does not execute.");
//     return;
//   }
//   var tasks = fetchNotionTasksFromAllDatabases(NOTION_DATABASE_IDS);
//   if (tasks.length === 0) {
//     Logger.log("No Notion tasks today. autoTrello ends.");
//     return;
//   }
//   var hourlyPlan = generateHourlyPlanAll(tasks, dayOfWeek);
//   var text = `
// **${formattedDate} (${dayNames[dayOfWeek]})**
// - ---
// - **Short-term goal:**
// \t${SHORT_TERM_GOAL}
// - **Daily Hourly Plan:**
// ${hourlyPlan}
// `;

//   try {
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
//     var res = UrlFetchApp.fetch(trelloUrl, options);
//     Logger.log("Trello API response: " + res.getResponseCode());
//     var jsonResponse = JSON.parse(res.getContentText());
//     var commentURL = TRELLO_COMMENT_BASE_URL + "#comment-" + jsonResponse.id;
//     if (SEND_MSG_URL) SEND_MSG(commentURL);
//     Logger.log("Generated Comment URL: " + commentURL);
//   } catch (error) {
//     Logger.log("Error in autoTrello: " + error);
//   }
// }

// // ==== Optionally: SEND_MSG Utility (ENABLED if SEND_MSG_URL set) ====
// function SEND_MSG(MsgStr) {
//   if (!SEND_MSG_URL) {
//     Logger.log("SEND_MSG_URL not set. Skipped.");
//     return;
//   }
//   try {
//     var encodedMsg = encodeURIComponent(MsgStr);
//     var url = SEND_MSG_URL + encodedMsg;
//     UrlFetchApp.fetch(url);
//     Logger.log("Message sent: " + MsgStr);
//   } catch (error) {
//     Logger.log("Error in SEND_MSG: " + error);
//   }
// }
