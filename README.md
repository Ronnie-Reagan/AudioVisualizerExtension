# Audio Visualizer

A Chrome extension that captures tab audio and renders real-time visualizations.  
Switch modes with the **M** key.

---

## Installation (from source)

1. **Download** this repository as a ZIP and extract it anywhere.
2. **Open** Chrome (or any Chromium-based browser).
3. Navigate to: `chrome://extensions/`
4. Toggle **Developer Mode** in the upper-right corner.
5. Click **Load Unpacked** and select the `source` folder inside the unzipped directory.
6. The extension will appear in your extensions list and is ready to use.

> Core visualization logic is implemented in [`visualizer.js`](source/visualizer.js).

---

## Development

- The visualizer runs entirely client-side using the Web Audio API and Canvas 2D.
- Each mode (spectrum, waveform, spectrogram) is drawn on a per-frame loop using requestAnimationFrame.
- Communication with the active tab uses `chrome.tabCapture`.

---

## Contributing

Contributions are welcome.  
Please **fork** this repository, make your changes in a feature branch, and submit a **pull request**.

Areas for improvement:
- Additional visualization modes
- UI/UX enhancements
- Performance optimizations
- Accessibility and configuration options
