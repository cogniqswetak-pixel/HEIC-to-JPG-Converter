# HEIC to JPG Converter

A fast, private, client-side batch converter for Apple HEIC and HEIF photos. Converts files directly in the browser using WebAssembly and HTML5 Canvas with zero network latency and 100% data privacy.

---

## What is Included

### 1. Batch & Parallel Conversion
* **Multi-File Concurrency**: Drag and drop dozens of `.heic` and `.heif` images at once. Files convert concurrently in parallel chunks for maximum throughput.
* **Smart Progress Tracking**: Real-time progress indicators, status badges, and size reduction percentage counters for each image.
* **ZIP Archive Export**: Download individual converted images or bundle the entire queue into a single `.zip` file with one click.

### 2. Formats & Quality Controls
* **JPG Mode**: Adjustable compression quality (60% to 100%) with quick preset buttons:
  * **Compact (75%)**: Ideal for web sharing, emails, and lightweight storage.
  * **Balanced (85%)**: Recommended default for high visual clarity and efficient compression.
  * **Ultra (95%)**: Maximum visual preservation for professional prints and archives.
* **Lossless PNG Mode**: Converts images with 100% pixel fidelity.
* **Optional Resolution Limits**: Constrain maximum width or height in pixels while maintaining the original aspect ratio.

### 3. Privacy & Metadata Management
* **100% Offline & Private**: Zero external API calls, zero tracking, zero server uploads. Files are processed entirely inside browser memory.
* **EXIF Toggle**: Choose whether to preserve camera timestamps and location data, or strip them automatically for privacy.
* **Automatic Orientation**: Uses embedded orientation tags to keep photos right-side up.

### 4. Visual Comparison Studio
* **Interactive Split Slider**: In-place Before/After comparison viewer to compare original HEIC photos with converted JPG/PNG outputs.
* **Inspection Zoom**: 1x and 2x zoom toggles to inspect fine image details and compression artifacts.

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Cmd + O` / `Ctrl + O` | Open file picker dialog |
| `Cmd + V` / `Ctrl + V` | Paste image directly from clipboard |
| `Cmd + Enter` / `Ctrl + Enter` | Start batch conversion for all queued files |
| `Esc` | Close Before/After comparison modal |

---

## Local Development

### Prerequisites
* Node.js (version 16 or higher) or any local static file server.

### Running Locally

1. Clone or navigate to the project directory:
```bash
cd /path/to/Converter
```

2. Start the local server:
```bash
node server.js
```

3. Open your browser at:
```
http://localhost:8080/app.html
```

---

## Chrome Extension Setup

This project is also configured as a Chrome Extension (Manifest V3):

1. Open Google Chrome and go to `chrome://extensions`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the project folder.
5. Click the extension icon in your Chrome toolbar to open the converter in a dedicated full-page tab.

---

## License

MIT License. Free for personal and commercial use.
