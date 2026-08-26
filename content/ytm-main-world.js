(() => {
  function runsText(runs) {
    return Array.isArray(runs) ? runs.map((r) => r.text ?? "").join("") : "";
  }

  function thumbnailFromData(data) {
    const thumbs = data?.thumbnail?.thumbnails;
    if (!thumbs?.length) return "";
    const url = thumbs[thumbs.length - 1].url || "";
    return url.startsWith("//") ? "https:" + url : url;
  }

  function annotate(item) {
    const data = item.data;
    if (!data) return;
    item.dataset.ytmfloatTitle = runsText(data.title?.runs);
    item.dataset.ytmfloatArtist = runsText(data.longBylineText?.runs) || runsText(data.shortBylineText?.runs);
    item.dataset.ytmfloatThumb = thumbnailFromData(data);
    item.dataset.ytmfloatVideoId = data.videoId ?? "";
    item.dataset.ytmfloatSelected = data.selected ? "1" : "0";
  }

  function annotateAll() {
    document.querySelectorAll("ytmusic-player-queue-item").forEach(annotate);
  }

  const observer = new MutationObserver(annotateAll);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  annotateAll();
  setInterval(annotateAll, 1000);
})();
