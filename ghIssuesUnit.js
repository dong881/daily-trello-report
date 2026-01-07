// const GITHUB_API_TOKEN        = getRequiredProperty("GITHUB_API_TOKEN").trim();
// // ==== GitHub Issue Automation Config (New for Progress Plan) ====
// // 針對您指定的 Repo: https://github.com/bmw-ece-ntust/progress-plan
// const GITHUB_OWNER            = "bmw-ece-ntust";
// const GITHUB_REPO_NAME        = "progress-plan"; // API 只需要名稱，不需要完整網址
// const TARGET_ISSUE_NUMBER     = "374";
// /**
//  * 將訊息發佈到 GitHub Repository 的指定 Issue
//  */
// function addCommentToIssue() {
//   const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO_NAME}/issues/${TARGET_ISSUE_NUMBER}/comments`;
  
//   const payload = {
//     'body': 'Update: Commit message / Log added via GAS.'
//   };

//   const options = {
//     'method': 'post',
//     'contentType': 'application/json',
//     'headers': {
//       'Authorization': 'Bearer ' + GITHUB_API_TOKEN, // 使用全域變數
//       'Accept': 'application/vnd.github.v3+json'
//     },
//     'payload': JSON.stringify(payload)
//   };
  
//   try {
//     // 發送請求
//     const response = UrlFetchApp.fetch(url, options);
//     const responseCode = response.getResponseCode();
//     const responseBody = JSON.parse(response.getContentText());

//     if (responseCode === 201) {
//       Logger.log('✅ 成功！留言已新增。');
//       Logger.log('留言連結: ' + responseBody.html_url);
//     } else {
//       Logger.log('❌ 失敗。錯誤代碼: ' + responseCode);
//       Logger.log('錯誤訊息: ' + responseBody.message);
      
//       if (responseCode === 404) {
//         Logger.log('可能原因：找不到 Repo 或 Issue，或者是 Token 權限不足 (Private Repo 需要勾選 repo 權限)。');
//       }
//     }

//   } catch (e) {
//     Logger.log('發生例外錯誤: ' + e.toString());
//   }
// }