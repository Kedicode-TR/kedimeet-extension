// Раз в 200 мс снимаем участников со страницы созвона и шлём в KediMeet только изменения —
// и раз в 5 секунд тот же снимок, чтобы приложение знало состояние на старте записи.
// Скрипт стоит во всех фреймах (all_frames): у Телемоста и Zoom созвон живёт во фрейме. Фрейм без участников молчит.
// Страницы созвонов — одностраничники, участники появляются позже скрипта: поэтому опрос, а не разовый поиск.
{
  const platform = platformFor(location.href);
  let last = '';
  let sentAt = 0;
  let emptySince = 0; // участники пропали — «ушёл с созвона» говорим не сразу: при перерисовке плитки мигают
  let inCall = false;

  const send = message => {
    try {
      chrome.runtime.sendMessage(message).catch(() => {});
    } catch {
      clearInterval(timer); // расширение обновили или выключили — этот экземпляр скрипта больше не нужен
    }
  };

  const tick = () => {
    let participants;
    try {
      participants = tidy(platform.participants());
    } catch {
      return; // разметка поменялась на полуслове — разберёмся на следующем тике
    }
    const now = Date.now();
    if (participants.length === 0) {
      emptySince ||= now;
      if (inCall && now - emptySince > 3000) {
        inCall = false;
        last = '';
        send({ left: true });
      }
      return;
    }
    emptySince = 0;
    inCall = true;
    // Meet в фоновой вкладке подсветку не обновляет — «говорит» тогда не знаем, а приложению говорим об этом прямо
    const blind = !!platform.blind && document.hidden;
    if (blind) participants = participants.map(p => ({ ...p, speaking: false }));
    const key = JSON.stringify(participants) + blind;
    if (key === last && now - sentAt < 5000) return;
    last = key;
    sentAt = now;
    send({ platform: platform.id, t: now, participants, ...(blind && { blind }) });
  };

  const timer = platform ? setInterval(tick, 200) : 0;
}
