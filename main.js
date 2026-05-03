const screens = { home: document.getElementById('home-screen'), play: document.getElementById('play-screen') };
const btns = {
    selectFile: document.getElementById('btn-select-file'),
    selectFolder: document.getElementById('btn-select-folder'),
    recentFolder: document.getElementById('btn-recent-folder'),
    play: document.getElementById('btn-play'),
    repeat: document.getElementById('btn-repeat'),
    home: document.getElementById('btn-home')
};
const inputs = { file: document.getElementById('input-file'), folder: document.getElementById('input-folder') };
const player = document.getElementById('media-player');
const seekBar = document.getElementById('seek-bar');
const volumeBar = document.getElementById('volume-bar');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const audioPlaceholder = document.getElementById('audio-placeholder');
const panel = { container: document.getElementById('panel-container'), list: document.getElementById('file-list'), handle: document.getElementById('panel-handle') };
const timeCurrent = document.getElementById('time-current');
const timeTotal = document.getElementById('time-total');

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

let currentFiles = [];
let currentIndex = -1;
let isRepeat = false;
let folderMode = false;
let dirHandle = null;
let cachedFolderFiles = null;

const hasFSAPI = 'showDirectoryPicker' in window;

async function checkRecentFolder() {
    if (!hasFSAPI) return;
    try {
        const req = indexedDB.open('MusicRunnerDB', 1);
        req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
        req.onsuccess = e => {
            const db = e.target.result;
            const tx = db.transaction('handles', 'readonly');
            const getReq = tx.objectStore('handles').get('recent');
            getReq.onsuccess = () => {
                if (getReq.result) {
                    dirHandle = getReq.result;
                    btns.recentFolder.style.display = 'flex';
                }
            };
        };
    } catch (e) { }
}
checkRecentFolder();

async function saveRecentFolder(handle) {
    if (!hasFSAPI) return;
    try {
        const req = indexedDB.open('MusicRunnerDB', 1);
        req.onsuccess = e => {
            const db = e.target.result;
            const tx = db.transaction('handles', 'readwrite');
            tx.objectStore('handles').put(handle, 'recent');
        };
    } catch (e) { }
}

function switchScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
}

btns.selectFile.onclick = () => inputs.file.click();
btns.selectFolder.onclick = async () => {
    if (hasFSAPI) {
        try {
            const handle = await window.showDirectoryPicker();
            dirHandle = handle;
            await saveRecentFolder(handle);
            btns.recentFolder.style.display = 'flex';
            loadFromHandle(handle);
        } catch (e) {
            if (e.name !== 'AbortError') inputs.folder.click();
        }
    } else {
        inputs.folder.click();
    }
};

btns.recentFolder.onclick = async () => {
    if (hasFSAPI && dirHandle) {
        try {
            const opts = { mode: 'read' };
            if (await dirHandle.queryPermission(opts) === 'granted' || await dirHandle.requestPermission(opts) === 'granted') {
                loadFromHandle(dirHandle);
            }
        } catch (e) { }
    } else if (cachedFolderFiles) {
        setupFolderMode(cachedFolderFiles);
    }
};

inputs.file.onchange = e => {
    const file = e.target.files[0];
    if (file) {
        folderMode = false;
        currentFiles = [file];
        playFile(0);
        switchScreen('play');
        closePanel();
    }
    e.target.value = '';
};

inputs.folder.onchange = e => {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('audio/') || f.type.startsWith('video/') || f.name.match(/\.(webm|mp4|mp3|ogg|wav|m4a|aac)$/i));
    cachedFolderFiles = files;
    btns.recentFolder.style.display = 'flex';
    setupFolderMode(files);
    e.target.value = '';
};

async function loadFromHandle(handle) {
    const files = [];
    for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
            const file = await entry.getFile();
            if (file.type.startsWith('audio/') || file.type.startsWith('video/') || file.name.match(/\.(webm|mp4|mp3|ogg|wav|m4a|aac)$/i)) {
                files.push(file);
            }
        }
    }
    setupFolderMode(files);
}

function setupFolderMode(files) {
    folderMode = true;
    currentFiles = files;
    panel.list.innerHTML = '';

    files.forEach((file, i) => {
        const item = document.createElement('div');
        item.className = 'file-item';

        const isVideo = file.type.startsWith('video/') || file.name.match(/\.(mp4|webm)$/i);
        const icon = isVideo ?
            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>` :
            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;

        item.innerHTML = `${icon}<span>${file.name}</span>`;
        item.onclick = () => {
            playFile(i);
            closePanel();
        };
        panel.list.appendChild(item);
    });

    switchScreen('play');
    player.src = '';
    audioPlaceholder.style.display = 'none';
}

function playFile(index) {
    if (index < 0 || index >= currentFiles.length) return;
    currentIndex = index;
    const file = currentFiles[index];
    const url = URL.createObjectURL(file);
    player.src = url;
    player.play();

    const isAudio = file.type.startsWith('audio/') || (!file.type.startsWith('video/') && !file.name.match(/\.(mp4|webm)$/i));
    audioPlaceholder.style.display = isAudio ? 'block' : 'none';

    Array.from(panel.list.children).forEach((el, i) => {
        el.classList.toggle('playing', i === index);
    });

    updatePlayPauseIcon();
}

player.onended = () => {
    if (isRepeat) {
        player.currentTime = 0;
        player.play();
    } else if (folderMode && currentIndex + 1 < currentFiles.length) {
        playFile(currentIndex + 1);
    }
};

btns.play.onclick = () => {
    if (!player.src) return;
    if (player.paused) player.play();
    else player.pause();
    updatePlayPauseIcon();
};

player.onplay = updatePlayPauseIcon;
player.onpause = updatePlayPauseIcon;

function updatePlayPauseIcon() {
    if (player.paused) {
        iconPlay.style.display = 'block';
        iconPause.style.display = 'none';
    } else {
        iconPlay.style.display = 'none';
        iconPause.style.display = 'block';
    }
}

btns.repeat.onclick = () => {
    isRepeat = !isRepeat;
    btns.repeat.classList.toggle('active', isRepeat);
};

btns.home.onclick = () => {
    player.pause();
    player.src = '';
    seekBar.value = 0;
    timeCurrent.textContent = '0:00';
    timeTotal.textContent = '0:00';
    closePanel();
    switchScreen('home');
};

player.ontimeupdate = () => {
    if (player.duration) {
        seekBar.value = (player.currentTime / player.duration) * 100;
        timeCurrent.textContent = formatTime(player.currentTime);
        timeTotal.textContent = formatTime(player.duration);
    }
};

player.onloadedmetadata = () => {
    timeTotal.textContent = formatTime(player.duration);
};

seekBar.oninput = () => {
    if (player.duration) {
        player.currentTime = (seekBar.value / 100) * player.duration;
    }
};

volumeBar.oninput = () => {
    player.volume = volumeBar.value / 100;
};

let touchStartY = 0;
document.getElementById('media-area').addEventListener('touchstart', e => {
    if (!folderMode || e.target.closest('#panel-container')) return;
    touchStartY = e.touches[0].clientY;
});

document.getElementById('media-area').addEventListener('touchmove', e => {
    if (!folderMode || panel.container.classList.contains('open') || e.target.closest('#panel-container')) return;
    const dy = e.touches[0].clientY - touchStartY;
    if (dy > 30) panel.container.classList.add('open');
});

panel.handle.addEventListener('touchstart', e => {
    touchStartY = e.touches[0].clientY;
});

panel.handle.addEventListener('touchmove', e => {
    const dy = touchStartY - e.touches[0].clientY;
    if (dy > 30) closePanel();
});

function closePanel() {
    panel.container.classList.remove('open');
}
