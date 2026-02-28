// DOM Elements
const elements = {
    settingsToggle: document.getElementById('settingsToggle'),
    settingsPanel: document.querySelector('.settings-outer'),
    apiToken: document.getElementById('apiToken'),
    targetFolder: document.getElementById('targetFolder'),
    syncInterval: document.getElementById('syncInterval'),
    methodCards: document.querySelectorAll('.method-card'),
    tagInputGroup: document.getElementById('tagInputGroup'),
    collectionInputGroup: document.getElementById('collectionInputGroup'),
    configValueTag: document.getElementById('configValueTag'),
    configValueCollection: document.getElementById('configValueCollection'),
    allInputGroup: document.getElementById('allInputGroup'),
    checkboxGroup: document.querySelector('.checkbox-group'), // Container for flatten option
    flattenImport: document.getElementById('flattenImport'),
    flattenHelpBtn: document.getElementById('flattenHelpBtn'),
    flattenTooltip: document.getElementById('flattenTooltip'),
    tokenHelpBtn: document.getElementById('tokenHelpBtn'),
    tokenTooltip: document.getElementById('tokenTooltip'),
    folderHelpBtn: document.getElementById('folderHelpBtn'),
    folderTooltip: document.getElementById('folderTooltip'),
    importBtn: document.getElementById('importBtn'),
    btnTitle: document.getElementById('btnTitle'),
    btnSubtitle: document.getElementById('btnSubtitle'),
    tokenStatus: document.getElementById('tokenStatus'),
    versionTag: document.getElementById('versionTag'),
    starCount: document.getElementById('starCount')
};

// Default State
const STATE = {
    apiToken: '',
    targetFolder: 'Imported from Raindrop',
    method: 'collection', // 'tag' or 'collection'
    tagValue: '',
    collectionValue: '',
    syncInterval: 720, // 0 = off, value in minutes (Default: 12 Hours)
    flattenImport: false // When true, imports all to single folder
};

// Load Settings
async function loadState() {
    try {
        const stored = await browser.storage.local.get(null);
        Object.assign(STATE, stored);

        // Apply to UI
        elements.apiToken.value = STATE.apiToken || '';
        elements.targetFolder.value = STATE.targetFolder || 'Imported from Raindrop';
        elements.configValueTag.value = STATE.tagValue || '';
        elements.configValueCollection.value = STATE.collectionValue || '';
        elements.syncInterval.value = STATE.syncInterval ?? 0;
        elements.flattenImport.checked = STATE.flattenImport || false;

        // Restore method selection
        selectMethod(STATE.method || 'collection');

        // Smart Settings Logic
        if (!STATE.apiToken) {
            elements.settingsPanel.classList.add('force-visible');
            elements.settingsToggle.classList.add('active'); // Sync button state
            elements.apiToken.classList.add('invalid'); // Highlight if empty

            // Show status message on first launch if empty
            elements.tokenStatus.textContent = '❌ Test Token is required';
            elements.tokenStatus.style.color = 'var(--error)';

            if (!elements.targetFolder.value.trim()) {
                elements.targetFolder.classList.add('invalid');
            }
        } else {
            validateToken(STATE.apiToken);
        }

        // Update Version ID and Changelog Link
        const manifest = browser.runtime.getManifest();
        const version = manifest.version;
        elements.versionTag.textContent = `v${version}`;
        elements.versionTag.href = `https://github.com/BXZ1/raindrop-sync-firefox/releases/tag/v${version}`;

        updateLastSyncDisplay(stored.lastSync);
        fetchGitHubStars();
    } catch (e) {
        console.error('Failed to load state', e);
    }
}

async function fetchGitHubStars() {
    const CACHE_KEY = 'github_stars_cache';
    const CACHE_TTL = 3600000; // 1 hour

    try {
        const cached = await browser.storage.local.get(CACHE_KEY);
        const now = Date.now();

        if (cached[CACHE_KEY] && (now - cached[CACHE_KEY].timestamp < CACHE_TTL)) {
            updateStarsUI(cached[CACHE_KEY].count);
            return;
        }

        const response = await fetch('https://api.github.com/repos/BXZ1/raindrop-sync-firefox');
        if (response.ok) {
            const data = await response.json();
            const count = data.stargazers_count;
            updateStarsUI(count);
            await browser.storage.local.set({
                [CACHE_KEY]: { count, timestamp: now }
            });
        }
    } catch (e) {
        console.error('Failed to fetch stars', e);
    }
}

function updateStarsUI(count) {
    if (elements.starCount && count !== undefined) {
        elements.starCount.textContent = count;
    }
}

// Helper: Debounce
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Helper: Time Ago Formatter
function timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "Just now";

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;

    const days = Math.floor(hours / 24);
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days} days ago`;

    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;

    const years = Math.floor(months / 12);
    return `${years} year${years !== 1 ? 's' : ''} ago`;
}

function updateLastSyncDisplay(timestamp) {
    STATE.lastSync = timestamp;
    if (elements.importBtn.classList.contains('loading') || elements.importBtn.classList.contains('error') || elements.importBtn.classList.contains('success')) {
        return;
    }
    if (!timestamp) {
        elements.btnSubtitle.textContent = 'Last Sync: Never';
        return;
    }
    const date = new Date(timestamp);
    const dateString = date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric'
    });
    const relativeTime = timeAgo(timestamp);
    elements.btnSubtitle.textContent = `Last Sync: ${dateString} (${relativeTime})`;
}

// Helper: Validate Token (Async API Check)
const validateToken = debounce(async (token) => {
    const statusEl = elements.tokenStatus;
    const input = elements.apiToken;

    if (!token) {
        statusEl.textContent = '❌ Test Token is required';
        statusEl.style.color = 'var(--error)';
        input.classList.add('invalid');
        input.classList.remove('valid');
        return;
    }

    if (token.length < 20) {
        statusEl.textContent = '❌ Invalid format (too short)';
        statusEl.style.color = 'var(--error)';
        input.classList.add('invalid');
        input.classList.remove('valid');
        return;
    }

    statusEl.textContent = '⏳ Verifying...';
    statusEl.style.color = 'var(--text-muted)';

    try {
        const response = await fetch('https://api.raindrop.io/rest/v1/user', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const user = data.item || data.user || {}; // API can vary slightly depending on scope
            const name = user.full_name || user.name || user.username || 'Raindrop User';
            statusEl.textContent = `✅ Connected as ${name}`;
            statusEl.style.color = 'var(--success)';
            input.classList.add('valid');
            input.classList.remove('invalid');
        } else {
            statusEl.textContent = '❌ Invalid Token';
            statusEl.style.color = 'var(--error)';
            input.classList.add('invalid');
            input.classList.remove('valid');
        }
    } catch (e) {
        statusEl.textContent = '⚠️ Connection error';
        statusEl.style.color = 'var(--text-muted)';
    }
}, 500);

// Method Selection Logic
function selectMethod(method) {
    STATE.method = method;

    // Update Cards
    elements.methodCards.forEach(card => {
        if (card.dataset.method === method) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });

    // Toggle Inputs
    if (method === 'tag') {
        elements.tagInputGroup.style.display = 'block';
        elements.collectionInputGroup.style.display = 'none';
        elements.allInputGroup.style.display = 'none';
        elements.checkboxGroup.style.display = 'flex'; // Only show for tags
    } else if (method === 'collection') {
        elements.tagInputGroup.style.display = 'none';
        elements.collectionInputGroup.style.display = 'block';
        elements.allInputGroup.style.display = 'none';
        elements.checkboxGroup.style.display = 'none'; // Hide for collections
    } else if (method === 'all') {
        elements.tagInputGroup.style.display = 'none';
        elements.collectionInputGroup.style.display = 'none';
        elements.allInputGroup.style.display = 'block';
        elements.checkboxGroup.style.display = 'flex'; // Show for all, to allow flattening structure
    }

    saveState(); // Persist selection immediately
}

// Save State to Storage
async function saveState() {
    STATE.apiToken = elements.apiToken.value.trim();
    STATE.targetFolder = elements.targetFolder.value.trim();
    STATE.tagValue = elements.configValueTag.value.trim();
    STATE.collectionValue = elements.configValueCollection.value.trim();
    STATE.syncInterval = parseInt(elements.syncInterval.value, 10);
    STATE.flattenImport = elements.flattenImport.checked;

    await browser.storage.local.set(STATE);
}

// Status Feedback Helper
function showStatus(type, text, autoHide = false) {
    const btn = elements.importBtn;
    const subtitle = elements.btnSubtitle;

    btn.classList.remove('loading', 'error', 'success');
    if (type) btn.classList.add(type);

    if (type === 'loading') {
        subtitle.innerHTML = `<div class="spinner-small"></div><span>${text}</span>`;
    } else if (type === 'success') {
        subtitle.innerHTML = `<span>✨ ${text}</span>`;
    } else if (type === 'error') {
        subtitle.innerHTML = `<span>⚠️ ${text}</span>`;
    } else {
        subtitle.textContent = text;
    }

    if (autoHide) {
        setTimeout(() => {
            btn.classList.remove(type);
            updateLastSyncDisplay(STATE.lastSync);
        }, 5000); // Revert back to last sync after 5 seconds
    }
}

// Event Listeners
elements.settingsToggle.addEventListener('click', () => {
    // If it's forced visible, the first toggle should hide it
    if (elements.settingsPanel.classList.contains('force-visible')) {
        elements.settingsPanel.classList.remove('force-visible');
        elements.settingsPanel.classList.remove('active');
        elements.settingsToggle.classList.remove('active');
    } else {
        const isActive = elements.settingsPanel.classList.toggle('active');
        elements.settingsToggle.classList.toggle('active', isActive);
    }
});

// Auto-Save Logic
const handleInput = debounce(async () => {
    await saveState();
    // Optional: show a tiny 'saved' indicator if needed, but keeping it clean for now
}, 250);

// Attach listeners to all inputs
[elements.apiToken, elements.targetFolder, elements.configValueTag, elements.configValueCollection].forEach(input => {
    if (!input) return;
    input.addEventListener('input', (e) => {
        handleInput();
        if (e.target === elements.apiToken) {
            validateToken(e.target.value.trim());
        }
        // Highlight folder if empty
        if (e.target === elements.targetFolder) {
            e.target.classList.toggle('invalid', !e.target.value.trim());
        }
    });
});

// Auto-fill folder if left empty
elements.targetFolder.addEventListener('blur', () => {
    if (!elements.targetFolder.value.trim()) {
        elements.targetFolder.value = 'Imported from Raindrop';
        elements.targetFolder.classList.remove('invalid');
        saveState();
    }
});

// Sync Interval Listener
elements.syncInterval.addEventListener('change', async () => {
    await saveState();
    // Notify background to update alarm overlap
    browser.runtime.sendMessage({
        command: 'update_alarm',
        interval: parseInt(elements.syncInterval.value, 10)
    });
});

elements.methodCards.forEach(card => {
    card.addEventListener('click', () => selectMethod(card.dataset.method));
});

// Flatten checkbox auto-save
elements.flattenImport.addEventListener('change', () => saveState());

// Helper: Close all tooltips
function closeAllTooltips() {
    [
        elements.flattenTooltip,
        elements.tokenTooltip,
        elements.folderTooltip
    ].forEach(el => {
        if (el) el.classList.remove('visible');
    });
}

// Tooltip toggle logic
[
    { btn: elements.flattenHelpBtn, tip: elements.flattenTooltip },
    { btn: elements.tokenHelpBtn, tip: elements.tokenTooltip },
    { btn: elements.folderHelpBtn, tip: elements.folderTooltip }
].forEach(item => {
    if (item.btn && item.tip) {
        item.btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = item.tip.classList.contains('visible');
            closeAllTooltips();
            if (!isVisible) item.tip.classList.add('visible');
        });
    }
});

// Close tooltips when clicking outside
document.addEventListener('click', (e) => {
    const isHelpBtn = [
        elements.flattenHelpBtn,
        elements.tokenHelpBtn,
        elements.folderHelpBtn
    ].some(btn => btn && btn.contains(e.target));

    const isTooltip = [
        elements.flattenTooltip,
        elements.tokenTooltip,
        elements.folderTooltip
    ].some(tip => tip && tip.contains(e.target));

    if (!isHelpBtn && !isTooltip) {
        closeAllTooltips();
    }
});

elements.importBtn.addEventListener('click', async () => {
    // 1. Validate
    if (!elements.apiToken.value.trim()) {
        elements.settingsPanel.classList.add('force-visible');
        elements.apiToken.focus();
        showStatus('error', 'Please enter your Raindrop Test Token.', true);
        return;
    }

    if (elements.apiToken.classList.contains('invalid')) {
        elements.settingsPanel.classList.add('force-visible');
        elements.apiToken.focus();
        showStatus('error', 'Please provide a valid Test Token first.', true);
        return;
    }

    // 1.5 Ensure folder is not empty
    if (!elements.targetFolder.value.trim()) {
        elements.targetFolder.value = 'Imported from Raindrop';
    }

    // 2. Prepare Data
    await saveState(); // Ensure latest is saved
    // Fix: Trim configValue before validation to match saveState behavior
    const configValue = (STATE.method === 'tag' ? STATE.tagValue : STATE.collectionValue)?.trim();

    if (STATE.method !== 'all' && !configValue) {
        showStatus('error', `Please enter at least one ${STATE.method === 'tag' ? 'tag' : 'collection'}.`, true);
        return;
    }

    // 3. UI Loading State
    elements.importBtn.disabled = true;
    elements.btnTitle.textContent = 'Syncing...';
    showStatus('loading', 'Fetching bookmarks from Raindrop...');

    // 4. Send to Background
    try {
        const response = await browser.runtime.sendMessage({
            command: 'import_bookmarks',
            settings: {
                apiToken: STATE.apiToken,
                targetFolder: STATE.targetFolder,
                mode: STATE.method, // 'tag' or 'collection'
                configValue: configValue,     // The tag name(s) or collection name(s)
                flattenImport: STATE.flattenImport // Whether to flatten into single folder
            }
        });

        // Fix: Validate response exists before accessing properties
        if (response && response.success) {
            updateLastSyncDisplay(Date.now());
            showStatus('success', `Done! Imported ${response.count} bookmarks.`, true);
        } else {
            const errorMsg = response?.error || 'Unknown error occurred';
            showStatus('error', `Sync Failed: ${errorMsg}`, true);
        }
    } catch (e) {
        showStatus('error', `Error: ${e.message || 'Failed to communicate with background script'}`, true);
    } finally {
        elements.importBtn.disabled = false;
        elements.btnTitle.textContent = 'Sync Now';
    }
});

// Initialize
loadState();

// Listen for progress updates from background
browser.runtime.onMessage.addListener((msg) => {
    if (msg.command === 'sync_progress' && elements.importBtn.classList.contains('loading')) {
        const text = `Syncing... ${msg.percent}%`;
        elements.btnSubtitle.innerHTML = `<div class="spinner-small"></div><span>${text}</span>`;
    }
});