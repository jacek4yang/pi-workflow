# Architecture

`prepareArguments` converts legacy input → strict schema → one immutable file snapshot under public `withFileMutationQueue` → canonical `pi-codebuffer/editing` compiler → validated final content → small positional filesystem write. The kernel remains pure. No private Pi imports and no `createEditTool` fuzzy matching backend.

Pi extension tools override built-ins by name. Real-SDK tests assert exactly one enhanced `edit`, permission events named edit, nested CodeMode resolution and native write behavior. The loader uses the host public SDK; queue coordination is verified with native operations. Conflicting third-party overrides of edit are unsupported and must be removed, not silently combined.

Snapshots bind the requested path to a complete UTF-8 content hash. UTF-16 offsets never rebase; supplementary characters cannot be split. Two paths with identical content have the same content hash, not an authorization token. Path/permission checks run on each request. Results keep full identities in structured metadata; display digests are not authority.

Output details are bounded (16 splices, 256 units per side). Model text is compact. Scope is single-file editing; multi-file atomicity, arbitrary rollback and process recovery are non-goals.
