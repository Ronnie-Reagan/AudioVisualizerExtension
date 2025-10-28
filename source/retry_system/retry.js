const messageEl = document.getElementById("message");
const retryBtn = document.getElementById("retry");
const closeBtn = document.getElementById("close");

const params = new URLSearchParams(window.location.search);
const initialMessage = params.get("message") || "We could not access the tab audio.";
messageEl.textContent = initialMessage;

retryBtn.addEventListener("click", async () => {
  retryBtn.disabled = true;
  messageEl.textContent = "Trying again…";
  try {
    const response = await chrome.runtime.sendMessage({ type: "RETRY_CAPTURE" });
    if (!response?.ok) {
      throw new Error(response?.error || "Retry failed");
    }
    window.close();
  } catch (err) {
    console.error("Retry failed:", err);
    messageEl.textContent = err?.message || "Retry failed.";
    retryBtn.disabled = false;
  }
});

closeBtn.addEventListener("click", () => window.close());
