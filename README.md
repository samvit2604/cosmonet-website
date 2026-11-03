# Cosmonet website

Public frontend of [cosmonet.smkxtpwdnn.chatgpt.site](https://cosmonet.smkxtpwdnn.chatgpt.site/), captured on 3 November 2026. Includes all 40 discovered pages, the original CSS and browser JavaScript, and 55 local image, logo, icon and font assets. The website files retain their captured content and appearance.

## Run locally

Requires Python 3. No third-party packages are needed.

Open Terminal in the project folder containing `index.html`, then run:

```sh
python3 -m http.server 8000
```

Keep this Terminal window open while using the website. Pressing Ctrl+C or closing the server stops it.

Open http://localhost:8000/ in your browser, then use the website navigation. All pages share this server, including `/case-studies/` and `/services/security-engineering/`. Serve the project over HTTP because links and asset paths start at the website root.

If the browser shows `ERR_CONNECTION_REFUSED`, restart the server with the command above. If you run the server on a different port, use that same port in the browser URL.

## Build and deploy

```sh
python3 build.py
python3 -m http.server 8000 --directory dist
```

Upload the contents of `dist/` to a static host at the domain root. Preserve directory/index.html routing. There is no framework compilation step. Binary assets are included in their original formats.

## Included pages

- Home; about; team; how we work; technology; contact; privacy.
- Services overview and 10 service detail pages.
- Three business-stage solution pages.
- Industries overview and six industry pages.
- Products, GCC and dedicated pods, and recruitment.
- Case studies overview and three solution blueprint pages.
- Insights overview and four articles.

The original browser code handles navigation menus, responsive navigation, service tabs, filters/search, section navigation, motion controls and contact-form submission.

## Contact form and unavailable server source

The form sends a JSON POST to `/api/leads`. The public frontend expects `{"ok": true, "reference": "..."}` on success or `{"error": "..."}` on failure. This repository does not include the original private server implementation, production infrastructure, credentials, database or enquiry records. A static server cannot save submissions; provide your own `/api/leads` handler before using the form in production. Do not send submissions to the source website's endpoint.

## Integrity and ownership

`SHA256SUMS` records the original public frontend files included here. Run `sha256sum -c SHA256SUMS` from this directory to verify them. Documentation and the build helper are additions for this export. This is a public frontend export, not a claim to the original private development repository. Branding, text and assets remain subject to their owners' rights; no new license is granted.
