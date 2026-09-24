# Publishing Natural TTS

How version 1.5.0 goes from `main` to the Chrome Web Store, what is automated, what is yours, and what to do after
launch.

| File | What it is |
| --- | --- |
| [RELEASE.md](RELEASE.md) | The release program, `scripts/release/release.sh`: preflight, tag, GitHub Release, Homebrew tap, security contact, then the GUI handoff |
| [CHROME_WEB_STORE.md](CHROME_WEB_STORE.md) | Every dashboard field, ready to paste, in dashboard order, plus the policy-risk review and the timings behind the numbers |
| [YOUTUBE.md](YOUTUBE.md) | The demo video's title, description, chapters, tags and settings |
| [PRIVACY_TRACEABILITY.md](PRIVACY_TRACEABILITY.md) | Every sentence of [`chrome-extension/PRIVACY.md`](../../chrome-extension/PRIVACY.md) mapped to the code that makes it true |

The package is built by `cd chrome-extension && bun run package`, which writes the deterministic
`chrome-extension/release/natural-tts-<version>.zip` (gitignored) and checks it.

## Order of operations

| # | Step | Who | How |
| --- | --- | --- | --- |
| 1 | Land the W3 lanes on `main`: the store images in `assets/store/`, the README, this kit | agents | Normal merges. `release.sh` refuses to run anywhere but `origin/main` |
| 2 | Preview the release | **you** run one command; it drives the checks | `scripts/release/release.sh`: verify-all, versions, the package, and every gated command printed. Changes nothing (exit 2) |
| 3 | Release | **you** confirm; it drives | Rerun with the confirms it printed: tag `v1.5.0`, GitHub Release with the zip, the README's hero as a playable video (`embed-hero-video.sh`), the Homebrew tap, private vulnerability reporting. After this `brew install renchris/tap/natural-tts` works |
| 4 | Smoke-test the tap | **you**, or an agent on a machine without a running helper | `brew install renchris/tap/natural-tts && brew test natural-tts` (`brew test` uses a free port, so it does not collide with a running helper) |
| 5 | Upload the demo video | **you** (YouTube sign-in) | [YOUTUBE.md](YOUTUBE.md). Then `release.sh --youtube-url <URL>` prints the reviewer's test instructions with the link in them |
| 6 | Create the store listing and submit | **you** (Google sign-in, US$5 fee, 2-Step Verification) | [CHROME_WEB_STORE.md](CHROME_WEB_STORE.md), top to bottom. Submit with **deferred publishing** |
| 7 | Wait for review | Google | See the timeline below. Don't cancel and resubmit: that loses the queue position |
| 8 | Publish, then the post-launch checklist | **you** press Publish; agents do the repository changes | Below |

## What is automated, and what is yours

**Automated** (`release.sh` and the packager): every check before a release (clean `main` equal to `origin/main`,
one version in five places plus the formula URL, `scripts/verify-all.sh` green), the store zip (built, checked for
stray files, re-read and hashed), the tag, the GitHub Release and its notes, the Homebrew formula (downloaded
tarball, real sha256, `brew audit --strict --online`, push), turning on the security contact, and checking the store
images' sizes. Each step that publishes something waits for its own `--confirm`, and prints its exact command first.

**Yours**, because they need your identity or a browser:

- the Google developer account: a dedicated address, 2-Step Verification, the one-time US$5 fee, a verified contact
  email, and the Non-trader declaration;
- uploading the video to YouTube;
- the dashboard itself: upload, paste the fields, submit, and later press Publish;
- the confirms that let `release.sh` publish.

## Timeline

Plan on **about 4-5 weeks from submission to being findable in search** (R07 §8 and its verification):

- **Review: at least 3-4 weeks.** Google's guidance is "a few days, up to a few weeks", but its April 2026 notice
  reports a submission surge, developers reported 28-day waits, and new publishers with new items get closer
  review. Contact support only after three weeks.
- **Publish: within 30 days of approval.** With deferred publishing the approved version waits for you; after 30 days
  it returns to draft.
- **Search: up to 7 days after publishing** before the item shows in store search. Until then, share the direct
  listing URL (`https://chromewebstore.google.com/detail/<item-id>`).
- A rejection can be appealed from the dashboard. Every later update is reviewed again, usually faster.

## After launch

- [ ] **Record the item ID and the publisher ID** (Dashboard → the item → Package; Account). Everything below needs the
      item ID, which exists as soon as the first zip is uploaded.
- [ ] **Badge the README with the store link** (R08: at most 4 live badges). For example
      `[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/<item-id>)](https://chromewebstore.google.com/detail/<item-id>)`
      and, once there are users, the `users` badge. Make the store the first way to install the extension, with
      loading it unpacked as the developer path.
- [ ] **Pin the helper to the published extension (W2-6).** Today the helper answers any browser extension (see
      PRIVACY.md, "It refuses websites"). Restrict `/speak` and `/voices` to `chrome-extension://<item-id>`, keep
      development builds working with the manifest `key` (never in the store zip: the packager refuses a `key`),
      ship it as a helper release, and in the same change update PRIVACY.md and row H3 of
      PRIVACY_TRACEABILITY.md. R07's verification notes the ID exists before approval, so this may land before
      publishing if you prefer.
- [ ] **Update the YouTube description** with the store URL, and make the video Public if it was uploaded unlisted.
- [ ] **Update the GitHub About box**: description, topics and homepage (`gh repo edit`; a public change, R08 item 10).
- [ ] **Check the listing signed out**: the title, the images at the store's 640×400 size, the video, the privacy
      block ("Website content"), and that the privacy policy link opens.
- [ ] **Watch the first week's reviews and uninstalls.** An uninstall within minutes usually means a missing helper;
      the answer is the Requirements block and the popup's install notice, both already in place.
- [ ] **Later, optional:** a Featured nomination through One Stop Support (R07 §10); an official URL once a site is
      verified in Search Console (the picker is reported flaky); CI publishing through the **Chrome Web Store API
      v2** for updates (v1 stops working on 15 October 2026).

## Next release

Bump the version in `chrome-extension/package.json`, `chrome-extension/public/manifest.json`,
`native-helper/Sources/NaturalTTSHelper/Models.swift`, `native-helper/python/pyproject.toml` and the formula's `url`,
add a dated CHANGELOG section, land it, and run `scripts/release/release.sh`. Its preflight names any place you
missed. Then upload the new zip from the dashboard's Package tab; every update is reviewed.
