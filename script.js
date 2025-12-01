const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const previewWrapper = document.getElementById('previewWrapper');
const previewContainer = document.getElementById('previewContainer');
const exportCanvas = document.getElementById('exportCanvas');
const exportCtx = exportCanvas.getContext('2d');
const exportBtn = document.getElementById('exportBtn');
const copyBtn = document.getElementById('copyBtn');
const clearBtn = document.getElementById('clearBtn');
const imageCountDisplay = document.getElementById('imageCount');
const canvasSizeDisplay = document.getElementById('canvasSize');
const zoomDisplay = document.getElementById('zoomDisplay');

// Inputs
const canvasWidthInput = document.getElementById('canvasWidth');
const targetRowHeightInput = document.getElementById('targetRowHeight');
const paddingInput = document.getElementById('padding');
const canvasWidthSlider = document.getElementById('canvasWidthSlider');
const rowHeightSlider = document.getElementById('rowHeightSlider');
const paddingSlider = document.getElementById('paddingSlider');
const bgColorInput = document.getElementById('bgColor');
const bgColorValue = document.getElementById('bgColorValue');
const hanModeToggle = document.getElementById('hanModeToggle');
const hanControls = document.getElementById('hanControls');
const hanStripCountInput = document.getElementById('hanStripCount');
const hanGenerateBtn = document.getElementById('hanGenerateBtn');
const hanSingleWidthInput = document.getElementById('hanSingleWidth');
const hanSingleWidthSlider = document.getElementById('hanSingleWidthSlider');
const previewHint = document.querySelector('.preview-hint');
const toastContainer = document.getElementById('toastContainer');
const filenameToggle = document.getElementById('filenameToggle');
let showFilenames = false;
const exportModal = document.getElementById('exportModal');
const exportModalClose = document.getElementById('exportModalClose');
const exportFormatRadios = document.querySelectorAll('input[name="exportFormat"]');
const exportQualitySlider = document.getElementById('exportQuality');
const exportQualityValue = document.getElementById('exportQualityValue');
const exportQualityRow = document.getElementById('qualityRow');
const exportPreviewList = document.getElementById('exportPreviewList');
const exportConfirmBtn = document.getElementById('exportConfirmBtn');
const exportZipBtn = document.getElementById('exportZipBtn');
let exportConfig = { format: 'png', quality: 0.92 };

let loadedImages = []; // Array of { element: HTMLImageElement, aspectRatio: number, id: string }
let dragSrcId = null; // Use ID instead of index for stability
let currentScale = 1; // Track applied preview scale for accurate drag images
let lastReorderTargetId = null;
const MAX_DRAG_PREVIEW = 240;
let activeDragPreviewEl = null;
let insertIndicator = null;
let activeInsertHint = null;
let lastLayout = null;
let lastDragPosition = null;
const MIN_DRAG_POINTER_DELTA = 4;
// WRAPPER_PADDING is now dynamic via getWrapperPadding()
const EDGE_DEAD_ZONE = 16;
const GAP_THRESHOLD = 8;
const HYSTERESIS_FORWARD = 0.7;
const HYSTERESIS_BACKWARD = 0.3;
const MIN_POINTER_MOVE = 4;
const HEAD_TAIL_ZONE = 60;

// Get wrapper padding dynamically from CSS variable (responsive)
function getWrapperPadding() {
    const computed = getComputedStyle(document.documentElement);
    const paddingStr = computed.getPropertyValue('--wrapper-padding').trim();
    return parseInt(paddingStr, 10) || 40; // Fallback to 40px
}


// Zoom State
let userZoom = 1.0;
let userPan = { x: 0, y: 0 };
let baseScale = 1.0;
let baseOffset = { x: 0, y: 0 };

// Han mode (multi-strip) state
let hanModeEnabled = false;
let strips = []; // Array of arrays of image ids
let targetStripCount = null;
const HAN_STRIP_SPACING = 40;
const HAN_SEPARATOR_WIDTH = 4;        // 分隔线宽度
const HAN_SEPARATOR_COLOR = '#3b82f6'; // 分隔线颜色（蓝色）
let isMiddlePanning = false;
let lastPanPoint = null;
let middlePanPointerId = null;
let middlePanStartPan = null;
let middlePanStartPoint = null;
let middlePanRafId = null;

function throttleRAF(fn) {
    let ticking = false;
    let lastArgs = null;
    return function throttled(...args) {
        lastArgs = args;
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            ticking = false;
            fn.apply(null, lastArgs);
        });
    };
}

function debounce(fn, delay = 150) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(null, args), delay);
    };
}

function showToast(message) {
    if (!toastContainer) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    toastContainer.appendChild(el);
    setTimeout(() => {
        el.remove();
    }, 2500);
}

function ensureInsertIndicator() {
    if (insertIndicator && insertIndicator.parentElement === previewContainer) return;
    insertIndicator = document.createElement('div');
    insertIndicator.className = 'insert-indicator hidden';
    previewContainer.appendChild(insertIndicator);
}

function hideInsertIndicator() {
    if (insertIndicator) {
        insertIndicator.classList.add('hidden');
    }
}

function renderInsertIndicator() {
    if (!insertIndicator || !activeInsertHint || !lastLayout) return;
    const box = (lastLayout.boxes || []).find(b => b && b.img && b.img.id === activeInsertHint.targetId);
    if (!box) {
        hideInsertIndicator();
        return;
    }
    insertIndicator.style.left = `${activeInsertHint.insertAfter ? box.x + box.width : box.x}px`;
    insertIndicator.style.top = `${box.y}px`;
    insertIndicator.style.height = `${box.height}px`;
    insertIndicator.classList.remove('hidden');
}

function setInsertHint(targetId, insertAfter) {
    if (!targetId) {
        activeInsertHint = null;
        hideInsertIndicator();
        return;
    }
    activeInsertHint = { targetId, insertAfter };
    renderInsertIndicator();
}

function updateDragPointer(e) {
    const point = { x: e.clientX, y: e.clientY };
    if (!lastDragPosition) {
        lastDragPosition = point;
        return true;
    }
    const delta = Math.hypot(point.x - lastDragPosition.x, point.y - lastDragPosition.y);
    if (delta < MIN_DRAG_POINTER_DELTA) {
        return false;
    }
    lastDragPosition = point;
    return true;
}

function findImageById(id) {
    return loadedImages.find(img => img.id === id);
}

function cloneStripsData() {
    return strips.map(strip => [...strip]);
}

function orderFromStrips(stripsData) {
    const result = [];
    stripsData.forEach(strip => {
        strip.forEach(id => result.push(id));
    });
    return result;
}

function reorderList(list, sourceId, destIndex) {
    const srcIndex = list.indexOf(sourceId);
    if (srcIndex === -1) return list;
    const next = [...list];
    const [item] = next.splice(srcIndex, 1);
    const bounded = Math.max(0, Math.min(destIndex, next.length));
    next.splice(bounded, 0, item);
    return next;
}

function reorderStrips(stripsData, sourceId, destStrip, destIndex) {
    const next = stripsData.map(strip => [...strip]);
    const srcStripIdx = next.findIndex(strip => strip.includes(sourceId));
    if (srcStripIdx === -1) return next;
    const srcPos = next[srcStripIdx].indexOf(sourceId);
    if (srcPos === -1) return next;

    const boundedStrip = Math.max(0, Math.min(destStrip, next.length - 1));
    const targetStrip = next[boundedStrip];
    const [item] = next[srcStripIdx].splice(srcPos, 1);

    let insertPos = destIndex;
    if (srcStripIdx === boundedStrip && srcPos < insertPos) insertPos -= 1;
    insertPos = Math.max(0, Math.min(insertPos, targetStrip.length));
    targetStrip.splice(insertPos, 0, item);
    return next;
}

function simulateListMove(order, sourceId, destIndex) {
    const list = [...order];
    const srcIndex = list.indexOf(sourceId);
    if (srcIndex === -1) return list;
    const [item] = list.splice(srcIndex, 1);
    const bounded = Math.max(0, Math.min(destIndex, list.length));
    list.splice(bounded, 0, item);
    return list;
}

function simulateStripsMove(stripsData, sourceId, destStrip, destIndex) {
    const next = stripsData.map(strip => [...strip]);
    const srcStripIdx = next.findIndex(strip => strip.includes(sourceId));
    if (srcStripIdx === -1) return next;
    const srcPos = next[srcStripIdx].indexOf(sourceId);
    if (srcPos === -1) return next;

    const boundedStrip = Math.max(0, Math.min(destStrip, next.length - 1));
    const targetStrip = next[boundedStrip];
    const [item] = next[srcStripIdx].splice(srcPos, 1);
    let insertPos = Math.max(0, Math.min(destIndex, targetStrip.length));
    targetStrip.splice(insertPos, 0, item);
    return next;
}

function buildSlotMap() {
    if (!lastLayout || !lastLayout.boxes) return null;
    const boxMap = new Map();
    lastLayout.boxes.forEach(box => {
        if (box && box.img && box.img.id) {
            boxMap.set(box.img.id, box);
        }
    });

    const slotsByStrip = [];
    const baseOrderStrips = [];
    const hitZones = [];
    const stripMeta = [];

    if (hanModeEnabled && strips.length) {
        strips.forEach((strip, stripIndex) => {
            const ids = strip.filter(Boolean);
            baseOrderStrips.push([...ids]);
            const slots = [];
            let minX = Infinity;
            let maxX = -Infinity;
            let minY = Infinity;
            let maxY = -Infinity;
            ids.forEach((id, idx) => {
                const box = boxMap.get(id);
                if (box) {
                    slots.push({
                        id,
                        stripIndex,
                        orderIndex: idx,
                        box
                    });
                    minX = Math.min(minX, box.x);
                    maxX = Math.max(maxX, box.x + box.width);
                    minY = Math.min(minY, box.y);
                    maxY = Math.max(maxY, box.y + box.height);
                }
            });
            if (slots.length > 0) {
                const zoneWidth = maxX - minX;
                const head = {
                    type: 'head',
                    stripIndex,
                    box: {
                        x: minX,
                        y: Math.max(0, minY - HEAD_TAIL_ZONE),
                        width: zoneWidth,
                        height: HEAD_TAIL_ZONE
                    }
                };
                const tail = {
                    type: 'tail',
                    stripIndex,
                    box: {
                        x: minX,
                        y: maxY,
                        width: zoneWidth,
                        height: HEAD_TAIL_ZONE
                    }
                };
                hitZones.push(head, tail);
                stripMeta.push({
                    stripIndex,
                    minX,
                    maxX,
                    minY,
                    maxY
                });
            }
            slotsByStrip.push(slots);
        });
    } else {
        const ids = loadedImages.map(img => img.id);
        baseOrderStrips.push([...ids]);
        const slots = [];
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        ids.forEach((id, idx) => {
            const box = boxMap.get(id);
            if (box) {
                slots.push({
                    id,
                    stripIndex: 0,
                    orderIndex: idx,
                    box
                });
                minX = Math.min(minX, box.x);
                maxX = Math.max(maxX, box.x + box.width);
                minY = Math.min(minY, box.y);
                maxY = Math.max(maxY, box.y + box.height);
            }
        });
        if (slots.length > 0) {
            const zoneWidth = maxX - minX;
            hitZones.push({
                type: 'head',
                stripIndex: 0,
                box: {
                    x: minX,
                    y: Math.max(0, minY - HEAD_TAIL_ZONE),
                    width: zoneWidth,
                    height: HEAD_TAIL_ZONE
                }
            });
            hitZones.push({
                type: 'tail',
                stripIndex: 0,
                box: {
                    x: minX,
                    y: maxY,
                    width: zoneWidth,
                    height: HEAD_TAIL_ZONE
                }
            });
            stripMeta.push({
                stripIndex: 0,
                minX,
                maxX,
                minY,
                maxY
            });
        }
        slotsByStrip.push(slots);
    }

    const flatSlots = slotsByStrip.flat();
    const idToSlot = new Map();
    flatSlots.forEach(slot => idToSlot.set(slot.id, slot));

    return {
        slots: flatSlots,
        slotsByStrip,
        baseOrderStrips,
        idToSlot,
        hitZones,
        stripMeta
    };
}

function mapIdsToImages(order) {
    return order.map(id => findImageById(id)).filter(Boolean);
}

function flattenStripsToImages() {
    if (!hanModeEnabled || !strips.length) return;
    const reordered = [];
    strips.forEach(strip => {
        strip.forEach(id => {
            const img = findImageById(id);
            if (img) reordered.push(img);
        });
    });
    loadedImages = reordered;
}

function resetStripsFromLoaded() {
    if (!hanModeEnabled) return;
    strips = [loadedImages.map(img => img.id)];
    targetStripCount = null;
    if (hanStripCountInput) hanStripCountInput.value = '';
    updateCopyButtonState();
}

function getRenderStrips() {
    if (!hanModeEnabled || !strips.length) {
        return [loadedImages];
    }
    return strips.map(strip => strip.map(id => findImageById(id)).filter(Boolean)).filter(s => s.length > 0);
}

function suggestedStripCount() {
    if (!loadedImages.length) return '';
    // simple heuristic: about 10 pages per strip
    return Math.max(1, Math.ceil(loadedImages.length / 10));
}

function generateStrips(count) {
    if (!hanModeEnabled || !loadedImages.length) return;
    const total = loadedImages.length;
    const safeCount = Math.max(1, Math.min(count, total));
    const ids = loadedImages.map(img => img.id);
    const baseSize = Math.floor(total / safeCount);
    let remainder = total % safeCount;
    const result = [];
    let cursor = 0;

    // 分配策略：前少后多 [少 少 少 多 多]
    // 将余数分配给后面的 strip，而不是前面的
    for (let i = 0; i < safeCount; i++) {
        // 计算从后往前的索引，后面的 strip 获得额外的图片
        const reverseIndex = safeCount - 1 - i;
        const size = baseSize + (reverseIndex < remainder ? 1 : 0);
        const chunk = ids.slice(cursor, cursor + size);
        cursor += size;
        if (chunk.length > 0) result.push(chunk);
    }
    strips = result;
    flattenStripsToImages();
    targetStripCount = safeCount;
    render();
}

function setHanModeEnabled(enabled) {
    hanModeEnabled = enabled;
    if (hanModeToggle) hanModeToggle.checked = enabled;
    if (enabled) {
        resetStripsFromLoaded();
        if (hanStripCountInput) hanStripCountInput.placeholder = suggestedStripCount() || '例如：3';
        if (hanSingleWidthInput && !hanSingleWidthInput.value) {
            hanSingleWidthInput.value = '800';
        }
    } else {
        strips = [];
        targetStripCount = null;
        if (hanStripCountInput) hanStripCountInput.value = '';
        if (hanSingleWidthInput) hanSingleWidthInput.value = '';
    }
    if (hanSingleWidthSlider && hanSingleWidthInput && hanSingleWidthInput.value) {
        hanSingleWidthSlider.value = hanSingleWidthInput.value;
    }
    updateHanControlsVisibility();
    updateCopyButtonState();
    render();
}

function updateHanControlsVisibility() {
    if (!hanControls) return;
    if (hanModeEnabled && loadedImages.length > 0) {
        hanControls.style.display = 'block';
        if (!hanStripCountInput.value) hanStripCountInput.value = suggestedStripCount();
    } else {
        hanControls.style.display = 'none';
    }
}

// Ensure container-level dragover to handle gaps between items
previewContainer.addEventListener('dragover', handleContainerDragOver);

// Zoom Interaction
previewWrapper.addEventListener('wheel', (e) => {
    // Only handle if dragging is NOT active (or handle carefully)
    // And ensure we are not dragging files
    if (e.dataTransfer && e.dataTransfer.types.includes('Files')) return;

    e.preventDefault();

    const rect = previewWrapper.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate mouse position relative to the container (before zoom)
    // transform origin is effectively (0,0) due to our manual translation
    // currentX = baseOffset.x + userPan.x
    // currentY = baseOffset.y + userPan.y
    // mouse relative to container = (mouse - currentOffset) / currentScale

    const currentOffsetX = baseOffset.x + userPan.x;
    const currentOffsetY = baseOffset.y + userPan.y;
    const oldScale = baseScale * userZoom;

    // Point in container space under the mouse
    const pointX = (mouseX - currentOffsetX) / oldScale;
    const pointY = (mouseY - currentOffsetY) / oldScale;

    // Calculate new zoom
    const delta = Math.sign(e.deltaY);
    const step = 0.1;
    let newZoom = userZoom * (1 - delta * step);
    newZoom = Math.max(0.1, Math.min(newZoom, 5.0));

    // Calculate new pan to keep the point under the mouse stationary
    // mouseX = newOffset + point * newScale
    // newOffset = mouseX - point * newScale
    // newOffset = baseOffset + newUserPan
    // newUserPan = mouseX - point * newScale - baseOffset

    const newScale = baseScale * newZoom;
    const newTotalOffsetX = mouseX - pointX * newScale;
    const newTotalOffsetY = mouseY - pointY * newScale;

    userPan.x = newTotalOffsetX - baseOffset.x;
    userPan.y = newTotalOffsetY - baseOffset.y;
    userZoom = newZoom;

    render();
}, { passive: false });

// Double click to reset
previewWrapper.addEventListener('dblclick', (e) => {
    if (e.target === previewWrapper || e.target === previewContainer) {
        userZoom = 1.0;
        userPan = { x: 0, y: 0 };
        render();
    }
});

// Middle mouse drag to pan (pointer events + rAF for smoother follow)
previewWrapper.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 1) return;
    e.preventDefault();
    isMiddlePanning = true;
    middlePanPointerId = e.pointerId;
    middlePanStartPoint = { x: e.clientX, y: e.clientY };
    middlePanStartPan = { x: userPan.x, y: userPan.y };
    lastPanPoint = { x: e.clientX, y: e.clientY };
    previewWrapper.setPointerCapture(e.pointerId);
    previewWrapper.classList.add('panning');
});

previewWrapper.addEventListener('pointermove', (e) => {
    if (!isMiddlePanning || e.pointerId !== middlePanPointerId || !middlePanStartPoint || !middlePanStartPan) return;
    e.preventDefault();
    lastPanPoint = { x: e.clientX, y: e.clientY };
    if (middlePanRafId) return;
    middlePanRafId = requestAnimationFrame(() => {
        const dx = lastPanPoint.x - middlePanStartPoint.x;
        const dy = lastPanPoint.y - middlePanStartPoint.y;
        userPan.x = middlePanStartPan.x + dx;
        userPan.y = middlePanStartPan.y + dy;
        updateContainerTransform();
        middlePanRafId = null;
    });
});

['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => {
    previewWrapper.addEventListener(ev, (e) => {
        if (!isMiddlePanning || e.pointerId !== middlePanPointerId) return;
        if (previewWrapper.hasPointerCapture && previewWrapper.hasPointerCapture(e.pointerId)) {
            previewWrapper.releasePointerCapture(e.pointerId);
        }
        isMiddlePanning = false;
        middlePanPointerId = null;
        middlePanStartPan = null;
        middlePanStartPoint = null;
        lastPanPoint = null;
        if (middlePanRafId) {
            cancelAnimationFrame(middlePanRafId);
            middlePanRafId = null;
        }
        previewWrapper.classList.remove('panning');
    });
});

// Event Listeners for Controls
const inputs = [canvasWidthInput, targetRowHeightInput, paddingInput, bgColorInput];
inputs.forEach(input => {
    input.addEventListener('input', () => {
        if (input === bgColorInput) {
            bgColorValue.textContent = input.value;
        }
        if (input === canvasWidthInput && canvasWidthSlider) {
            canvasWidthSlider.value = input.value;
        }
        if (input === targetRowHeightInput && rowHeightSlider) {
            rowHeightSlider.value = input.value;
        }
        if (input === paddingInput && paddingSlider) {
            paddingSlider.value = input.value;
        }
        render();
    });
});

if (rowHeightSlider) {
    rowHeightSlider.addEventListener('input', () => {
        targetRowHeightInput.value = rowHeightSlider.value;
        render();
    });
}
if (paddingSlider) {
    paddingSlider.addEventListener('input', () => {
        paddingInput.value = paddingSlider.value;
        render();
    });
}
if (canvasWidthSlider) {
    canvasWidthSlider.addEventListener('input', () => {
        canvasWidthInput.value = canvasWidthSlider.value;
        render();
    });
}
if (hanSingleWidthSlider && hanSingleWidthInput) {
    hanSingleWidthSlider.addEventListener('input', () => {
        hanSingleWidthInput.value = hanSingleWidthSlider.value;
        render();
    });
}

function syncSlidersFromInputs() {
    if (canvasWidthSlider) canvasWidthSlider.value = canvasWidthInput.value;
    if (rowHeightSlider) rowHeightSlider.value = targetRowHeightInput.value;
    if (paddingSlider) paddingSlider.value = paddingInput.value;
    if (hanSingleWidthSlider && hanSingleWidthInput && hanSingleWidthInput.value) {
        hanSingleWidthSlider.value = hanSingleWidthInput.value;
    }
}
syncSlidersFromInputs();

const debouncedRender = debounce(render, 160);
window.addEventListener('resize', debouncedRender);

if (hanModeToggle) {
    hanModeToggle.addEventListener('change', (e) => {
        setHanModeEnabled(!!e.target.checked);
        if (hanModeEnabled) {
            const rawPadding = parseInt(paddingInput.value, 10);
            if (!Number.isFinite(rawPadding) || rawPadding !== 0) {
                paddingInput.value = '0';
                if (paddingSlider) paddingSlider.value = '0';
            }
        }
    });
}

if (hanGenerateBtn) {
    hanGenerateBtn.addEventListener('click', () => {
        const raw = parseInt(hanStripCountInput.value, 10);
        const count = Number.isFinite(raw) ? raw : 0;
        if (count > 0) {
            generateStrips(count);
        }
    });
}

if (filenameToggle) {
    filenameToggle.addEventListener('change', (e) => {
        showFilenames = !!e.target.checked;
        render();
    });
}

if (exportModalClose) {
    exportModalClose.addEventListener('click', closeExportModal);
}

if (exportFormatRadios && exportFormatRadios.length) {
    exportFormatRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            updateExportQualityVisibility();
            refreshExportPreviewList();
        });
    });
}

if (exportQualitySlider) {
    exportQualitySlider.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        exportConfig.quality = Math.max(0.1, Math.min(val / 100, 0.95));
        if (exportQualityValue) {
            exportQualityValue.textContent = `${Math.round(exportConfig.quality * 100)}%`;
        }
        refreshExportPreviewList();
    });
}

if (exportConfirmBtn) {
    exportConfirmBtn.addEventListener('click', () => handleExportAction('single'));
}
if (exportZipBtn) {
    exportZipBtn.addEventListener('click', () => handleExportAction('zip'));
}

updateHanControlsVisibility();
// Disable copy button in han mode
function updateCopyButtonState() {
    if (!copyBtn) return;
    copyBtn.disabled = !!hanModeEnabled;
    copyBtn.title = hanModeEnabled ? '汉化模式下暂不支持复制，请使用导出' : '';
    copyBtn.classList.toggle('han-disabled', !!hanModeEnabled);
}
updateCopyButtonState();

// Drag & Drop (File Upload)
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    // Only show file drop styling if we are NOT reordering images
    if (!dragSrcId) {
        dropZone.classList.add('drag-over');
    }
});

dropZone.addEventListener('dragleave', (e) => {
    // Only remove class if we are truly leaving the dropZone (not entering a child)
    if (e.relatedTarget && dropZone.contains(e.relatedTarget)) {
        return;
    }
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');

    // Check if it's a file drop
    if (e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        handleFiles(files);
    }
});

// Click to upload (only on empty state or background)
dropZone.addEventListener('click', (e) => {
    // Only trigger when empty-state is visible and click happens on the drop card/button
    if (loadedImages.length > 0) return;

    const card = e.target.closest('.drop-card');
    if (card || e.target.classList.contains('ghost-btn')) {
        fileInput.click();
    }
});

fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    handleFiles(files);
    fileInput.value = ''; // Reset
});

// Clear
clearBtn.addEventListener('click', () => {
    loadedImages = [];
    dropZone.classList.remove('has-content');
    imageCountDisplay.textContent = '0 张图片';
    canvasSizeDisplay.textContent = '0 x 0 px';
    if (zoomDisplay) zoomDisplay.textContent = '100%';
    previewContainer.innerHTML = '';
    previewContainer.style.width = '0px';
    previewContainer.style.height = '0px';

    // Reset Zoom
    userZoom = 1.0;
    userPan = { x: 0, y: 0 };

    // Reset han mode state but keep toggle unchecked/visible
    strips = [];
    targetStripCount = null;
    updateHanControlsVisibility();
});

// Export
exportBtn.addEventListener('click', () => {
    openExportModal();
});

// Copy
copyBtn.addEventListener('click', () => {
    const canvases = renderStripsToCanvases();
    if (!canvases.length) {
        showToast('没有可复制的图片');
        return;
    }

    Promise.all(canvases.map(canvas => new Promise(resolve => {
        canvas.toBlob((blob) => {
            if (blob) return resolve(blob);
            try {
                const fallback = dataUrlToBlob(canvas.toDataURL('image/png'));
                resolve(fallback);
            } catch (err) {
                resolve(null);
            }
        }, 'image/png');
    })))
        .then(blobs => blobs.filter(Boolean))
        .then(blobs => {
            if (!blobs.length) throw new Error('No image blobs generated');
            const items = blobs.map(blob => new ClipboardItem({ 'image/png': blob }));
            return navigator.clipboard.write(items).then(() => items.length);
        })
        .then(count => {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = count > 1 ? `已复制 ${count} 张图片!` : '已复制图片!';
            setTimeout(() => {
                copyBtn.textContent = '复制到剪贴板';
            }, 2000);
        })
        .catch(err => {
            console.error('Clipboard write failed:', err);
            showToast('复制失败，请稍后重试');
        });
});

function renderStripsToCanvases() {
    const targetRowHeight = parseInt(targetRowHeightInput.value, 10) || 300;
    const rawPadding = parseInt(paddingInput.value, 10);
    const padding = Number.isFinite(rawPadding) ? Math.max(0, rawPadding) : 10;
    const bgColor = bgColorInput.value;

    const stripsRaw = hanModeEnabled ? getRenderStrips() : [loadedImages];
    const stripsForRender = (stripsRaw && stripsRaw.length ? stripsRaw : [loadedImages]).map(strip =>
        (strip || []).filter(img => img && img.element)
    );
    const results = [];

    // 导出模式：不包含分隔线，每个长图只包含图片内容
    stripsForRender.forEach(stripImages => {
        if (!stripImages || !stripImages.length) return;
        const layout = computeStripLayout(stripImages, targetRowHeight, padding);
        if (!layout || !layout.boxes || !layout.boxes.length) return;
        const width = Number.isFinite(layout.containerWidth) ? Math.max(1, Math.round(layout.containerWidth)) : null;
        const height = Number.isFinite(layout.containerHeight) ? Math.max(1, Math.round(layout.containerHeight)) : null;
        if (!width || !height) return;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        layout.boxes.forEach(box => {
            ctx.drawImage(box.img.element, box.x, box.y, box.width, box.height);
        });
        results.push(canvas);
    });

    // Fallback: if no results but we have images, try a simple layout in normal mode
    if (!results.length && loadedImages.length > 0) {
        const widthRaw = parseInt(canvasWidthInput.value, 10);
        const fallbackWidth = Number.isFinite(widthRaw) && widthRaw > 0 ? widthRaw : 1920;
        const layout = window.calculateLayout(loadedImages, fallbackWidth, targetRowHeight, padding);
        if (layout && layout.boxes && layout.boxes.length) {
            const width = Math.max(1, Math.round(layout.containerWidth || fallbackWidth));
            const height = Math.max(1, Math.round(layout.containerHeight || targetRowHeight));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            layout.boxes.forEach(box => {
                if (box.img && box.img.element) {
                    ctx.drawImage(box.img.element, box.x, box.y, box.width, box.height);
                }
            });
            results.push(canvas);
        }
    }

    return results;
}

function dataUrlToBlob(dataUrl) {
    const arr = dataUrl.split(',');
    if (arr.length < 2) return null;
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const size = bytes / Math.pow(k, i);
    return `${size.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function downloadBlob(blob, filename) {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// ===== ZIP (store) - Pure JS =====
let CRC_TABLE = null;
function getCRCTable() {
    if (CRC_TABLE) return CRC_TABLE;
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        CRC_TABLE[n] = c >>> 0;
    }
    return CRC_TABLE;
}

function crc32(buf) {
    const table = getCRCTable();
    let crc = 0 ^ -1;
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
}

async function createZip(entries) {
    const encoder = new TextEncoder();
    const fileParts = [];
    const centralParts = [];
    let offset = 0;

    for (const entry of entries) {
        const data = new Uint8Array(await entry.blob.arrayBuffer());
        const nameBytes = encoder.encode(entry.name);
        const crc = crc32(data);
        const size = data.byteLength;

        const localHeader = new Uint8Array(30 + nameBytes.length);
        const lhView = new DataView(localHeader.buffer);
        lhView.setUint32(0, 0x04034b50, true); // signature
        lhView.setUint16(4, 20, true); // version needed
        lhView.setUint16(6, 0, true); // general flag
        lhView.setUint16(8, 0, true); // compression 0
        lhView.setUint16(10, 0, true); // mod time
        lhView.setUint16(12, 0, true); // mod date
        lhView.setUint32(14, crc, true);
        lhView.setUint32(18, size, true); // compressed size
        lhView.setUint32(22, size, true); // uncompressed size
        lhView.setUint16(26, nameBytes.length, true); // name length
        lhView.setUint16(28, 0, true); // extra length
        localHeader.set(nameBytes, 30);

        const centralHeader = new Uint8Array(46 + nameBytes.length);
        const chView = new DataView(centralHeader.buffer);
        chView.setUint32(0, 0x02014b50, true); // signature
        chView.setUint16(4, 20, true); // version made by
        chView.setUint16(6, 20, true); // version needed
        chView.setUint16(8, 0, true); // flags
        chView.setUint16(10, 0, true); // compression
        chView.setUint16(12, 0, true); // mod time
        chView.setUint16(14, 0, true); // mod date
        chView.setUint32(16, crc, true);
        chView.setUint32(20, size, true); // comp size
        chView.setUint32(24, size, true); // uncomp size
        chView.setUint16(28, nameBytes.length, true); // name length
        chView.setUint16(30, 0, true); // extra length
        chView.setUint16(32, 0, true); // comment length
        chView.setUint16(34, 0, true); // disk number
        chView.setUint16(36, 0, true); // internal attr
        chView.setUint32(38, 0, true); // external attr
        chView.setUint32(42, offset, true); // local header offset
        centralHeader.set(nameBytes, 46);

        fileParts.push(localHeader, data);
        centralParts.push(centralHeader);
        offset += localHeader.length + data.length;
    }

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const centralOffset = offset;
    const eocd = new Uint8Array(22);
    const eView = new DataView(eocd.buffer);
    eView.setUint32(0, 0x06054b50, true); // signature
    eView.setUint16(4, 0, true); // disk number
    eView.setUint16(6, 0, true); // central dir disk
    eView.setUint16(8, entries.length, true); // entries on this disk
    eView.setUint16(10, entries.length, true); // total entries
    eView.setUint32(12, centralSize, true); // central dir size
    eView.setUint32(16, centralOffset, true); // central dir offset
    eView.setUint16(20, 0, true); // comment length

    const allParts = [...fileParts, ...centralParts, eocd];
    return new Blob(allParts, { type: 'application/zip' });
}

async function handleFiles(files) {
    if (files.length === 0) return;

    // Sort incoming files by filename for deterministic order
    const sortedFiles = [...files].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
    );

    const promises = sortedFiles.map(file => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                resolve({
                    element: img,
                    aspectRatio: img.width / img.height,
                    id: Math.random().toString(36).substr(2, 9),
                    originalName: file.name,
                    displayName: file.name
                });
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    });

    try {
        const newImages = await Promise.all(promises);
        loadedImages = [...loadedImages, ...newImages];

        if (loadedImages.length > 0) {
            dropZone.classList.add('has-content');
        }

        imageCountDisplay.textContent = `${loadedImages.length} 张图片`;

        if (hanModeEnabled) {
            resetStripsFromLoaded();
        }

        // Reset Zoom on new files? Or keep?
        // Let's reset to fit new content nicely
        userZoom = 1.0;
        userPan = { x: 0, y: 0 };

        render();
        updateHanControlsVisibility();
    } catch (err) {
        console.error('Error loading images:', err);
        showToast('部分图片加载失败');
    }
}

function updateContainerTransform() {
    const finalScale = baseScale * userZoom;
    const finalX = baseOffset.x + userPan.x;
    const finalY = baseOffset.y + userPan.y;

    currentScale = finalScale; // Update for drag logic

    previewContainer.style.left = '0px';
    previewContainer.style.top = '0px';
    previewContainer.style.transform = `translate3d(${finalX}px, ${finalY}px, 0) scale(${finalScale})`;

    if (zoomDisplay) {
        zoomDisplay.textContent = `${Math.round(userZoom * 100)}%`;
    }
}

function render() {
    if (loadedImages.length === 0) {
        previewContainer.innerHTML = '';
        previewContainer.style.width = '0px';
        previewContainer.style.height = '0px';
        lastLayout = null;
        hideInsertIndicator();
        if (zoomDisplay) zoomDisplay.textContent = '100%';
        return;
    }

    const targetRowHeight = parseInt(targetRowHeightInput.value) || 300;

    const rawPadding = parseInt(paddingInput.value, 10);
    const padding = Number.isFinite(rawPadding) ? Math.max(0, rawPadding) : 10;

    const bgColor = bgColorInput.value;

    const stripsForRender = getRenderStrips();
    if (!stripsForRender.length) {
        previewContainer.innerHTML = '';
        previewContainer.style.width = '0px';
        previewContainer.style.height = '0px';
        lastLayout = null;
        hideInsertIndicator();
        return;
    }

    let combinedWidth = 0;
    let combinedHeight = 0;
    const combinedBoxes = [];

    if (hanModeEnabled) {
        let offsetX = 0;
        let maxHeight = 0;
        stripsForRender.forEach((stripImages, stripIndex) => {
            if (!stripImages.length) return;
            const layout = computeStripLayout(stripImages, targetRowHeight, padding);
            layout.boxes.forEach(box => {
                combinedBoxes.push({
                    ...box,
                    x: box.x + offsetX,
                    y: box.y,
                    stripIndex
                });
            });
            offsetX += layout.containerWidth;
            if (stripIndex < stripsForRender.length - 1) {
                // 添加分隔线标记
                combinedBoxes.push({
                    isSeparator: true,
                    x: offsetX + (HAN_STRIP_SPACING - HAN_SEPARATOR_WIDTH) / 2,
                    y: 0,
                    width: HAN_SEPARATOR_WIDTH,
                    height: maxHeight || layout.containerHeight,
                    stripIndex
                });
                offsetX += HAN_STRIP_SPACING;
            }
            maxHeight = Math.max(maxHeight, layout.containerHeight);
        });
        combinedWidth = offsetX;
        combinedHeight = maxHeight;
    } else {
        const containerWidth = parseInt(canvasWidthInput.value, 10) || 1920;
        const layout = window.calculateLayout(loadedImages, containerWidth, targetRowHeight, padding);
        layout.boxes.forEach(box => combinedBoxes.push(box));
        combinedWidth = containerWidth;
        combinedHeight = layout.containerHeight;
    }

    // Ensure height matches actual content to avoid trailing gaps
    if (combinedBoxes.length > 0) {
        const maxBottom = combinedBoxes.reduce((m, b) => Math.max(m, b.y + b.height), 0);
        combinedHeight = Math.max(combinedHeight, maxBottom);
    }

    lastLayout = {
        boxes: combinedBoxes,
        containerHeight: combinedHeight,
        containerWidth: combinedWidth
    };

    // Update container size (Logical size)
    previewContainer.style.width = `${combinedWidth}px`;
    previewContainer.style.height = `${combinedHeight}px`;
    previewContainer.style.backgroundColor = bgColor;
    canvasSizeDisplay.textContent = `${Math.round(combinedWidth)} x ${Math.round(combinedHeight)} px`;

    // Calculate Scale to fit in wrapper
    const wrapperRect = previewWrapper.getBoundingClientRect();
    const WRAPPER_PADDING = getWrapperPadding();
    const paddingInset = WRAPPER_PADDING * 2; // previewWrapper padding total
    const innerWidth = Math.max(wrapperRect.width - paddingInset, 0);
    const innerHeight = Math.max(wrapperRect.height - paddingInset, 0);

    const scaleX = innerWidth / combinedWidth;
    const scaleY = innerHeight / combinedHeight;
    const scale = Math.min(1, scaleX, scaleY); // Fit entirely

    // Store base values
    baseScale = scale;
    const offsetX = WRAPPER_PADDING + Math.max((innerWidth - combinedWidth * scale) / 2, 0);
    // Top-align vertically to avoid bottom gap when content is shorter than the viewport
    const offsetY = WRAPPER_PADDING;
    baseOffset = { x: offsetX, y: offsetY };

    // Apply User Zoom & Pan
    updateContainerTransform();

    ensureInsertIndicator();

    ensureInsertIndicator();

    // DOM Diffing / Stable Update
    const existingElements = new Map();
    Array.from(previewContainer.children).forEach(el => {
        if (el.dataset.id) existingElements.set(el.dataset.id, el);
    });

    // Mark all as not visited initially
    const visitedIds = new Set();

    lastLayout.boxes.forEach((box, index) => {
        // 处理分隔线
        if (box.isSeparator) {
            const separatorId = `separator-${box.stripIndex}`;
            let separatorDiv = existingElements.get(separatorId);

            if (!separatorDiv) {
                separatorDiv = document.createElement('div');
                separatorDiv.className = 'han-separator';
                separatorDiv.dataset.id = separatorId;
                separatorDiv.style.backgroundColor = HAN_SEPARATOR_COLOR;
                separatorDiv.style.pointerEvents = 'none';
                previewContainer.appendChild(separatorDiv);
            }

            visitedIds.add(separatorId);
            separatorDiv.style.left = `${box.x}px`;
            separatorDiv.style.top = `${box.y}px`;
            separatorDiv.style.width = `${box.width}px`;
            separatorDiv.style.height = `${box.height}px`;
            separatorDiv.dataset.index = index;
            return;
        }

        // 处理图片
        let itemDiv = existingElements.get(box.img.id);
        visitedIds.add(box.img.id);

        if (!itemDiv) {
            // Create new
            itemDiv = document.createElement('div');
            itemDiv.className = 'image-item';
            itemDiv.draggable = false;
            itemDiv.dataset.id = box.img.id;

            const img = document.createElement('img');
            img.src = box.img.element.src;
            itemDiv.appendChild(img);

            const badge = document.createElement('div');
            badge.className = 'filename-badge';
            badge.title = box.img.displayName || box.img.originalName || '';
            badge.textContent = (box.img.displayName || box.img.originalName || '').split(/[\\/]/).pop() || '';
            if (!showFilenames || !badge.textContent) badge.classList.add('hidden');
            itemDiv.appendChild(badge);

            const deleteBtn = document.createElement('div');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '✕';
            deleteBtn.title = 'Remove image';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent drag start
                deleteImage(box.img.id);
            });
            itemDiv.appendChild(deleteBtn);

            // Pointer drag for reorder (mouse/pen). Touch handled separately.
            itemDiv.addEventListener('pointerdown', handleItemPointerDown);

            previewContainer.appendChild(itemDiv);
        }

        // Update Position & Size
        itemDiv.style.left = `${box.x}px`;
        itemDiv.style.top = `${box.y}px`;
        itemDiv.style.width = `${box.width}px`;
        itemDiv.style.height = `${box.height}px`;
        itemDiv.dataset.index = index; // Update current index
        itemDiv.draggable = false;
        itemDiv.addEventListener('pointerdown', handleItemPointerDown);

        // Update badge if exists
        const badge = itemDiv.querySelector('.filename-badge');
        if (badge) {
            badge.title = box.img.displayName || box.img.originalName || '';
            badge.textContent = (box.img.displayName || box.img.originalName || '').split(/[\\/]/).pop() || '';
            badge.classList.toggle('hidden', !showFilenames || !badge.textContent);
        }
    });

    // Remove elements that are no longer in the layout
    existingElements.forEach((el, id) => {
        if (!visitedIds.has(id)) {
            el.remove();
        }
    });

    renderInsertIndicator();
}

function deleteImage(id) {
    const index = loadedImages.findIndex(img => img.id === id);
    if (index > -1) {
        loadedImages.splice(index, 1);
        if (hanModeEnabled && strips.length) {
            strips = strips.map(strip => strip.filter(itemId => itemId !== id)).filter(strip => strip.length > 0);
            flattenStripsToImages();
        }
        imageCountDisplay.textContent = `${loadedImages.length} 张图片`;
        if (loadedImages.length === 0) {
            dropZone.classList.remove('has-content');
            strips = [];
            targetStripCount = null;
        }
        render();
        updateHanControlsVisibility();
    }
}

// ======================================
// Unified Reorder Session (mouse + touch)
// ======================================

let activeReorderSession = null;

class VisualPreviewEngine {
    constructor(slotMap, sourceId) {
        this.slotMap = slotMap;
        this.sourceId = sourceId;
        this.hanMode = hanModeEnabled;
    }

    getElement(id) {
        return previewContainer.querySelector(`[data-id="${id}"]`);
    }

    resetElement(id, instant = false) {
        const el = this.getElement(id);
        if (!el) return;
        if (instant) {
            const prev = el.style.transition;
            el.style.transition = 'none';
            el.classList.remove('preview-shift');
            el.style.transform = '';
            // force reflow to apply the no-transition reset
            void el.offsetWidth;
            el.style.transition = prev;
            return;
        }
        el.classList.remove('preview-shift');
        el.style.transform = '';
    }

    resetAll(instant = false) {
        if (!this.slotMap) return;
        this.slotMap.slots.forEach(slot => this.resetElement(slot.id, instant));
    }

    computeOrder(dest) {
        if (!this.slotMap) return [];
        const base = this.slotMap.baseOrderStrips || [];
        if (!dest || dest.index === null || dest.index === undefined) {
            return base.map(strip => [...strip]);
        }
        if (this.hanMode) {
            return simulateStripsMove(base, this.sourceId, dest.stripIndex ?? 0, dest.index);
        }
        const flatBase = base[0] || [];
        return [simulateListMove(flatBase, this.sourceId, dest.index)];
    }

    apply(dest) {
        if (!this.slotMap) return;
        const orderStrips = this.computeOrder(dest);
        if (!orderStrips.length) {
            this.resetAll();
            return;
        }

        const touched = new Set();

        orderStrips.forEach((stripOrder, stripIdx) => {
            const stripSlots = this.slotMap.slotsByStrip[stripIdx] || [];
            stripOrder.forEach((id, idxInStrip) => {
                const targetSlot = stripSlots[idxInStrip];
                const currentSlot = this.slotMap.idToSlot.get(id);
                if (!targetSlot || !currentSlot) return;

                const el = this.getElement(id);
                if (!el) return;

                const dx = (targetSlot.box.x - currentSlot.box.x);
                const dy = (targetSlot.box.y - currentSlot.box.y);
                const negligible = Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5;
                if (negligible) {
                    this.resetElement(id);
                } else {
                    el.classList.add('preview-shift');
                    el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
                }
                touched.add(id);
            });
        });

        // Clear transforms for untouched items
        this.slotMap.slots.forEach(slot => {
            if (!touched.has(slot.id)) {
                this.resetElement(slot.id);
            }
        });
    }
}

function applyInsertHysteresis(fraction, prevInsertAfter) {
    if (fraction > HYSTERESIS_FORWARD) return true;
    if (fraction < HYSTERESIS_BACKWARD) return false;
    if (typeof prevInsertAfter === 'boolean') return prevInsertAfter;
    return fraction >= 0.5;
}

class ReorderSession {
    constructor({ sourceId, pointerId = null, startClient, mirror = null, sourceElement = null }) {
        this.sourceId = sourceId;
        this.pointerId = pointerId;
        this.mirror = mirror;
        this.sourceElement = sourceElement;
        this.hanMode = hanModeEnabled;
        this.containerRect = previewContainer.getBoundingClientRect();
        this.startScale = currentScale || 1;
        this.slotMap = buildSlotMap();
        this.previewEngine = this.slotMap ? new VisualPreviewEngine(this.slotMap, sourceId) : null;
        this.baseOrderStrips = this.slotMap?.baseOrderStrips || [];
        this.currentSignature = this.computeCurrentSignature();
        this.startSignature = this.currentSignature;
        this.currentHint = null;
        this.active = true;
        this.lastPointer = startClient ? { ...startClient } : null;
        this.currentDest = null;

        dragSrcId = sourceId;
        lastReorderTargetId = null;
        lastDragPosition = null;

        if (this.sourceElement) {
            this.sourceElement.classList.add('dragging');
            this.sourceElement.style.opacity = '0.2';
            const badge = this.sourceElement.querySelector('.filename-badge');
            if (badge) badge.remove();
        }

        setInsertHint(null, false);
    }

    computeCurrentSignature() {
        if (this.hanMode) {
            const base = this.baseOrderStrips;
            const stripIdx = base.findIndex(strip => strip.includes(this.sourceId));
            if (stripIdx === -1) return null;
            const pos = base[stripIdx].indexOf(this.sourceId);
            if (pos === -1) return null;
            return `han-${stripIdx}-${pos}`;
        }
        const base = this.baseOrderStrips[0] || [];
        const idx = base.indexOf(this.sourceId);
        return idx >= 0 ? `idx-${idx}` : null;
    }

    toLayoutCoords(clientX, clientY) {
        return {
            x: (clientX - this.containerRect.left) / this.startScale,
            y: (clientY - this.containerRect.top) / this.startScale
        };
    }

    pickStripIndex(relX) {
        const metas = this.slotMap?.stripMeta || [];
        if (!metas.length) return 0;
        const containing = metas.find(m => relX >= m.minX - EDGE_DEAD_ZONE && relX <= m.maxX + EDGE_DEAD_ZONE);
        if (containing) return containing.stripIndex;
        // fallback to nearest by center
        let nearest = metas[0];
        let best = Math.abs(relX - ((nearest.minX + nearest.maxX) / 2));
        metas.forEach(m => {
            const dist = Math.abs(relX - ((m.minX + m.maxX) / 2));
            if (dist < best) {
                best = dist;
                nearest = m;
            }
        });
        return nearest.stripIndex;
    }

    resolveTarget(relX, relY) {
        if (!this.slotMap || !this.slotMap.slots.length) return null;

        // Han mode: choose strip by X first, then Y slot
        if (this.hanMode) {
            const stripIndex = this.pickStripIndex(relX);
            const stripSlots = this.slotMap.slotsByStrip[stripIndex] || [];
            const zones = (this.slotMap.hitZones || []).filter(z => z.stripIndex === stripIndex);

            // First check head/tail zones
            const zoneHit = zones.find(z =>
                relX >= z.box.x &&
                relX <= z.box.x + z.box.width &&
                relY >= z.box.y &&
                relY <= z.box.y + z.box.height
            );
            if (zoneHit) {
                return this.mapZoneToTarget(zoneHit, stripSlots);
            }

            // Check item slots by Y
            const slotHit = stripSlots.find(slot =>
                relY >= slot.box.y &&
                relY <= slot.box.y + slot.box.height
            );
            if (slotHit) {
                if (slotHit.id === this.sourceId) {
                    return { targetId: null, insertAfter: false };
                }
                const frac = (relY - slotHit.box.y) / slotHit.box.height;
                const prevAfter = this.currentHint && this.currentHint.targetId === slotHit.id ? this.currentHint.insertAfter : null;
                const insertAfter = applyInsertHysteresis(frac, prevAfter);
                return { targetId: slotHit.id, insertAfter, fraction: frac, via: 'hit' };
            }

            // Edge: above head / below tail
            const meta = (this.slotMap.stripMeta || []).find(m => m.stripIndex === stripIndex);
            if (meta) {
                if (relY < (meta.minY - EDGE_DEAD_ZONE)) {
                    const headZone = zones.find(z => z.type === 'head');
                    if (headZone) return this.mapZoneToTarget(headZone, stripSlots, 'edge');
                }
                if (relY > (meta.maxY + EDGE_DEAD_ZONE)) {
                    const tailZone = zones.find(z => z.type === 'tail');
                    if (tailZone) return this.mapZoneToTarget(tailZone, stripSlots, 'edge');
                }
            }

            // Nearest boundary within strip
            if (!stripSlots.length) return null;
            const boundaries = [];
            stripSlots.forEach(box => {
                boundaries.push({
                    id: box.id,
                    insertAfter: false,
                    dist: Math.abs(relY - box.box.y)
                });
                boundaries.push({
                    id: box.id,
                    insertAfter: true,
                    dist: Math.abs(relY - (box.box.y + box.box.height))
                });
            });
            boundaries.sort((a, b) => a.dist - b.dist);
            const nearest = boundaries[0];
            const second = boundaries[1];
            if (!nearest) return null;
            if (second && Math.abs(nearest.dist - second.dist) <= GAP_THRESHOLD && this.currentHint) {
                return { targetId: this.currentHint.targetId, insertAfter: this.currentHint.insertAfter, via: 'gap-hold' };
            }
            return { targetId: nearest.id, insertAfter: nearest.insertAfter, via: 'boundary' };
        }

        // Non-han: single strip logic with head/tail zones
        const zones = (this.slotMap.hitZones || []).filter(z => z.stripIndex === 0);
        const zoneHit = zones.find(z =>
            relY >= z.box.y &&
            relY <= z.box.y + z.box.height &&
            relX >= z.box.x - EDGE_DEAD_ZONE &&
            relX <= z.box.x + z.box.width + EDGE_DEAD_ZONE
        );
        const slots = this.slotMap.slotsByStrip[0] || [];
        if (zoneHit) {
            return this.mapZoneToTarget(zoneHit, slots);
        }

        const hitSlot = slots.find(slot =>
            relY >= slot.box.y &&
            relY <= slot.box.y + slot.box.height &&
            relX >= slot.box.x - EDGE_DEAD_ZONE &&
            relX <= slot.box.x + slot.box.width + EDGE_DEAD_ZONE
        );
        if (hitSlot) {
            if (hitSlot.id === this.sourceId) {
                return { targetId: null, insertAfter: false };
            }
            const frac = (relY - hitSlot.box.y) / hitSlot.box.height;
            const prevAfter = this.currentHint && this.currentHint.targetId === hitSlot.id ? this.currentHint.insertAfter : null;
            const insertAfter = applyInsertHysteresis(frac, prevAfter);
            return { targetId: hitSlot.id, insertAfter, fraction: frac, via: 'hit' };
        }

        if (!slots.length) return null;

        const meta = (this.slotMap.stripMeta || []).find(m => m.stripIndex === 0);
        if (meta) {
            if (relX < meta.minX - EDGE_DEAD_ZONE) {
                const firstId = slots[0]?.id;
                if (firstId) return { targetId: firstId, insertAfter: false, via: 'edge-x' };
            }
            if (relX > meta.maxX + EDGE_DEAD_ZONE) {
                const lastId = slots[slots.length - 1]?.id;
                if (lastId) return { targetId: lastId, insertAfter: true, via: 'edge-x' };
            }
        }
        const boundaries = [];
        slots.forEach(box => {
            boundaries.push({
                id: box.id,
                insertAfter: false,
                dist: Math.abs(relY - box.box.y)
            });
            boundaries.push({
                id: box.id,
                insertAfter: true,
                dist: Math.abs(relY - (box.box.y + box.box.height))
            });
        });
        boundaries.sort((a, b) => a.dist - b.dist);
        const nearest = boundaries[0];
        const second = boundaries[1];
        if (!nearest) return null;
        if (second && Math.abs(nearest.dist - second.dist) <= GAP_THRESHOLD && this.currentHint) {
            return { targetId: this.currentHint.targetId, insertAfter: this.currentHint.insertAfter, via: 'gap-hold' };
        }
        return { targetId: nearest.id, insertAfter: nearest.insertAfter, via: 'boundary' };
    }

    mapZoneToTarget(zone, stripSlots, via = 'zone') {
        if (!stripSlots || !stripSlots.length) return null;
        const firstId = stripSlots[0]?.id;
        const lastId = stripSlots[stripSlots.length - 1]?.id;
        if (zone.type === 'head' && firstId) {
            return { targetId: firstId, insertAfter: false, via };
        }
        if (zone.type === 'tail' && lastId) {
            return { targetId: lastId, insertAfter: true, via };
        }
        return null;
    }

    computeDestination(targetId, insertAfter) {
        if (!targetId) return null;
        if (this.hanMode) {
            const stripsData = this.slotMap?.baseOrderStrips?.length ? this.slotMap.baseOrderStrips : cloneStripsData();
            const srcStripIdx = stripsData.findIndex(strip => strip.includes(this.sourceId));
            const targetStripIdx = stripsData.findIndex(strip => strip.includes(targetId));
            if (srcStripIdx === -1 || targetStripIdx === -1) return null;
            const targetPos = stripsData[targetStripIdx].indexOf(targetId);
            if (targetPos === -1) return null;
            let destPos = insertAfter ? targetPos + 1 : targetPos;
            destPos = Math.max(0, Math.min(destPos, stripsData[targetStripIdx].length));
            return { stripIndex: targetStripIdx, index: destPos, signature: `han-${targetStripIdx}-${destPos}` };
        }

        const order = (this.slotMap?.baseOrderStrips?.[0]) ? this.slotMap.baseOrderStrips[0] : loadedImages.map(img => img.id);
        const srcIndex = order.indexOf(this.sourceId);
        const targetIndex = order.indexOf(targetId);
        if (srcIndex === -1 || targetIndex === -1) return null;
        let destinationIndex = insertAfter ? targetIndex + 1 : targetIndex;
        if (srcIndex < destinationIndex) destinationIndex -= 1;
        destinationIndex = Math.max(0, Math.min(destinationIndex, order.length - 1));
        return { stripIndex: null, index: destinationIndex, signature: `idx-${destinationIndex}` };
    }

    updateInsertHint(targetId, insertAfter) {
        if (!targetId) {
            this.currentHint = null;
            setInsertHint(null, false);
            return;
        }
        this.currentHint = { targetId, insertAfter };
        setInsertHint(targetId, insertAfter);
        renderInsertIndicator();
    }

    updatePosition(clientX, clientY) {
        if (!this.active) return;
        if (this.mirror) {
            this.mirror.update(clientX, clientY);
        }
        if (this.lastPointer) {
            const delta = Math.hypot(clientX - this.lastPointer.x, clientY - this.lastPointer.y);
            if (delta < MIN_POINTER_MOVE) return;
        }
        this.lastPointer = { x: clientX, y: clientY };
        const relative = this.toLayoutCoords(clientX, clientY);
        const target = this.resolveTarget(relative.x, relative.y);
        if (!target || !target.targetId) {
            this.updateInsertHint(null, false);
            if (this.previewEngine) this.previewEngine.apply(null);
            this.currentDest = null;
            return;
        }

        const dest = this.computeDestination(target.targetId, target.insertAfter);
        if (!dest) {
            if (this.previewEngine) this.previewEngine.apply(null);
            return;
        }

        if (dest.signature === this.currentSignature) {
            this.updateInsertHint(target.targetId, target.insertAfter);
            return;
        }

        this.currentDest = dest;
        this.currentSignature = dest.signature;
        this.updateInsertHint(target.targetId, target.insertAfter);
        if (this.previewEngine) {
            this.previewEngine.apply(dest);
        }
    }

    hasChanges() {
        return !!(this.currentDest && this.currentDest.signature && this.currentDest.signature !== this.startSignature);
    }

    commit() {
        if (!this.currentDest) return;
        if (this.previewEngine) {
            this.previewEngine.resetAll(true);
        }
        if (this.hanMode) {
            const base = this.slotMap?.baseOrderStrips?.length ? this.slotMap.baseOrderStrips : cloneStripsData();
            const nextStrips = simulateStripsMove(base, this.sourceId, this.currentDest.stripIndex ?? 0, this.currentDest.index ?? 0);
            strips = nextStrips.map(strip => [...strip]);
            flattenStripsToImages();
        } else {
            const base = (this.slotMap?.baseOrderStrips?.[0]) ? this.slotMap.baseOrderStrips[0] : loadedImages.map(img => img.id);
            const nextOrder = simulateListMove(base, this.sourceId, this.currentDest.index ?? 0);
            const reordered = mapIdsToImages(nextOrder);
            if (reordered.length) {
                loadedImages = reordered;
            }
        }
        render();
    }

    finish(commit = true) {
        if (!this.active) return;
        if (commit && this.hasChanges()) {
            this.commit();
        } else if (this.previewEngine) {
            this.previewEngine.resetAll();
        }
        this.cleanup();
    }

    cleanup() {
        this.active = false;
        if (this.sourceElement) {
            this.sourceElement.classList.remove('dragging');
            this.sourceElement.style.opacity = '';
        }
        if (this.mirror) {
            this.mirror.destroy();
        }
        dragSrcId = null;
        lastReorderTargetId = null;
        lastDragPosition = null;
        setInsertHint(null, false);
        if (this.previewEngine) {
            this.previewEngine.resetAll(true);
        }
    }
}

// Drag & Drop Reordering Logic
function startPointerReorderSession(targetEl, pointerEvent) {
    if (!targetEl || !targetEl.dataset.id || !lastLayout) return;
    const mirror = new DragMirror(targetEl, pointerEvent.clientX, pointerEvent.clientY);
    activeReorderSession = new ReorderSession({
        sourceId: targetEl.dataset.id,
        pointerId: pointerEvent.pointerId,
        startClient: { x: pointerEvent.clientX, y: pointerEvent.clientY },
        mirror,
        sourceElement: targetEl
    });
    try {
        targetEl.setPointerCapture(pointerEvent.pointerId);
    } catch (err) {
        // Ignore capture failures
    }
}

function handleItemPointerDown(e) {
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
        if (e.button !== 0) return;
        if (activeReorderSession) return;
        if (e.target.closest('.delete-btn')) return;
        e.preventDefault();
        startPointerReorderSession(e.currentTarget, e);
    }
}

function handleReorderPointerMove(e) {
    if (!activeReorderSession || (activeReorderSession.pointerId !== null && e.pointerId !== activeReorderSession.pointerId)) return;
    e.preventDefault();
    activeReorderSession.updatePosition(e.clientX, e.clientY);
}

function finalizePointerReorder(e, commit = true) {
    if (!activeReorderSession || (activeReorderSession.pointerId !== null && e.pointerId !== activeReorderSession.pointerId)) return;
    if (activeReorderSession.sourceElement && activeReorderSession.sourceElement.hasPointerCapture && e.pointerId !== undefined) {
        try {
            activeReorderSession.sourceElement.releasePointerCapture(e.pointerId);
        } catch (err) {
            // ignore
        }
    }
    activeReorderSession.finish(commit);
    activeReorderSession = null;
}

window.addEventListener('pointermove', handleReorderPointerMove, { passive: false });
window.addEventListener('pointerup', (e) => finalizePointerReorder(e, true));
window.addEventListener('pointercancel', (e) => finalizePointerReorder(e, false));

// Legacy HTML5 drag handlers retained for file drops; sorting now uses pointer sessions.
function handleDragStart(e) {
    this.classList.add('dragging');
    dragSrcId = this.dataset.id;
    lastReorderTargetId = null;
    activeInsertHint = null;
    lastDragPosition = null;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSrcId);

    // Use a stylized, scaled drag image
    const sourceImage = loadedImages.find(img => img.id === dragSrcId);
    if (sourceImage && e.dataTransfer.setDragImage) {
        const layoutBox = lastLayout?.boxes.find(b => b?.img && b.img.id === dragSrcId);
        const rect = layoutBox ? { width: layoutBox.width * currentScale, height: layoutBox.height * currentScale } : this.getBoundingClientRect();
        try {
            const dragCanvas = createDragPreviewCanvas(sourceImage.element, rect);
            if (dragCanvas) {
                // Convert canvas to image element for better browser support
                const dragImg = new Image();
                dragImg.src = dragCanvas.toDataURL('image/png');
                dragImg.style.position = 'fixed';
                dragImg.style.top = '-9999px';
                dragImg.style.left = '-9999px';
                dragImg.style.pointerEvents = 'none';
                dragImg.style.opacity = '1';
                dragImg.style.zIndex = '-9999';
                document.body.appendChild(dragImg);
                activeDragPreviewEl = dragImg;
                e.dataTransfer.setDragImage(dragImg, dragCanvas.width / 2, dragCanvas.height / 2);
                return;
            }
        } catch (err) {
            console.warn('Custom drag preview failed, falling back:', err);
        }
        // Fallback to default behavior if custom preview fails
        e.dataTransfer.setDragImage(this, rect.width / 2, rect.height / 2);
    }
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    dragSrcId = null;
    lastReorderTargetId = null;
    lastDragPosition = null;
    setInsertHint(null, false);
    if (activeDragPreviewEl) {
        activeDragPreviewEl.remove();
        activeDragPreviewEl = null;
    }
}

function handleContainerDragOver(e) {
    // Handle external file drags
    if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        dropZone.classList.add('drag-over');
        return;
    }

    // Sorting is handled by pointer/touch sessions, ignore non-file drags
}

function findStripIndexById(id) {
    if (!hanModeEnabled) return -1;
    return strips.findIndex(strip => strip.includes(id));
}

function computeDestinationPosition(targetId, insertAfter = false) {
    if (!hanModeEnabled) {
        const srcIndex = loadedImages.findIndex(img => img.id === dragSrcId);
        const targetIndex = loadedImages.findIndex(img => img.id === targetId);
        if (srcIndex === -1 || targetIndex === -1) return null;
        let destinationIndex = insertAfter ? targetIndex + 1 : targetIndex;
        if (srcIndex < destinationIndex) destinationIndex -= 1;
        destinationIndex = Math.max(0, Math.min(destinationIndex, loadedImages.length - 1));
        return { stripIndex: null, index: destinationIndex };
    }

    const srcStripIdx = findStripIndexById(dragSrcId);
    const targetStripIdx = findStripIndexById(targetId);
    if (srcStripIdx === -1 || targetStripIdx === -1) return null;

    const targetStrip = strips[targetStripIdx];
    const targetPos = targetStrip.indexOf(targetId);
    if (targetPos === -1) return null;

    const srcPos = strips[srcStripIdx].indexOf(dragSrcId);
    if (srcPos === -1) return null;

    let destPos = insertAfter ? targetPos + 1 : targetPos;
    if (srcStripIdx === targetStripIdx && srcPos < destPos) destPos -= 1;
    destPos = Math.max(0, Math.min(destPos, strips[targetStripIdx].length));
    return { stripIndex: targetStripIdx, index: destPos };
}

function maybeReorderFlat(destinationIndex, pointerMoved) {
    if (destinationIndex === null || destinationIndex === undefined) return;
    const srcIndex = loadedImages.findIndex(img => img.id === dragSrcId);
    if (srcIndex === -1) return;

    const bounded = Math.max(0, Math.min(destinationIndex, loadedImages.length - 1));
    if (bounded === srcIndex) {
        lastReorderTargetId = `idx-${bounded}`;
        return;
    }

    const signature = `idx-${bounded}`;
    if (signature === lastReorderTargetId && !pointerMoved) return;

    const [itemToMove] = loadedImages.splice(srcIndex, 1);
    loadedImages.splice(bounded, 0, itemToMove);
    lastReorderTargetId = signature;
    render();
    renderInsertIndicator();
}

function maybeReorderHan(dest, pointerMoved) {
    if (!dest || dest.stripIndex === null || dest.index === null) return;
    const srcStripIdx = findStripIndexById(dragSrcId);
    if (srcStripIdx === -1) return;
    const srcPos = strips[srcStripIdx].indexOf(dragSrcId);
    if (srcPos === -1) return;

    const boundedStrip = Math.max(0, Math.min(dest.stripIndex, strips.length - 1));
    const targetStrip = strips[boundedStrip];
    const boundedPos = Math.max(0, Math.min(dest.index, targetStrip.length));

    if (boundedStrip === srcStripIdx && boundedPos === srcPos) {
        lastReorderTargetId = `han-${boundedStrip}-${boundedPos}`;
        return;
    }

    const signature = `han-${boundedStrip}-${boundedPos}`;
    if (signature === lastReorderTargetId && !pointerMoved) return;

    const [itemId] = strips[srcStripIdx].splice(srcPos, 1);
    let insertPos = boundedPos;
    if (srcStripIdx === boundedStrip && srcPos < boundedPos) insertPos -= 1;
    strips[boundedStrip].splice(insertPos, 0, itemId);
    lastReorderTargetId = signature;
    flattenStripsToImages();
    render();
    renderInsertIndicator();
}

function handleReorderDestination(dest, pointerMoved) {
    if (hanModeEnabled) {
        maybeReorderHan(dest, pointerMoved);
    } else {
        maybeReorderFlat(dest ? dest.index : null, pointerMoved);
    }
}

function reorderImages(targetId, insertAfter = false) {
    const dest = computeDestinationPosition(targetId, insertAfter);
    handleReorderDestination(dest, true);
}

function getHanBaseWidth(targetRowHeight) {
    const inputVal = hanSingleWidthInput ? parseInt(hanSingleWidthInput.value, 10) : NaN;
    if (Number.isFinite(inputVal) && inputVal > 0) return inputVal;
    const refImg = loadedImages[0];
    if (refImg) return Math.round(targetRowHeight * refImg.aspectRatio);
    return Math.round(targetRowHeight);
}

function computeStripLayout(images, targetRowHeight, padding) {
    if (!hanModeEnabled) {
        const raw = parseInt(canvasWidthInput.value, 10);
        const containerWidth = Number.isFinite(raw) && raw > 0 ? raw : 1920;
        return window.calculateLayout(images, containerWidth, targetRowHeight, padding);
    }
    const baseWidth = getHanBaseWidth(targetRowHeight);
    const pad = Math.max(0, padding);
    const boxes = [];
    let currentY = 0;

    images.forEach((img, idx) => {
        const width = baseWidth;
        const height = Math.round(baseWidth / img.aspectRatio);
        boxes.push({
            img,
            x: 0,
            y: currentY,
            width,
            height
        });
        currentY += height;
        if (idx < images.length - 1) currentY += pad;
    });

    return {
        boxes,
        containerHeight: currentY,
        containerWidth: baseWidth
    };
}

// Create a stylized drag preview canvas
function createDragPreviewCanvas(imageEl, rect) {
    if (!rect || !rect.width || !rect.height) return null;
    const scale = Math.min(MAX_DRAG_PREVIEW / rect.width, MAX_DRAG_PREVIEW / rect.height, 1);
    const width = Math.max(rect.width * scale, 40);
    const height = Math.max(rect.height * scale, 40);
    if (width <= 0 || height <= 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const radius = 12;

    ctx.save();
    roundRect(ctx, 0, 0, width, height, radius);
    ctx.fillStyle = 'rgba(20, 20, 24, 0.85)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.restore();

    // Image with clipping
    ctx.save();
    roundRect(ctx, 1, 1, width - 2, height - 2, radius - 1);
    ctx.clip();
    ctx.drawImage(imageEl, 0, 0, width, height);

    // Overlay gradient for depth
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.05)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    // Stroke + glow
    ctx.save();
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.6)';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(99, 102, 241, 0.35)';
    ctx.shadowBlur = 14;
    roundRect(ctx, 1, 1, width - 2, height - 2, radius - 1);
    ctx.stroke();
    ctx.restore();

    return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

// ======================================
// MOBILE RESPONSIVE - P0: Drawer Toggle
// ======================================

const menuToggle = document.getElementById('menuToggle');
const sidebar = document.querySelector('.sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const mobileExport = document.getElementById('mobileExport');

// Toggle sidebar drawer on mobile
function toggleSidebar() {
    if (!sidebar || !sidebarOverlay) return;

    const isOpen = sidebar.classList.contains('open');

    if (isOpen) {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
        document.body.classList.remove('sidebar-open');
    } else {
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('active');
        document.body.classList.add('sidebar-open');
    }
}

if (menuToggle) {
    menuToggle.addEventListener('click', toggleSidebar);
}

if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', toggleSidebar);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
    }
});

if (mobileExport) {
    if (mobileExport) {
        mobileExport.addEventListener('click', () => exportBtn.click());
    }
}

// ======================================
// P1: TOUCH INTERACTION HANDLER (Direct Implementation)
// ======================================

class DragMirror {
    constructor(sourceElement, initialX, initialY) {
        this.element = sourceElement.cloneNode(true);
        this.element.classList.remove('dragging');
        this.element.classList.add('drag-mirror');

        // Copy computed styles for exact visual match
        const rect = sourceElement.getBoundingClientRect();
        const computed = window.getComputedStyle(sourceElement);

        this.width = rect.width;
        this.height = rect.height;
        this.offsetX = initialX - rect.left;
        this.offsetY = initialY - rect.top;

        // Apply styles
        Object.assign(this.element.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            margin: '0',
            zIndex: '9999',
            pointerEvents: 'none',
            willChange: 'transform',
            transform: `translate3d(${initialX - this.offsetX}px, ${initialY - this.offsetY}px, 0)`,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            opacity: '0.9',
            transition: 'none' // Ensure no transition lag
        });

        // Remove delete button from mirror if present
        const deleteBtn = this.element.querySelector('.delete-btn');
        if (deleteBtn) deleteBtn.remove();

        document.body.appendChild(this.element);
    }

    update(x, y) {
        const tx = x - this.offsetX;
        const ty = y - this.offsetY;
        this.element.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    }

    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.remove();
        }
    }
}

class TouchHandler {
    constructor() {
        this.wrapper = document.getElementById('previewWrapper');
        this.container = document.getElementById('previewContainer');

        // Pinch zoom state
        this.initialPinchDistance = null;
        this.initialZoom = 1.0;
        this.initialPan = { x: 0, y: 0 };
        this.pinchCenter = null;
        this.zoomRafId = null;

        // Pan state
        this.lastPanPosition = null;
        this.isPanning = false;
        this.panRafId = null;

        // Drag state
        this.isDragging = false;
        this.draggedElement = null;
        this.touchStartPos = null;
        this.longPressTimer = null;
        this.dragRafId = null;
        this.mirror = null;
        this.reorderSession = null;

        this.LONG_PRESS_DURATION = 200; // ms
        this.MIN_MOVE_THRESHOLD = 8; // pixels

        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);

        this.init();
    }

    init() {
        if (!this.wrapper) return;

        this.wrapper.addEventListener('touchstart', this.handleTouchStart, { passive: false });
        this.wrapper.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        this.wrapper.addEventListener('touchend', this.handleTouchEnd);
        this.wrapper.addEventListener('touchcancel', this.handleTouchEnd);
    }

    getDistance(touches) {
        return Math.hypot(
            touches[0].clientX - touches[1].clientX,
            touches[0].clientY - touches[1].clientY
        );
    }

    getMidpoint(touches) {
        return {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2
        };
    }

    getPanBounds() {
        if (!this.container || !lastLayout) {
            return { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 };
        }

        const wrapperRect = this.wrapper.getBoundingClientRect();
        const containerRect = this.container.getBoundingClientRect();

        const contentWidth = containerRect.width;
        const contentHeight = containerRect.height;

        const marginX = Math.max(wrapperRect.width * 0.5, contentWidth * 0.3);
        const marginY = Math.max(wrapperRect.height * 0.5, contentHeight * 0.3);

        return {
            minX: -marginX,
            maxX: marginX,
            minY: -marginY,
            maxY: marginY
        };
    }

    startDrag(imageItem, clientX, clientY) {
        if (!imageItem || this.isDragging) return;

        this.isDragging = true;
        this.isPanning = false;
        this.draggedElement = imageItem;

        // Haptic feedback
        if (navigator.vibrate) {
            navigator.vibrate(15);
        }

        // Initialize Drag Mirror
        this.mirror = new DragMirror(imageItem, clientX, clientY);

        // Unified reorder session (touch path shares core logic)
        this.reorderSession = new ReorderSession({
            sourceId: imageItem.dataset.id,
            pointerId: null,
            startClient: { x: clientX, y: clientY },
            mirror: this.mirror,
            sourceElement: imageItem
        });

        lastReorderTargetId = null;
        activeInsertHint = null;
        lastDragPosition = null;
    }

    processReorder(clientX, clientY) {
        if (this.reorderSession) {
            this.reorderSession.updatePosition(clientX, clientY);
        }
    }

    updateDragPointerManual(clientX, clientY) {
        const moved = !lastDragPosition ||
            Math.abs(clientX - lastDragPosition.x) > 2 ||
            Math.abs(clientY - lastDragPosition.y) > 2;
        lastDragPosition = { x: clientX, y: clientY };
        return moved;
    }

    handleTouchStart(e) {
        // 2 fingers: Pinch Zoom
        if (e.touches.length === 2) {
            e.preventDefault();
            this.clearLongPress();
            this.cancelDrag();

            this.initialPinchDistance = this.getDistance(e.touches);
            this.initialZoom = userZoom;
            this.initialPan = { ...userPan };
            this.pinchCenter = this.getMidpoint(e.touches);
            this.isPanning = false;
            return;
        }

        // 1 finger
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this.touchStartPos = { x: touch.clientX, y: touch.clientY };

            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            const imageItem = target.closest('.image-item');
            const isDeleteBtn = target.closest('.delete-btn');

            if (isDeleteBtn) return;

            if (imageItem && !imageItem.classList.contains('dragging')) {
                e.preventDefault();
                // Do NOT set draggedElement immediately, wait for long press
                // this.draggedElement = imageItem; 

                this.longPressTimer = setTimeout(() => {
                    this.startDrag(imageItem, touch.clientX, touch.clientY);
                }, this.LONG_PRESS_DURATION);

            } else if (!imageItem) {
                e.preventDefault();
                this.lastPanPosition = { x: touch.clientX, y: touch.clientY };
            }
        }
    }

    handleTouchMove(e) {
        // 2-finger pinch zoom
        if (e.touches.length === 2 && this.initialPinchDistance) {
            e.preventDefault();

            if (this.zoomRafId) return;

            this.zoomRafId = requestAnimationFrame(() => {
                const currentDistance = this.getDistance(e.touches);
                const scale = currentDistance / this.initialPinchDistance;

                const newZoom = Math.max(0.1, Math.min(this.initialZoom * scale, 5.0));

                if (this.pinchCenter) {
                    const wrapperRect = this.wrapper.getBoundingClientRect();
                    const relX = this.pinchCenter.x - wrapperRect.left;
                    const relY = this.pinchCenter.y - wrapperRect.top;
                    const zoomRatio = newZoom / this.initialZoom;

                    userPan.x = this.initialPan.x + (relX - baseOffset.x) * (1 - zoomRatio);
                    userPan.y = this.initialPan.y + (relY - baseOffset.y) * (1 - zoomRatio);
                }

                userZoom = newZoom;
                render();

                this.zoomRafId = null;
            });
            return;
        }

        // Cancel long press if moved too far
        if (this.longPressTimer && this.touchStartPos && e.touches.length === 1) {
            const touch = e.touches[0];
            const deltaX = touch.clientX - this.touchStartPos.x;
            const deltaY = touch.clientY - this.touchStartPos.y;
            const distance = Math.hypot(deltaX, deltaY);

            if (distance > this.MIN_MOVE_THRESHOLD) {
                this.clearLongPress();
                if (!this.isDragging) {
                    this.isPanning = true;
                    this.lastPanPosition = { x: touch.clientX, y: touch.clientY };
                }
            }
        }

        // 1-finger drag (image reorder)
        if (e.touches.length === 1 && this.isDragging) {
            e.preventDefault();
            const touch = e.touches[0];

            // P0 Optimization: Update Mirror IMMEDIATELY (every frame possible)
            if (this.mirror) {
                this.mirror.update(touch.clientX, touch.clientY);
            }

            // Throttle the heavy reorder logic
            if (this.dragRafId) return;

            this.dragRafId = requestAnimationFrame(() => {
                if (this.reorderSession) {
                    this.reorderSession.updatePosition(touch.clientX, touch.clientY);
                }
                this.dragRafId = null;
            });
            return;
        }

        // 1-finger pan
        if (e.touches.length === 1 && this.isPanning && this.lastPanPosition) {
            e.preventDefault();

            if (this.panRafId) return;

            const touch = e.touches[0];
            const deltaX = touch.clientX - this.lastPanPosition.x;
            const deltaY = touch.clientY - this.lastPanPosition.y;

            this.panRafId = requestAnimationFrame(() => {
                const bounds = this.getPanBounds();

                userPan.x = Math.max(bounds.minX, Math.min(bounds.maxX, userPan.x + deltaX / currentScale));
                userPan.y = Math.max(bounds.minY, Math.min(bounds.maxY, userPan.y + deltaY / currentScale));

                this.lastPanPosition = { x: touch.clientX, y: touch.clientY };
                updateContainerTransform();

                this.panRafId = null;
            });
        }
    }

    handleTouchEnd(e) {
        this.clearLongPress();

        // End drag
        if (this.isDragging) {
            if (this.reorderSession) {
                this.reorderSession.finish(true);
                this.reorderSession = null;
            }
            this.cancelDrag();
        }

        // Reset states
        if (e.touches.length < 2) {
            this.initialPinchDistance = null;
            this.pinchCenter = null;
        }

        if (e.touches.length === 0) {
            this.isPanning = false;
            this.lastPanPosition = null;
            this.touchStartPos = null;
        }
    }

    cancelDrag() {
        if (this.reorderSession) {
            this.reorderSession.finish(false);
            this.reorderSession = null;
        }
        this.isDragging = false;
        this.draggedElement = null;
        this.mirror = null;
    }

    clearLongPress() {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }
}

// Initialize Touch Handler
new TouchHandler();
async function collectExportPreviews(format = 'png', quality = 0.92) {
    const canvases = renderStripsToCanvases();
    const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const suffix = format === 'jpg' ? 'jpg' : 'png';
    const entries = [];
    for (let i = 0; i < canvases.length; i++) {
        const canvas = canvases[i];
        const name = canvases.length > 1 ? `collage_${String(i + 1).padStart(2, '0')}.${suffix}` : `collage.${suffix}`;
        const blob = await new Promise(resolve => {
            canvas.toBlob((b) => {
                if (b) return resolve(b);
                try {
                    const fallback = dataUrlToBlob(canvas.toDataURL(mime));
                    resolve(fallback);
                } catch (err) {
                    resolve(null);
                }
            }, mime, mime === 'image/jpeg' ? quality : undefined);
        });
        if (!blob) continue;
        entries.push({
            name,
            width: canvas.width,
            height: canvas.height,
            size: blob.size,
            blob
        });
    }
    return entries;
}

function renderExportPreviewList(entries) {
    if (!exportPreviewList) return;
    exportPreviewList.innerHTML = '';
    if (!entries || !entries.length) {
        exportPreviewList.innerHTML = '<div class="empty-preview">暂无可导出内容</div>';
        return;
    }
    entries.forEach(item => {
        const row = document.createElement('div');
        row.className = 'preview-list-item';
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = item.name;

        const size = document.createElement('span');
        size.className = 'dim';
        size.textContent = `${item.width} x ${item.height}`;

        const bytes = document.createElement('span');
        bytes.className = 'bytes';
        bytes.textContent = formatBytes(item.size);

        row.appendChild(name);
        row.appendChild(size);
        row.appendChild(bytes);
        exportPreviewList.appendChild(row);
    });
}

function openExportModal() {
    if (!exportModal) return;
    exportModal.classList.add('active');
    exportModal.setAttribute('aria-hidden', 'false');
    updateExportQualityVisibility();
    refreshExportPreviewList();
}

function closeExportModal() {
    if (!exportModal) return;
    exportModal.classList.remove('active');
    exportModal.setAttribute('aria-hidden', 'true');
}

function getSelectedFormat() {
    let fmt = exportConfig.format;
    exportFormatRadios.forEach(r => {
        if (r.checked) fmt = r.value;
    });
    return fmt === 'jpg' ? 'jpg' : 'png';
}

function updateExportQualityVisibility() {
    const fmt = getSelectedFormat();
    if (exportQualityRow) {
        exportQualityRow.style.display = fmt === 'jpg' ? 'flex' : 'none';
    }
}

let previewRefreshTimer = null;
let previewGenerationId = 0;
let lastPreviewEntries = [];
function refreshExportPreviewList() {
    if (previewRefreshTimer) clearTimeout(previewRefreshTimer);
    const currentGen = ++previewGenerationId;
    // mark loading without clearing list
    if (exportPreviewList && lastPreviewEntries.length) {
        exportPreviewList.querySelectorAll('.preview-list-item .bytes').forEach(el => {
            el.textContent = '...';
        });
    } else if (exportPreviewList && !exportPreviewList.children.length) {
        exportPreviewList.innerHTML = '<div class="empty-preview">计算中...</div>';
    }
    previewRefreshTimer = setTimeout(async () => {
        const fmt = getSelectedFormat();
        const quality = fmt === 'jpg' ? exportConfig.quality : undefined;
        const entries = await collectExportPreviews(fmt, quality);
        if (currentGen !== previewGenerationId) {
            return;
        }
        lastPreviewEntries = entries;
        renderExportPreviewList(entries);
        previewRefreshTimer = null;
    }, 120);
}

async function handleExportAction(mode = 'single') {
    const fmt = getSelectedFormat();
    exportConfig.format = fmt;
    if (fmt === 'jpg' && exportQualitySlider) {
        const q = Number(exportQualitySlider.value) / 100;
        exportConfig.quality = Math.max(0.1, Math.min(q, 0.95));
    }
    const entries = await collectExportPreviews(fmt, exportConfig.quality);
    if (!entries.length) {
        showToast('没有可导出的图片');
        return;
    }
    if (mode === 'zip') {
        try {
            const zipBlob = await createZip(entries);
            downloadBlob(zipBlob, 'collage_export.zip');
        } catch (err) {
            console.warn('ZIP build failed, fallback to sequential downloads', err);
            entries.forEach(item => downloadBlob(item.blob, item.name));
            showToast('打包失败，已逐个下载');
        }
    } else {
        entries.forEach(item => downloadBlob(item.blob, item.name));
    }
    closeExportModal();
}
