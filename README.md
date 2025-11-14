# Audio Visualizer

A Chrome extension that captures tab audio and renders real-time visualizations.

Supports various modes such as
- Oscilliscope(XY)
   - Crudely designed to emulate a Soviet-era oscilliscope which may be using phosphor
   - Maps Left/Right channels to X/Y axis on the screen/veiwport
   - Uses a specially designed UI to allow a more natural use - emulating the oscilliscope better.
   - Sometimes used to visualize movement and 'shapes' from audio

- Spectrogram
   - Side-scrolling veiw that shows amplitude with colour and frequency on Y axis
   - Ideal for visualizing noise-frequency binning
   - Sometimes used to see images encoded in audio

- Spectrum
   - The most common visualization - Bar graph
   - Custom Colour-mapping for amplitude to add aethestic
   - 'Falling' bars to improve smoothness

- PCM
   - PCM (normalized to +1/-1 from +126/-127) wave form visualization
   - Great for seeing 'chopped' audio transients (common for crudely bass-boosted audio files)
   - I personally like to imagine it like a guitar string

- Halo
   - Crudely implemented and **Under Construction** view to emulate a solar storm or a 'earth' traveling through space
   - Very Early Implementation; Not representative of final mode.

- Light Room (GL)
   - Experimental WebGL/GLSL ray-marched light installation mapped to live frequency bins
   - Each light blooms and fades purely from amplitude, simulating a volumetric club/room scene.
   - UNTESTED DUE TO HARDWARE LIMITATIONS

Expect more modes to be added as time goes on; try not to be upset if your favourite mode is removed as we intend to make the modes user-scriptable/moddable via Extension-Storage (Under Review for feasibility - no promises)


[Official Release Here](https://chromewebstore.google.com/detail/pmjocachgcbpjkpckfapgcmijopjfcik?utm_source=item-share-cb)

---

## Installation (from source)

> Due to how loading unpacked extensions work; you will need to re-load the extension manually each time you start your system; I reccomend using the Chrome Store Release [Here](https://chromewebstore.google.com/detail/pmjocachgcbpjkpckfapgcmijopjfcik?utm_source=item-share-cb)

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

> Core visualization logic is implemented in [`visualizer_system/draw`](source/visualizer_system/draw).

---

## Development

- The visualizer runs entirely client-side using the Web Audio API and Canvas 2D.
- Each mode (spectrum, waveform, spectrogram) is drawn on a per-frame loop using requestAnimationFrame.
- Communication with the active tab uses `chrome.tabCapture`.

## Testing

Pure logic utilities now have automated coverage so regressions are caught before shipping builds. Run:

```bash
npm test
```

---

## Contributing

Contributions are welcome.
Please **fork** this repository, make your changes in a feature branch, and submit a **pull request**.

Areas for improvement:
- Additional visualization modes
- UI/UX enhancements
- Performance optimizations
- Accessibility and configuration options
