// Документ без окна (chrome.offscreen): говорит воркеру, светлый браузер или тёмный, и снова — когда тема меняется.
// Воркер сам этого не знает: matchMedia есть только у документа.
const dark = matchMedia('(prefers-color-scheme: dark)');
const tell = () => chrome.runtime.sendMessage({ dark: dark.matches }).catch(() => {});
dark.addEventListener('change', tell);
tell();
