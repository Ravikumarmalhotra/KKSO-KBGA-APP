function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    
    // ✅ Use lock to prevent race conditions
    var lock = LockService.getScriptLock();
    lock.tryLock(10000);
    
    var ss = SpreadsheetApp.openById(data.spreadsheetId);
    var sheet = ss.getSheetByName(data.sheetName);
    
    if (!sheet) {
      return jsonResponse({success: false, error: "Sheet not found"});
    }
    
    // PASSWORD CHANGE
    if (data.action === 'changePassword') {
      sheet.getRange(data.row, 2).setValue(data.newPassword);
      SpreadsheetApp.flush(); // ✅ Force write immediately
      lock.releaseLock();
      return jsonResponse({success: true, message: "Password changed"});
    }
    
    // INBOX STATUS UPDATE
    if (data.action === 'updateInboxStatus') {
      sheet.getRange(data.row, 8).setValue(data.status);
      SpreadsheetApp.flush();
      lock.releaseLock();
      return jsonResponse({success: true, message: "Status updated"});
    }
    
    // DATA ENTRY - ✅ OPTIMIZED
    // Use getLastRow() instead of scanning entire column
    var lastRow = sheet.getLastRow();
    var newRow = lastRow + 1;
    
    // ✅ If you need to find first empty in column K specifically:
    var colKData = sheet.getRange(1, 11, lastRow, 1).getValues();
    for (var i = 0; i < colKData.length; i++) {
      if (colKData[i][0] === "" || colKData[i][0] === null) {
        newRow = i + 1;
        break;
      }
    }
    
    // ✅ BATCH WRITE - Single call instead of loop
    if (data.data.length > 0) {
      sheet.getRange(newRow, 11, 1, data.data.length)
           .setValues([data.data]);  // One call instead of N calls!
    }
    
    SpreadsheetApp.flush();
    lock.releaseLock();
    return jsonResponse({success: true, row: newRow});
    
  } catch(err) {
    return jsonResponse({success: false, error: err.toString()});
  }
}

// ✅ Helper function to reduce repetition
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return ContentService.createTextOutput("Apps Script is working!");
}
