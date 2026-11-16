// Окошко расширения: на связи ли KediMeet и пишет ли он, что за вкладка, кто в созвоне и кто говорит.
// Участников приносит фоновый скрипт (последний снимок вкладки в storage.session), состояние приложения —
// GET /status: расширению с host_permissions на 127.0.0.1 CORS не нужен.
const APP = 'http://127.0.0.1:47811';
const SITE = 'https://kedimeet.app/?utm_source=extension'; // счётчик сайта считает заходы по utm_source
const FRESH = 15000; // снимки идут хотя бы раз в 5 секунд — старше 15 секунд значит, созвона на вкладке уже нет

// Hugeicons, свободный набор под MIT (@hugeicons/core-free-icons 4.4.0, stroke rounded): Power, Browser, Hourglass,
// UserMultiple, MicOff01, InformationCircle; цвет — currentColor. Код расширения открыт, поэтому значки только
// из свободного набора: лицензия Hugeicons Pro не разрешает выкладывать исходники значков.
const ICONS = {
  power: '<path d="M18.7083 6C20.1334 7.59227 21 9.69494 21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 9.69494 3.86656 7.59227 5.29168 6"/><path d="M12 3V12"/>',
  browser: '<path d="M3 12C3 7.75736 3 5.63604 4.31802 4.31802C5.63604 3 7.75736 3 12 3C16.2426 3 18.364 3 19.682 4.31802C21 5.63604 21 7.75736 21 12C21 16.2426 21 18.364 19.682 19.682C18.364 21 16.2426 21 12 21C7.75736 21 5.63604 21 4.31802 19.682C3 18.364 3 16.2426 3 12Z"/><path d="M3 9H21"/>',
  hourglass: '<path d="M4 3H20"/><path d="M5.5 3V5.03039C5.5 6.27227 6.07682 7.4437 7.06116 8.20089L12 12L16.9388 8.20089C17.9232 7.44371 18.5 6.27227 18.5 5.03039V3"/><path d="M5.5 21V18.9696C5.5 17.7277 6.07682 16.5563 7.06116 15.7991L12 12L16.9388 15.7991C17.9232 16.5563 18.5 17.7277 18.5 18.9696V21"/><path d="M4 21H20"/>',
  people: '<path d="M16 21C15.7668 18.0685 13.3422 15.7477 10.3085 15.5521L9.49999 15.5C9.21121 15.5076 8.94209 15.5178 8.68816 15.5298C5.68124 15.6723 3.23089 18.0974 3 21"/><path d="M12.75 9.75C12.75 11.5449 11.2949 13 9.5 13C7.70508 13 6.25 11.5449 6.25 9.75C6.25 7.95507 7.70508 6.5 9.5 6.5C11.2949 6.5 12.75 7.95507 12.75 9.75Z"/><path d="M21 17.501C20.7709 14.6314 18.4541 12.2748 15.5 11.9961"/><path d="M15.9877 9C16.8965 8.42434 17.5001 7.40788 17.5001 6.25C17.5001 4.45507 16.0496 3 14.2602 3C13.3811 3 12.5838 3.35121 12.0001 3.92139"/>',
  micOff: '<path d="M8.1572 4.1572C8.94761 2.86349 10.373 2 12 2C14.4853 2 16.5 4.01472 16.5 6.5V11.5C16.5 11.8111 16.4684 12.1149 16.4083 12.4083M7.5 7.5V11.5C7.5 13.9853 9.51472 16 12 16C13.1154 16 14.136 15.5942 14.9222 14.9222"/><path d="M2 2L22 22"/><path d="M12 19H11.5828C8.07267 19 5.07706 16.4623 4.5 13M12 19H12.4172C14.2325 19 15.9102 18.3213 17.1869 17.1869M12 19V22M19.5 13C19.3878 13.6733 19.1841 14.3116 18.903 14.903"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16V12"/><path d="M12.125 8.25H12M12.25 8.25C12.25 8.11193 12.1381 8 12 8C11.8619 8 11.75 8.11193 11.75 8.25C11.75 8.38807 11.8619 8.5 12 8.5C12.1381 8.5 12.25 8.38807 12.25 8.25Z"/>',
};

const svg = (name, size = 16) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

/** Элемент с классом и текстом. Имена участников — с чужой страницы: только textContent, никакого HTML. */
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const t = (key, ...subs) => chrome.i18n.getMessage(key, subs.map(String));
// chrome.i18n без множественных чисел: категория из Intl.PluralRules (ru — one/few/many/other, en — one/other, ja — other),
// нет ключа категории — берём other
const plural = (key, n) =>
  t(`${key}_${new Intl.PluralRules(chrome.i18n.getUILanguage()).select(n)}`, n) || t(`${key}_other`, n);
// Названия площадок — бренд, но у части есть латинская запись; ключа нет (Zoom, Meet…) — имя из platforms.js
const pname = p => t(`platform_${p.id}`) || p.name;
const phint = p => (p.hint && t(`hint_${p.id}`)) || p.hint;

const clock = ms => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
};

const initials = name => name.split(/\s+/).slice(0, 2).map(w => [...w][0] || '').join('').toUpperCase();
const TINTS = ['--blue', '--orange', '--purple', '--green'];
const tint = name => TINTS[[...name].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 7) % TINTS.length];

let status; // ответ /status; null — приложение не отвечает; undefined — ещё не спросили
let appSeen; // приложение хоть раз отвечало (storage.local, ставят и фоновый скрипт, и окошко)
let snapshot; // последний снимок созвона на этой вкладке
let tab;

/** Шапка: на связи ли приложение и идёт ли запись. */
function renderApp() {
  const pill = document.getElementById('pill');
  document.getElementById('link').textContent =
    status === undefined ? t('searching') : status ? t('connected') : t('disconnected');
  pill.hidden = !status;
  if (status) {
    pill.className = status.recording ? 'pill rec' : 'pill';
    pill.textContent = status.recording
      ? (status.startedAt ? t('rec_time', clock(Date.now() - status.startedAt)) : t('rec'))
      : t('idle');
    pill.title = status.recording ? t('title_rec') : t('title_idle');
  }
  document.getElementById('version-app').textContent = status?.version ? `KediMeet ${status.version}` : '';
  // Идёт запись — готовая фраза для чата созвона: бот в звонок не заходит, собеседников предупреждает сам человек.
  // Слова — из приложения (note в /status), те же, что копирует его панель записи; старое приложение их не шлёт
  document.getElementById('consent').hidden = !(status?.recording && status.note);
}

document.getElementById('consent-copy').addEventListener('click', async e => {
  const button = e.currentTarget;
  try {
    await navigator.clipboard.writeText(status.note);
  } catch {
    return; // буфер недоступен — кнопка остаётся как была
  }
  button.textContent = t('consent_copied');
  setTimeout(() => { button.textContent = t('consent_copy'); }, 3000);
});

function card(iconName, tone, title, sub) {
  const box = el('section', 'card');
  const head = el('div', 'head');
  const tile = el('div', `tile ${tone}`);
  tile.innerHTML = svg(iconName);
  const text = el('div', 'head-text');
  text.append(el('div', 'head-title', title), el('div', 'head-sub', sub));
  head.append(tile, text);
  box.append(head);
  return box;
}

function note(text) {
  const line = el('div', 'note');
  line.innerHTML = svg('info', 14);
  line.append(el('span', '', text));
  return line;
}

/** У одного человека бывает две плитки (камера и экран) — в списке он один. */
function people(participants) {
  const byName = new Map();
  for (const p of participants) {
    const seen = byName.get(p.name);
    byName.set(p.name, seen
      ? { ...seen, self: seen.self || p.self, speaking: seen.speaking || p.speaking, muted: seen.muted || p.muted }
      : p);
  }
  return [...byName.values()].sort((a, b) => b.self - a.self);
}

function personRow(p) {
  const row = el('li', p.speaking ? 'person speaking' : 'person');
  const avatar = el('span', 'avatar', initials(p.name));
  avatar.style.setProperty('--tint', `var(${tint(p.name)})`);
  avatar.setAttribute('aria-hidden', 'true');
  const who = el('span', 'who', p.name);
  who.title = p.name;
  if (p.self && !/^(вы|you|du|vous|tú|usted|あなた)$/i.test(p.name)) who.append(el('span', 'you', t('you_tag'))); // Meet и VK вместо имени пишут «Вы»
  const state = el('span', 'state');
  if (p.speaking) {
    state.innerHTML = '<span class="bars" aria-hidden="true"><i></i><i></i><i></i></span>';
    // Список перерисовывается при каждом снимке — фаза от общих часов, чтобы полоски не начинали такт заново
    state.firstChild.style.setProperty('--phase', `${-(Date.now() % 900)}ms`);
    state.title = t('speaking_title');
  } else if (p.muted) {
    state.innerHTML = svg('micOff', 15);
    state.title = t('muted_title');
  }
  row.setAttribute('aria-label', [p.name, p.self && t('aria_self'), p.speaking && t('aria_speaking'), p.muted && t('aria_muted')]
    .filter(Boolean).join(', '));
  row.append(avatar, who, state);
  return row;
}

/** Карточки: приложение не запущено (если так) и что на вкладке. */
function renderMain() {
  const main = document.getElementById('main');
  const platform = platformFor(tab?.url || '') || PLATFORMS.find(p => p.id === snapshot?.platform);
  const live = snapshot && Date.now() - snapshot.t < FRESH ? snapshot : undefined;
  const cards = [];

  // Приложение не отвечает. Ни разу не отвечало — скорее всего, расширение поставили из магазина, а приложения нет:
  // говорим, что оно нужно, а не «не запущено». В обоих случаях — где его взять
  if (status === null) {
    const box = appSeen
      ? card('power', 'warn', t('off_title'), t('off_sub'))
      : card('power', 'warn', t('need_title'), t('need_sub'));
    const get = el('a', 'note get', t('get_app'));
    get.href = SITE;
    get.target = '_blank';
    box.append(get);
    cards.push(box);
  }

  if (!platform) {
    cards.push(card('browser', '', t('nocall_title'), t('nocall_sub')));
  } else if (!live) {
    const box = card('hourglass', '', pname(platform), t('waiting_sub'));
    if (platform.hint) box.append(note(phint(platform)));
    cards.push(box);
  } else {
    const list = people(live.participants);
    const box = card('people', 'live', pname(platform), plural('participants', list.length));
    const ul = el('ul', 'people');
    ul.setAttribute('aria-label', t('participants_aria'));
    ul.append(...list.map(personRow));
    box.append(ul);
    if (platform.speakers === false) {
      box.append(note(t('note_nospeakers', pname(platform))));
    } else if (live.blind) {
      box.append(note(t('note_background', pname(platform))));
    } else if (platform.hint) {
      box.append(note(phint(platform)));
    }
    cards.push(box);
  }
  const scroll = main.querySelector('.people')?.scrollTop;
  main.replaceChildren(...cards);
  if (scroll) main.querySelector('.people')?.scrollTo(0, scroll);

  document.getElementById('platforms').replaceChildren(...PLATFORMS.map(p => {
    const chip = el('li', p === platform ? 'here' : '', pname(p));
    if (p === platform) chip.setAttribute('aria-current', 'true');
    return chip;
  }));
}

function render() {
  renderApp();
  renderMain();
}

async function poll() {
  // Старый KediMeet (мост 0.2) на любой запрос отвечает 204 — он запущен, только про запись не скажет
  status = await fetch(`${APP}/status`, { cache: 'no-store' })
    .then(r => (r.status === 200 ? r.json() : r.ok ? {} : null))
    .catch(() => null);
  if (status && !appSeen) chrome.storage.local.set({ appSeen: (appSeen = true) });
  render();
}

(async () => {
  document.getElementById('version-extension').textContent = t('ext_version', chrome.runtime.getManifest().version);
  document.querySelectorAll('[data-i18n]').forEach(n => { n.textContent = t(n.dataset.i18n); });
  document.documentElement.lang = chrome.i18n.getUILanguage();
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const key = `tab:${tab?.id}`;
  snapshot = (await chrome.storage.session.get(key))[key];
  ({ appSeen } = await chrome.storage.local.get('appSeen'));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'session' || !(key in changes)) return;
    snapshot = changes[key].newValue;
    renderMain();
  });
  render();
  await poll();
  setInterval(poll, 2000);
  setInterval(renderApp, 1000); // часы записи
})();
