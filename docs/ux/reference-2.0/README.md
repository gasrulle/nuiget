# 2.0 reference captures cited by decisions

Crops of the webviews from the `ui-screenshots` artifact of CI run 39025149785 (VS Code 1.140.0, Chromium 150, ubuntu, DPR 1),
cut at 1:1 from `main-installed-single.png` (x 348–1280, y 65–878) and `sidebar-sections.png` (x 48–348, y 65–878). They are
column 1 of the round-1 direction canvas (`docs/design/DECISIONS.md`, round 1) and the "before" of the V1–V5 findings.

| File | Shows |
|---|---|
| `main-installed-single.webview.png` | The 2.0 main panel, Installed tab, single project, first row selected, README tab (932×813) |
| `sidebar-sections.webview.png` | The 2.0 sidebar with its native title strip, Installed and Updates sections (300×813) |

## Tier A reference set (UX-P0.18)

The 46 webview crops of the push run 40111706433 on `57a9bdd` (`ui-screenshots` artifact, fetched by artifact id;
`[capture] lane ui vscode 1.140.0 chromium 150 linux dpr 1 look modern window 1440x900 png 1440x900`, and the classic pass of the
same job), named `<state>.<theme>.<width>.png` as the capture suite writes them (theme part `<theme>-classic` for the classic
look). The product tree of that SHA is the 2.0 tree before any screen item of the UX plan (only measurement hooks were added). They
are the permanent "before" of the before/after pages (UX-P2.10, UX-P7.4) and the captures negative control (b) was read from
(`docs/design/negative-control.md`); the two files above stay the round-1 references. The PNGs of run 39025149785 (classic, full
window) stay the V1–V5 evidence only. The sha256 below is computed from each file here, not copied from the goldens (0 px after
masks is not byte identity).

| File | sha256 |
|---|---|
| `main-browse-details.dark-modern.1200.png` | 2ac0de4a12cbccdb72d1fc8945ec572d8d81a2669668f7e1f23c806ddfe785d7 |
| `main-browse-results.dark-modern.1200.png` | e2da8d5e9996a4e0434e5e91dd53bb2423779fd002ab45030578ebd2281437b8 |
| `main-details-readme.dark-modern.1200.png` | 3e9207b2d7c49b34ec9f49a8172a12b83253e900008eea76648e14dd83bb9075 |
| `main-installed-all.dark-high-contrast.1200.png` | 8d2bedbcac54772f1e8896218087910c99053dd083a2cb19732724ef778e61ec |
| `main-installed-all.dark-modern-classic.1200.png` | fba760b570856302e274666fba6fd29ece80f30f951e27debdb33bfff0906133 |
| `main-installed-all.dark-modern.1200.png` | 93de23a00baf9289da153dc39948252e0fe3ee8adfe210a7b62e5416c3260cf9 |
| `main-installed-all.light-modern.1200.png` | 8ea8d82a7182996c21778081934b8cc24993d838e540c6f51a5cb24f68c3d5ae |
| `main-installed-bulk-dialog.dark-modern.1200.png` | 699cc35e06217c5e84541f2ab14b2eeb57d6034ae55240f09d262aeae7b45118 |
| `main-installed-cpm.dark-modern.1200.png` | 71ee0cdb06f493cac47e862c101a4a8534763d06de2e0dda1a0b125e31792beb |
| `main-installed-details.dark-high-contrast.1200.png` | 4015837437a67ea3317015c73bd8f0c27169ecd75c3b736275311194dc562514 |
| `main-installed-details.dark-modern-classic.1200.png` | ce8c4f96a1a75b8ec79cafa72b150a23790a77ed3e1736cd2c01b54c55a2bf50 |
| `main-installed-details.dark-modern.1200.png` | 3284f25fcea88f328cc20bf20d404a0b2b8ca1099a0eee653621a0f1a1ce212d |
| `main-installed-details.dark-modern.400.png` | 40a39be149d92095913c42dc448b596e4272e115d121779eef4c50e3ab7a6d02 |
| `main-installed-details.light-modern.1200.png` | 9ea412a782fbc55e2b5233ff9433d4971f3905349657440820a6de11727fb4f9 |
| `main-installed-filter-nomatch.dark-modern.1200.png` | 61a55d7c57e770bf92a48f25687cd0763ab7d7f2dec80c12174cbc9eb0d4d662 |
| `main-installed-filter.dark-modern.1200.png` | de03c2e7951969903ed85b77dfaba2edf8571e039485d666c170078c9fd8b3e5 |
| `main-installed-focus.dark-high-contrast.1200.png` | 3520d8f6fb6e13938691be01603464f3b0ca8fec9122c52f8c661209ace27616 |
| `main-installed-focus.dark-modern-classic.1200.png` | 2a758fd0e69bb6bb53d026437f93fe49cb23f79824cedf6f87ba4513685bde65 |
| `main-installed-focus.dark-modern.1200.png` | d7cef38eb603187056a9dc37a0d91450e761e2c16fb742f7a866568effccb9cf |
| `main-installed-focus.light-modern.1200.png` | cda8251ee80aa265002032ee4543a2ad1711019b5be41f947f99a2db265d3d64 |
| `main-installed-hover.dark-modern.1200.png` | 374ec961e60cd7336e764d01ee294457c26f7082c1f610b447fec8661f4b6de9 |
| `main-installed-single.dark-high-contrast.1200.png` | 5ec67d8ffa75bf06d5007f4426a9f1a49745d76c87611331d682cf420781aef0 |
| `main-installed-single.dark-modern-classic.1200.png` | c288fb6859edc9b37050f06b434c1a71107cc9c42108101f8c4640cdf51b4539 |
| `main-installed-single.dark-modern-classic.932.png` | dc50d178001394e1ed9db844f1fab2a8a2d7bf321df0bf898ba9d52eed11d5c2 |
| `main-installed-single.dark-modern.1200.png` | b374995299c7b8bf58f34f24cca918fe5388ff5e40b21828f77c9a782e6b6621 |
| `main-installed-single.dark-modern.220.png` | f321b2e9f3c6c77a7b7a936660a3a9968a0f41534cee796ad974d0fabe36ac69 |
| `main-installed-single.dark-modern.400.png` | 8e6dd6f2c990059d057822304e2e7cdd48ab0a7923669938799ab963849077d6 |
| `main-installed-single.dark-modern.600.png` | 884daa358bb7b768d65b03edba9303d4276a4ccf307ca01ca2e979944348fe36 |
| `main-installed-single.dark-modern.800.png` | 845c62d5981743b2915bee5c6e78ce726f1048b8002147eb5c3893c4359891f2 |
| `main-installed-single.dark-modern.932.png` | 34aad843cd2458190b9fbf54350d61648f289899c402896c63cde4b4afd408bc |
| `main-installed-single.light-modern.1200.png` | b5352c4c5ce22d51e24f250fae95bc1b2994d94b09ed5678b6225d4f91778abc |
| `main-installed-unfocused.dark-modern.1200.png` | a6a50cdd5bffaa8f3ee08e0ebf4364f19f0f2f134086bc58ee7d95953f44a444 |
| `main-installed-unsupported.dark-modern.1200.png` | 59c1f945be76e57ad3fec1695e718ce64aa776e89dd74fca8babe723437824a4 |
| `main-quicksearch-open.dark-modern.1200.png` | 6fc398273d3959109e5a983651d4285ce834265e5b98ab0c85a2a88639529e8a |
| `main-quicksearch-versions.dark-modern.1200.png` | 88d5fe5df571e41652e82fc9d9a191999b62576591ca4c577e7246669e29b6ca |
| `main-transitive-details.dark-modern.1200.png` | 16b4011ec380105d57ee14c26122e1c3b606a56db76304eced0fe8da517f196d |
| `main-transitive-expanded.dark-modern.1200.png` | 1a17cadfc9e435f7bf734dcb77891e6da5d2e8d4aa2b2f147ff26c68308672c9 |
| `main-updates.dark-modern.1200.png` | 2be18e999ae6519b71520c84c9823a15b101f49aedae488650c3c9f8ee172d0a |
| `sidebar-narrow-200px.dark-modern.200.png` | 8d745f57ce6c5fb0ada3c06b598fcc4e3ce54cea19aedab28d29d4a1fe46d932 |
| `sidebar-sections.dark-high-contrast.300.png` | 79849880635cc34d24f1824e91798e506457181571444f2c86b378df90a0eb59 |
| `sidebar-sections.dark-modern-classic.300.png` | 67baff2bcee08a4400055c76740381989b5d12833d27081ade4f9cfdef3e7a5e |
| `sidebar-sections.dark-modern.170.png` | 9ecde8d922bac9cefc3cffde1987a9d5da9f382ae0c6bdea676151302768e646 |
| `sidebar-sections.dark-modern.250.png` | 2512c77db482bb7af10f68d23024368bd660b404972d83625f7a58b1b85e1d41 |
| `sidebar-sections.dark-modern.300.png` | aada5a99e4de155f8c1ec1e1939df32430f1eddc9521d3cc1950da292e081712 |
| `sidebar-sections.light-modern.300.png` | c1ab7f35c21b335b4860dde4fe310e950c7a9507e8acba487c19f26480602ceb |
| `sidebar-update-all-dialog.dark-modern.300.png` | d7a9decb04c45afbfe7181bc171c73860014efa4e3c1796fa3153681e708297c |
