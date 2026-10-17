# 1.18.9 reference screenshots

Captured by the owner on 2026-10-16 from nUIget 1.18.9 (VS Code, dark theme, a two-project workspace). They are the
visual baseline for plan phase P9 (1.x parity): the 2.0 webviews must present the same information architecture on
the 2.0 primitives. Downscaled to 1600 px JPEG; the originals are with the owner.

| File | Shows |
|---|---|
| `installed-all-projects.jpg` | Installed tab in All Projects: two-line rows (icon, name, version, authors with Verified glyph), per-project sections, header with Restore/Prerelease checkboxes, details pane with Dependencies groups |
| `installed-single-transitive-headers.jpg` | Single project: "Direct packages (10)" header and collapsed "Transitive packages (47) net10.0" sections with TFM badges |
| `transitive-details.jpg` | Transitive package selected: rows with icons/authors, details pane with Version, Authors, Required by, "Transitive" badge |
| `updates-all-projects.jpg` | Updates tab: old → new version with the new one in green, Update All, per-project sections |
| `updates-prerelease-two-line.jpg` | Updates with long prerelease versions wrapping on the second line; sidebar shows the same with the name first |
| `browse-results.jpg` | Browse results: icon, name, version · downloads, Verified author; details with Downloads, Package size, Date published, Report abuse, dependency groups with counts, Multi Install |
| `quick-search-grouped.jpg` | Quick-search dropdown grouped per source with headers |
| `quick-search-versions.jpg` | ArrowRight on a suggestion: version list under the search box with a back arrow |
| `sources-dialog.jpg` | NuGet Sources dialog with toggle switches and "+ Add Source" |
| `add-source.jpg` | Add New Source form with Back, Advanced section, Cancel/Add Source |
| `narrow-sidebar.jpg` | Sidebar at narrow width: names stay first, versions truncated with an ellipsis |
| `installed-filter-count.jpg` | `@installed digx` filter: "Direct packages (2 of 10)" header |
