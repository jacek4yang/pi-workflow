import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  stat,
  symlink,
  link,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createWriteTool,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { edit } from "../src/edit.js";
async function fixture(
  source: string,
  run: (dir: string, path: string) => Promise<void>,
) {
  const dir = await mkdtemp(join(tmpdir(), "workflow-test-"));
  const path = join(dir, "file.txt");
  try {
    await writeFile(path, source, { mode: 0o640 });
    await run(dir, path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const request = (path: string, edits: unknown[]) => ({
  path,
  format: "replace",
  edits,
});
const get = (r: any) => r.structuredContent;
test("exact and legacy shapes share strict atomic semantics", async () =>
  fixture("alpha beta", async (dir, path) => {
    for (const a of [
      request(path, [
        { old: "alpha", replacement: "A" },
        { old: "missing", replacement: "B" },
      ]),
      request(path, [
        { old: "alpha", replacement: "A" },
        { old: "beta", replacement: 42 },
      ]),
      request(path, [
        { old: "alpha", replacement: "A" },
        { old: "alpha beta", replacement: "B" },
      ]),
    ]) {
      await assert.rejects(edit(a, dir));
      assert.equal(await readFile(path, "utf8"), "alpha beta");
    }
    await edit(
      request(path, [
        { old: "alpha", replacement: "A" },
        { old: "beta", replacement: "B" },
      ]),
      dir,
    );
    assert.equal(await readFile(path, "utf8"), "A B");
    await edit({ path, oldText: "A", newText: "alpha" }, dir);
    await edit({ path, edits: [{ oldText: "B", newText: "beta" }] }, dir);
    assert.equal(await readFile(path, "utf8"), "alpha beta");
    const unchanged = get(
      await edit(request(path, [{ old: "alpha", replacement: "alpha" }]), dir),
    );
    assert.equal(unchanged.status, "unchanged");
    await assert.rejects(edit(request(path, []), dir));
  }));
test("ambiguity and no fuzzy whitespace normalization", async () =>
  fixture("a a\n word", async (dir, path) => {
    await assert.rejects(
      edit(request(path, [{ old: "a", replacement: "b" }]), dir),
      /AMBIGUOUS/,
    );
    await assert.rejects(
      edit(request(path, [{ old: "  word", replacement: "b" }]), dir),
      /NOT_FOUND/,
    );
    await edit(request(path, [{ old: "a", replacement: "b", count: 2 }]), dir);
    assert.equal(await readFile(path, "utf8"), "b b\n word");
  }));
test("snapshot/range, Unicode boundaries, stale bases, empty/EOF", async () =>
  fixture("😀abcdef", async (dir, path) => {
    let base = get(
      await edit({ path, format: "snapshot", offset: 0, limit: 8 }, dir),
    ).base;
    await assert.rejects(
      edit(
        {
          path,
          format: "range",
          base,
          edits: [{ start: 1, end: 2, text: "x" }],
        },
        dir,
      ),
    );
    await edit(
      {
        path,
        format: "range",
        base,
        edits: [
          { start: 2, end: 5, text: "X" },
          { start: 8, end: 8, text: "!" },
        ],
      },
      dir,
    );
    assert.equal(await readFile(path, "utf8"), "😀Xdef!");
    await assert.rejects(
      edit(
        {
          path,
          format: "range",
          base,
          edits: [{ start: 0, end: 2, text: "" }],
        },
        dir,
      ),
      /STALE_BASE/,
    );
    base = get(await edit({ path, format: "snapshot" }, dir)).base;
    await edit(
      { path, format: "range", base, edits: [{ start: 0, end: 7, text: "" }] },
      dir,
    );
    assert.equal(await readFile(path, "utf8"), "");
    base = get(await edit({ path, format: "snapshot" }, dir)).base;
    await edit(
      {
        path,
        format: "range",
        base,
        edits: [{ start: 0, end: 0, text: "end" }],
      },
      dir,
    );
    assert.equal(await readFile(path, "utf8"), "end");
  }));
test("BOM/newlines and strict patch tails/path", async () =>
  fixture("\uFEFFa\r\nb\r\n", async (dir, path) => {
    await edit(request(path, [{ old: "b", replacement: "c" }]), dir);
    assert.equal(await readFile(path, "utf8"), "\uFEFFa\r\nc\r\n");
    const patch =
      "*** Begin Patch\n*** Update File: file.txt\n@@\n-c\n+d\n*** End Patch";
    await edit({ path, format: "apply_patch", patch }, dir);
    assert.equal(await readFile(path, "utf8"), "\uFEFFa\r\nd\r\n");
    for (const p of [
      patch.replace("file.txt", "other.txt"),
      patch + "\nBAD",
      patch
        .replace("-c", "-d")
        .replace("*** End Patch", "@@\n-missing\n+x\n*** End Patch"),
    ]) {
      await assert.rejects(
        edit({ path, format: "apply_patch", patch: p }, dir),
      );
      assert.equal(await readFile(path, "utf8"), "\uFEFFa\r\nd\r\n");
    }
    await writeFile(path, "a\nb\r\n");
    await assert.rejects(edit({ path, format: "apply_patch", patch }, dir));
    await writeFile(path, "c\nc\n");
    await assert.rejects(
      edit({ path, format: "apply_patch", patch }, dir),
      /AMBIGUOUS/,
    );
  }));
test("queue coordination with original write, cancellation and file identity", async () =>
  fixture("one", async (dir, path) => {
    const before = await stat(path);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      edit(
        request(path, [{ old: "one", replacement: "two" }]),
        dir,
        controller.signal,
      ),
      /CANCELLED/,
    );
    assert.equal(await readFile(path, "utf8"), "one");
    await Promise.all([
      edit(request(path, [{ old: "one", replacement: "two" }]), dir),
      edit(request(path, [{ old: "two", replacement: "three" }]), dir),
    ]);
    assert.equal(await readFile(path, "utf8"), "three");
    let release!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>((r) => (entered = r));
    const locked = withFileMutationQueue(path, async () => {
      entered();
      await new Promise<void>((r) => (release = r));
    });
    await ready;
    const writing = createWriteTool(dir).execute("w", {
      path,
      content: "native",
    });
    const editing = edit(
      request(path, [{ old: "native", replacement: "edited" }]),
      dir,
    );
    release();
    await Promise.all([locked, writing, editing]);
    assert.equal(await readFile(path, "utf8"), "edited");
    const after = await stat(path);
    assert.equal(after.ino, before.ino);
    if (process.platform !== "win32") assert.equal(after.mode, before.mode);
  }));
test("symlink policy, hardlinks, special targets and UTF8", async () =>
  fixture("one", async (dir, path) => {
    if (process.platform !== "win32") {
      await symlink(path, join(dir, "alias"));
      await edit(
        request(join(dir, "alias"), [{ old: "one", replacement: "two" }]),
        dir,
      );
      assert.equal(await readFile(path, "utf8"), "two");
    }
    await link(path, join(dir, "hard"));
    await assert.rejects(
      edit(request(path, [{ old: "two", replacement: "x" }]), dir),
      /UNSUPPORTED_TARGET/,
    );
    await rm(join(dir, "hard"));
    await mkdir(join(dir, "folder"));
    await assert.rejects(
      edit({ path: join(dir, "folder"), format: "snapshot" }, dir),
      /UNSUPPORTED_TARGET/,
    );
    await writeFile(path, Buffer.from([0xff]));
    await assert.rejects(edit({ path, format: "snapshot" }, dir));
    await writeFile(path, "a\0b");
    await assert.rejects(edit({ path, format: "snapshot" }, dir));
  }));
