# Audio Visualizer

A Chrome extension that captures tab audio and renders real-time visualizations.  
Switch modes with the **M** key.
[Official Release Here](https://chromewebstore.google.com/detail/pmjocachgcbpjkpckfapgcmijopjfcik?utm_source=item-share-cb)

---

## Installation (from source)

1. **Download** this repository as a ZIP and extract it anywhere.  
2. **Open** your Chromium-based browser.  
3. Open the extensions page manually by copying and pasting one of these into your address bar:  
   - `chrome://extensions/` — Google Chrome | Chromium
   - `brave://extensions/` — Brave  
   - `edge://extensions/` — Microsoft Edge  
   - `opera://extensions/` — Opera  
   - `vivaldi://extensions/` — Vivaldi  
   - `epic://extensions/` — Epic Privacy Browser  
   - `browser://extensions/` — Yandex Browser  
4. Toggle **Developer Mode** in the upper-right corner.  
5. Click **Load Unpacked** and select the `source` folder inside the unzipped directory.  
6. The extension will appear in your extensions list and be ready to use.

> Core visualization logic is implemented in [`visualizer_system/audio`](source/visualizer_system/audio).

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
