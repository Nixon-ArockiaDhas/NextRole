const status = document.querySelector("#status");
const open = document.querySelector("#open");

async function prepare() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ? new URL(tab.url) : null;
  const posting = url?.pathname.match(/^\/jobs\/view\/(?:[^/]+-)?(\d{1,20})\/?$/)?.[1];
  const selection = url?.searchParams.get("currentJobId");
  const jobId = posting || (url?.pathname.startsWith("/jobs/") && /^\d{1,20}$/.test(selection ?? "") ? selection : null);

  if (!jobId || url.protocol !== "https:" || !["www.linkedin.com", "linkedin.com"].includes(url.hostname)) {
    status.textContent = "Open a LinkedIn job posting or select a job in LinkedIn Jobs.";
    return;
  }

  const nextRole = new URL("http://localhost:3000/discover");
  nextRole.searchParams.set("job", jobId);
  status.textContent = "Review the posting in NextRole and save it to your list.";
  open.disabled = false;
  open.addEventListener("click", async () => {
    await chrome.tabs.create({ url: nextRole.href });
    window.close();
  });
}

prepare().catch(() => {
  status.textContent = "The current tab could not be read. Try opening the LinkedIn posting directly.";
});
