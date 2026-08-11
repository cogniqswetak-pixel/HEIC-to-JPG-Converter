// Dedicated Background Web Worker for HEIC to JPG Conversion
self.importScripts('vendor/heic2any.min.js');

self.onmessage = async (e) => {
  const { id, file, format, quality, maxWidth, maxHeight, keepExif } = e.data;

  try {
    self.postMessage({ type: 'progress', id, progress: 25 });
    const targetMime = format === 'png' ? 'image/png' : 'image/jpeg';
    const qValue = Math.max(0.6, Math.min(1.0, quality / 100));

    let isDecoded = false;
    let resultBlob;

    // 1. Hardware decode path (if native HEIC is supported)
    try {
      const bitmap = await createImageBitmap(file);
      let width = bitmap.width;
      let height = bitmap.height;
      if (maxWidth && width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      if (maxHeight && height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      resultBlob = await canvas.convertToBlob({ type: targetMime, quality: qValue });
      if (resultBlob && resultBlob.size > 0) isDecoded = true;
    } catch (err) {
      isDecoded = false;
    }

    self.postMessage({ type: 'progress', id, progress: 60 });

    // 2. WASM heic2any path (standard fallback for Chrome/Firefox)
    if (!isDecoded) {
      const decoded = await heic2any({ blob: file, toType: targetMime, quality: qValue, multiple: false });
      resultBlob = Array.isArray(decoded) ? decoded[0] : decoded;
      
      // Handle resize via OffscreenCanvas if needed
      if (maxWidth || maxHeight) {
         const bmp = await createImageBitmap(resultBlob);
         let w = bmp.width;
         let h = bmp.height;
         if (maxWidth && w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
         if (maxHeight && h > maxHeight) { w = Math.round((w * maxHeight) / h); h = maxHeight; }
         const cvs = new OffscreenCanvas(w, h);
         cvs.getContext('2d').drawImage(bmp, 0, 0, w, h);
         bmp.close();
         resultBlob = await cvs.convertToBlob({ type: targetMime, quality: qValue });
      }
    }

    self.postMessage({ type: 'progress', id, progress: 100 });
    self.postMessage({ type: 'success', id, blob: resultBlob, size: resultBlob.size });
  } catch (error) {
    self.postMessage({ type: 'error', id, error: error.message || 'Failed to decode HEIC file' });
  }
};
