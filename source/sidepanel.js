import { initFromStreamId } from "./audio/capture.js";

async function startTabAudio() {
  // Ask background for a stream ID for the active tab
  const res = await chrome.runtime.sendMessage({ type: "REQUEST_STREAM_ID" });
  if (!res?.ok) {
    console.error("Failed to get stream ID:", res?.error);
    return;
  }

  // Now request the actual audio stream in sidebar context
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: res.streamId,
        },
      },
    });

    // Start your visualizer logic
    initFromStreamId(res.streamId, stream);
  } catch (err) {
    console.error("Sidebar capture error:", err);
  }
}

startTabAudio();
