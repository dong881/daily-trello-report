// ==========================================
// ====    RECOVERY FUNCTIONS (補救專用)    ====
// ==========================================

/**
 * 補救函數 1：自動補足 5/2 ~ 5/22 的日報 (Issue #374 & Trello)
 * 根據近期的 commit/notes 一次性生成並填補這段時間的每日計畫。
 */
function recoverDailyUpdates() {
  // 設定補救的時間區間 (系統預設年份為 2026，若不同請自行修改年份)
  const startDate = new Date('2026/05/06');
  const endDate = new Date('2026/05/22');
  
  Logger.log(">>> 開始執行日報補救...");
  
  // 一次性抓取過去 25 天的筆記，供 Gemini 參考生成計畫 (覆蓋補救期間)
  let tasks = fetchTasksFromNoteAPI(25, 'all'); 
  if (tasks.length === 0) {
    Logger.log("❌ 找不到近期的 API tasks，無法進行補救。");
    return;
  }
  
  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    let dayOfWeek = currentDate.getDay();
    
    // 跳過週末 (0: Sunday, 6: Saturday)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      Logger.log(`處理補救日期: ${Utilities.formatDate(currentDate, Session.getScriptTimeZone(), 'yyyy/MM/dd')}`);
      
      // 執行單日補救邏輯
      processSingleRecoveryDay(new Date(currentDate), tasks);
      
      // 避免短時間內對 Gemini/GitHub/Trello 發送過多請求而被擋 (延遲 5 秒)
      Utilities.sleep(5000); 
    }
    
    // 天數加 1
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  Logger.log(">>> 補救日報執行完畢！");
}

/**
 * 單日補救邏輯 (抽離自 mainDailyUpdate，專供 recoverDailyUpdates 呼叫)
 */
function processSingleRecoveryDay(targetDate, tasks) {
  var formattedDate = Utilities.formatDate(targetDate, Session.getScriptTimeZone(), 'yyyy/MM/dd');
  var dayOfWeek = targetDate.getDay();
  var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // 根據指定目標日期生成 Plan
  var hourlyPlan = generateHourlyPlanAll(tasks, targetDate); 
  if (!hourlyPlan || hourlyPlan.length < 5) {
    Logger.log(`❌ ${formattedDate} 無法產生有效的 Plan，跳過。`);
    return;
  }

  var finalText = `
**${formattedDate} (${dayNames[dayOfWeek]})**
- ---
- **Short-term goal:**
\t${SHORT_TERM_GOAL}
- **Daily Hourly Plan:**
${hourlyPlan}
`;

  // 補救只推送到日報 (Issue #374) 和 Trello
  postToGitHubIssue(MAIN_PROGRESS_ISSUE_ID, finalText);
  sendToTrello(finalText);
}

/**
 * 補救函數 2：獨立自動補上 Meeting Page 連結 (Issue #10)
 * 跳過建立頁面（因為已存在），直接尋找 5/2 ~ 5/22 間的 meeting day 填入連結。
 */
function recoverMeetingSync() {
  const startDate = new Date('2026/05/02');
  const endDate = new Date('2026/05/22');
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  Logger.log(">>> 開始執行 Meeting Links 補救 (Issue #10)...");

  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    let dayOfWeek = currentDate.getDay();
    
    // 只有 PROF_RAY_MEETING_DAY (2 = Tuesday) 才會觸發
    if (dayOfWeek === PROF_RAY_MEETING_DAY) {
      var formattedDate = Utilities.formatDate(currentDate, Session.getScriptTimeZone(), 'yyyy/MM/dd');
      const weekNum = getWeekNumber(currentDate);
      const yyyymmddForLink = Utilities.formatDate(currentDate, Session.getScriptTimeZone(), 'yyyyMMdd');
      
      // 依照你的架構組裝既有的頁面連結
      const meetingFullUrl = `${GITHUB_THESIS_REPO_URL}${MEETING_MINUTES_PATH}week${weekNum}-${yyyymmddForLink}.md`;
      const issue10Content = `## Week ${weekNum} (${formattedDate}-${dayNames[dayOfWeek]}) Meeting minute\n\n -> ${meetingFullUrl}`;

      Logger.log(`補推 Meeting Link: ${formattedDate} (Week ${weekNum})`);
      postToGitHubIssue(THESIS_LOG_ISSUE_ID, issue10Content);
      
      // 延遲 3 秒避免 GitHub API Rate Limit
      Utilities.sleep(3000);
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  Logger.log(">>> Meeting Links 補救完畢！");
}