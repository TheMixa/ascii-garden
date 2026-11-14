# Chrome Web Store listing kit

Everything needed to submit **ASCII Garden** to the Chrome Web Store.

## Steps

1. Open the [Developer Dashboard](https://chrome.google.com/webstore/devconsole), sign in with the Google account that should own the extension, accept the terms and pay the one-time registration fee.
2. Click **Add new item** and upload **`ascii-garden-store.zip`** (manifest at the root of the zip).
3. Fill in the tabs using the text below, upload the images from this folder, then click **Submit for review**.

---

## Store listing tab

**Name** (comes from the manifest)
```
ASCII Garden
```

**Summary** (max 132 characters)
```
A calm new tab page where little animals made of keyboard characters drift around. Click anywhere and they scatter.
```

**Description**
```
Turn every new tab into a little garden.

ASCII Garden replaces your new tab page with a dark grid where butterflies, jellyfish, dragonflies, koi, frogs, cranes and crabs drift around. Every one of them is built from keyboard characters. Click anywhere and they scatter.

WHAT YOU GET
• 7 animals plus a Mix mode, each with its own way of moving
• Click anywhere to scatter them. They also stay shy of your cursor
• Fading trails of characters behind everything that moves
• Your bookmarks bar, with folders, right on the page
• A greeting and clock that follow the time of day
• A search box that uses your browser's own search engine, or goes straight to a site when you type a web address
• Settings for your name, how many animals, trails and the bookmarks bar
• Keys 1 to 8 switch animals

PRIVATE BY DESIGN
No accounts, no tracking, no ads and no network requests. Everything runs locally in your browser, and your settings stay on your device.

OPEN SOURCE
The full source code is on GitHub: https://github.com/TheMixa/ascii-garden
```

**Category:** Make Chrome Yours, then Functionality & UI
**Language:** English

**Graphic assets**

| Field | File |
| --- | --- |
| Store icon (128×128) | `icon-128.png` |
| Screenshots (1280×800) | `screenshot-1-butterflies.png` to `screenshot-5-settings.png`, in that order |
| Small promo tile (440×280) | `promo-small-440x280.png` |
| Marquee promo tile (1400×560, optional) | `promo-marquee-1400x560.png` |

**Official URL:** none
**Homepage URL:** `https://github.com/TheMixa/ascii-garden`
**Support URL:** `https://github.com/TheMixa/ascii-garden/issues`

---

## Privacy practices tab

**Single purpose description**
```
Replaces the new tab page with an animated page of animals drawn from keyboard characters, together with the user's bookmarks, a clock and a search box that uses the browser's default search engine.
```

**Permission justifications**

`bookmarks`
```
Used only to read the user's Bookmarks Bar and Other Bookmarks folders and show them on the new tab page, because the browser hides its own bookmarks bar on custom new tab pages. Bookmarks are never modified, copied elsewhere or sent anywhere.
```

`favicon`
```
Used to show each bookmark's site icon next to its name in the on-page bookmarks bar, using the browser's built-in favicon cache. No network requests are made.
```

`search`
```
Used so that text typed into the new tab search box is searched with the user's own default search engine via chrome.search.query, as required for new tab page extensions.
```

**Are you using remote code?** No, I am not using remote code.

**Data usage:** leave every data type unchecked (nothing is collected or transmitted), then tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**
```
https://github.com/TheMixa/ascii-garden/blob/main/PRIVACY.md
```

---

## Distribution tab

**Visibility:** Public
**Regions:** All regions
