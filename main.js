/* ============================================================
   ESP32 SOUNDBOARD STUDIO - CORE ENGINE & LOCAL STORAGE LIBRARY
   ============================================================ */

// App State
const state = {
  serial: {
    port: null,
    reader: null,
    connected: false,
    baudRate: 115200,
    keepReading: false
  },
  audioCtx: null,
  masterVolume: 0.9,
  isMuted: false,
  library: [], // Array of sound objects stored in local IndexedDB: { id, name, blob, fileUrl, isDefault, createdAt }
  slots: [],   // Array of active deck slot cards: { id, key, title, soundId, vol, speed, loop, audioElement }
  draggedSoundId: null,
  previewAudio: null,
  activeAnalyserNodes: new Map(),
  recording: {
    mediaRecorder: null,
    chunks: [],
    targetSlotId: null,
    startTime: 0,
    timerInterval: null
  }
};

// Default Initial Sounds matching workspace files
const DEFAULT_PRESET_SOUNDS = [
  { id: 'def-1', name: 'suara1.mp3', file: './suara1.mp3', isDefault: true },
  { id: 'def-2', name: 'suara2.mp3', file: './suara2.mp3', isDefault: true },
  { id: 'def-3', name: 'suara3.mp3', file: './suara3.mp3', isDefault: true },
  { id: 'def-4', name: 'suara4.mp3', file: './suara4.mp3', isDefault: true },
  { id: 'def-5', name: 'suara5.mp3', file: './suara5.mp3', isDefault: true },
  { id: 'def-6', name: 'suara6.mp3', file: './suara6.mp3', isDefault: true }
];

const DEFAULT_SLOT_DECK = [
  { id: '1', key: '1', title: 'Suara 1', soundId: 'def-1', vol: 1.0, speed: 1.0, loop: false },
  { id: '2', key: '2', title: 'Suara 2', soundId: 'def-2', vol: 1.0, speed: 1.0, loop: false },
  { id: '3', key: '3', title: 'Suara 3', soundId: 'def-3', vol: 1.0, speed: 1.0, loop: false },
  { id: '4', key: '4', title: 'Suara 4', soundId: 'def-4', vol: 1.0, speed: 1.0, loop: false },
  { id: '5', key: '5', title: 'Suara 5', soundId: 'def-5', vol: 1.0, speed: 1.0, loop: false },
  { id: '6', key: '6', title: 'Suara 6', soundId: 'def-6', vol: 1.0, speed: 1.0, loop: false }
];

// DOM Elements
const elements = {
  statusDot: document.getElementById('status-dot'),
  statusText: document.getElementById('status-text'),
  portName: document.getElementById('port-name'),
  btnConnect: document.getElementById('btn-connect'),
  btnConnectLabel: document.getElementById('btn-connect-label'),
  browserWarning: document.getElementById('browser-warning'),
  grid: document.getElementById('soundboard-grid'),
  slotCountBadge: document.getElementById('slot-count-badge'),
  masterVolumeInput: document.getElementById('master-volume'),
  masterVolumeText: document.getElementById('master-volume-text'),
  btnMute: document.getElementById('btn-mute'),
  btnStopAll: document.getElementById('btn-stop-all'),
  btnAddSlot: document.getElementById('btn-add-slot'),
  btnExportPreset: document.getElementById('btn-export-preset'),
  btnImportPreset: document.getElementById('btn-import-preset'),
  btnResetDefaults: document.getElementById('btn-reset-defaults'),
  presetFileInput: document.getElementById('preset-file-input'),
  // Sidebar Sound Library
  sidebarLibrary: document.getElementById('sidebar-library'),
  libraryCountBadge: document.getElementById('library-count-badge'),
  libraryUploadZone: document.getElementById('library-upload-zone'),
  libraryFileInput: document.getElementById('library-file-input'),
  btnTriggerUpload: document.getElementById('btn-trigger-upload'),
  librarySearchInput: document.getElementById('library-search-input'),
  libraryList: document.getElementById('library-list'),
  // Drawer & Logs
  terminalDrawer: document.getElementById('terminal-drawer'),
  btnTerminalToggle: document.getElementById('btn-terminal-toggle'),
  btnCloseTerminal: document.getElementById('btn-close-terminal'),
  btnClearTerminal: document.getElementById('btn-clear-terminal'),
  terminalLogs: document.getElementById('terminal-logs'),
  selectBaud: document.getElementById('select-baud'),
  terminalInput: document.getElementById('terminal-input'),
  btnSendSerial: document.getElementById('btn-send-serial'),
  // Arduino Code Modal
  codeModal: document.getElementById('code-modal'),
  btnCodeModal: document.getElementById('btn-code-modal'),
  btnCloseCodeModal: document.getElementById('btn-close-code-modal'),
  btnCopyCode: document.getElementById('btn-copy-code'),
  codeBlock: document.getElementById('code-block'),
  // Recorder Modal
  recorderModal: document.getElementById('recorder-modal'),
  btnCloseRecorder: document.getElementById('btn-close-recorder'),
  recTargetLabel: document.getElementById('rec-target-label'),
  recTimer: document.getElementById('rec-timer'),
  recStatus: document.getElementById('rec-status'),
  btnStartRec: document.getElementById('btn-start-rec'),
  btnStopRec: document.getElementById('btn-stop-rec'),
  btnSaveRec: document.getElementById('btn-save-rec'),
  recPreviewPlayer: document.getElementById('rec-preview-player'),
  // Drop Overlay
  dropOverlay: document.getElementById('drop-overlay')
};

/* ============================================================
   INDEXED DB LOCAL STORAGE ENGINE FOR AUDIO FILES
   ============================================================ */
const DB_NAME = 'ESP32SoundboardStorageDB';
const DB_VERSION = 1;
let dbInstance = null;

function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('sounds')) {
        db.createObjectStore('sounds', { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

function saveSoundToDB(soundObj) {
  return new Promise((resolve, reject) => {
    if (!dbInstance) return resolve();
    const tx = dbInstance.transaction('sounds', 'readwrite');
    const store = tx.objectStore('sounds');
    // Save plain object (store Blob or ArrayBuffer)
    const record = {
      id: soundObj.id,
      name: soundObj.name,
      blob: soundObj.blob,
      fileUrl: soundObj.fileUrl && !soundObj.fileUrl.startsWith('blob:') ? soundObj.fileUrl : '',
      isDefault: !!soundObj.isDefault,
      createdAt: soundObj.createdAt || Date.now()
    };
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

function getAllSoundsFromDB() {
  return new Promise((resolve, reject) => {
    if (!dbInstance) return resolve([]);
    const tx = dbInstance.transaction('sounds', 'readonly');
    const store = tx.objectStore('sounds');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

function deleteSoundFromDB(id) {
  return new Promise((resolve, reject) => {
    if (!dbInstance) return resolve();
    const tx = dbInstance.transaction('sounds', 'readwrite');
    const store = tx.objectStore('sounds');
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

/* ============================================================
   INITIALIZATION
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  initAudioContext();
  checkWebSerialSupport();
  
  try {
    await initDB();
    await loadLibraryAndSlots();
  } catch (err) {
    console.error('Database initialization error:', err);
    fallbackInitLibrary();
  }

  renderLibrary();
  renderGrid();
  setupEventListeners();
  setupGlobalDragAndDrop();
  setupKeyboardShortcuts();

  // Attempt auto-connect if browser has saved ESP32 serial permissions
  if ('serial' in navigator) {
    autoConnectSerial();
    navigator.serial.addEventListener('connect', handleSerialDeviceConnected);
    navigator.serial.addEventListener('disconnect', handleSerialDeviceDisconnected);
  }
});

function initAudioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (AudioContext) {
    state.audioCtx = new AudioContext();
  }
}

function checkWebSerialSupport() {
  if (!('serial' in navigator)) {
    elements.browserWarning.classList.remove('hidden');
    elements.btnConnect.disabled = true;
    elements.btnConnectLabel.textContent = 'Serial Tidak Didukung';
    logTerminal('Browser ini tidak mendukung Web Serial API. Gunakan Chrome, Edge, atau Brave.', 'error');
  }
}

/* ============================================================
   SOUND LIBRARY & SLOT DATA LOADING
   ============================================================ */
async function loadLibraryAndSlots() {
  const dbSounds = await getAllSoundsFromDB();

  if (dbSounds.length === 0) {
    // Initialize default preset sounds into DB for first time use
    state.library = [];
    for (const def of DEFAULT_PRESET_SOUNDS) {
      try {
        const resp = await fetch(def.file);
        const blob = await resp.blob();
        const soundObj = {
          id: def.id,
          name: def.name,
          blob: blob,
          fileUrl: def.file,
          isDefault: true,
          createdAt: Date.now()
        };
        await saveSoundToDB(soundObj);
        soundObj.fileUrl = URL.createObjectURL(blob);
        state.library.push(soundObj);
      } catch (err) {
        state.library.push({
          id: def.id,
          name: def.name,
          blob: null,
          fileUrl: def.file,
          isDefault: true,
          createdAt: Date.now()
        });
      }
    }
  } else {
    // Map DB items to state library with active ObjectURLs
    state.library = dbSounds.map(item => {
      let fileUrl = item.fileUrl;
      if (item.blob) {
        fileUrl = URL.createObjectURL(item.blob);
      }
      return {
        id: item.id,
        name: item.name,
        blob: item.blob,
        fileUrl: fileUrl,
        isDefault: !!item.isDefault,
        createdAt: item.createdAt || Date.now()
      };
    });
  }

  // Load Saved Slot Deck configurations from localStorage
  const savedSlots = localStorage.getItem('esp32_soundboard_deck_v2');
  if (savedSlots) {
    try {
      const parsed = JSON.parse(savedSlots);
      state.slots = parsed.map((s, idx) => ({
        id: s.id || String(idx + 1),
        key: s.key || String(idx + 1),
        title: s.title || `Suara ${idx + 1}`,
        soundId: s.soundId || (state.library[idx] ? state.library[idx].id : state.library[0]?.id || ''),
        vol: s.vol !== undefined ? s.vol : 1.0,
        speed: s.speed || 1.0,
        loop: !!s.loop,
        audioElement: null
      }));
    } catch (e) {
      initDefaultDeckSlots();
    }
  } else {
    initDefaultDeckSlots();
  }

  // Initialize Audio objects for each slot
  state.slots.forEach(slot => {
    initSlotAudio(slot);
  });
}

function initDefaultDeckSlots() {
  state.slots = DEFAULT_SLOT_DECK.map(d => ({
    ...d,
    soundId: state.library.find(s => s.name === d.name)?.id || state.library[0]?.id || d.soundId,
    audioElement: null
  }));
}

function fallbackInitLibrary() {
  state.library = DEFAULT_PRESET_SOUNDS.map(d => ({
    id: d.id,
    name: d.name,
    blob: null,
    fileUrl: d.file,
    isDefault: true,
    createdAt: Date.now()
  }));
  initDefaultDeckSlots();
  state.slots.forEach(slot => initSlotAudio(slot));
}

function getSoundFromLibrary(soundId) {
  return state.library.find(s => s.id === soundId) || state.library[0] || null;
}

function initSlotAudio(slot) {
  if (slot.audioElement) {
    slot.audioElement.pause();
  }
  const sound = getSoundFromLibrary(slot.soundId);
  const audio = new Audio();
  audio.crossOrigin = 'anonymous';

  if (sound && sound.fileUrl) {
    audio.src = sound.fileUrl;
  }

  audio.volume = slot.vol * (state.isMuted ? 0 : state.masterVolume);
  audio.playbackRate = slot.speed || 1.0;
  audio.loop = !!slot.loop;

  audio.addEventListener('ended', () => {
    onAudioEnded(slot.id);
  });

  slot.audioElement = audio;
}

function saveSlotsToStorage() {
  const serializable = state.slots.map(s => ({
    id: s.id,
    key: s.key,
    title: s.title,
    soundId: s.soundId,
    vol: s.vol,
    speed: s.speed,
    loop: s.loop
  }));
  localStorage.setItem('esp32_soundboard_deck_v2', JSON.stringify(serializable));
}

/* ============================================================
   SIDEBAR SOUND LIBRARY RENDERING
   ============================================================ */
function renderLibrary() {
  elements.libraryList.innerHTML = '';
  const filter = (elements.librarySearchInput.value || '').toLowerCase().trim();

  const filteredSounds = state.library.filter(s => s.name.toLowerCase().includes(filter));
  elements.libraryCountBadge.textContent = `${state.library.length} Suara`;

  if (filteredSounds.length === 0) {
    elements.libraryList.innerHTML = `
      <div style="text-align: center; color: var(--text-dim); padding: 20px; font-size: 0.82rem;">
        Tidak ada suara ditemukan. Upload file audio baru di atas!
      </div>
    `;
    return;
  }

  filteredSounds.forEach(sound => {
    const item = document.createElement('div');
    item.className = 'library-item';
    item.setAttribute('draggable', 'true');
    item.dataset.soundId = sound.id;

    item.innerHTML = `
      <div class="library-item-info">
        <span class="drag-handle" title="Tarik item ini ke Slot Suara di kanan">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="9" cy="6" r="1.5"></circle><circle cx="15" cy="6" r="1.5"></circle>
            <circle cx="9" cy="12" r="1.5"></circle><circle cx="15" cy="12" r="1.5"></circle>
            <circle cx="9" cy="18" r="1.5"></circle><circle cx="15" cy="18" r="1.5"></circle>
          </svg>
        </span>
        <div class="sound-details">
          <span class="sound-name" title="${escapeHtml(sound.name)}">${escapeHtml(sound.name)}</span>
          <span class="sound-meta">${sound.isDefault ? 'Preset Default' : 'Tersimpan di Komputer'}</span>
        </div>
      </div>

      <div class="library-item-actions">
        <button class="btn-preview-play" data-sound-id="${sound.id}" title="Pratinjau Suara">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </button>
        ${!sound.isDefault ? `
          <button class="btn-delete-library" data-sound-id="${sound.id}" title="Hapus dari Penyimpanan Lokal">
            &times;
          </button>
        ` : ''}
      </div>
    `;

    // Drag Start & End for Library Item
    item.addEventListener('dragstart', (e) => {
      state.draggedSoundId = sound.id;
      e.dataTransfer.setData('text/plain', sound.id);
      e.dataTransfer.effectAllowed = 'copy';
      item.classList.add('dragging');
    });

    item.addEventListener('dragend', () => {
      state.draggedSoundId = null;
      item.classList.remove('dragging');
    });

    // Preview play sound button
    const btnPreview = item.querySelector('.btn-preview-play');
    btnPreview.addEventListener('click', (e) => {
      e.stopPropagation();
      previewSound(sound);
    });

    // Delete sound button
    const btnDelete = item.querySelector('.btn-delete-library');
    if (btnDelete) {
      btnDelete.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSoundFromLibrary(sound.id);
      });
    }

    elements.libraryList.appendChild(item);
  });
}

function previewSound(sound) {
  if (state.previewAudio) {
    state.previewAudio.pause();
  }
  if (!sound || !sound.fileUrl) return;

  if (state.audioCtx && state.audioCtx.state === 'suspended') {
    state.audioCtx.resume();
  }

  state.previewAudio = new Audio(sound.fileUrl);
  state.previewAudio.volume = state.masterVolume;
  state.previewAudio.play().catch(err => {
    logTerminal(`Pratinjau gagal: ${err.message}`, 'error');
  });
  logTerminal(`Memutar pratinjau: ${sound.name}`, 'system');
}

async function uploadFilesToLibrary(files) {
  const audioFiles = Array.from(files).filter(f => f.type.startsWith('audio/') || isAudioFileExtension(f.name));
  if (audioFiles.length === 0) return;

  for (const file of audioFiles) {
    const soundId = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const soundObj = {
      id: soundId,
      name: file.name,
      blob: file,
      fileUrl: URL.createObjectURL(file),
      isDefault: false,
      createdAt: Date.now()
    };

    await saveSoundToDB(soundObj);
    state.library.unshift(soundObj);
    logTerminal(`Suara "${file.name}" disimpan ke Penyimpanan Lokal komputer.`, 'system');
  }

  renderLibrary();
  renderGrid(); // update sound select options on deck slots
}

async function deleteSoundFromLibrary(soundId) {
  const sound = state.library.find(s => s.id === soundId);
  if (!sound) return;

  if (confirm(`Hapus "${sound.name}" dari Penyimpanan Lokal komputer?`)) {
    await deleteSoundFromDB(soundId);
    state.library = state.library.filter(s => s.id !== soundId);

    // Update slots using this sound to fallback
    const fallback = state.library[0]?.id || '';
    state.slots.forEach(slot => {
      if (slot.soundId === soundId) {
        slot.soundId = fallback;
        initSlotAudio(slot);
      }
    });

    saveSlotsToStorage();
    renderLibrary();
    renderGrid();
    logTerminal(`Suara "${sound.name}" dihapus dari penyimpanan.`, 'system');
  }
}

/* ============================================================
   SOUNDBOARD GRID SLOTS RENDERING (RIGHT DECK)
   ============================================================ */
function renderGrid() {
  elements.grid.innerHTML = '';
  elements.slotCountBadge.textContent = `${state.slots.length} Slot Suara Aktif`;

  state.slots.forEach((slot) => {
    const sound = getSoundFromLibrary(slot.soundId);
    const card = document.createElement('div');
    card.className = 'sound-card';
    card.id = `card-slot-${slot.id}`;
    card.dataset.slotId = slot.id;

    // Generate dropdown options for selecting sound directly
    const optionsHtml = state.library.map(s => `
      <option value="${s.id}" ${s.id === slot.soundId ? 'selected' : ''}>
        ${escapeHtml(s.name)}
      </option>
    `).join('');

    card.innerHTML = `
      <div class="sound-card-header">
        <div class="trigger-badge" title="Sinyal ESP32 Serial / Keyboard Key">
          <span>KEY [ ${slot.key} ]</span>
        </div>
        <input type="text" class="card-title-input" value="${escapeHtml(slot.title)}" data-slot-id="${slot.id}" title="Klik untuk mengubah judul slot">
        <button class="btn-icon-only btn-sm btn-delete-slot" data-slot-id="${slot.id}" title="Hapus Slot">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>

      <!-- Select Sound from Library Dropdown -->
      <div class="slot-sound-picker">
        <select class="slot-sound-select" data-slot-id="${slot.id}" title="Pilih suara dari Koleksi Suara">
          ${optionsHtml}
        </select>
      </div>

      <div class="waveform-container">
        <canvas class="waveform-canvas" id="canvas-slot-${slot.id}"></canvas>
        <div class="audio-file-name" title="${escapeHtml(sound ? sound.name : 'Tidak Ada File')}">
          🎵 ${escapeHtml(sound ? sound.name : 'Kosong')}
        </div>
      </div>

      <div class="card-main-action">
        <button class="btn-trigger-play" id="btn-play-${slot.id}" data-slot-id="${slot.id}">
          <svg class="play-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span class="btn-play-label">Putar Suara</span>
        </button>

        <button class="btn-icon-only btn-mic-rec" data-slot-id="${slot.id}" title="Rekam Suara Mikrofon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        </button>
      </div>

      <!-- Fine Tuning Audio Settings -->
      <div class="card-settings">
        <div class="setting-row">
          <label>Volume: <span id="vol-val-${slot.id}">${Math.round(slot.vol * 100)}%</span></label>
          <input type="range" class="slot-vol-slider" data-slot-id="${slot.id}" min="0" max="1" step="0.05" value="${slot.vol}">
        </div>

        <div class="setting-row">
          <label>Speed: <span id="speed-val-${slot.id}">${slot.speed}x</span></label>
          <input type="range" class="slot-speed-slider" data-slot-id="${slot.id}" min="0.5" max="2" step="0.1" value="${slot.speed}">
        </div>

        <div class="setting-toggles">
          <label class="toggle-item">
            <input type="checkbox" class="slot-loop-checkbox" data-slot-id="${slot.id}" ${slot.loop ? 'checked' : ''}>
            <span>Loop Playback</span>
          </label>
        </div>
      </div>
    `;

    elements.grid.appendChild(card);
    setupCardEvents(card, slot);
    drawStaticWaveform(slot.id);
  });
}

function assignSoundToSlot(slotId, soundId) {
  const slot = state.slots.find(s => s.id === slotId);
  const sound = getSoundFromLibrary(soundId);
  if (!slot || !sound) return;

  slot.soundId = sound.id;
  if (!slot.title || slot.title.startsWith('Suara')) {
    slot.title = sound.name.replace(/\.[^/.]+$/, "");
  }

  initSlotAudio(slot);
  saveSlotsToStorage();
  renderGrid();
  logTerminal(`Slot ${slot.id} (${slot.title}) diganti ke suara: ${sound.name}`, 'system');
}

function setupCardEvents(card, slot) {
  // Title Edit
  const titleInput = card.querySelector('.card-title-input');
  titleInput.addEventListener('change', (e) => {
    slot.title = e.target.value.trim() || `Suara ${slot.id}`;
    saveSlotsToStorage();
  });

  // Sound Select Dropdown Change
  const soundSelect = card.querySelector('.slot-sound-select');
  soundSelect.addEventListener('change', (e) => {
    assignSoundToSlot(slot.id, e.target.value);
  });

  // Play Button
  const playBtn = card.querySelector('.btn-trigger-play');
  playBtn.addEventListener('click', () => {
    triggerSlotSound(slot.id, 'UI Click');
  });

  // Delete Slot
  const deleteBtn = card.querySelector('.btn-delete-slot');
  deleteBtn.addEventListener('click', () => {
    deleteSlot(slot.id);
  });

  // Volume Slider
  const volSlider = card.querySelector('.slot-vol-slider');
  volSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    slot.vol = val;
    card.querySelector(`#vol-val-${slot.id}`).textContent = `${Math.round(val * 100)}%`;
    if (slot.audioElement) {
      slot.audioElement.volume = val * (state.isMuted ? 0 : state.masterVolume);
    }
    saveSlotsToStorage();
  });

  // Speed Slider
  const speedSlider = card.querySelector('.slot-speed-slider');
  speedSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    slot.speed = val;
    card.querySelector(`#speed-val-${slot.id}`).textContent = `${val}x`;
    if (slot.audioElement) {
      slot.audioElement.playbackRate = val;
    }
    saveSlotsToStorage();
  });

  // Loop Checkbox
  const loopCheckbox = card.querySelector('.slot-loop-checkbox');
  loopCheckbox.addEventListener('change', (e) => {
    slot.loop = e.target.checked;
    if (slot.audioElement) {
      slot.audioElement.loop = slot.loop;
    }
    saveSlotsToStorage();
  });

  // Mic Record Button
  const micBtn = card.querySelector('.btn-mic-rec');
  micBtn.addEventListener('click', () => {
    openMicRecorderModal(slot.id);
  });

  // DRAG & DROP FROM UPLOADED LIBRARY TO DECK SLOT
  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    card.classList.add('slot-drop-over');
  });

  card.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    card.classList.remove('slot-drop-over');
  });

  card.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    card.classList.remove('slot-drop-over');

    // If drag originated from Library item
    const soundId = e.dataTransfer.getData('text/plain') || state.draggedSoundId;
    if (soundId && getSoundFromLibrary(soundId)) {
      assignSoundToSlot(slot.id, soundId);
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // If external files were dropped on card, upload to library and bind to slot
      uploadFilesToLibrary(e.dataTransfer.files).then(() => {
        if (state.library[0]) {
          assignSoundToSlot(slot.id, state.library[0].id);
        }
      });
    }
  });
}

function isAudioFileExtension(filename) {
  return /\.(mp3|wav|ogg|flac|m4a|aac|webm)$/i.test(filename);
}

/* ============================================================
   TRIGGER SOUND & AUDIO VISUALIZER
   ============================================================ */
function triggerSlotSound(slotId, source = 'Trigger') {
  const slot = state.slots.find(s => s.id === slotId);
  if (!slot || !slot.audioElement) {
    logTerminal(`Slot ${slotId} tidak ditemukan atau file audio belum siap.`, 'error');
    return;
  }

  if (state.audioCtx && state.audioCtx.state === 'suspended') {
    state.audioCtx.resume();
  }

  const card = document.getElementById(`card-slot-${slotId}`);
  const playBtn = document.getElementById(`btn-play-${slotId}`);

  if (card) {
    card.classList.add('playing', 'triggered-flash');
    setTimeout(() => card.classList.remove('triggered-flash'), 400);
  }

  if (playBtn) {
    playBtn.classList.add('playing-active');
    playBtn.querySelector('.btn-play-label').textContent = 'Memutar...';
  }

  slot.audioElement.currentTime = 0;
  slot.audioElement.volume = slot.vol * (state.isMuted ? 0 : state.masterVolume);
  slot.audioElement.playbackRate = slot.speed || 1.0;
  
  const sound = getSoundFromLibrary(slot.soundId);
  const playPromise = slot.audioElement.play();
  if (playPromise !== undefined) {
    playPromise.then(() => {
      logTerminal(`[${source}] Putar Suara Slot ${slot.id} (${slot.title}): ${sound ? sound.name : ''}`, 'rx');
      startWaveformAnimation(slot);
    }).catch(err => {
      logTerminal(`Gagal memutar audio Slot ${slot.id}: ${err.message}`, 'error');
    });
  }
}

function onAudioEnded(slotId) {
  const card = document.getElementById(`card-slot-${slotId}`);
  const playBtn = document.getElementById(`btn-play-${slotId}`);
  const slot = state.slots.find(s => s.id === slotId);

  if (!slot || !slot.loop) {
    if (card) card.classList.remove('playing');
    if (playBtn) {
      playBtn.classList.remove('playing-active');
      playBtn.querySelector('.btn-play-label').textContent = 'Putar Suara';
    }
    drawStaticWaveform(slotId);
  }
}

function stopAllSounds() {
  if (state.previewAudio) {
    state.previewAudio.pause();
  }
  state.slots.forEach(slot => {
    if (slot.audioElement) {
      slot.audioElement.pause();
      slot.audioElement.currentTime = 0;
    }
    onAudioEnded(slot.id);
  });
  logTerminal('Semua suara dihentikan.', 'system');
}

/* Waveform Canvas Animation */
function drawStaticWaveform(slotId) {
  const canvas = document.getElementById(`canvas-slot-${slotId}`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width = canvas.offsetWidth;
  const height = canvas.height = canvas.offsetHeight;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(0, 242, 254, 0.2)';

  const bars = 28;
  const barWidth = width / bars - 2;

  for (let i = 0; i < bars; i++) {
    const h = Math.sin(i * 0.4) * (height * 0.3) + height * 0.25;
    ctx.fillRect(i * (barWidth + 2), height - h, barWidth, h);
  }
}

function startWaveformAnimation(slot) {
  const canvas = document.getElementById(`canvas-slot-${slot.id}`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function renderFrame() {
    if (!slot.audioElement || slot.audioElement.paused) return;

    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;
    ctx.clearRect(0, 0, width, height);

    const bars = 30;
    const barWidth = width / bars - 2;

    for (let i = 0; i < bars; i++) {
      const randomFactor = Math.random() * 0.7 + 0.3;
      const h = Math.sin(Date.now() * 0.01 + i * 0.5) * (height * 0.4) * randomFactor + (height * 0.4);
      
      const gradient = ctx.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, '#00f2fe');
      gradient.addColorStop(1, '#ff007a');

      ctx.fillStyle = gradient;
      ctx.fillRect(i * (barWidth + 2), height - h, barWidth, h);
    }

    requestAnimationFrame(renderFrame);
  }

  renderFrame();
}

/* ============================================================
   WEB SERIAL API (ESP32 AUTO-DETECT & READ STREAM)
   ============================================================ */
async function autoConnectSerial() {
  try {
    const ports = await navigator.serial.getPorts();
    if (ports.length > 0) {
      logTerminal(`ESP32 terdeteksi di memori browser. Mencoba auto-connect...`, 'system');
      await connectToPort(ports[0]);
    }
  } catch (err) {
    console.warn('Auto-connect serial check skipped:', err);
  }
}

async function requestSerialPort() {
  if (!('serial' in navigator)) return;
  try {
    const port = await navigator.serial.requestPort();
    await connectToPort(port);
  } catch (err) {
    if (err.name !== 'NotFoundError') {
      logTerminal(`Gagal menyambungkan Serial: ${err.message}`, 'error');
    }
  }
}

async function connectToPort(port) {
  try {
    state.serial.baudRate = parseInt(elements.selectBaud.value, 10) || 115200;
    
    updateConnectionUI('connecting', 'Menghubungkan ESP32...');
    await port.open({ baudRate: state.serial.baudRate });

    state.serial.port = port;
    state.serial.connected = true;
    state.serial.keepReading = true;

    const info = port.getInfo ? port.getInfo() : {};
    const portLabel = info.usbVendorId ? `VID: 0x${info.usbVendorId.toString(16)}` : 'ESP32 Serial Port';

    updateConnectionUI('connected', 'ESP32 Terhubung', portLabel);
    logTerminal(`BERHASIL: Terhubung ke ESP32 pada ${state.serial.baudRate} Baud.`, 'system');

    readSerialStream();
  } catch (err) {
    updateConnectionUI('disconnected', 'Gagal Terhubung');
    logTerminal(`Gagal membuka port serial: ${err.message}`, 'error');
  }
}

async function readSerialStream() {
  while (state.serial.port && state.serial.port.readable && state.serial.keepReading) {
    try {
      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = state.serial.port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      state.serial.reader = reader;

      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          reader.releaseLock();
          break;
        }

        if (value) {
          buffer += value;
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop();

          for (let line of lines) {
            line = line.trim();
            if (line.length > 0) {
              handleIncomingSerialLine(line);
            }
          }
        }
      }
    } catch (err) {
      logTerminal(`Error saat membaca data Serial: ${err.message}`, 'error');
      break;
    }
  }

  disconnectSerialPort();
}

function handleIncomingSerialLine(line) {
  logTerminal(`[ESP32 -> WEB]: "${line}"`, 'rx');

  const matchedSlot = state.slots.find(s => s.key.toLowerCase() === line.toLowerCase() || s.id === line);
  if (matchedSlot) {
    triggerSlotSound(matchedSlot.id, 'ESP32 Hardware Button');
  }
}

async function disconnectSerialPort() {
  state.serial.keepReading = false;
  if (state.serial.reader) {
    try {
      await state.serial.reader.cancel();
    } catch (e) {}
    state.serial.reader = null;
  }
  if (state.serial.port) {
    try {
      await state.serial.port.close();
    } catch (e) {}
    state.serial.port = null;
  }
  state.serial.connected = false;
  updateConnectionUI('disconnected', 'ESP32 Terputus');
  logTerminal('Koneksi ESP32 terputus.', 'system');
}

function handleSerialDeviceConnected(e) {
  logTerminal('Perangkat ESP32 USB baru terdeteksi!', 'system');
  updateConnectionUI('connecting', 'Mendeteksi ESP32 USB...');
  setTimeout(() => {
    autoConnectSerial();
  }, 500);
}

function handleSerialDeviceDisconnected(e) {
  logTerminal('Kabel USB ESP32 dicabut.', 'error');
  disconnectSerialPort();
}

function updateConnectionUI(status, text, extraInfo = '') {
  elements.statusDot.className = `status-dot ${status}`;
  elements.statusText.textContent = text;
  elements.portName.textContent = extraInfo;

  if (status === 'connected') {
    elements.btnConnectLabel.textContent = 'Putuskan ESP32';
    elements.btnConnect.classList.replace('btn-primary', 'btn-secondary');
  } else {
    elements.btnConnectLabel.textContent = 'Sambungkan ESP32';
    elements.btnConnect.classList.replace('btn-secondary', 'btn-primary');
  }
}

/* ============================================================
   GLOBAL DRAG & DROP OVERLAY MANAGER
   ============================================================ */
function setupGlobalDragAndDrop() {
  let dragCounter = 0;

  // Sidebar upload zone file input click
  if (elements.libraryUploadZone) {
    elements.libraryUploadZone.addEventListener('click', () => {
      elements.libraryFileInput.click();
    });
  }

  if (elements.btnTriggerUpload) {
    elements.btnTriggerUpload.addEventListener('click', (e) => {
      e.stopPropagation();
      elements.libraryFileInput.click();
    });
  }

  if (elements.libraryFileInput) {
    elements.libraryFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        uploadFilesToLibrary(e.target.files);
      }
    });
  }

  // Sidebar Upload zone drag & drop
  if (elements.libraryUploadZone) {
    elements.libraryUploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      elements.libraryUploadZone.classList.add('drag-over');
    });

    elements.libraryUploadZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      elements.libraryUploadZone.classList.remove('drag-over');
    });

    elements.libraryUploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      elements.libraryUploadZone.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        uploadFilesToLibrary(e.dataTransfer.files);
      }
    });
  }

  // Window level file drop
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (hasAudioFiles(e.dataTransfer) && !state.draggedSoundId) {
      elements.dropOverlay.classList.remove('hidden');
    }
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      elements.dropOverlay.classList.add('hidden');
    }
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    elements.dropOverlay.classList.add('hidden');

    if (state.draggedSoundId) return; // Handled by slot drop handler

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFilesToLibrary(e.dataTransfer.files);
    }
  });
}

function hasAudioFiles(dataTransfer) {
  if (!dataTransfer.types) return false;
  return dataTransfer.types.includes('Files');
}

/* ============================================================
   MICROPHONE AUDIO RECORDER
   ============================================================ */
function openMicRecorderModal(slotId) {
  state.recording.targetSlotId = slotId;
  const slot = state.slots.find(s => s.id === slotId);
  elements.recTargetLabel.innerHTML = `Rekam suara untuk <strong>${escapeHtml(slot ? slot.title : 'Slot')}</strong>`;
  elements.recStatus.textContent = 'Siap Merekam';
  elements.recTimer.textContent = '00:00';
  elements.btnStartRec.classList.remove('hidden');
  elements.btnStopRec.classList.add('hidden');
  elements.btnSaveRec.classList.add('hidden');
  elements.recPreviewPlayer.classList.add('hidden');
  elements.recorderModal.classList.remove('hidden');
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.recording.chunks = [];
    state.recording.mediaRecorder = new MediaRecorder(stream);

    state.recording.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) state.recording.chunks.push(e.data);
    };

    state.recording.mediaRecorder.onstop = () => {
      const blob = new Blob(state.recording.chunks, { type: 'audio/webm' });
      const audioUrl = URL.createObjectURL(blob);
      elements.recPreviewPlayer.src = audioUrl;
      elements.recPreviewPlayer.classList.remove('hidden');
      elements.btnSaveRec.classList.remove('hidden');
      elements.recStatus.textContent = 'Pratinjau Hasil Rekaman';
      stream.getTracks().forEach(track => track.stop());
    };

    state.recording.mediaRecorder.start();
    state.recording.startTime = Date.now();
    elements.recStatus.textContent = '🔴 Merekam suara...';
    elements.btnStartRec.classList.add('hidden');
    elements.btnStopRec.classList.remove('hidden');

    state.recording.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - state.recording.startTime) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const secs = String(elapsed % 60).padStart(2, '0');
      elements.recTimer.textContent = `${mins}:${secs}`;
    }, 1000);

  } catch (err) {
    alert(`Gagal mengakses mikrofon: ${err.message}`);
  }
}

function stopRecording() {
  if (state.recording.mediaRecorder && state.recording.mediaRecorder.state !== 'inactive') {
    state.recording.mediaRecorder.stop();
    clearInterval(state.recording.timerInterval);
    elements.btnStopRec.classList.add('hidden');
  }
}

async function saveRecording() {
  if (state.recording.chunks.length > 0) {
    const blob = new Blob(state.recording.chunks, { type: 'audio/webm' });
    const recName = `Rekaman_${new Date().toLocaleTimeString().replace(/:/g, '-')}.webm`;
    const soundId = 'rec_' + Date.now();
    const soundObj = {
      id: soundId,
      name: recName,
      blob: blob,
      fileUrl: URL.createObjectURL(blob),
      isDefault: false,
      createdAt: Date.now()
    };

    await saveSoundToDB(soundObj);
    state.library.unshift(soundObj);
    renderLibrary();

    if (state.recording.targetSlotId) {
      assignSoundToSlot(state.recording.targetSlotId, soundId);
    }
    elements.recorderModal.classList.add('hidden');
    logTerminal(`Hasil rekaman mikrofon disimpan ke koleksi suara.`, 'system');
  }
}

/* ============================================================
   EVENT LISTENERS & TOOLBAR ACTIONS
   ============================================================ */
function setupEventListeners() {
  // Connect ESP32
  elements.btnConnect.addEventListener('click', () => {
    if (state.serial.connected) {
      disconnectSerialPort();
    } else {
      requestSerialPort();
    }
  });

  // Master Volume
  elements.masterVolumeInput.addEventListener('input', (e) => {
    state.masterVolume = parseFloat(e.target.value);
    elements.masterVolumeText.textContent = `${Math.round(state.masterVolume * 100)}%`;
    updateAllAudioVolumes();
  });

  // Mute Toggle
  elements.btnMute.addEventListener('click', () => {
    state.isMuted = !state.isMuted;
    elements.btnMute.style.opacity = state.isMuted ? '0.5' : '1';
    updateAllAudioVolumes();
  });

  // Stop All
  elements.btnStopAll.addEventListener('click', stopAllSounds);

  // Add Slot
  elements.btnAddSlot.addEventListener('click', () => {
    const nextId = String(state.slots.length + 1);
    const soundId = state.library[0]?.id || '';
    const newSlot = {
      id: nextId,
      key: nextId,
      title: `Suara ${nextId}`,
      soundId: soundId,
      vol: 1.0,
      speed: 1.0,
      loop: false,
      audioElement: null
    };
    initSlotAudio(newSlot);
    state.slots.push(newSlot);
    saveSlotsToStorage();
    renderGrid();
    logTerminal(`Slot baru ${nextId} ditambahkan ke soundboard deck.`, 'system');
  });

  // Export Preset JSON
  elements.btnExportPreset.addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.slots, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", "esp32_soundbank_preset.json");
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  });

  // Import Preset JSON
  elements.btnImportPreset.addEventListener('click', () => {
    elements.presetFileInput.click();
  });

  elements.presetFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (Array.isArray(imported)) {
            state.slots = imported.map((s, idx) => ({
              id: s.id || String(idx + 1),
              key: s.key || String(idx + 1),
              title: s.title || `Suara ${idx + 1}`,
              soundId: s.soundId || (state.library[idx] ? state.library[idx].id : state.library[0]?.id || ''),
              vol: s.vol !== undefined ? s.vol : 1.0,
              speed: s.speed || 1.0,
              loop: !!s.loop,
              audioElement: null
            }));
            state.slots.forEach(s => initSlotAudio(s));
            saveSlotsToStorage();
            renderGrid();
            logTerminal('Preset Soundbank berhasil diimpor!', 'system');
          }
        } catch (err) {
          alert('File JSON tidak valid!');
        }
      };
      reader.readAsText(e.target.files[0]);
    }
  });

  // Reset Defaults
  elements.btnResetDefaults.addEventListener('click', async () => {
    if (confirm('Kembalikan semua slot suara ke preset default?')) {
      localStorage.removeItem('esp32_soundboard_deck_v2');
      initDefaultDeckSlots();
      state.slots.forEach(s => initSlotAudio(s));
      saveSlotsToStorage();
      renderGrid();
      logTerminal('Soundboard deck dikembalikan ke posisi default.', 'system');
    }
  });

  // Search input filter in Library
  elements.librarySearchInput.addEventListener('input', () => {
    renderLibrary();
  });

  // Terminal Drawer Toggles
  elements.btnTerminalToggle.addEventListener('click', () => {
    elements.terminalDrawer.classList.toggle('hidden');
  });

  elements.btnCloseTerminal.addEventListener('click', () => {
    elements.terminalDrawer.classList.add('hidden');
  });

  elements.btnClearTerminal.addEventListener('click', () => {
    elements.terminalLogs.innerHTML = '';
  });

  elements.btnSendSerial.addEventListener('click', sendManualSerialData);
  elements.terminalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendManualSerialData();
  });

  // Code Modal Toggles
  elements.btnCodeModal.addEventListener('click', () => {
    elements.codeModal.classList.remove('hidden');
  });
  elements.btnCloseCodeModal.addEventListener('click', () => {
    elements.codeModal.classList.add('hidden');
  });
  elements.btnCopyCode.addEventListener('click', () => {
    navigator.clipboard.writeText(elements.codeBlock.textContent);
    elements.btnCopyCode.textContent = 'Tersalin! ✓';
    setTimeout(() => elements.btnCopyCode.textContent = 'Salin Kode', 2000);
  });

  // Recorder Modal Events
  elements.btnCloseRecorder.addEventListener('click', () => {
    stopRecording();
    elements.recorderModal.classList.add('hidden');
  });
  elements.btnStartRec.addEventListener('click', startRecording);
  elements.btnStopRec.addEventListener('click', stopRecording);
  elements.btnSaveRec.addEventListener('click', saveRecording);
}

function updateAllAudioVolumes() {
  state.slots.forEach(slot => {
    if (slot.audioElement) {
      slot.audioElement.volume = slot.vol * (state.isMuted ? 0 : state.masterVolume);
    }
  });
}

function deleteSlot(slotId) {
  if (state.slots.length <= 1) {
    alert('Soundboard harus memiliki minimal 1 slot suara!');
    return;
  }
  const idx = state.slots.findIndex(s => s.id === slotId);
  if (idx !== -1) {
    if (state.slots[idx].audioElement) {
      state.slots[idx].audioElement.pause();
    }
    state.slots.splice(idx, 1);
    saveSlotsToStorage();
    renderGrid();
  }
}

async function sendManualSerialData() {
  const val = elements.terminalInput.value.trim();
  if (!val) return;

  logTerminal(`[WEB -> ESP32]: "${val}"`, 'system');
  elements.terminalInput.value = '';

  handleIncomingSerialLine(val);

  if (state.serial.port && state.serial.port.writable) {
    try {
      const encoder = new TextEncoder();
      const writer = state.serial.port.writable.getWriter();
      await writer.write(encoder.encode(val + '\n'));
      writer.releaseLock();
    } catch (err) {
      logTerminal(`Gagal mengirim data Serial: ${err.message}`, 'error');
    }
  }
}

/* ============================================================
   KEYBOARD SHORTCUTS
   ============================================================ */
function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

    if (e.key === 'Escape') {
      stopAllSounds();
      return;
    }

    const keyTrigger = e.key.toLowerCase();
    const matchedSlot = state.slots.find(s => s.key.toLowerCase() === keyTrigger);
    if (matchedSlot) {
      triggerSlotSound(matchedSlot.id, `Keyboard '${e.key}'`);
    }
  });
}

/* ============================================================
   LOG TERMINAL UTILITY
   ============================================================ */
function logTerminal(msg, type = 'system') {
  const time = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = `[${time}] ${msg}`;
  elements.terminalLogs.appendChild(line);
  elements.terminalLogs.scrollTop = elements.terminalLogs.scrollHeight;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[m]);
}
