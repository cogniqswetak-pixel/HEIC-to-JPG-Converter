// Background Service Worker for HEIC to JPG Converter Extension
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('app.html')
  });
});
