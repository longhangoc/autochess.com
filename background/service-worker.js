/**
 * Service Worker - Quản lý settings cho extension
 */

const DEFAULT_SETTINGS = {
    autoPlayEnabled: true,
    autoAnalyzeEnabled: true,
    autoDepthEnabled: true,
    autoQueueEnabled: false,
    autoQueueMode: 'same',
    depth: 12,
    variants: 5,
    thinkingTime: 50,
    highlightEnabled: true,
    arrowsEnabled: true,
    soundEnabled: false,
    humanErrorRate: 10 // 0-20%
};

chrome.runtime.onInstalled.addListener(() => {
    console.log('[Extension] Installed');
    chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
});

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    switch (req.action) {
        case 'getSettings':
            chrome.storage.local.get(['settings'], r => {
                sendResponse({ success: true, settings: r.settings || DEFAULT_SETTINGS });
            });
            return true;

        case 'updateSettings':
        case 'saveSettings':
            chrome.storage.local.get(['settings'], r => {
                const updated = { ...r.settings || DEFAULT_SETTINGS, ...req.settings };
                chrome.storage.local.set({ settings: updated }, () => {
                    console.log('[SW] Settings updated');
                    sendResponse({ success: true, settings: updated });
                });
            });
            return true;

        case 'logError':
            console.error('[Extension]:', req.error);
            sendResponse({ success: true });
            break;

        default:
            sendResponse({ success: false, error: 'Unknown action' });
    }
});
