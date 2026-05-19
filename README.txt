Static GitHub Pages rehearsal demo.

This build includes Ty's explicit-consent ElevenLabs voice clone (`Ty Frost 25Minute`) injected into the Rodney track and labelled in the UI as the Parkes voice assignment for the prototype.

The page makes no runtime network calls apart from loading its own static assets from GitHub Pages. Audio files are baked into the repo for phone-safe playback.

Boundary: the cloned-voice audio is for Ty's rehearsal/prototype review only and must not be reused for external impersonation.

Playback state as of 2026-05-19:
- Current live app: https://ocklefrost.github.io/rehearsal-demo/app.html?page=9&v=20260520-0910
- Latest commit: current local fix / Fix stitched playback scenario sync.
- Normal Play on iPhone now prefers page-level continuous MP3 renders as audio sprites when the selected setup matches a baked mode.
- Supported sprite modes: full cast, Rodney muted + director on, Rodney muted + director off, with standard 1x gaps.
- Unsupported custom setups, including local replacement takes or non-standard muted/gap combinations, fall back to reliable per-line HTML audio.
- Do not restore chained per-line Web Audio as the primary iPhone path without real-device testing. It is fast on desktop but unreliable on iOS because of WebKit user-gesture, suspended/interrupted AudioContext, and private/cache-state behaviour.
