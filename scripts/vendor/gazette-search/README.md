# Gazette browser search consumer

Byte-retained `@rtepl/gazette/search` 0.1.0 export from [Gazette’s search SDK at the captured commit](https://github.com/getHarshOnline/gazette/tree/e18fe7c1ca4347cb3a653a72f2b02b0f8bb3acac/sdk/js/search) on 2026-11-25. These browser files are licensed under the Apache License, Version 2.0, in LICENSE, with Gazette’s notice in NOTICE. The unchanged Elasticlunr dependency has its complete MIT licence, embedded bundle notice and provenance in vendor/.

Reproduce by copying the named files from that SDK export and verifying these SHA-256 values. Source modifications require a new explicit capture and hashes.

```text
b3678519ec7842899bb3cf11df675e1b061dc946188b0ac255d9a5cf75a462ba  index.mjs
f1904ec9cfcf2e655eb1376760e2a5d77aee682627a470185a3559ebe6849d7a  browse.mjs
aef10b15da22b6d132a0c9802393c456d98a3ee9ae416b6f81bcce938356ea8a  corpus.mjs
b79ec4fddcd1a1871fca117fbcc18485e10d96086fa590cd32d214146dfb7ff8  load.mjs
49d0c8bc857952fe58384afdafbbf4b592847d08bb3329130a5f55ba1bb478b1  index.d.ts
cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30  LICENSE
f39bbd34d7fc6c593337b8e1e32a7746b7e91b4a53f109be78083b2bdfc11324  NOTICE
90372e00d0651d888600aeea7ca57368b852b77292518ff305d4ab83ef5ebf59  vendor/elasticlunr.mjs
222d4486b77438746bc70b93642beb510a8b1897530333b64c6459e825c0f6bc  vendor/README.md
bed1fdbb81861c8ca427d5aef7e3c5ec466c428a3eb93972d05eb94818913ca7  vendor/LICENSE
```
