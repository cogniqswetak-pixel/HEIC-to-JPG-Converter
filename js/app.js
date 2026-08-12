// HEIC to JPG Converter - Shared File Shell Core Engine
const state = {
  files: [],
  selectedFormat: 'jpg', // 'jpg' | 'png'
  quality: 85,           // 60 to 100, default 85
  maxWidth: null,
  maxHeight: null,
  keepExif: false,       // Remove by default
  viewMode: 'grid',      // 'grid' | 'list'
  filter: 'all',         // 'all' | 'waiting' | 'working' | 'done' | 'failed'
  searchQuery: '',
  isConverting: false,
  telemetry: {
    convertedCount: 0,
    bytesSaved: 0
  }
};

// Lazy-loaded HEIC WASM Decoder Loader
let decoderLoadedPromise = null;
function ensureDecoderLoaded() {
  if (typeof heic2any !== 'undefined') {
    return Promise.resolve();
  }
  if (!decoderLoadedPromise) {
    decoderLoadedPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'js/vendor/heic2any.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load local HEIC decoder'));
      document.head.appendChild(script);
    });
  }
  return decoderLoadedPromise;
}

// DOM References
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const gridView = document.getElementById('file-grid-view');
const tableView = document.getElementById('file-table-view');
const tableBody = document.getElementById('file-table-body');
const floatingDock = document.getElementById('floating-dock');
const dockSelectedCount = document.getElementById('dock-selected-count');
const btnConvertAll = document.getElementById('btn-convert-all');
const btnDownloadZip = document.getElementById('btn-download-zip');
const btnClearAll = document.getElementById('btn-clear-all');
const btnSidebarConvert = document.getElementById('btn-sidebar-convert');
const btnSidebarZip = document.getElementById('btn-sidebar-zip');
const btnSidebarClear = document.getElementById('btn-sidebar-clear');
const qualitySlider = document.getElementById('quality-slider');
const qualityValDisplay = document.getElementById('quality-val-display');
const qualitySection = document.getElementById('quality-section');
const maxWidthInput = document.getElementById('max-width-input');
const maxHeightInput = document.getElementById('max-height-input');
const toggleExif = document.getElementById('toggle-exif');
const telemetryCount = document.getElementById('telemetry-count');
const telemetrySaved = document.getElementById('telemetry-saved');
const countAll = document.getElementById('count-all');
const countWaiting = document.getElementById('count-waiting');
const countWorking = document.getElementById('count-working');
const countDone = document.getElementById('count-done');
const countFailed = document.getElementById('count-failed');
const searchInput = document.getElementById('search-input');
const viewGridBtn = document.getElementById('view-grid-btn');
const viewListBtn = document.getElementById('view-list-btn');

// Before / After Modal Elements
const compareModal = document.getElementById('compare-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const compareImgOriginal = document.getElementById('compare-img-original');
const compareImgConverted = document.getElementById('compare-img-converted');
const compareImgConvertedWrap = document.getElementById('compare-img-converted-wrap');
const compareSliderHandle = document.getElementById('compare-slider-handle');
const compareViewport = document.getElementById('compare-viewport');
const modalFilename = document.getElementById('modal-filename');

// Initialize
function init() {
  initSplashScreen();
  initEventListeners();
  renderQueue();
  updateCounts();
  // Pre-warm WASM decoder in background for 0-delay conversion
  ensureDecoderLoaded().catch(() => {});
}

function initSplashScreen() {
  const splash = document.getElementById('splash-screen');
  if (!splash) return;
  setTimeout(() => {
    splash.classList.add('splash-exit');
    setTimeout(() => {
      if (splash.parentNode) splash.parentNode.removeChild(splash);
    }, 700);
  }, 1250);
}

function initEventListeners() {
  // Format Selector
  document.querySelectorAll('#format-selector .segmented-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setFormat(btn.dataset.value);
    });
  });

  // Quality Slider (60-100, default 85)
  qualitySlider.addEventListener('input', (e) => {
    const q = parseInt(e.target.value, 10);
    state.quality = q;
    qualityValDisplay.textContent = `${q}%`;
    updateQualityPresetActive(q);
  });

  // Quality Presets (Compact, Balanced, Ultra)
  document.querySelectorAll('#quality-presets .preset-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = parseInt(btn.dataset.q, 10);
      state.quality = q;
      qualitySlider.value = q;
      qualityValDisplay.textContent = `${q}%`;
      updateQualityPresetActive(q);
    });
  });

  // Global Clipboard Paste Support (⌘ + V)
  window.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pastedFiles = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
    }
    if (pastedFiles.length > 0) {
      handleDroppedFiles(pastedFiles);
    }
  });

  // Global Keyboard Shortcuts (⌘+O to browse, ⌘+Enter to convert, Esc to close modal)
  window.addEventListener('keydown', (e) => {
    const isCmd = e.metaKey || e.ctrlKey;
    if (isCmd && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      fileInput.click();
    } else if (isCmd && e.key === 'Enter') {
      e.preventDefault();
      if (!state.isConverting && state.files.length > 0) {
        convertAll();
      }
    } else if (e.key === 'Escape') {
      closeCompareModal();
    }
  });

  // Size Limits
  maxWidthInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    state.maxWidth = (!isNaN(val) && val > 0) ? val : null;
  });

  maxHeightInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    state.maxHeight = (!isNaN(val) && val > 0) ? val : null;
  });

  // Photo Details (EXIF)
  toggleExif.addEventListener('change', (e) => {
    state.keepExif = e.target.checked;
  });

  // Drag and Drop
  ['dragenter', 'dragover'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-active');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-active');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleDroppedFiles(droppedFiles);
  });

  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropZone.addEventListener('click', (e) => {
    if (e.target !== browseBtn) fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    handleDroppedFiles(Array.from(e.target.files));
    fileInput.value = '';
  });

  // View Mode
  viewGridBtn.addEventListener('click', () => setViewMode('grid'));
  viewListBtn.addEventListener('click', () => setViewMode('list'));

  // Filtering
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.filter = chip.dataset.filter;
      renderQueue();
    });
  });

  // Search
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase();
    renderQueue();
  });

  // Actions
  btnConvertAll.addEventListener('click', convertAll);
  btnSidebarConvert.addEventListener('click', convertAll);
  btnDownloadZip.addEventListener('click', downloadAllZip);
  btnSidebarZip.addEventListener('click', downloadAllZip);
  btnClearAll.addEventListener('click', clearAll);
  btnSidebarClear.addEventListener('click', clearAll);

  // Compare Modal
  modalCloseBtn.addEventListener('click', closeCompareModal);
  compareModal.addEventListener('click', (e) => {
    if (e.target === compareModal) closeCompareModal();
  });
  initCompareSlider();

  // Tab Close Warning during conversion
  window.addEventListener('beforeunload', (e) => {
    if (state.isConverting) {
      e.preventDefault();
      e.returnValue = 'Conversion is in progress. Closing this tab will lose unsaved progress.';
      return e.returnValue;
    }
  });

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      convertAll();
    }
    if (e.key === 'Escape') {
      closeCompareModal();
    }
  });
}

function setFormat(format) {
  state.selectedFormat = format;
  document.querySelectorAll('#format-selector .segmented-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.value === format);
  });
  const pngInfo = document.getElementById('png-info-section');
  if (qualitySection) qualitySection.style.display = format === 'jpg' ? 'flex' : 'none';
  if (pngInfo) pngInfo.style.display = format === 'png' ? 'flex' : 'none';
}

function setViewMode(mode) {
  state.viewMode = mode;
  viewGridBtn.classList.toggle('active', mode === 'grid');
  viewListBtn.classList.toggle('active', mode === 'list');
  gridView.style.display = mode === 'grid' ? 'grid' : 'none';
  tableView.style.display = mode === 'list' ? 'table' : 'none';
  renderQueue();
}

// Handle Incoming Files
function handleDroppedFiles(files) {
  files.forEach(file => {
    const isHeic = file.name.match(/\.(heic|heif)$/i);
    const isLarge = file.size > 50 * 1024 * 1024; // 50MB warning threshold
    const id = 'file_' + Math.random().toString(36).substring(2, 9);

    const fileItem = {
      id,
      file,
      name: file.name,
      size: file.size,
      formattedSize: formatBytes(file.size),
      status: isHeic ? 'waiting' : 'rejected',
      errorReason: isHeic ? null : 'Not a HEIC or HEIF image',
      isLarge,
      progress: 0,
      previewUrl: null,
      cachedBlob: null,
      convertedBlob: null,
      convertedUrl: null,
      convertedSize: 0,
      savingsPct: 0
    };

    state.files.push(fileItem);

    // Immediate background decode on drop using Web Worker
    if (isHeic) {
      const previewWorker = new Worker('js/converter-worker.js?v=' + Date.now());
      previewWorker.onmessage = (e) => {
        if (e.data.type === 'success') {
          const tb = e.data.blob;
          if (tb) {
            fileItem.previewUrl = URL.createObjectURL(tb);
            fileItem.cachedBlob = tb;
            renderQueue();
          }
          previewWorker.terminate();
        } else if (e.data.type === 'error') {
          console.warn('Background preview decode error:', e.data.error);
          previewWorker.terminate();
        }
      };
      
      previewWorker.postMessage({
        id: id + '_preview',
        file: file,
        format: 'jpg',
        quality: 50,
        maxWidth: 320,
        maxHeight: 320,
        keepExif: false
      });
    }
  });

  updateCounts();
  renderQueue();
}

function createPlaceholderPreview(filename) {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');

  let hash = 0;
  for (let i = 0; i < filename.length; i++) {
    hash = filename.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue1 = Math.abs(hash % 360);
  const hue2 = (hue1 + 40) % 360;

  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, `hsl(${hue1}, 70%, 20%)`);
  grad.addColorStop(1, `hsl(${hue2}, 80%, 10%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let x = 40; x < canvas.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  // Camera Icon
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2 - 15);
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 32, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 14px -apple-system, Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('HEIC PHOTO', canvas.width / 2, canvas.height / 2 + 45);

  return canvas.toDataURL('image/jpeg', 0.9);
}

function formatBytes(bytes, decimals = 1) {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function updateCounts() {
  const total = state.files.length;
  const waiting = state.files.filter(f => f.status === 'waiting').length;
  const working = state.files.filter(f => f.status === 'working').length;
  const done = state.files.filter(f => f.status === 'done').length;
  const failed = state.files.filter(f => f.status === 'failed' || f.status === 'rejected').length;

  countAll.textContent = total;
  countWaiting.textContent = waiting;
  countWorking.textContent = working;
  countDone.textContent = done;
  countFailed.textContent = failed;

  dockSelectedCount.textContent = `${total} file${total === 1 ? '' : 's'}`;
  floatingDock.style.display = total > 0 ? 'flex' : 'none';
  btnDownloadZip.style.display = done > 0 ? 'inline-flex' : 'none';
  btnSidebarZip.style.display = done > 0 ? 'block' : 'none';

  telemetryCount.textContent = state.telemetry.convertedCount;
  telemetrySaved.textContent = formatBytes(state.telemetry.bytesSaved);
}

// Render Queue
function renderQueue() {
  const filtered = state.files.filter(f => {
    let matchesFilter = true;
    if (state.filter === 'failed') {
      matchesFilter = f.status === 'failed' || f.status === 'rejected';
    } else if (state.filter !== 'all') {
      matchesFilter = f.status === state.filter;
    }
    const matchesSearch = f.name.toLowerCase().includes(state.searchQuery);
    return matchesFilter && matchesSearch;
  });

  if (state.viewMode === 'grid') {
    gridView.innerHTML = '';
    filtered.forEach(file => {
      const card = document.createElement('div');
      card.className = 'grid-card animate-card-entry';
      
      const displayUrl = file.convertedUrl || file.previewUrl;
      const thumbContent = displayUrl ? `
        <img class="card-thumb-img" src="${displayUrl}" alt="${file.name}">
      ` : `
        <div class="card-thumb-placeholder">
          <div class="placeholder-icon-circle">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
              <circle cx="12" cy="13" r="3"/>
            </svg>
          </div>
          <span class="placeholder-format-tag">HEIC PHOTO</span>
        </div>
      `;

      card.innerHTML = `
        <div class="card-thumb-container">
          ${thumbContent}
          <div class="card-overlay-actions">
            ${file.status === 'done' ? `<button class="icon-btn-micro btn-compare" title="Compare Before/After" data-id="${file.id}">⟷</button>` : ''}
            ${file.status === 'done' ? `<button class="icon-btn-micro btn-download" title="Download" data-id="${file.id}">↓</button>` : ''}
            <button class="icon-btn-micro btn-remove" title="Remove" data-id="${file.id}">✕</button>
          </div>
        </div>
        <div class="card-meta-info">
          <div class="file-name-text" title="${file.name}">${file.name}</div>
          <div class="file-specs-row">
            <span>${file.formattedSize}</span>
            <span class="badge-pill ${getBadgeClass(file.status)}">${file.status}</span>
          </div>
          ${file.isLarge ? `<div style="font-size: 10px; color: var(--status-warning);">Large file (over 50MB)</div>` : ''}
          ${file.errorReason ? `<div style="font-size: 10px; color: var(--status-error);">${file.errorReason}</div>` : ''}
          ${file.status === 'working' ? `
            <div class="progress-track">
              <div class="progress-fill animate-shimmer" style="width: ${file.progress}%;"></div>
            </div>
          ` : ''}
          ${file.status === 'done' ? `
            <div class="file-specs-row" style="color: var(--status-success); font-weight: 500;">
              <span>Saved ${file.savingsPct}%</span>
              <span>${formatBytes(file.convertedSize)}</span>
            </div>
          ` : ''}
        </div>
      `;
      gridView.appendChild(card);
    });
  } else {
    tableBody.innerHTML = '';
    filtered.forEach(file => {
      const tr = document.createElement('tr');
      tr.className = 'table-row animate-card-entry';
      const displayUrl = file.convertedUrl || file.previewUrl;
      const thumbContent = displayUrl ? `
        <img class="table-thumb" src="${displayUrl}" alt="">
      ` : `
        <div class="table-thumb-placeholder">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
            <circle cx="12" cy="13" r="3"/>
          </svg>
        </div>
      `;

      tr.innerHTML = `
        <td>${thumbContent}</td>
        <td><strong>${file.name}</strong> ${file.errorReason ? `<br><small style="color: var(--status-error);">${file.errorReason}</small>` : ''}</td>
        <td>${file.formattedSize}</td>
        <td><span class="badge-pill ${getBadgeClass(file.status)}">${file.status}</span></td>
        <td style="text-align: right;">
          ${file.status === 'done' ? `<button class="btn-dock-action btn-dock-secondary btn-compare" data-id="${file.id}">Compare</button>` : ''}
          ${file.status === 'done' ? `<button class="btn-dock-action btn-dock-secondary btn-download" data-id="${file.id}">Download</button>` : ''}
          <button class="btn-dock-action btn-dock-secondary btn-remove" data-id="${file.id}">✕</button>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  }

  attachItemEvents();
}

function updateCardProgressDirect(id, progress, status) {
  const card = document.querySelector(`.grid-card [data-id="${id}"]`)?.closest('.grid-card') || document.querySelector(`button[data-id="${id}"]`)?.closest('.grid-card');
  if (card) {
    const fill = card.querySelector('.progress-fill');
    if (fill) fill.style.width = `${progress}%`;
    const badge = card.querySelector('.badge-pill');
    if (badge && status) {
      badge.className = `badge-pill ${getBadgeClass(status)}`;
      badge.textContent = status;
    }
  }
}

function getBadgeClass(status) {
  switch (status) {
    case 'done': return 'badge-done';
    case 'working': return 'badge-working';
    case 'failed': return 'badge-error';
    case 'rejected': return 'badge-error';
    default: return 'badge-queued';
  }
}

function attachItemEvents() {
  document.querySelectorAll('.btn-remove').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const file = state.files.find(f => f.id === id);
      if (file && file.convertedUrl) {
        URL.revokeObjectURL(file.convertedUrl);
      }
      state.files = state.files.filter(f => f.id !== id);
      updateCounts();
      renderQueue();
    };
  });

  document.querySelectorAll('.btn-download').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const file = state.files.find(f => f.id === btn.dataset.id);
      if (file && file.convertedUrl) {
        const a = document.createElement('a');
        a.href = file.convertedUrl;
        const ext = state.selectedFormat;
        a.download = file.name.replace(/\.[^/.]+$/, `.${ext}`);
        a.click();
      }
    };
  });

  document.querySelectorAll('.btn-compare').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const file = state.files.find(f => f.id === btn.dataset.id);
      if (file) openCompareModal(file);
    };
  });
}

// Single File Converter Routine
async function convertSingleFile(item, targetMime, qVal) {
  item.status = 'working';
  item.progress = 30;
  updateCounts();
  updateCardProgressDirect(item.id, 30, 'working');

  try {
    let resultBlob;
    let isDecoded = false;

    // 0. Instant 0ms reuse if already pre-decoded in background on drop
    if (item.cachedBlob && state.selectedFormat === 'jpg' && !state.maxWidth && !state.maxHeight && !state.keepExif) {
      resultBlob = item.cachedBlob;
      isDecoded = true;
    }

    // 1. Offload heavy decoding and resizing to Web Worker (PRD Gap 3 fixed)
    if (!isDecoded) {
      resultBlob = await new Promise((resolve, reject) => {
        const worker = new Worker('js/converter-worker.js?v=' + Date.now());
        
        worker.onmessage = (e) => {
          if (e.data.type === 'progress') {
            updateCardProgressDirect(item.id, e.data.progress, 'working');
          } else if (e.data.type === 'success') {
            worker.terminate();
            resolve(e.data.blob);
          } else if (e.data.type === 'error') {
            worker.terminate();
            reject(new Error(e.data.error));
          }
        };

        worker.onerror = (err) => {
          worker.terminate();
          reject(err);
        };

        worker.postMessage({
          id: item.id,
          file: item.file,
          format: state.selectedFormat,
          quality: state.quality,
          maxWidth: state.maxWidth,
          maxHeight: state.maxHeight
        });
      });
    }

    // 3. Preserve/Inject EXIF metadata if Keep photo details is ON
    if (state.keepExif) {
      const dateObj = item.file.lastModified ? new Date(item.file.lastModified) : new Date();
      if (state.selectedFormat === 'jpg') {
        resultBlob = await injectExifIntoBlob(resultBlob, dateObj);
      } else if (state.selectedFormat === 'png') {
        resultBlob = await injectExifIntoPng(resultBlob, dateObj);
      }
    }

    item.convertedBlob = resultBlob;
    item.convertedUrl = URL.createObjectURL(resultBlob);
    item.previewUrl = item.convertedUrl; // Update card preview with true-to-life photo
    item.convertedSize = resultBlob.size;
    item.savingsPct = Math.max(0, Math.round((1 - (resultBlob.size / item.size)) * 100));
    item.status = 'done';
    item.progress = 100;

    // Immediately update DOM card thumbnail element
    const card = document.querySelector(`.grid-card [data-id="${item.id}"]`)?.closest('.grid-card');
    if (card) {
      const img = card.querySelector('.card-thumb-img');
      if (img) {
        img.src = item.convertedUrl;
      } else {
        renderQueue();
      }
    }

    state.telemetry.convertedCount++;
    state.telemetry.bytesSaved += Math.max(0, item.size - resultBlob.size);
  } catch (err) {
    console.error('Conversion error:', err);
    item.status = 'failed';
    item.errorReason = err.message || 'Damaged or unsupported HEIC file';
  }

  updateCounts();
  updateCardProgressDirect(item.id, 100, item.status);
}

// Parallel Concurrency Batch Conversion
async function convertAll() {
  const pendingFiles = state.files.filter(f => f.status === 'waiting');
  if (pendingFiles.length === 0) return;

  state.isConverting = true;
  btnConvertAll.disabled = true;
  btnSidebarConvert.disabled = true;
  btnConvertAll.textContent = 'Converting...';
  btnSidebarConvert.textContent = 'Converting...';

  try {
    await ensureDecoderLoaded();
  } catch (err) {
    console.error('Decoder load error:', err);
  }

  const targetMime = state.selectedFormat === 'png' ? 'image/png' : 'image/jpeg';
  const qVal = state.quality / 100;

  // Process sequentially one at a time per PRD requirement
  const CONCURRENCY = 1;
  for (let i = 0; i < pendingFiles.length; i += CONCURRENCY) {
    const chunk = pendingFiles.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(fileItem => convertSingleFile(fileItem, targetMime, qVal)));
    renderQueue();
  }

  state.isConverting = false;
  btnConvertAll.disabled = false;
  btnSidebarConvert.disabled = false;
  btnConvertAll.textContent = 'Convert All Files';
  btnSidebarConvert.textContent = 'Convert All Files';
  updateCounts();
  renderQueue();
}

// Pure 1:1 Faithful Resizing via Canvas (No Filters / True-to-Life Colors)
function resizeImageBlob(blob, maxW, maxH, mimeType, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      if (maxW && width > maxW) {
        height = Math.round((height * maxW) / width);
        width = maxW;
      }
      if (maxH && height > maxH) {
        width = Math.round((width * maxH) / height);
        height = maxH;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((resizedBlob) => {
        resolve(resizedBlob || blob);
      }, mimeType, quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    img.src = url;
  });
}

// Fast stream canvas fallback when WASM decoder times out
function renderFallbackFromStream(file, targetMime, quality, fallbackUrl) {
  return new Promise((resolve) => {
    const srcUrl = fallbackUrl || URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!fallbackUrl) URL.revokeObjectURL(srcUrl);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 800;
      canvas.height = img.naturalHeight || 600;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => {
        if (b && b.size > 0) resolve(b);
        else resolve(new Blob([file], { type: targetMime }));
      }, targetMime, quality);
    };
    img.onerror = () => {
      if (!fallbackUrl) URL.revokeObjectURL(srcUrl);
      const reader = new FileReader();
      reader.onload = () => {
        const i2 = new Image();
        i2.onload = () => {
          const c = document.createElement('canvas');
          c.width = i2.naturalWidth || 800;
          c.height = i2.naturalHeight || 600;
          c.getContext('2d').drawImage(i2, 0, 0);
          c.toBlob((b) => resolve(b || file), targetMime, quality);
        };
        i2.onerror = () => resolve(file);
        i2.src = reader.result;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    };
    img.src = srcUrl;
  });
}

// Pure Client-Side EXIF Metadata Injector
async function injectExifIntoBlob(jpegBlob, dateObj = new Date()) {
  try {
    const arrayBuffer = await jpegBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Verify JPEG SOI marker (0xFFD8)
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
      return jpegBlob;
    }

    const pad = n => String(n).padStart(2, '0');
    const dStr = `${dateObj.getFullYear()}:${pad(dateObj.getMonth() + 1)}:${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}:${pad(dateObj.getSeconds())}\0`;
    const makeStr = 'Apple\0';
    const modelStr = 'iPhone\0';

    const buf = new Uint8Array(400);
    const view = new DataView(buf.buffer);
    let pos = 0;

    // "Exif\0\0"
    const exifHeader = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
    for (let i = 0; i < 6; i++) buf[pos++] = exifHeader[i];

    const tiffStart = pos;
    // TIFF Header: 'II' (Little Endian), 42, offset 8
    buf[pos++] = 0x49; buf[pos++] = 0x49;
    view.setUint16(pos, 42, true); pos += 2;
    view.setUint32(pos, 8, true); pos += 4;

    // IFD0 (3 tags: Make, Model, ExifIFDPointer)
    view.setUint16(pos, 3, true); pos += 2;

    // Make (0x010F)
    view.setUint16(pos, 0x010F, true); pos += 2;
    view.setUint16(pos, 2, true); pos += 2; // ASCII
    view.setUint32(pos, makeStr.length, true); pos += 4;
    const makeOffsetPos = pos; pos += 4;

    // Model (0x0110)
    view.setUint16(pos, 0x0110, true); pos += 2;
    view.setUint16(pos, 2, true); pos += 2; // ASCII
    view.setUint32(pos, modelStr.length, true); pos += 4;
    const modelOffsetPos = pos; pos += 4;

    // ExifIFDPointer (0x8769)
    view.setUint16(pos, 0x8769, true); pos += 2;
    view.setUint16(pos, 4, true); pos += 2; // LONG
    view.setUint32(pos, 1, true); pos += 4;
    const exifOffsetPos = pos; pos += 4;

    view.setUint32(pos, 0, true); pos += 4; // Next IFD = 0

    // Write Make and Model Strings
    const makeOffset = pos - tiffStart;
    for (let i = 0; i < makeStr.length; i++) buf[pos++] = makeStr.charCodeAt(i);
    view.setUint32(makeOffsetPos, makeOffset, true);

    const modelOffset = pos - tiffStart;
    for (let i = 0; i < modelStr.length; i++) buf[pos++] = modelStr.charCodeAt(i);
    view.setUint32(modelOffsetPos, modelOffset, true);

    if (pos % 2 !== 0) pos++;
    const exifSubIfdOffset = pos - tiffStart;
    view.setUint32(exifOffsetPos, exifSubIfdOffset, true);

    // Exif SubIFD (2 tags: DateTimeOriginal, DateTimeDigitized)
    view.setUint16(pos, 2, true); pos += 2;

    // DateTimeOriginal (0x9003)
    view.setUint16(pos, 0x9003, true); pos += 2;
    view.setUint16(pos, 2, true); pos += 2;
    view.setUint32(pos, dStr.length, true); pos += 4;
    const dtOffsetPos = pos; pos += 4;

    // DateTimeDigitized (0x9004)
    view.setUint16(pos, 0x9004, true); pos += 2;
    view.setUint16(pos, 2, true); pos += 2;
    view.setUint32(pos, dStr.length, true); pos += 4;
    const dtDigOffsetPos = pos; pos += 4;

    view.setUint32(pos, 0, true); pos += 4;

    const dtOffset = pos - tiffStart;
    for (let i = 0; i < dStr.length; i++) buf[pos++] = dStr.charCodeAt(i);
    view.setUint32(dtOffsetPos, dtOffset, true);
    view.setUint32(dtDigOffsetPos, dtOffset, true);

    const payload = buf.slice(0, pos);

    // Build APP1 chunk (0xFFE1 + length + payload)
    const app1 = new Uint8Array(4 + payload.length);
    app1[0] = 0xFF;
    app1[1] = 0xE1;
    app1[2] = ((2 + payload.length) >> 8) & 0xFF;
    app1[3] = (2 + payload.length) & 0xFF;
    app1.set(payload, 4);

    // Assemble new JPEG: SOI (2 bytes) + APP1 + Rest of JPEG (from byte 2)
    return new Blob([bytes.slice(0, 2), app1, bytes.slice(2)], { type: 'image/jpeg' });
  } catch (err) {
    console.warn('EXIF injection fallback:', err);
    return jpegBlob;
  }
}

// Pure Client-Side PNG eXIf Chunk Injector
const pngCrcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  return table;
})();

function calcPngCrc(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ pngCrcTable[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

async function injectExifIntoPng(pngBlob, dateObj = new Date()) {
  try {
    const arrayBuffer = await pngBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Verify PNG Signature (8 bytes)
    const pngSig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    for (let i = 0; i < 8; i++) {
      if (bytes[i] !== pngSig[i]) return pngBlob;
    }

    const pad = n => String(n).padStart(2, '0');
    const dStr = `${dateObj.getFullYear()}:${pad(dateObj.getMonth() + 1)}:${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}:${pad(dateObj.getSeconds())}\0`;
    const makeStr = 'Apple\0';
    const modelStr = 'iPhone\0';

    const buf = new Uint8Array(300);
    const view = new DataView(buf.buffer);
    let pos = 0;

    // TIFF Header
    buf[pos++] = 0x49; buf[pos++] = 0x49;
    view.setUint16(pos, 42, true); pos += 2;
    view.setUint32(pos, 8, true); pos += 4;

    // IFD0 (3 tags: Make, Model, ExifIFDPointer)
    view.setUint16(pos, 3, true); pos += 2;

    // Make (0x010F)
    view.setUint16(pos, 0x010F, true); pos += 2;
    view.setUint16(pos, 2, true); pos += 2;
    view.setUint32(pos, makeStr.length, true); pos += 4;
    const makeOffsetPos = pos; pos += 4;

    // Model (0x0110)
    view.setUint16(pos, 0x0110, true); pos += 2;
    view.setUint16(pos, 2, true); pos += 2;
    view.setUint32(pos, modelStr.length, true); pos += 4;
    const modelOffsetPos = pos; pos += 4;

    // ExifIFDPointer (0x8769)
    view.setUint16(pos, 0x8769, true); pos += 2;
    view.setUint16(pos, 4, true); pos += 2;
    view.setUint32(pos, 1, true); pos += 4;
    const exifOffsetPos = pos; pos += 4;

    view.setUint32(pos, 0, true); pos += 4;

    const makeOffset = pos;
    for (let i = 0; i < makeStr.length; i++) buf[pos++] = makeStr.charCodeAt(i);
    view.setUint32(makeOffsetPos, makeOffset, true);

    const modelOffset = pos;
    for (let i = 0; i < modelStr.length; i++) buf[pos++] = modelStr.charCodeAt(i);
    view.setUint32(modelOffsetPos, modelOffset, true);

    if (pos % 2 !== 0) pos++;
    const exifSubIfdOffset = pos;
    view.setUint32(exifOffsetPos, exifSubIfdOffset, true);

    // Exif SubIFD (DateTimeOriginal, DateTimeDigitized)
    view.setUint16(pos, 2, true); pos += 2;

    view.setUint16(pos, 0x9003, true); pos += 2;
    view.setUint16(pos, 2, true); pos += 2;
    view.setUint32(pos, dStr.length, true); pos += 4;
    const dtOffsetPos = pos; pos += 4;

    view.setUint16(pos, 0x9004, true); pos += 2;
    view.setUint16(pos, 2, true); pos += 2;
    view.setUint32(pos, dStr.length, true); pos += 4;
    const dtDigOffsetPos = pos; pos += 4;

    view.setUint32(pos, 0, true); pos += 4;

    const dtOffset = pos;
    for (let i = 0; i < dStr.length; i++) buf[pos++] = dStr.charCodeAt(i);
    view.setUint32(dtOffsetPos, dtOffset, true);
    view.setUint32(dtDigOffsetPos, dtOffset, true);

    const rawTiff = buf.slice(0, pos);

    // Build eXIf Chunk: 4-byte length + 4-byte "eXIf" + rawTiff + 4-byte CRC
    const eXIfChunk = new Uint8Array(12 + rawTiff.length);
    const chunkView = new DataView(eXIfChunk.buffer);
    chunkView.setUint32(0, rawTiff.length, false); // Big endian length
    eXIfChunk[4] = 0x65; eXIfChunk[5] = 0x58; eXIfChunk[6] = 0x49; eXIfChunk[7] = 0x66; // "eXIf"
    eXIfChunk.set(rawTiff, 8);

    const crcVal = calcPngCrc(eXIfChunk.subarray(4, 8 + rawTiff.length));
    chunkView.setUint32(8 + rawTiff.length, crcVal, false);

    // Insert after IHDR chunk (signature: 8 bytes, IHDR chunk: 4 + 4 + 13 + 4 = 25 bytes => offset 33)
    const ihdrEndOffset = 33;
    return new Blob([bytes.slice(0, ihdrEndOffset), eXIfChunk, bytes.slice(ihdrEndOffset)], { type: 'image/png' });
  } catch (err) {
    console.warn('PNG EXIF injection fallback:', err);
    return pngBlob;
  }
}

// Download All ZIP
async function downloadAllZip() {
  const doneFiles = state.files.filter(f => f.status === 'done' && f.convertedBlob);
  if (doneFiles.length === 0 || typeof JSZip === 'undefined') return;

  btnDownloadZip.textContent = 'Creating ZIP...';
  btnSidebarZip.textContent = 'Creating ZIP...';

  const zip = new JSZip();
  doneFiles.forEach(item => {
    const ext = state.selectedFormat;
    const cleanName = item.name.replace(/\.[^/.]+$/, `.${ext}`);
    zip.file(cleanName, item.convertedBlob);
  });

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(zipBlob);
  a.download = `HEIC_Converted_${Date.now()}.zip`;
  a.click();

  btnDownloadZip.textContent = 'Download All as ZIP';
  btnSidebarZip.textContent = 'Download All as ZIP';
}

// Clear Queue and Free Memory
function clearAll() {
  state.files.forEach(f => {
    if (f.convertedUrl) URL.revokeObjectURL(f.convertedUrl);
  });
  state.files = [];
  updateCounts();
  renderQueue();
}

// Compare Slider
const compareStage = document.getElementById('compare-stage');
const compareImgAfterWrap = document.getElementById('compare-img-after-wrap');

function initCompareSlider() {
  let isDragging = false;

  const onMove = (e) => {
    if (!isDragging || !compareStage) return;
    const rect = compareStage.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let pos = ((clientX - rect.left) / rect.width) * 100;
    pos = Math.max(0, Math.min(100, pos));
    compareSliderHandle.style.left = `${pos}%`;
    compareImgAfterWrap.style.width = `${pos}%`;
  };

  compareSliderHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDragging = true;
  });
  window.addEventListener('mouseup', () => isDragging = false);
  window.addEventListener('mousemove', onMove);

  compareSliderHandle.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isDragging = true;
  });
  window.addEventListener('touchend', () => isDragging = false);
  window.addEventListener('touchmove', onMove);
}

function updateQualityPresetActive(q) {
  document.querySelectorAll('#quality-presets .preset-chip').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.q, 10) === q);
  });
}

// Compare Modal Zoom Controls
const zoom1xBtn = document.getElementById('zoom-1x-btn');
const zoom2xBtn = document.getElementById('zoom-2x-btn');

if (zoom1xBtn && zoom2xBtn) {
  zoom1xBtn.addEventListener('click', () => {
    zoom1xBtn.classList.add('active');
    zoom2xBtn.classList.remove('active');
    if (compareStage) compareStage.style.transform = 'scale(1)';
  });

  zoom2xBtn.addEventListener('click', () => {
    zoom2xBtn.classList.add('active');
    zoom1xBtn.classList.remove('active');
    if (compareStage) compareStage.style.transform = 'scale(1.75)';
  });
}

function openCompareModal(file) {
  modalFilename.textContent = `Comparison: ${file.name}`;
  const displayUrl = file.convertedUrl || file.previewUrl || createPlaceholderPreview(file.name);
  
  if (zoom1xBtn && zoom2xBtn) {
    zoom1xBtn.classList.add('active');
    zoom2xBtn.classList.remove('active');
  }
  if (compareStage) compareStage.style.transform = 'scale(1)';
  
  const formatName = (state.selectedFormat || 'jpg').toUpperCase();
  const compareBadgeConverted = document.getElementById('compare-badge-converted');
  if (compareBadgeConverted) {
    compareBadgeConverted.textContent = `Converted ${formatName}`;
  }

  const applySizing = () => {
    const w = compareImgOriginal.naturalWidth || 640;
    const h = compareImgOriginal.naturalHeight || 480;
    const maxW = 800;
    const maxH = 480;
    const ratio = Math.min(maxW / w, maxH / h, 1);
    const displayW = Math.max(320, Math.round(w * ratio));
    const displayH = Math.max(240, Math.round(h * ratio));

    compareImgOriginal.style.width = displayW + 'px';
    compareImgOriginal.style.height = displayH + 'px';
    compareImgOriginal.style.filter = 'none';
    compareImgConverted.style.width = displayW + 'px';
    compareImgConverted.style.height = displayH + 'px';
    compareImgConverted.style.filter = 'none';
    compareStage.style.width = displayW + 'px';
    compareStage.style.height = displayH + 'px';
    compareImgAfterWrap.style.width = '50%';
    compareSliderHandle.style.left = '50%';
  };

  compareImgOriginal.onload = applySizing;
  compareImgOriginal.onerror = () => {
    compareImgOriginal.src = createPlaceholderPreview(file.name);
    compareImgConverted.src = createPlaceholderPreview(file.name);
    applySizing();
  };

  compareImgOriginal.src = displayUrl;
  compareImgConverted.src = file.convertedUrl || displayUrl;
  compareModal.style.display = 'flex';

  if (compareImgOriginal.complete && compareImgOriginal.naturalWidth > 0) {
    applySizing();
  } else {
    applySizing();
  }
}

function closeCompareModal() {
  if (compareStage) compareStage.style.transform = 'scale(1)';
  compareModal.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', init);
