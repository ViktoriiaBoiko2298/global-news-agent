self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const payload = safeJson(event.data);
  const title = payload.title || "News Agent";
  const options = {
    body: payload.body || "Новый алерт",
    tag: payload.tag || "news-agent-alert",
    data: {
      url: payload.url || "/"
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => "focus" in client);

    if (existing) {
      await existing.navigate(targetUrl);
      return existing.focus();
    }

    return self.clients.openWindow(targetUrl);
  })());
});

function safeJson(data) {
  if (!data) return {};

  try {
    return data.json();
  } catch {
    try {
      return JSON.parse(data.text());
    } catch {
      return {};
    }
  }
}
