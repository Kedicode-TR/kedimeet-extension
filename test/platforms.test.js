// Проверка таблицы платформ на маленьких слепках разметки — по одному-два на платформу, собраны по тем же источникам,
// что в комментариях platforms.js. Слепки проверяют наш разбор (имена, «своя», «говорит», «микрофон», пометки
// в скобках, адреса и manifest.json), а не саму платформу: её проверит только живой созвон.
//
// Запуск: python3 -m http.server 8765 -d extension, открыть http://127.0.0.1:8765/test/platforms.html —
// заголовок станет PASS или FAIL. Без окна:
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --virtual-time-budget=30000 \
//     --dump-dom http://127.0.0.1:8765/test/platforms.html | grep -o '<title>[A-Z]*'

const P = (name, self, speaking, muted) => ({ name, self, speaking, muted });
const stage = document.getElementById('stage');
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const li = document.createElement('li');
  li.textContent = a === e ? `ok — ${label}` : `FAIL — ${label}\n  получили ${a}\n  ждали    ${e}`;
  if (a !== e) {
    li.className = 'fail';
    failures.push(label);
  }
  document.getElementById('results').append(li);
}

/** Слепок на страницу — и что из него читает платформа по этому адресу (после той же чистки, что в content.js). */
function read(url, html) {
  stage.innerHTML = html;
  const platform = platformFor(url);
  return platform ? tidy(platform.participants()) : undefined;
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  check('telemost', read('https://telemost.yandex.ru/j/123', `
    <div class="selfView_a1"><div class="rootTeleMessenger_b2">
      <span class="TextName_c3">Maya Chen</span><svg data-testid="micro-off-icon"></svg></div></div>
    <div class="rootTeleMessenger_b2 rootStroke_d4"><span class="TextName_c3">Daniel</span></div>`),
  [P('Maya Chen', true, false, true), P('Daniel', false, true, false)]);

  // Meet: «говорит» — перемена классов в индикаторе; демонстрация экрана (другой media id) — не участник
  const meet = `
    <button data-is-muted="true" aria-label="Включить микрофон (⌘ + D)"></button>
    <button data-is-muted="false" aria-label="Выключить камеру (⌘ + E)"></button>
    <div data-participant-id="spaces/s/devices/1" data-tile-media-id="spaces/s/devices/1">
      <span class="notranslate"><i class="google-symbols">frame_person</i></span>
      <span class="notranslate">Вы</span><div jsname="QgSmzd"><div class="a"></div></div></div>
    <div data-participant-id="spaces/s/devices/2" data-tile-media-id="spaces/s/devices/2">
      <span class="notranslate">Daniel K.</span><div jsname="QgSmzd"><div class="b"></div></div></div>
    <div data-participant-id="spaces/s/devices/2" data-tile-media-id="spaces/s/devices/9">
      <span class="notranslate">Daniel K.</span></div>
    <div data-participant-id="spaces/s/devices/3" data-tile-media-id="spaces/s/devices/3">
      <span class="notranslate">Priya</span><i class="google-symbols">mic_off</i></div>`;
  check('meet: тишина', read('https://meet.google.com/abc-defg-hij', meet),
    [P('Вы', true, false, true), P('Daniel K.', false, false, false), P('Priya', false, false, true)]);
  stage.querySelector('[data-tile-media-id="spaces/s/devices/2"] .b').className = 'b level-3';
  await wait(0);
  check('meet: индикатор шевелится — говорит', tidy(platformFor('https://meet.google.com/x').participants())[1].speaking, true);
  await wait(900);
  check('meet: замер на 800 мс — замолчал', tidy(platformFor('https://meet.google.com/x').participants())[1].speaking, false);

  const zoomRows = `
    <li class="participants-li" aria-label="Maya (Host, me),computer audio muted,video off">
      <span class="participants-item__display-name">Maya</span></li>
    <li class="participants-li" aria-label="Daniel,computer audio unmuted,video on">
      <span class="participants-item__display-name">Daniel</span><span class="participants-icon__voip-speaking-icon"></span></li>`;
  check('zoom: панель видна целиком', read('https://app.zoom.us/wc/123/join',
    `<div style="height:300px;overflow:auto"><ul id="participants-ul">${zoomRows}</ul></div>`),
  [P('Maya', true, false, true), P('Daniel', false, true, false)]);
  check('zoom: панель прокручивается — «говорит» не верим', read('https://app.zoom.us/wc/123/join',
    `<div style="height:20px;overflow:auto"><ul id="participants-ul">${zoomRows}</ul></div>`),
  [P('Maya', true, false, true), P('Daniel', false, false, false)]);
  check('zoom: панель закрыта — плитки', read('https://us05web.zoom.us/wc/123/join', `
    <div class="video-avatar__avatar"><div class="video-avatar__avatar-footer video-avatar__avatar-footer--view-mute-computer">
      <span>Daniel</span></div></div>`),
  [P('Daniel', false, false, true)]);

  check('teams: имена из data-tid, «говорит» не шлём', read('https://teams.microsoft.com/v2/', `
    <div data-tid="video-item-container-Maya Chen">
      <div data-tid="voice-level-stream-outline" class="vdi-frame-occlusion"></div></div>
    <div data-tid="video-item-container-Daniel (Guest)"></div>
    <div data-tid="video-item-container-Daniel"><div data-stream-type="ScreenSharing"></div></div>`),
  [P('Maya Chen', false, false, false), P('Daniel', false, false, false)]);

  check('jitsi', read('https://meet.jit.si/KediRoom', `
    <span class="videocontainer" id="localVideoContainer">
      <span class="displayname" id="localDisplayName">Maya (me)</span><span id="audioMuted"></span></span>
    <span class="videocontainer dominant-speaker" id="participant_ab12cd">
      <span class="displayname" id="participant_ab12cd_name">Daniel</span></span>
    <span class="videocontainer" id="participant_ab12cd_stage"><span class="displayname">Daniel</span></span>`),
  [P('Maya', true, false, true), P('Daniel', false, true, false)]);

  check('whereby', read('https://whereby.com/kedi', `
    <div class="WebRtcVideo jstest-client-video jstest-local-client-video" data-clientid="c1">
      <div class="jstest-mute-icon"></div>
      <div class="jstest-displayname _nameBanner_x1"><span class="_you_asinu_8"><span class="_name_asinu_1">Maya</span>&nbsp;(you)</span></div>
      <div class="_AudioIndicator_d7ejw_1" style="opacity:0"></div></div>
    <div class="WebRtcVideo jstest-client-video" data-clientid="c2">
      <div class="jstest-displayname"><span class="_name_asinu_1">Daniel</span></div>
      <div class="_AudioIndicator_d7ejw_1" style="opacity:0.8"></div></div>
    <div class="jstest-client-video" data-clientid="c3" title="Priya (is recording)"></div>`),
  [P('Maya', true, false, true), P('Daniel', false, true, false), P('Priya', false, false, false)]);

  check('webex', read('https://web.webex.com/meet/maya', `
    <div data-video-pane-member-id="m1" data-test="Maya Chen-video-pane-container">
      <video data-self-view-location="INLINE"></video>
      <div class="participant-name-label-wrapper"><mdc-icon name="microphone-muted-bold"></mdc-icon>
        <span data-test="participant-label-display-name">Maya Chen</span></div></div>
    <div data-video-pane-member-id="m2" data-test="Daniel-video-pane-container">
      <div class="active-speaker-halo" data-test="active-speaker-halo"></div></div>`),
  [P('Maya Chen', true, false, true), P('Daniel', false, true, false)]);

  check('jazz: панель участников', read('https://salutejazz.ru/calls/abc?psw=1', `
    <div style="overflow-y:scroll;height:300px">
      <div data-testid="participantItem-0" aria-label="Maya Chen. Это вы. Микрофон Выключен. Камера Выключена">
        <span>Maya Chen (вы)</span></div>
      <div data-testid="participantItem-1" aria-label="А. Петров. Активный говорящий. Микрофон Включен. Камера Включена">
        <span>А. Петров</span><svg data-testid="speechIcon"></svg></div></div>`),
  [P('Maya Chen', true, false, true), P('А. Петров', false, true, false)]);
  check('jazz: панель закрыта — плитки', read('https://jazz.sber.ru/calls/abc', `
    <button data-testid="microphone" data-muted="false"></button>
    <div data-testid="participantTile-p1" data-local=""><div data-testid="participantUserName">Maya</div></div>
    <div data-testid="thumbnailTile-p2"><div data-testid="participantInfoText" data-with-micro="">Daniel</div></div>`),
  [P('Maya', true, false, false), P('Daniel', false, false, true)]);

  check('vk', read('https://calls.vk.com/call/join/abc', `
    <article class="Participant Participant--withAnimation" participant-id="1">
      <span class="Participant__name">Вы</span><svg class="Participant__statusIcon--mic"></svg></article>
    <article class="Participant Participant--withAnimation Participant--isSpeaking" participant-id="2">
      <span class="Participant__name">Daniel</span></article>`),
  [P('Вы', false, false, true), P('Daniel', false, true, false)]);

  check('ktalk', read('https://acme.ktalk.ru/room1', `
    <conference-participant data-testid="participant"><div class="participant-info" data-testid="participant-info">
      <span class="participant-name">Maya</span><span class="participant-icon mute"></span></div></conference-participant>
    <conference-participant class="dominant"><div class="participant-info">
      <span class="participant-name">Daniel</span><span class="participant-icon"></span></div></conference-participant>`),
  [P('Maya', false, false, true), P('Daniel', false, true, false)]);

  check('mtslink', read('https://my.mts-link.ru/j/1/2', `
    <div data-testid="vcsItem.collapse" class="vcs-item"><span class="VcsItemOverlay__title___a1">Maya</span>
      <i class="VcsItemOverlay__micStateIcon___orudu"></i><div data-testid="VcsItemSoundBorder"></div></div>
    <div data-testid="vcsItem" class="vcs-item"><span class="VcsItemOverlay__title___a1">Daniel (Acme)</span>
      <div data-testid="VcsItemSoundBorder.Active"></div></div>
    <div data-testid="vcsItemControls"></div>`),
  [P('Maya', true, false, true), P('Daniel (Acme)', false, true, false)]);

  // Адреса: созвоны узнаются, соседние разделы тех же сайтов — нет
  const ids = urls => urls.map(url => platformFor(url)?.id ?? null);
  check('адреса созвонов', ids([
    'https://telemost.360.yandex.ru/j/1', 'https://meet.google.com/abc', 'https://app.zoom.us/wc/1/join',
    'https://teams.cloud.microsoft/', 'https://8x8.vc/a/b', 'https://sub.whereby.com/r', 'https://acme.webex.com/meet/x',
    'https://salutejazz.ru/calls/1', 'https://vk.com/call/join/abc', 'https://acme.ktalk.ru/r', 'https://events.webinar.ru/j/1/2',
  ]), ['telemost', 'meet', 'zoom', 'teams', 'jitsi', 'whereby', 'webex', 'jazz', 'vk', 'ktalk', 'mtslink']);
  check('не созвоны', ids(['https://vk.com/feed', 'https://zoom.us/j/123', 'https://example.com/', 'about:blank']),
    [null, null, null, null]);

  // manifest.json: каждый адрес из content_scripts — какая-то платформа, у каждой платформы есть адрес,
  // host_permissions — те же адреса плюс KediMeet
  const manifest = await fetch('../manifest.json').then(r => r.json());
  const matches = manifest.content_scripts[0].matches;
  const sample = pattern => pattern.replace('*.', 'x.').replace(/\*$/, 'room');
  check('manifest: адреса — платформы', matches.filter(m => !platformFor(sample(m))), []);
  check('manifest: у платформ есть адреса',
    PLATFORMS.filter(p => !matches.some(m => platformFor(sample(m)) === p)).map(p => p.id), []);
  check('manifest: host_permissions', manifest.host_permissions, ['http://127.0.0.1:47811/*', ...matches]);

  // content.js: что и когда уходит в KediMeet — на выдуманной платформе, без браузерного расширения
  const sent = [];
  let people = [];
  window.chrome = Object.assign(window.chrome || {}, { runtime: { sendMessage: m => (sent.push(m), Promise.resolve()) } });
  platformFor = () => ({ id: 'fake', blind: true, participants: () => people });
  await new Promise(resolve => document.body.append(Object.assign(document.createElement('script'), { src: '../content.js', onload: resolve })));
  const lastSent = () => ({ ...sent.at(-1), t: typeof sent.at(-1)?.t });

  people = [P('Maya (Вы)', true, true, false), P('', false, false, false)];
  await wait(250);
  check('content: снимок — с чисткой имён', lastSent(), { platform: 'fake', t: 'number', participants: [P('Maya', true, true, false)] });
  await wait(1000);
  check('content: без перемен не повторяет', sent.length, 1);
  await wait(4500);
  check('content: раз в 5 секунд — тот же снимок', sent.length, 2);
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  await wait(250);
  check('content: вкладка в фоне — blind, «говорит» не знаем', lastSent(),
    { platform: 'fake', t: 'number', participants: [P('Maya', true, false, false)], blind: true });
  delete document.hidden;
  people = [];
  await wait(1000);
  check('content: участники мигнули — не уходим', sent.at(-1).left, undefined);
  await wait(2500);
  check('content: пусто 3 секунды — ушёл с созвона', sent.at(-1), { left: true });

  document.title = failures.length ? 'FAIL' : 'PASS';
})();
