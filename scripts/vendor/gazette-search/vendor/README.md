# Retained Elasticlunr provider

This is an explicit browser-ranking dependency, not Gazette's semantic model or
a new search-provider framework. It was retained from the prototype's
`components/search/src/elasticlunr.min.js` at observed Zola commit
`f1a2338090cd19c5321d3dc222d3cb1bbf58107d`. The asset itself was unmodified there.
The original SHA-256 is
`4f648b9e42abdef9c436e68776eca79c23596c798a9ef1400cf538d8a218b8cd`.

The retained header says 0.9.6; the internal `version` property says 0.9.5.
This discrepancy is preserved. Exact bytes, not that property, identify the
provider. The upstream project is <https://github.com/weixsong/elasticlunr.js>;
its license is <https://raw.githubusercontent.com/weixsong/elasticlunr.js/master/LICENSE>.
No claim of active maintenance, newest release or universal language support is made.

`elasticlunr.mjs` makes only these scoped adaptations:

- Retain the original source and its two copyright notices, adding the complete
  MIT permission/warranty notice in a leading `@license` comment and [LICENSE](LICENSE).
- Declare the legacy `lunr` alias lexically. Shadow AMD `define`, CommonJS
  `exports` and `module`, so ambient loaders and global names are not consulted.
- Replace the final `}();` with `}.call({ console: globalThis.console });` so the
  original warning closure receives its explicit context under strict ESM.
- Export the local `module.exports` as the ESM default.

No tokenizer, stemming, stop-word, indexing, ranking or query algorithm is changed.
There is no eval, Function constructor, executable download or global `lunr` or
`elasticlunr` installation. The product wrapper selects either the existing
English pipeline or an explicitly reset lexical pipeline on its own index.

The compiler's `src/authored/english-stopwords.txt` is a mechanically extracted,
nonempty copy of this provider's `defaultStopWords`, with its MIT notice retained.
The native recommendation algorithm uses it only for explicitly English metadata;
it does not execute the browser provider or inherit a browser search profile.
The SDK search test compares the complete native vocabulary with this retained
provider to reject drift. Do not maintain another hand-selected stop-word list.

The full MIT notice must remain in distributed source and the generated browser
bundle, not just this repository's source. Gazette's ordinary selected-resource
compiler and its legal-comment preservation own that output. Provider provenance
is not a publication permission, security certification or content-language claim.
