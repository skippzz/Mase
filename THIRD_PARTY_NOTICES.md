# Third-party licenses

Application dependencies are recorded in `package-lock.json`.

- React / React DOM, Vite, TypeScript, Lucide, ExcelJS, pdf-lib, PDF-Lib Fontkit, JSZip, idb, vite-plugin-pwa: permissively licensed packages. Refer to each installed package's LICENSE for its complete terms. ExcelJS is MIT, pdf-lib and Fontkit are MIT, PDF.js is Apache-2.0, and JSZip is dual MIT/GPLv3 (used under MIT here).
- PDF.js standard font and CMap resources are copied from `pdfjs-dist`; their bundled LICENSE files remain alongside the assets in `public/pdf-fonts/` and `public/cmaps/`.
- Lato Regular is supplied by Google Fonts and distributed under the SIL Open Font License 1.1. The full license is at `public/fonts/OFL.txt`. Source: https://github.com/google/fonts/tree/main/ofl/lato.
- Cormorant Garamond Regular is the static OpenType font from the upstream Cormorant project. Its SIL Open Font License 1.1 is at `public/fonts/Cormorant-OFL.txt`. Source: https://github.com/CatharsisFonts/Cormorant/tree/master/fonts/otf.
- DM Sans and Cormorant Garamond webfonts are bundled locally through Fontsource; the respective OFL license files are included in those npm packages. No font is requested from a third-party server when using the app.

The npm override upgrades ExcelJS's UUID dependency to a compatible patched CommonJS-capable version. The parser and export tests verify compatibility.
