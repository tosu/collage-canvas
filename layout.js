/**
 * Calculates the geometry for a justified image layout.
 * 
 * @param {Array} images - Array of objects with { aspectRatio } properties.
 * @param {number} containerWidth - The total width of the container/canvas.
 * @param {number} targetRowHeight - The desired height of rows.
 * @param {number} padding - The gap between images.
 * @returns {Object} { boxes: Array, containerHeight: number }
 */
function calculateLayout(images, containerWidth, targetRowHeight, padding) {
    const boxes = [];
    // No outer padding; padding is only between items
    const outerPad = 0;
    let currentY = 0;
    let currentRow = [];
    let currentRowWidth = 0; // Width excluding the last padding
    let lastRowAddedPadding = false;

    // Helper to process a completed row
    const processRow = (row, isLastRow) => {
        if (row.length === 0) return;

        let rowHeight;

        if (isLastRow) {
            // For the last row, we don't force justify. We use the target height.
            rowHeight = targetRowHeight;
        } else {
            // Calculate the total aspect ratio of the row
            const totalAspectRatio = row.reduce((sum, img) => sum + img.aspectRatio, 0);

            // Available width for images (total width - paddings)
            // Padding count is (items - 1) * padding.

            // Total gaps width
            const totalGapWidth = (row.length - 1) * padding;
            const availableWidth = containerWidth - totalGapWidth;

            // rowHeight = width / totalAspectRatio
            rowHeight = availableWidth / totalAspectRatio;
        }

        // Integer snapping with error compensation
        const rowHeightInt = Math.round(rowHeight);
        const totalGapWidth = (row.length - 1) * padding;
        const targetRowWidthInt = isLastRow ? null : (containerWidth - totalGapWidth);

        let currentX = outerPad; // Start at 0; no outer padding
        let idealProgress = 0;
        let widthAccum = 0; // sum of int widths (no gaps)

        row.forEach((img, idx) => {
            const floatWidth = rowHeight * img.aspectRatio;
            const nextIdeal = idealProgress + floatWidth;
            let intWidth = Math.round(nextIdeal) - Math.round(idealProgress);

            // For justified rows, force the last item to consume remaining space
            if (!isLastRow && idx === row.length - 1 && targetRowWidthInt !== null) {
                intWidth = targetRowWidthInt - widthAccum;
            }

            boxes.push({
                img: img,
                x: currentX,
                y: currentY,
                width: intWidth,
                height: rowHeightInt
            });

            currentX += intWidth + padding;
            widthAccum += intWidth;
            idealProgress = nextIdeal;
        });

        currentY += rowHeightInt;
        if (!isLastRow) {
            currentY += padding;
            lastRowAddedPadding = true;
        } else {
            lastRowAddedPadding = false;
        }
    };

    for (const img of images) {
        currentRow.push(img);

        // Calculate potential width with this new image at target height
        const totalAspectRatio = currentRow.reduce((sum, item) => sum + item.aspectRatio, 0);
        const totalGapWidth = (currentRow.length - 1) * padding;
        const currentContentWidth = totalAspectRatio * targetRowHeight;

        // Check if adding this image makes the row wide enough (close to container width)
        // We NO LONGER add padding * 2 for left/right margins
        if (currentContentWidth + totalGapWidth >= containerWidth) {
            processRow(currentRow, false);
            currentRow = [];
        }
    }

    // Process the last row
    if (currentRow.length > 0) {
        processRow(currentRow, true);
    } else if (boxes.length > 0 && lastRowAddedPadding) {
        // Remove trailing padding added after the final processed row
        currentY = Math.max(0, currentY - padding);
    }

    return {
        boxes: boxes,
        containerHeight: currentY
    };
}

// Export for use in script.js (if using modules, but we are using simple script tags)
window.calculateLayout = calculateLayout;
