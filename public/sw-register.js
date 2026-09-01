if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {
    // Registration fails in non-secure contexts or private browsing; non-fatal.
  });
}