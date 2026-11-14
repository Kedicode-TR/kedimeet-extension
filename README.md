# KediMeet browser extension

Companion to [KediMeet](https://kedimeet.kedicode.cloud), a Mac app that records your calls and writes the
transcript and summary. The extension tells the app who is in a browser call and, where the page shows it reliably,
who is speaking. KediMeet uses that to put names in the transcript.

The code is open so you can check what it reads and where the data goes.

## What it reads

On a supported call page it looks at the participant tiles five times a second and sends only what changed. For each tile:

- the display name
- whether the tile is marked as speaking
- whether the microphone is shown as muted
- whether the tile is your own

It also takes the address of the call tab, so the app can link the meeting and recognise a recurring one.

It reads no audio, no video, no chat and no other page content.

## Where the data goes

Only to `http://127.0.0.1:47811`, which is the KediMeet app on the same Mac. There are three requests:

| Request | What it carries |
|---|---|
| `POST /snapshot` | platform id, time, participants (name, speaking, muted, self), tab address, a mark when the tab is in the background |
| `POST /hello` | the extension version, once a minute, so the app knows the extension is installed |
| `GET /status` | nothing; the answer says whether the app is recording |

If the app is not running, snapshots are dropped. The last snapshot of each tab is kept in `chrome.storage.session`
for the popup; the browser clears it when it closes.

There is no analytics, no remote code and no other server. To check it yourself:

```bash
grep -n "fetch(" *.js
```

Every call goes to the `APP` constant at the top of `background.js` and `popup.js`.

## Permissions

| Permission | Why |
|---|---|
| Call sites listed in `manifest.json` | read the participant tiles on the call page |
| `http://127.0.0.1:47811/*` | talk to the KediMeet app on this Mac |
| `storage` | keep the last snapshot of a tab for the popup, in session storage |
| `alarms` | the once-a-minute hello to the app |
| `offscreen` | a windowless page that reports light or dark browser theme, to pick the toolbar icon |
| `activeTab` | the popup shows which call platform the current tab is |

## Supported platforms

| Where the call runs | Names | Who is speaking |
|---|---|---|
| Google Meet | Yes | Yes, while the tab stays visible |
| Microsoft Teams | Yes | No, the app tells voices apart from the audio |
| Zoom, web client | Yes | Yes, with the participants list open |
| Webex | Yes | Yes |
| Whereby | Yes | Yes |
| Jitsi Meet | Yes | Yes |
| Yandex Telemost | Yes | Yes |
| SaluteJazz | Yes | Yes, with the participants list open |
| VK Calls | Yes | Yes |
| Kontur.Talk | Yes | Yes |
| MTS Link | Yes | Yes |

Desktop call apps have no page to read, so the extension does nothing there and KediMeet tells speakers apart by voice.

How much to trust this table: everything platform-specific lives in `platforms.js`, and each entry says in a comment
where its selectors came from and how they were checked. Yandex Telemost was verified in live calls. The other
entries were written from the platforms' own page code and from other open-source projects, and have not all been
verified in a live call yet. Call pages change without notice. The extension sends "speaking" only when the sign is
reliable; when a sign breaks, it stops lighting up and the app falls back to telling voices apart from the audio.

Reports and fixes for a platform are welcome.

## Recording and consent

KediMeet records on your Mac and no bot joins the call, so the other people get no sign on their screens that a
recording is running. Tell them. While the app is recording, the popup offers a button that copies a ready-made note
for the call chat.

## Install

The extension ships inside the KediMeet app: Settings → Extension shows its folder and how to add it to the browser.

From this repository:

1. Open `chrome://extensions` (in Arc, `arc://extensions`).
2. Turn on Developer mode.
3. Click "Load unpacked" and choose this folder.

It works in Chrome, Arc and other Chromium browsers. Without the KediMeet app it has nothing to talk to.

## Develop

There is no build step and there are no dependencies.

Check the platform table against small snapshots of each platform's markup:

```bash
python3 -m http.server 8765
```

Then open `http://127.0.0.1:8765/test/platforms.html`. The page title becomes `PASS` or `FAIL`.

To add a platform: add an entry to `platforms.js`, add its addresses to `content_scripts.matches` and
`host_permissions` in `manifest.json`, and add a snapshot of its markup to `test/platforms.test.js`.

Comments in the source are in Russian for now.

## License

The code is under the [MIT License](LICENSE).

The interface icons in `popup.js` come from the free [Hugeicons](https://hugeicons.com) set, also MIT.

The KediMeet name, the cat mascot and the `icon-*.png` files are not covered by the MIT License. They belong to
KediCode and may be used unchanged as part of this extension. Details are in [NOTICE](NOTICE).
