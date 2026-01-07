// /*********************************
//  * Multi-API + Smart Linking + Graduate Student Logic
//  * Language: Apps Script (GAS JavaScript)
//  * Version: 8.0 (Unified Date + Debug Log + Clean URL)
//  *********************************/

// // ==== Script Properties ====
// const TRELLO_API_KEY          = getRequiredProperty("TRELLO_API_KEY").replace(/\s/g, '').trim();
// const TRELLO_API_TOKEN        = getRequiredProperty("TRELLO_API_TOKEN").replace(/\s/g, '').trim();
// const TRELLO_COMMENT_BASE_URL = getRequiredProperty("TRELLO_COMMENT_BASE_URL").trim();
// const GEMINI_API_TOKEN        = getRequiredProperty("GEMINI_API_KEY").trim();
// const SEND_MSG_URL            = getOptionalProperty("SEND_MSG_URL");
// const MING_NOTE_API_BASE      = "https://ming-note.vercel.app/api/daily-report";

// // ==== GitHub Configuration for Future Notes ====
// const GITHUB_REPO_URL         = "https://github.com/bmw-ece-ntust/ming-note/blob/ming-v1.0.0/";
// const MEETING_MINUTES_PATH    = "notes/Meeting-Minutes/";

// // ==== Periodic Meeting/Slot Config ====
// const LAB_MEETING_DAY     = 3; // Wednesday
// const LAB_MEETING_START   = "09:00";
// const LAB_MEETING_END     = "11:00";
// const labMeetingStart     = 9 * 60;
// const labMeetingEnd       = 11 * 60;

// // Bi-weekly Logic: 1 = Odd Weeks, 0 = Even Weeks
// const LAB_MEETING_WEEK_PARITY = 0; 

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

// // ==== Util: Date Helper for Bi-weekly Logic ====
// function getWeekNumber(d) {
//   // Clone date to avoid mutating the unified date object
//   d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
//   d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
//   var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
//   var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
//   return weekNo;
// }

// // ==== Util: GitHub Slugify ====
// function githubSlugify(text) {
//   if (!text) return "";
//   return text.toLowerCase()
//     .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') 
//     .replace(/[^a-z0-9 -]/g, '') 
//     .trim()
//     .replace(/\s+/g, '-');
// }

// // ==== Util: String Normalizer ====
// function normalizeString(str) {
//   return str.toLowerCase().replace(/[^a-z0-9]/g, '');
// }

// // ==== Fetch Daily Report Notes from API ====
// function fetchTasksFromNoteAPI(days = 3, status = "all", tags = null) {
//   let url = `${MING_NOTE_API_BASE}?days=${days}`;
//   if (status !== 'all') url += `&status=${status}`;
//   if (tags && tags.length) url += `&tags=${encodeURIComponent(tags.join(','))}`;
//   try {
//     let response = UrlFetchApp.fetch(url);
//     let data = JSON.parse(response.getContentText());
//     if (data.success && Array.isArray(data.data)) {
//       const emojiRegex = /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g;

//       return data.data
//         .filter(note => !(note.note && note.note.startsWith("notes/Meeting-Minutes/")))
//         .map(note => {
//           let base = {
//             title: note.noteName || "",
//             summary: note.metadata.summary || "No summary",
//             link: note.noteLink || "",
//             sections: note.sections || [],
//             tags: note.metadata.tags || [] 
//           };
//           if (base.sections.length) {
//             base.sections = base.sections.map(s => {
//               let cleanedLink = s.link || base.link;
//               if (cleanedLink) {
//                 cleanedLink = cleanedLink.replace(emojiRegex, '').replace(/#-/g, '#');
//               }
//               return { title: s.title || "", link: cleanedLink };
//             });
//           }
//           return base;
//         });
//     }
//     return [];
//   } catch (error) {
//     Logger.log("Error in fetchTasksFromNoteAPI: " + error);
//     return [];
//   }
// }

// // ==== Slot Utility ====
// function minutesToHHMM(mins) {
//   const h = Math.floor(mins / 60);
//   const m = mins % 60;
//   return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
// }

// // ==== Daily Slots (Even Weeks Logic) ====
// function generateDailySlots(today) {
//   const dayOfWeek = today.getDay();
//   const slots = [];
//   const start = 9 * 60, end = 17 * 60;
//   const lunchStart = 12 * 60, lunchEnd = 13 * 60;
  
//   const currentWeekNum = getWeekNumber(today);
//   const isLabMeetingWeek = (currentWeekNum % 2 === LAB_MEETING_WEEK_PARITY);

//   Logger.log(`[Slot Gen] Week: ${currentWeekNum}, Lab Meeting: ${isLabMeetingWeek}`);

//   let t = start;
//   while (t < end) {
//     if (t === lunchStart) {
//       slots.push({ startMins: lunchStart, endMins: lunchEnd, display: "Lunch Break" });
//       t = lunchEnd; continue;
//     }
//     if (dayOfWeek === LAB_MEETING_DAY && t === labMeetingStart) {
//       if (isLabMeetingWeek) {
//         slots.push({ startMins: labMeetingStart, endMins: labMeetingEnd, display: "BMW lab meeting" });
//         t = labMeetingEnd; continue;
//       }
//     }
//     if (dayOfWeek === PROF_RAY_MEETING_DAY && t === PROF_RAY_MEETING_START_MINS) {
//       slots.push({
//         startMins: PROF_RAY_MEETING_START_MINS,
//         endMins: PROF_RAY_MEETING_END_MINS,
//         display: PROF_RAY_MEETING_DISPLAY
//       });
//       t = PROF_RAY_MEETING_END_MINS; continue;
//     }
//     slots.push({ startMins: t, endMins: t + 60, display: null });
//     t += 60;
//   }
//   return slots;
// }

// // ==== Fallback Logic ====
// function buildMicroTasksFromAPI(notes) {
//   let microTasks = [];
//   notes.forEach(note => {
//     if (note.sections && note.sections.length > 0) {
//       note.sections.forEach(section => {
//         microTasks.push({
//           text: `[Update] ${section.title} (${note.title})`,
//           link: section.link,
//           match: [section.title, note.title]
//         });
//       });
//     } else {
//       microTasks.push({
//         text: `[Read] ${note.title}`,
//         link: note.link,
//         match: [note.title]
//       });
//     }
//   });
//   return microTasks;
// }

// // ==== Link Matching Logic V3 ====
// function attachRelevantLink(planText, notes, today) {
//   // 1. Prepare candidates
//   let candidates = [];
//   notes.forEach(note => {
//     if (note.title && note.link) {
//       candidates.push({ title: note.title, link: note.link, isSection: false });
//     }
//     if (note.sections && note.sections.length) {
//       note.sections.forEach(sec => {
//         if (sec.title) {
//           let deepLink = sec.link; 
//           if (!deepLink) {
//              deepLink = note.link + "#" + githubSlugify(sec.title);
//           }
//           candidates.push({ title: sec.title, link: deepLink, isSection: true });
//         }
//       });
//     }
//   });

//   candidates.sort((a, b) => b.title.length - a.title.length);

//   return planText.split('\n').map(line => {
//     let trimmedLine = line.trim();
//     if (!trimmedLine.match(/^\d{2}:\d{2}~\d{2}:\d{2}/)) return line;
//     if (trimmedLine.match(/\[.*?\]\(.*?\)/)) return line; 

//     // Future Note Logic
//     if (trimmedLine.includes("Prof. Ray") || trimmedLine.includes(PROF_RAY_MEETING_DISPLAY)) {
//       const weekNum = getWeekNumber(today); // Use unified date
//       const yyyymmdd = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyyMMdd');
//       const futureLink = `${GITHUB_REPO_URL}${MEETING_MINUTES_PATH}week${weekNum}-${yyyymmdd}.md`;
//       return `${trimmedLine} [Link](${futureLink})`;
//     }
    
//     // Fuzzy Matching
//     const normalizedLine = normalizeString(trimmedLine);
//     for (let cand of candidates) {
//       const normalizedTitle = normalizeString(cand.title);
//       if (cand.title.length > 3 && normalizedLine.includes(normalizedTitle)) {
//         return `${trimmedLine} [Link](${cand.link})`;
//       }
//     }
//     return line;
//   }).join('\n');
// }


// // ==== CORE: Generate Plan via Gemini ====
// function generatePlanViaGeminiAll(tasks, slots) {
//   if (!GEMINI_API_TOKEN) return null;
  
//   const slotTemplate = slots.map((slot, index) =>
//     `Slot ${index + 1}: ${minutesToHHMM(slot.startMins)}~${minutesToHHMM(slot.endMins)}${slot.display ? " (FIXED_EVENT: " + slot.display + ")" : " (EMPTY)"}`
//   ).join("\n");

//   const taskList = tasks.map(t => {
//     let noteInfo = `[Note] Title: ${t.title} | Tags: ${t.tags.join(", ")} | Summary: ${t.summary}`;
//     if (t.sections && t.sections.length > 0) {
//       const sectionList = t.sections.map(s => `  - Sub-topic: "${s.title}"`).join("\n");
//       noteInfo += `\n${sectionList}`;
//     }
//     return noteInfo;
//   }).join("\n\n");

//   const prompt = `
// You are a daily scheduler.

// **INSTRUCTIONS:**
// 1. Fill exactly ${slots.length} time slots based on the "Time Slots" list below.
// 2. **Fixed Events:** If a slot says "(FIXED_EVENT: X)", output "HH:MM~HH:MM X" (Do NOT include the word FIXED or parentheses).
// 3. **Empty Slots:** Fill with a task from "Task List".
// 4. **Action Tags:** Use [Update], [Refactor], [Analyze], [Debug], [Implement], [Optimize], [Plan]. Avoid [Review].
// 5. **Wording:** Use the **EXACT** Note Title or Sub-topic Title in your output to ensure linking works.

// **Time Slots:**
// ${slotTemplate}

// **Task List:**
// ${taskList}

// **OUTPUT (Exactly ${slots.length} lines):**
//   `.replace(/^\s+/gm, '');

//   const modelsToTry = ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.5-flash-lite"];

//   for (let model of modelsToTry) {
//     Logger.log(`Attempting to generate plan using model: ${model}...`);
//     let result = callGeminiAPI(model, prompt);
//     if (result) {
//       const lineCount = result.split('\n').filter(l => l.match(/^\d{2}:\d{2}/)).length;
//       if (lineCount >= slots.length) {
//          Logger.log(`Success with ${model}. Generated ${lineCount} lines.`);
//          return result;
//       }
//     }
//     Utilities.sleep(1000); 
//   }
//   return null;
// }

// function callGeminiAPI(modelName, promptText) {
//   const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_TOKEN}`;
//   const payload = { 
//     contents: [{ role: "user", parts: [{ text: promptText }] }],
//     safetySettings: [
//       { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
//       { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
//       { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
//       { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
//     ],
//     generationConfig: { temperature: 0.6, maxOutputTokens: 8192 }
//   };
//   const options = { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true };
//   try {
//     const response = UrlFetchApp.fetch(url, options);
//     const json = JSON.parse(response.getContentText());
//     if (json.error) return null;
//     return json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
//   } catch (err) {
//     return null;
//   }
// }

// // ==== Main Generation Flow ====
// function generateHourlyPlanAll(tasks, today) {
//   const slots = generateDailySlots(today);
//   let planRaw = generatePlanViaGeminiAll(tasks, slots);
//   let planLines = [];
  
//   if (planRaw) {
//     let cleanRaw = planRaw.replace(/\*\*/g, "").replace(/```/g, "").trim();
//     planLines = cleanRaw.split('\n').map(l => l.trim()).filter(l => l.match(/^\d{2}:\d{2}~\d{2}:\d{2}/)); 
//   }
  
//   let finalPlanLines = [];
//   if (planLines.length === slots.length) {
//     // Pass 'today' for future note calculation
//     const linkedText = attachRelevantLink(planLines.join('\n'), tasks, today); 
//     finalPlanLines = linkedText.split('\n');
//   } else {
//     finalPlanLines = assignMicroTasksToSlots(slots, tasks);
//   }
//   return finalPlanLines.map(line => `\t- ${line}`).join('\n');
// }

// // ==== Main Execution Function ====
// function autoTrello() {
//   // UNIFIED DATE: Call new Date() once here and pass it down
//   const today = new Date(); 
  
//   var formattedDate = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy/MM/dd');
//   var dayOfWeek = today.getDay();
//   var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
//   if (dayOfWeek === 0 || dayOfWeek === 6) { Logger.log("Weekend, skipping."); return; }

//   let daysToFetch = 3; 
//   const maxFetchDays = 10;
//   var tasks = [];
//   while (tasks.length === 0 && daysToFetch <= maxFetchDays) {
//     tasks = fetchTasksFromNoteAPI(daysToFetch, 'all'); 
//     if (tasks.length === 0) daysToFetch++;
//   }
//   if (tasks.length === 0) return;
  
//   // Pass 'today' to generation logic
//   var hourlyPlan = generateHourlyPlanAll(tasks, today); 
//   if (!hourlyPlan || hourlyPlan.length < 5) return;

//   var text = `
// **${formattedDate} (${dayNames[dayOfWeek]})**
// - ---
// - **Short-term goal:**
// \t${SHORT_TERM_GOAL}
// - **Daily Hourly Plan:**
// ${hourlyPlan}
// `;

//   // **DEBUG LOG: Print final message**
//   Logger.log("=== FINAL TRELLO MSG ===\n" + text);

//   try {
//     var safeKey = TRELLO_API_KEY.replace(/[^a-zA-Z0-9]/g, "");
//     var safeToken = TRELLO_API_TOKEN.replace(/[^a-zA-Z0-9]/g, "");
    
//     // **FIXED URL**: Pure string
//     var trelloUrl = 'https://api.trello.com/1/cards/CIIouy8k/actions/comments?key=' + safeKey + '&token=' + safeToken;

//     var options = { method: 'post', contentType: 'application/json', payload: JSON.stringify({text: text}), headers: { 'Accept': 'application/json' } };
//     var res = UrlFetchApp.fetch(trelloUrl, options);
//     Logger.log("Trello Response: " + res.getResponseCode());
//     var jsonResponse = JSON.parse(res.getContentText());
//     Logger.log("Comment URL: " + TRELLO_COMMENT_BASE_URL + "#comment-" + jsonResponse.id);
//   } catch (error) {
//     Logger.log("Error in autoTrello: " + error);
//   }
// }

// function assignMicroTasksToSlots(slots, notes) { return slots.map(s => s.display ? `${minutesToHHMM(s.startMins)}~${minutesToHHMM(s.endMins)} ${s.display}` : `${minutesToHHMM(s.startMins)}~${minutesToHHMM(s.endMins)}`); }