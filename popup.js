// DOM Elements
const elements = {
    settingsToggle: document.getElementById('settingsToggle'),
    settingsPanel: document.getElementById('settingsPanel'),
    apiToken: document.getElementById('apiToken'),
    targetFolder: document.getElementById('targetFolder'),
    syncInterval: document.getElementById('syncInterval'),
    methodCards: document.querySelectorAll('.method-card'),
    tagInputGroup: document.getElementById('tagInputGroup'),
    collectionInputGroup: document.getElementById('collectionInputGroup'),
    configValueTag: document.getElementById('configValueTag'),
    configValueCollection: document.getElementById('configValueCollection'),
    checkboxGroup: document.querySelector('.checkbox-group'), // Container for flatten option
    flattenImport: document.getElementById('flattenImport'),
    flattenHelpBtn: document.getElementById('flattenHelpBtn'),
    flattenTooltip: document.getElementById('flattenTooltip'),
    importBtn: document.getElementById('importBtn'),
    statusMsg: document.getElementById('statusMsg'),
    lastSyncMsg: document.getElementById('lastSyncMsg'),
    tokenStatus: document.getElementById('tokenStatus'),
    versionTag: document.getElementById('versionTag'),
    starCount: document.getElementById('starCount')
};

// Default State
const STATE = {
    apiToken: '',
    targetFolder: 'Imported from Raindrop',
    method: 'collection', // 'tag' or 'collection'
    tagValue: 'firefox',
    collectionValue: 'Bookmarks',
    syncInterval: 1440, // 0 = off, value in minutes
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
        elements.configValueTag.value = STATE.tagValue || 'firefox';
        elements.configValueCollection.value = STATE.collectionValue || 'Bookmarks';
        elements.syncInterval.value = STATE.syncInterval || 0;
        elements.flattenImport.checked = STATE.flattenImport || false;

        // Restore method selection
        selectMethod(STATE.method || 'collection');

        // Smart Settings Logic
        if (!STATE.apiToken) {
            elements.settingsPanel.classList.add('force-visible');
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
    if (!timestamp) {
        elements.lastSyncMsg.textContent = 'Last Sync: Never';
        return;
    }
    const date = new Date(timestamp);
    const relativeTime = timeAgo(timestamp);
    const dateString = date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric'
    });
    elements.lastSyncMsg.textContent = `Last Sync: ${dateString} (${relativeTime})`;
}

// Helper: Validate Token (Async API Check)
const validateToken = debounce(async (token) => {
    const statusEl = elements.tokenStatus;
    const input = elements.apiToken;

    if (!token) {
        statusEl.textContent = '';
        input.classList.remove('valid', 'invalid');
        return;
    }

    if (token.length < 20) {
        statusEl.textContent = '❌ Token too short';
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
        elements.checkboxGroup.style.display = 'flex'; // Only show for tags
    } else {
        elements.tagInputGroup.style.display = 'none';
        elements.collectionInputGroup.style.display = 'block';
        elements.checkboxGroup.style.display = 'none'; // Hide for collections
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
    const el = elements.statusMsg;
    el.className = `status-msg ${type}`;
    el.querySelector('.status-text').textContent = text;

    const icon = el.querySelector('.status-icon');
    if (type === 'loading') {
        icon.innerHTML = '<div class="spinner"></div>';
    } else if (type === 'success') {
        icon.textContent = '✅';
    } else {
        icon.textContent = '❌';
    }

    if (autoHide) {
        setTimeout(() => el.classList.add('hidden'), 3000);
    }
}

// Event Listeners
elements.settingsToggle.addEventListener('click', () => {
    // If it's forced visible, the first toggle should hide it
    if (elements.settingsPanel.classList.contains('force-visible')) {
        elements.settingsPanel.classList.remove('force-visible');
        elements.settingsPanel.classList.remove('active');
    } else {
        elements.settingsPanel.classList.toggle('active');
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
    });
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

// Tooltip toggle
elements.flattenHelpBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.flattenTooltip.classList.toggle('visible');
});

// Close tooltip when clicking outside
document.addEventListener('click', (e) => {
    if (!elements.flattenTooltip.contains(e.target) && e.target !== elements.flattenHelpBtn) {
        elements.flattenTooltip.classList.remove('visible');
    }
});

elements.importBtn.addEventListener('click', async () => {
    // 1. Validate
    if (!elements.apiToken.value.trim()) {
        elements.settingsPanel.classList.add('force-visible');
        elements.apiToken.focus();
        showStatus('error', 'Please enter your Raindrop API Token.');
        return;
    }

    // 2. Prepare Data
    await saveState(); // Ensure latest is saved
    // Fix: Trim configValue before validation to match saveState behavior
    const configValue = (STATE.method === 'tag' ? STATE.tagValue : STATE.collectionValue)?.trim();

    if (!configValue) {
        showStatus('error', `Please enter a ${STATE.method === 'tag' ? 'tag' : 'collection'} name.`);
        return;
    }

    // 3. UI Loading State
    elements.importBtn.disabled = true;
    elements.importBtn.querySelector('span').textContent = 'Syncing...';
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
            showStatus('success', `Done! Imported ${response.count} bookmarks.`);
            updateLastSyncDisplay(Date.now());
        } else {
            const errorMsg = response?.error || 'Unknown error occurred';
            showStatus('error', `Import Failed: ${errorMsg}`);
        }
    } catch (e) {
        showStatus('error', `Error: ${e.message || 'Failed to communicate with background script'}`);
    } finally {
        elements.importBtn.disabled = false;
        elements.importBtn.querySelector('span').textContent = 'Sync Now';
    }
});

// Initialize
loadState();