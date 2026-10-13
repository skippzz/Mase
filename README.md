# Mase — the private training studio

A static, browser-local Excel-to-image application for Urban Active weekly schedules. Its main workflow is one workbook upload followed by automatically prepared, branded Instagram Story images, which can also be shared on WhatsApp. The header switches between **UA story** and **Studio tools**. UA story is the default, with the UA black/lime palette and Gotham typography; secondary navigation is hidden. Studio tools reveals Calendar, Clients, Documents, Templates, and Settings in the light studio interface, with a short fade/slide transition. Reduced-motion preferences disable animation. Switching preserves the current UA upload and preview and returns to the last studio page.

## Primary workflow: UA weekly images

1. Open **UA story** (the default workspace).
2. Upload the normal UA `.xlsx` workbook.
3. MASLAK, GÖKTÜRK, and LIVE are extracted automatically. **Download & share** offers separate Cover, MASLAK, GÖKTÜRK, and LIVE PNG downloads for mobile use. Every image is 1080 × 1920. A ZIP containing all four images remains optional.

The importer discovers the `TRAINER` / `DERS` day blocks from their headers and preserves the workbook's cycle/studio grouping and row order. It reads actual Excel time cells, trainer names, themes, and LIVE durations. LIVE content comes from `UA+ FILM` (also accepts `UA+ LIVE` or `LIVE`), independent of the old image reference. Empty unassigned slots are omitted; incomplete assigned classes and unresolved formulas produce explicit errors. Missing location sheets are reported before downloading available outputs.

The supplied blank UA artwork and cover are bundled after stripping Canva account/person metadata. No real workbook, populated example image, or trainer data is committed. Borders and separators are drawn at native size, with the original black panel translucency, and heights adapt to the class count. The second row sits 40 pixels below the tallest first-row card, so a short LIVE week has no artificial gap before Friday. Excessive content or labels that cannot fit at readable sizes block generation instead of clipping.

**Gotham:** the supplied Book, Bold, Black, and Bold Italic fonts are bundled and cached for offline use. No font setup is needed. The supplied Bold Italic face lacks some Turkish glyphs; names requiring those glyphs use the complete Gotham Bold face with a 12-degree oblique, preserving the spelling. Other names use the original Bold Italic. **Included UA resources** provides the background, cover, and font files on demand. Its **Change brand fonts** control supports local overrides, stored in the browser. The image artwork, headline, and logo always use the supplied original graphics.

Maintainers can run `node scripts/prepare-ua-assets.mjs` after updating approved blank artwork or Gotham files. Source references and real test outputs remain in ignored `example/` / `.local/` directories.

## Daily use

1. Open **Calendar**. Add a session, choose an existing client or create one, and enter its date, time, movement, and location. Overlapping active sessions are blocked. Click a session to edit, cancel, or delete it.
2. To bring in an existing plan, click **Import Excel**, upload an `.xlsx` file, and select the columns for client, date, and time. Optionally map duration (minutes), movement, and location. Review the actual rows before importing. Invalid or conflicting rows are identified by their original spreadsheet row number; no rows are silently skipped.
3. Click **Share schedule** to open Documents. Choose a day or the whole week, and the full studio schedule or one client.
4. Choose **The weekly edit** for the included design, or upload your own PNG/JPEG/PDF background. **Customize** lets you drag text onto the background, edit its position and dimensions precisely, choose its source, style it, and save the layout for reuse. Arrow keys fine-tune placement; Shift + arrow moves in larger increments.
5. Review the generated preview and download a **PNG image** for your WhatsApp group, or a **PDF document** for a client. Attach the downloaded file manually. The application does not send messages or connect to WhatsApp.

Private client and session notes are excluded from calendar exports. Cancelled sessions are excluded. Tentative sessions are labelled. The full studio schedule includes client names; selecting one client creates a personal schedule.

The first launch contains no client data. **Explore a sample week** adds clearly labelled fictional records. **Clear sample data** removes only those sample records and preserves records you created yourself.

## Excel → documents

In Documents, choose **Excel**, upload a workbook, choose its worksheet and header row, and select a saved template. The included **Client session brief · example** is a configurable demonstration, not an assumed production spreadsheet format.

For weekly class grids, choose **Spreadsheet schedule block** as a text field's source. Set the worksheet, first/last rows, and the time, class, trainer, and optional theme/duration columns for one day. Empty class slots are skipped automatically; heading rows can be excluded explicitly. Source order is preserved, and missing times, trainers, or formula results are reported. This works with several days arranged side by side in a worksheet.

An optional **solid text panel background** covers an old schedule area before drawing its replacement. This is available in Customize; it does not alter the original image. Use transparent panels with blank backgrounds, or a chosen solid color with populated images. Real files under `example/` are ignored by Git and never deployed.

**Match column names** links only exact, case-insensitive matches between field names and the selected header row. Review all fields in Customize. Each field may read from a spreadsheet column, an explicit worksheet cell such as `B4`, fixed text, or a calendar detail. Source data and template definitions are separate, so a saved layout can be reused with new workbooks.

For column mappings, **All records as a ZIP** creates one document per nonempty row, preserving row order. Use `{Field name}` and `{row}` in the filename pattern. Names are sanitized and duplicates receive a suffix. Batch progress is displayed; per-row failures and truncation warnings are shown and included in `ERRORS.txt` / `WARNINGS.txt` in the ZIP. Direct-cell-only templates produce a single document; column mappings read the selected row.

### Spreadsheet behavior

- Excel and Google Sheets `.xlsx` exports; up to 20 MB, 20 worksheets, 5,000 rows per sheet, 100 columns, and 200,000 populated cells.
- Blank rows are skipped; original row numbers are retained. Dates, numbers, booleans, hyperlinks, rich text, and cached formula results are read. Dates and times from Excel retain their wall-clock meaning, independent of the device timezone.
- Formulas are **not recalculated**. Missing cached values and Excel error cells are reported. A mapped unresolved formula blocks that record; it is never replaced silently with zero or an empty value. Cached zero and false are preserved despite an ExcelJS getter issue.
- Choose date, time, number, or TRY currency formatting per field. Studio settings select English or Turkish output formatting independently of the source workbook. Turkish characters are supported by locally bundled, licensed embedded fonts.
- Calendar import accepts Excel dates, `YYYY-MM-DD`, or `DD.MM.YYYY`, and Excel time cells or `HH:MM` strings. Movement names are the names offered in the application; omit that mapping to use a chosen default.

## Templates and images

Templates supports create, rename, duplicate, edit, delete, export, and import. Template exports are ZIP archives with human-readable `templates.json` metadata and separate binary assets under `assets/`; large binaries are not embedded in JSON.

Static PDFs are overlaid with text while preserving their original page content. PDF text form widgets become editable overlays carrying their original identifiers; original text appearances are cleared and the form is flattened to avoid duplicate text. Checkboxes and other existing form fields are preserved as part of the background. PDFs with up to 50 pages, mixed page dimensions, crop boxes, and rotations of 0/90/180/270 degrees are supported.

PNG and JPEG backgrounds retain their original pixel dimensions, subject to a 24-megapixel / 12,000-pixel-per-side limit. PDF previews and PDF-to-PNG outputs use a rendered page up to 1080 pixels wide. Single PNG downloads export the selected page; batch PNG ZIPs include every page. The default schedule card is 1080 × 1350 pixels. Image pixels become PDF points at 144 dpi.

Fields use normalized top-left coordinates; font sizes are defined relative to a 595-point-wide page. Export and preview use the same text layout algorithm and font files. PDF page rotations are normalized before applying text, preserving its visual position.

Overflow modes are wrap, shrink to fit, or shorten with a visible warning. Text that still cannot fit is blocked. Unsupported font characters produce an explicit PDF error. DOCX, OCR, formula calculation, and online Google Sheets synchronization are outside this version.

## Privacy, backups, and offline use

There is no backend, login, analytics, cloud database, external font service, or AI API. Client records, appointments, settings, and template files are stored in IndexedDB in this browser. Spreadsheets remain in memory and are released when leaving the Documents workspace or clearing the upload. Uploaded files never become network requests or service-worker cache entries.

**Settings → Export studio backup** saves a ZIP containing calendar/client data and all template profiles/assets. Treat this file as private. **Restore backup** validates the archive and replaces local data only after an explicit confirmation. **Delete all local studio data** requires confirmation and clears IndexedDB; it does not uninstall the application shell.

Browser storage can be cleared or evicted. Export backups regularly. There is no cross-device synchronization; restoring a backup is the supported transfer method.

After the first successful online load, the PWA precaches application assets, fonts, PDF worker, and PDF font/CMap resources. Calendar editing, saved templates, local XLSX import, and document generation work offline. New application versions show an update prompt; finish any current downloads before choosing **Update app**.

- **Mac Safari:** File → Add to Dock, when offered.
- **iPhone/iPad Safari:** Share → Add to Home Screen. Downloads may open in a preview; use Share → Save Image or Save to Files.
- **Chrome/Edge:** Use the address-bar install action or Settings → Install Mase, when offered.

## Development

Requires Node.js 22.12+ (Node 24 also works).

```powershell
npm ci
npm run dev
```

Open the printed local URL with `/Mase/`. For root-path hosting, set `VITE_BASE_PATH=/` before starting or building. The default is the case-sensitive GitHub repository path `/Mase/`.

```powershell
npm run typecheck
npm test
npx playwright install chromium webkit
npm run test:e2e
```

`test:e2e` builds the production application first and serves it with Vite Preview. The test suite uses generated synthetic fixtures under ignored `.local/fixtures/`. Screenshots and downloaded outputs go to ignored `test-results/`.

For isolated Windows browser installations:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location).Path '.local\browsers'
npx playwright install chromium webkit
npm run test:e2e
```

Fonts, icons, and PDF resources are already committed. `npm run assets` regenerates icons and fetches the licensed font sources; it is a maintainer task and is not required for a build. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### Test coverage

Unit tests cover XLSX parsing, multiple sheets, cached formulas (including zero), empty cells, invalid files, required mappings, Turkish formatting, normalized coordinates, all quarter-turn PDF rotations, long Unicode text, overflow warnings, filename collisions, embedded PDF fonts, local persistence, template archives, and calendar export privacy.

Production browser tests cover calendar creation/editing/cancellation/conflicts, reload persistence, Excel-to-calendar import, Excel-to-document ZIP generation, draggable image overlays and saved reuse, PNG/PDF integrity and dimensions, rotated multipage PDFs, backup restore, and responsive layouts in Chromium and WebKit. UA checks cover bundled Gotham, Turkish trainer names, the hidden secondary navigation, switching without losing the preview, and actual PNG pixels verifying Friday wraps below the first row. A pixel comparison checks that PDF title glyphs render as fully as the corresponding PNG. Chromium additionally tests offline relaunch and offline PNG/PDF/UA ZIP generation with no external requests.

WebKit testing on Windows exercises the Safari engine, not an actual macOS/iOS device. Actual Mac Safari installation and iOS share-sheet behavior should be checked on those devices.

## GitHub Pages deployment

The repository target is `skippzz/Mase`. `.github/workflows/deploy.yml` installs locked dependencies, type-checks, runs engine and browser tests, builds the static application, and deploys `dist/` on pushes to `main`.

Set **Repository Settings → Pages → Source → GitHub Actions**. The workflow needs repository Pages enabled and its `github-pages` environment allowed to deploy from `main`. No secret, API key, custom domain, or paid hosting is required.

The workflow derives `VITE_BASE_PATH` from the repository name. Manifest paths, service-worker scope, assets, and hash navigation work under the repository subpath. Deploy URL: `https://skippzz.github.io/Mase/`.

Do not commit private spreadsheets, user backgrounds, client details, generated schedules, backups, credentials, or test artifacts. Application processing and persistence remain entirely on the user's device even though the application source is hosted publicly.
