// Страница созвона сама на 127.0.0.1 не достучится (CORS), а расширение с host_permissions — может.
// Адрес вкладки — отсюда, а не из страницы: участники живут во фрейме, у которого свой адрес, а ссылка на созвон —
// у вкладки. По ссылке KediMeet узнаёт повторяющуюся встречу и даёт ей имя прошлых созвонов там же.
const APP = 'http://127.0.0.1:47811';
const VERSION = chrome.runtime.getManifest().version;

chrome.runtime.onMessage.addListener((message, sender) => {
  if ('dark' in message) return void chrome.action.setIcon({ path: toolbarIcon(message.dark) });
  const tab = sender.tab?.id;
  if (tab === undefined) return;
  if (message.left) {
    chrome.storage.session.remove(`tab:${tab}`);
    chrome.action.setBadgeText({ tabId: tab, text: '' });
    return;
  }
  const snapshot = { ...message, url: sender.tab.url || sender.url };
  fetch(`${APP}/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot),
  }).catch(() => {}); // KediMeet не запущен — не страшно, снимок просто пропадёт
  // Последний снимок вкладки — для окошка расширения: оно открывается и сразу видит участников
  chrome.storage.session.set({ [`tab:${tab}`]: snapshot });
  badge(tab);
});

chrome.tabs.onRemoved.addListener(tab => chrome.storage.session.remove(`tab:${tab}`));

// «REC» на значке, пока вкладка — созвон, а KediMeet пишет. Снимки идут хотя бы раз в 5 секунд — значок
// успевает за началом и концом записи; состояние приложения спрашиваем не чаще раза в 4 секунды.
let status = null;
let statusAt = 0;

async function badge(tab) {
  if (Date.now() - statusAt > 4000) {
    statusAt = Date.now();
    status = await fetch(`${APP}/status`).then(r => (r.ok ? r.json() : null)).catch(() => null);
  }
  chrome.action.setBadgeText({ tabId: tab, text: status?.recording ? 'REC' : '' }).catch(() => {}); // вкладку закрыли
}

chrome.action.setBadgeBackgroundColor({ color: '#E5484D' });

// Значок на панели — голова кошки в наушниках; в тёмном браузере наушники светлые, иначе их не видно. Тему знает
// только документ — его и держим (theme.html, без окна); он уже открыт — воркер просто проснулся, значок на месте.
const toolbarIcon = dark => Object.fromEntries([16, 32].map(px => [px, `icon-${px}${dark ? '-dark' : ''}.png`]));
chrome.offscreen?.createDocument({
  url: 'theme.html',
  reasons: ['MATCH_MEDIA'],
  justification: 'Pick the toolbar icon for a light or dark browser',
}).catch(() => {});
chrome.action.setBadgeTextColor?.({ color: '#FFFFFF' });

// Раз в минуту здороваемся с KediMeet — приложение знает, что расширение установлено, даже без созвонов.
const hello = () =>
  fetch(`${APP}/hello`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: VERSION }),
  }).catch(() => {});

chrome.runtime.onInstalled.addListener(hello);
chrome.runtime.onStartup.addListener(hello);
chrome.alarms.onAlarm.addListener(alarm => alarm.name === 'hello' && hello());
// Будильник переживает сон воркера, но не всегда перезапуск браузера — заводим, если его нет
chrome.alarms.get('hello').then(alarm => alarm || chrome.alarms.create('hello', { periodInMinutes: 1 }));
