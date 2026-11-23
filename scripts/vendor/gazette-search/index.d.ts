// SPDX-License-Identifier: Apache-2.0
/** Hard ceiling for both response bytes and complete retained JSON; callers may select lower budgets. */
export const MAX_SEARCH_BYTES: number;
/** Bounded JSON values preserved from the emitted discovery-safe corpus. */
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json | undefined };
/** Native plain ranking fields; selected fields never replace result identity or navigation. */
export type SearchField = 'title' | 'description' | 'keywords' | 'route' | 'body' | 'notes' | 'summary' | 'projects';
export interface SearchRecord {
  readonly content: {
    /** Authored content key or exact canonical provider-documentation address. */
    readonly id: string;
    /** Display label; provider records retain their optional native title separately. */
    readonly title: string;
    readonly keywords?: readonly string[];
    /** Resolved documentation category; includes collections, journeys and contained examples. */
    readonly documentation?: boolean;
    readonly [key: string]: Json | undefined;
  };
  readonly route: {
    /** Serving destination and search identity; never inferred from canonical metadata. */
    readonly url: string;
    /** Canonical original, which may belong to another publication site. */
    readonly canonical_url: string;
    readonly [key: string]: Json;
  };
  readonly body: string;
  readonly summary?: string;
  readonly projects: readonly { readonly project: { readonly id: string; readonly name?: string; readonly [key: string]: Json | undefined }; readonly [key: string]: Json | undefined }[];
  /** Explicit emitted ranking selection; omitted only for the direct complete-corpus SDK operation. */
  readonly indexed?: Readonly<Partial<Record<Exclude<SearchField, 'keywords' | 'projects'>, string>> & Partial<Record<'keywords' | 'projects', readonly string[]>>>;
  readonly [key: string]: Json | undefined;
}
export interface IndexOptions {
  /** Explicit token processing, not an inferred declaration of document language. */
  readonly profile: 'lexical' | 'english';
  readonly maxDocuments: number;
  /** Complete captured JSON bytes, including result metadata and framing; at most MAX_SEARCH_BYTES. */
  readonly maxBytes: number;
  readonly maxQueryBytes: number;
  readonly maxResults: number;
}
export interface LoadOptions extends IndexOptions {
  readonly allowNetwork: true;
  /** Complete HTTP response bytes, independently bounded by MAX_SEARCH_BYTES. */
  readonly maxResponseBytes: number;
  readonly timeoutMs: number;
}
export interface QueryOptions {
  readonly limit: number;
  readonly fields?: Readonly<Partial<Record<SearchField, number>>>;
  /** Prefix matching; English includes literal token prefixes alongside stems. */
  readonly expand?: boolean;
  /** AND requires every processed query term across the selected fields. */
  readonly bool?: 'AND' | 'OR';
}
/** Exact native identities; values within one dimension are OR, dimensions are AND. */
export interface SearchFilters {
  readonly site?: readonly string[];
  readonly kind?: readonly string[];
  readonly author?: readonly string[];
  readonly project?: readonly string[];
  /** Exact authored phrases, without tokenization, case folding or taxonomy inference. */
  readonly keyword?: readonly string[];
  readonly classification?: readonly { readonly taxonomy: string; readonly term: string }[];
}
export interface BrowseOptions extends QueryOptions {
  readonly offset?: number;
  /** Publication-day order; timestamps use UTC days, unknown times follow known times within a day. */
  readonly sort?: 'relevance' | 'latest' | 'oldest';
  readonly filters?: SearchFilters;
}
export interface SearchFacet {
  readonly value: string;
  readonly count: number;
  /** Supplied native display name; omitted when absent or conflicting. */
  readonly label?: string;
}
export interface ClassificationFacet {
  readonly taxonomy: string;
  readonly term: string;
  readonly count: number;
  readonly taxonomy_label?: string;
  readonly term_label?: string;
}
export interface BrowseResults<R extends SearchRecord = SearchRecord> {
  /** Complete matching population after filters, before pagination. */
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly hits: readonly SearchHit<R>[];
  /** Counts over that same complete population; absent metadata contributes no value. */
  readonly facets: {
    readonly site: readonly SearchFacet[];
    readonly kind: readonly SearchFacet[];
    readonly author: readonly SearchFacet[];
    readonly project: readonly SearchFacet[];
    readonly keyword: readonly SearchFacet[];
    readonly classification: readonly ClassificationFacet[];
  };
}
/** The runtime captures and deeply freezes JSON; input mutability does not escape. */
export type Captured<T> = T extends readonly unknown[]
  ? { readonly [K in keyof T]: Captured<T[K]> }
  : T extends object ? { readonly [K in keyof T]: Captured<T[K]> } : T;
export interface SearchHit<R extends SearchRecord = SearchRecord> {
  /** Owned immutable JSON snapshot; no rendered HTML or reconstructed metadata. */
  readonly record: Captured<R>;
  /** Best matching provider relevance score; a full indexed-title match precedes other hits. */
  readonly score: number;
}
export interface SearchIndex<R extends SearchRecord = SearchRecord> {
  readonly size: number;
  readonly profile: IndexOptions['profile'];
  search(query: string, options: QueryOptions): readonly SearchHit<R>[];
  /** Complete eligible-corpus filtering/counting/sorting precedes the bounded slice. */
  browse(query: string, options: BrowseOptions): BrowseResults<R>;
}
export class SearchError extends Error {
  readonly code: string;
  constructor(code: string);
}
export function createIndex<R extends SearchRecord>(records: readonly R[], options: IndexOptions): SearchIndex<R>;
export function loadIndex(exactUrl: string, options: LoadOptions): Promise<SearchIndex>;
