# Diogo &amp; Co — consultancy website

A self-contained, single-page marketing site for **Silvia Diogo** / **Diogo &amp; Co**,
a boutique technology-strategy and AI/digital-transformation advisory.

Content is drawn from Silvia's professional background: former Equity Partner at
Deloitte and KPMG, 21+ years across Financial Services, Insurance and Private Equity.

## Structure

Everything lives in a single file:

```
website/index.html   # HTML + inline CSS + a little vanilla JS — no build, no dependencies
```

Sections: hero → about → services → expertise → metrics → track record → recognition → contact → footer.

## Run it

Open `website/index.html` directly in a browser, or serve the folder:

```bash
npx serve website
# or
python3 -m http.server --directory website
```

## Notes

- **Fonts** load from Google Fonts (Fraunces + Inter); the design degrades gracefully to system fonts offline.
- **Contact form** is front-end only — it opens the visitor's mail client via `mailto:`.
  Swap the handler in the `<script>` block for a real endpoint (Formspree, a serverless
  function, etc.) when a backend is available.
- **Placeholder contact details** (`hello@diogoandco.com`, LinkedIn) — update to the real
  address/handle before going live.
- Fully responsive; light-only palette (deep-navy hero, warm paper body, gold accent).
