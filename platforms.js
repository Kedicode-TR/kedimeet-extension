// Платформы созвонов: где их узнать и как снять со страницы участников — имя, говорит ли, выключен ли микрофон,
// своя ли плитка. Новая платформа — новая запись здесь и её адреса в manifest.json; приложение и движок о платформах
// не знают, им приходит общий снимок. Файл грузят и страница созвона (content.js), и окошко расширения (popup.js).
//
// Чему верить. Движок берёт спикеров из подсветки «говорит» вместо pyannote и фразы без подсветки отдаёт ближайшему
// спикеру. Поэтому «говорит» шлём, только если признак семантический и известен из кода, — иначе false всегда:
// пустая шкала безопасна (откат на pyannote), а неверная портит стенограмму. Признак сломался после обновления
// платформы — «говорит» просто перестаёт гореть, тоже откат. «Своя плитка» + «микрофон выключен» глушат твою дорожку
// при сведении — поэтому self ставим, только когда он надёжен, иначе false.
//
// sites — как в настройках автозаписи: сайт или любой его поддомен, после «/» — начало пути.
// speakers: false — подсветке «говорит» не верим, участники и ссылка всё равно полезны.
// blind: true — в фоновой вкладке платформа подсветку не обновляет; такие снимки помечаются, и приложение
//   не верит шкале, где их много (SpeakerTimeline).
// hint — что подсказать в окошке расширения.
//
// Проверено живьём только у Телемоста. Остальное — 08.11.2026 по чужому открытому коду и по боевым бандлам самих
// платформ (ничего не запускалось); в живом созвоне не проверено — первый же созвон на платформе покажет.

/** Текст узла: пробелы схлопнуты, края обрезаны. */
const textOf = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();

/** Платформы держат в разметке и спрятанные значки — считаем только видимые. */
const shown = el => !!el && el.getClientRects().length > 0;

/** Список прокручивается — значит, виден не весь: в виртуальных списках невидимых строк в разметке нет вовсе. */
const clipped = el => {
  for (let node = el?.parentElement; node && node !== document.body; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(node).overflowY)) return true;
  }
  return false;
};

/** Уровень звука мигает между слогами — «говорит» держим ещё ms после последнего всплеска. */
const heardAt = new Map();
const held = (key, on, ms = 700) => {
  const now = Date.now();
  if (on) heardAt.set(key, now);
  return now - (heardAt.get(key) ?? -Infinity) < ms;
};

// Google Meet: индикатор громкости на плитке [jsname="QgSmzd"] меняет классы несколько раз в секунду, пока человек
// говорит, и замирает в тишине. Сами классы обфусцированы и меняются от сборки к сборке — смотрим, ЧТО они меняются.
// Наблюдатель — на самих индикаторах, не на всём документе: страница Meet шевелится постоянно.
const meetObserver = new MutationObserver(records => {
  for (const record of records) {
    const id = record.target.closest?.('[data-participant-id]')?.getAttribute('data-participant-id');
    if (id) held('meet:' + id, true);
  }
});
const meetWatched = new WeakSet();

const PLATFORMS = [
  {
    id: 'meet',
    name: 'Google Meet',
    sites: ['meet.google.com'],
    blind: true,
    // Без фрейма. Плитка камеры — [data-participant-id][data-tile-media-id] с равными id (демонстрация экрана —
    // вторая плитка со своим media id); имя — span.notranslate (класс Google против автоперевода, не хеш).
    // «Говорит» — перемены классов внутри [jsname="QgSmzd"] за последние 800 мс; своя плитка — по кнопкам
    // своего превью [jsname="nsKqzb"], [jsname="Ac69Jc"] или значкам frame_person / visual_effects.
    // Источники: Natively (natively-browser/src/meet-dom.ts, замер на живом созвоне 27.09.2026), gravador
    // (meet-speakers.ts, 13.10.2026), escale-browser (meeting.js, 15.10.2026), all-ears (meet.ts, 12.08.2026).
    // [data-self-name] больше нет (all-ears, 12.08.2026). Свой микрофон — кнопка button[data-is-muted] с «микрофон»
    // в подписи (vibeconf meet-selectors.js, 06.11.2026); чужой — видимый значок mic_off (escale).
    // Ограничения: в фоновой вкладке индикатор замирает (blind); в больших созвонах плитки есть не у всех;
    // на своей плитке вместо имени — «Вы».
    participants: () => {
      const mic = [...document.querySelectorAll('button[data-is-muted]')]
        .find(button => /micro|mikro|микрофон/i.test(button.getAttribute('aria-label') || ''));
      return [...document.querySelectorAll('[data-participant-id][data-tile-media-id]')]
        .filter(tile => tile.getAttribute('data-tile-media-id') === tile.getAttribute('data-participant-id'))
        .map(tile => {
          const id = tile.getAttribute('data-participant-id');
          const meter = tile.querySelector('[jsname="QgSmzd"]');
          if (meter && !meetWatched.has(meter)) {
            meetWatched.add(meter);
            meetObserver.observe(meter, { attributes: true, attributeFilter: ['class'], subtree: true });
          }
          const icons = [...tile.querySelectorAll('i')].map(i => [i, textOf(i)]);
          const self = !!tile.querySelector('[jsname="nsKqzb"], [jsname="Ac69Jc"]')
            || icons.some(([, t]) => t === 'frame_person' || t === 'visual_effects');
          // Значки шрифта Material — тоже span.notranslate, их текст вида mic_off — не имя
          const name = [...tile.querySelectorAll('span.notranslate')].map(textOf)
            .find(t => t && !/^[a-z0-9]+(_[a-z0-9]+)+$/.test(t) && !/^Google Participant \(|spaces\/|devices\//.test(t));
          return {
            name,
            self,
            speaking: held('meet:' + id, false, 800),
            muted: self ? mic?.getAttribute('data-is-muted') === 'true'
              : icons.some(([i, t]) => t === 'mic_off' && shown(i)),
          };
        });
    },
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    sites: ['teams.microsoft.com', 'teams.live.com', 'teams.cloud.microsoft'],
    speakers: false,
    // Плитка — [data-tid^="video-item-container-"], имя — хвост data-tid (vibeconf teams-selectors.js, живой созвон
    // 15.10.2026); запасной — [data-stream-type][data-tid] с именем в data-tid (vexa msteams-speakers.ts, 20.08.2026).
    // «Говорит» — спорно, поэтому false всегда: класс vdi-frame-occlusion на [data-tid="voice-level-stream-outline"]
    // у одних срабатывает (EnviousWispr, 29.10.2026), у vexa за 13 минут живого созвона — ни разу (12.08.2026),
    // vibeconf видит рассинхрон с речью и читает прозрачность ::before (16.10.2026, только гостевой клиент).
    // Своя плитка в разметке не помечена — self false. Микрофон на плитках никем не проверен — muted false.
    participants: () => {
      const named = [...document.querySelectorAll('[data-tid^="video-item-container-"]')]
        .filter(tile => !tile.querySelector('[data-stream-type="ScreenSharing"]'))
        .map(tile => tile.getAttribute('data-tid').slice('video-item-container-'.length));
      const names = named.length ? named
        : [...document.querySelectorAll('[data-stream-type][data-tid]:not([data-stream-type="ScreenSharing"])')]
          .map(el => el.getAttribute('data-tid'));
      return names.map(name => ({ name, self: false, speaking: false, muted: false }));
    },
  },
  {
    id: 'zoom',
    name: 'Zoom',
    sites: ['zoom.us/wc'],
    hint: 'Открой список участников в Zoom — так видно всех и кто говорит.',
    // Веб-клиент; в PWA он во фрейме #webclient того же сайта (/wc/<id>/join) — его и ловит all_frames.
    // Полный источник — открытая панель участников: строки .participants-li, имя .participants-item__display-name,
    // aria-label строки «Stan (Host, me),computer audio muted,video off» — «me» в скобках = своя, «computer audio
    // muted» = микрофон выключен (vibeconf zoom-selectors.js 30.10.2026 и Pipit provider.js 11.09.2026 — совпадают).
    // «Говорит» — в строке значок .participants-icon__voip-speaking-icon вместо микрофона (vibeconf, живой созвон
    // 16.10.2026, один источник; BEM-класс написан руками, не хеш). Верим ему, только если список виден весь.
    // Подписи — английские: в интерфейсе на другом языке self и muted останутся false — безопасно.
    // Панель закрыта — имена с плиток .video-avatar__avatar-footer, «говорит» false: классы активного спикера
    // на плитках по свежим данным разные (vexa 31.08.2026: исчезли; EnviousWispr 28.10.2026: есть).
    participants: () => {
      const rows = [...document.querySelectorAll('.participants-li')];
      if (rows.length) {
        const all = !clipped(rows[0]);
        return rows.map(row => {
          const label = row.getAttribute('aria-label') || '';
          return {
            name: textOf(row.querySelector('.participants-item__display-name')),
            self: /\((?:[^)]*,\s*)?me\)/i.test(label),
            speaking: all && !!row.querySelector('.participants-icon__voip-speaking-icon'),
            muted: /computer audio muted/i.test(label),
          };
        });
      }
      return [...document.querySelectorAll('.video-avatar__avatar')].map(tile => ({
        name: textOf(tile.querySelector('.video-avatar__avatar-footer')),
        self: false,
        speaking: false,
        muted: !!tile.querySelector('.video-avatar__avatar-footer--view-mute-computer'),
      }));
    },
  },
  {
    id: 'webex',
    name: 'Webex',
    sites: ['webex.com'],
    // Открытого кода нет (attendee ходит через SDK, мимо интерфейса) — боевой бандл web.webex.com
    // (14940-8a0da13753270987.js, 08.11.2026). Плитка — [data-video-pane-member-id]; имя —
    // [data-test="participant-label-display-name"]; своя — внутри video[data-self-view-location="INLINE"];
    // микрофон — mdc-icon[name="microphone-muted-bold"]. «Говорит» — ореол [data-test="active-speaker-halo"]:
    // рисуется по списку активных спикеров от сервера. Классический веб-клиент webappng — другое приложение,
    // не разобран. Ограничение: сетка постраничная — спикеры с других страниц не видны.
    participants: () =>
      [...document.querySelectorAll('[data-video-pane-member-id]')].map(tile => ({
        name: textOf(tile.querySelector('[data-test="participant-label-display-name"]'))
          || (tile.getAttribute('data-test') || '').replace(/-video-pane-container$/, ''),
        self: !!tile.querySelector('video[data-self-view-location="INLINE"]'),
        speaking: !!tile.querySelector('[data-test="active-speaker-halo"], .active-speaker-halo'),
        muted: !!tile.querySelector('mdc-icon[name="microphone-muted-bold"]'),
      })),
  },
  {
    id: 'whereby',
    name: 'Whereby',
    sites: ['whereby.com'],
    // Открытого кода нет — боевой бандл whereby.com (index.DGs5_fAy.js, 08.11.2026). Плитка —
    // .jstest-client-video[data-clientid] (тестовые крючки jstest-* стабильны), своя — .jstest-local-client-video,
    // имя — .jstest-displayname [class*="_name_"] или title плитки (в мелких ячейках), микрофон — .jstest-mute-icon.
    // «Говорит» — индикатор [class*="_AudioIndicator_"]: Whereby сам считает громкость потока участника и
    // выставляет ему opacity > 0 (порог в их коде); держим 700 мс, чтобы не мигало между слогами. Выключен
    // в настройках («подсвечивать говорящего», «меньше эффектов») — не горит ни у кого, откат на pyannote.
    participants: () =>
      [...document.querySelectorAll('.jstest-client-video[data-clientid]')].map(tile => {
        const level = tile.querySelector('[class*="_AudioIndicator_"]');
        return {
          name: textOf(tile.querySelector('.jstest-displayname [class*="_name_"]'))
            || (tile.getAttribute('title') || '').replace(/ \(is recording\)$/, ''),
          self: tile.classList.contains('jstest-local-client-video'),
          speaking: held('whereby:' + tile.getAttribute('data-clientid'), parseFloat(level?.style.opacity) > 0),
          muted: !!tile.querySelector('.jstest-mute-icon'),
        };
      }),
  },
  {
    id: 'jitsi',
    name: 'Jitsi Meet',
    sites: ['meet.jit.si', '8x8.vc'],
    // Открытый код jitsi/jitsi-meet (master cc70588, 06.11.2026), те же строки — в боевых бандлах meet.jit.si и 8x8.vc.
    // Плитка — .videocontainer с id participant_<id> или localVideoContainer (Thumbnail.tsx; у двойников на сцене и
    // в демонстрации хвост _stage / _screenshare — их пропускаем). Имя — .displayname; свой микрофон и чужой —
    // #audioMuted в плитке (AudioMutedIndicator.tsx). «Говорит» — класс dominant-speaker: доминирующий спикер от
    // сервера (или P2P-детектора), один за раз, держится и в паузе — паузы слов не содержат, это не вредит.
    // Ограничение: плитки виртуальные — в большом созвоне есть только у видимых.
    participants: () =>
      [...document.querySelectorAll('.videocontainer')]
        .filter(tile => /^(participant_[^_]+|localVideoContainer)$/.test(tile.id))
        .map(tile => ({
          name: textOf(tile.querySelector('.displayname')),
          self: tile.id === 'localVideoContainer',
          speaking: tile.classList.contains('dominant-speaker'),
          muted: !!tile.querySelector('#audioMuted'),
        })),
  },
  {
    id: 'telemost',
    name: 'Яндекс Телемост',
    sites: ['telemost.yandex.ru', 'telemost.360.yandex.ru'],
    // Проверено живьём 29.09.2026. Созвон живёт во фрейме private-join — поэтому скрипт во всех фреймах (all_frames).
    // Классы — CSS-модули с хвостом-хешем, поэтому ищем по началу имени.
    //   плитка участника    — [class*="rootTeleMessenger"]
    //   имя                 — [class*="TextName"]
    //   «говорит»           — у плитки класс rootStroke_… (рамка вокруг)
    //   микрофон выключен   — внутри плитки [data-testid="micro-off-icon"]
    //   своя плитка         — внутри [class*="selfView"]
    participants: () =>
      [...document.querySelectorAll('[class*="rootTeleMessenger"]')].map(tile => ({
        name: textOf(tile.querySelector('[class*="TextName"]')),
        self: !!tile.closest('[class*="selfView"]'),
        speaking: /(^|\s)rootStroke_/.test(tile.className),
        muted: !!tile.querySelector('[data-testid="micro-off-icon"]'),
      })),
  },
  {
    id: 'jazz',
    name: 'SaluteJazz',
    sites: ['salutejazz.ru', 'jazz.sber.ru'],
    hint: 'Открой список участников в SaluteJazz — так видно, кто говорит.',
    // Бывший SberJazz: jazz.sber.ru отвечает 308 на salutejazz.ru/calls/<код>. Открытого кода нет — боевой бандл
    // (main.733752b1.js, 84.cb141f6b.chunk.js, 08.11.2026). Без фрейма.
    // Открытая панель участников [data-testid^="participantItem-"]: первая строка текста — имя («Имя (вы)» у своей),
    // aria-label — «Имя. Это вы. … Микрофон Выключен…» (ru/en строки из бандла), «говорит» — внутри
    // [data-testid="speechIcon"] (доминирующий спикер без выключенного микрофона). Список виртуальный — «говорит»
    // берём, только если он виден весь.
    // Панель закрыта — плитки [data-testid^="participantTile-"] / thumbnailTile-: имя participantUserName или
    // participantInfoText, своя — атрибут data-local, микрофон у себя — кнопка [data-testid="microphone"][data-muted]
    // (её же читает расширение sordio, 05.08.2026), у других — data-with-micro. «Говорит» на плитках — только класс
    // styled-components, меняется со сборкой, — false.
    participants: () => {
      const rows = [...document.querySelectorAll('[data-testid^="participantItem-"]')];
      if (rows.length) {
        const all = !clipped(rows[0]);
        return rows.map(row => {
          const label = row.getAttribute('aria-label') || '';
          const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
          let first = '';
          while (!first && walker.nextNode()) first = walker.currentNode.nodeValue.trim();
          return {
            name: first,
            self: /\((вы|you)\)$/i.test(first) || /\. (Это вы|This is you)(\.|$)/.test(label),
            speaking: all && !!row.querySelector('[data-testid="speechIcon"]'),
            muted: /(Микрофон Выключен|Microphone Off)/i.test(label),
          };
        });
      }
      const mic = document.querySelector('button[data-testid="microphone"][data-muted]');
      return [...document.querySelectorAll('[data-testid^="participantTile-"], [data-testid^="thumbnailTile-"]')]
        .map(tile => {
          const self = tile.hasAttribute('data-local');
          return {
            name: textOf(tile.querySelector('[data-testid="participantUserName"], [data-testid="participantInfoText"]')),
            self,
            speaking: false,
            muted: self ? mic?.getAttribute('data-muted') === 'true' : !!tile.querySelector('[data-with-micro]'),
          };
        });
    },
  },
  {
    id: 'vk',
    name: 'VK Звонки',
    sites: ['calls.vk.com', 'calls.vk.ru', 'vk.com/call', 'vk.ru/call'],
    // Открытого кода нет — боевой бандл calls.vk.com (calls_landing.36f6b5d6.js, 08.11.2026); на vk.com/call без входа
    // разметку звонка посмотреть не удалось. Плитка — .Participant[participant-id] (в сетке и в ленте сбоку),
    // имя — .Participant__name, микрофон — .Participant__statusIcon--mic. «Говорит» — BEM-модификатор
    // Participant--isSpeaking (состояние isSpeaking из SDK). Своя плитка не помечена, вместо имени на ней «Вы» —
    // self false.
    participants: () =>
      [...document.querySelectorAll('.Participant[participant-id]')].map(tile => ({
        name: textOf(tile.querySelector('.Participant__name')),
        self: false,
        speaking: tile.classList.contains('Participant--isSpeaking'),
        muted: !!tile.querySelector('.Participant__statusIcon--mic'),
      })),
  },
  {
    id: 'ktalk',
    name: 'Контур.Толк',
    sites: ['ktalk.ru'],
    // Комната — <пространство>.ktalk.ru/<комната>. Открытого кода нет — боевой бандл (Angular на lib-jitsi-meet:
    // main.4829e51ba5cac8b9.js, async/600.6425ded3b9b357b6.js, 08.11.2026). Плитка — элемент conference-participant,
    // имя — .participant-name, микрофон — .participant-icon.mute. «Говорит» — класс dominant на плитке:
    // доминирующий спикер Jitsi (viewDominantSpeaker$), один за раз. Своя плитка не помечена — self false.
    participants: () =>
      [...document.querySelectorAll('conference-participant')].map(tile => ({
        name: textOf(tile.querySelector('.participant-name')),
        self: false,
        speaking: tile.classList.contains('dominant'),
        muted: !!tile.querySelector('.participant-icon.mute'),
      })),
  },
  {
    id: 'mtslink',
    name: 'МТС Линк',
    sites: ['mts-link.ru', 'webinar.ru'],
    // Комната — my.mts-link.ru/j/<владелец>/<событие>, старые адреса events.webinar.ru и my.webinar.ru живы. Открытого
    // кода нет — боевой бандл (async/1710.8c71c532b5.js, 08.11.2026). Плитка — [data-testid^="vcsItem"]: у чужих
    // ровно vcsItem, у своей vcsItem.expand / .collapse / .hide. Имя — [class*="VcsItemOverlay__title"], микрофон —
    // [class*="VcsItemOverlay__micStateIcon"] (CSS-модули: начало имени стабильно, хвост-хеш — нет). «Говорит» —
    // [data-testid="VcsItemSoundBorder.Active"]: рамка по списку говорящих из SDK (onSwitchersSpeaking).
    participants: () =>
      [...document.querySelectorAll('[data-testid^="vcsItem"]')]
        .filter(tile => /^vcsItem(\.(expand|collapse|hide))?$/.test(tile.getAttribute('data-testid')))
        .map(tile => ({
          name: textOf(tile.querySelector('[class*="VcsItemOverlay__title"]')),
          self: tile.getAttribute('data-testid') !== 'vcsItem',
          speaking: !!tile.querySelector('[data-testid="VcsItemSoundBorder.Active"]'),
          muted: !!tile.querySelector('[class*="VcsItemOverlay__micStateIcon"]'),
        })),
  },
];

// Пометки платформ после имени: «Maya (Вы)», «Daniel (Host, me)», «Гость (Unverified)». Компанию в скобках —
// «Maya (Acme)» — не трогаем: это часть имени.
const QUALIFIER = /\s*\((?:\s*(?:you|вы|me|я|host|co-host|организатор|соорганизатор|guest|гость|unverified|external|внешний)\s*,?)+\)\s*$/i;

/** Мусор в KediMeet не шлём: пустые имена и простыни текста вместо имени. Формат участника — как в 0.2. */
const tidy = list => list
  .map(p => ({ name: (p.name || '').replace(QUALIFIER, '').trim(), self: !!p.self, speaking: !!p.speaking, muted: !!p.muted }))
  .filter(p => p.name && p.name.length <= 100)
  .slice(0, 300);

/** Платформа по адресу: сайт или его поддомен, путь — с начала. */
function platformFor(url) {
  let u;
  try { u = new URL(url); } catch { return undefined; }
  return PLATFORMS.find(p => p.sites.some(site => {
    const slash = site.indexOf('/');
    const host = slash < 0 ? site : site.slice(0, slash);
    const path = slash < 0 ? '' : site.slice(slash);
    return (u.hostname === host || u.hostname.endsWith('.' + host)) && u.pathname.startsWith(path);
  }));
}
