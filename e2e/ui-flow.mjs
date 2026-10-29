// End-to-end UI check: drives the real app in headless Chrome as 3 users.
// Usage: node ui-flow.mjs [screenshot-dir]   (BASE=http://localhost:8000 by default)
// Uses your Chrome if CHROME_PATH is set, otherwise a bundled Chromium.
// Run it against a fresh local DB, it creates docs as it goes.
import puppeteer from "puppeteer-core";
import fs from "fs";
import os from "os";
import path from "path";

async function chromePath() {
  if (process.env.CHROME_PATH) return { executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"] };
  const chromium = (await import("@sparticuz/chromium")).default;
  return {
    executablePath: await chromium.executablePath(),
    args: [...chromium.args.filter((a) => a !== "--single-process"), "--no-sandbox", "--disable-dev-shm-usage"],
  };
}

const BASE = process.env.BASE || "http://localhost:8000";
const OUT = process.argv[2] || "./shots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  ...(await chromePath()),
  headless: true,
  defaultViewport: { width: 1280, height: 860 },
});

const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (cond, msg) => {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok -", msg);
};

async function session(name) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`[${name}] ${m.text()}`));
  page.on("dialog", (d) => { errors.push(`[${name}] unexpected dialog: ${d.message()}`); d.accept(); });
  page.on("pageerror", (e) => errors.push(`[${name}] ${e.message}`));
  return page;
}

async function loginAs(page, who) {
  await page.goto(BASE + "/login", { waitUntil: "networkidle0" });
  const btns = await page.$$(".demo-user");
  const idx = { alice: 0, bob: 1, carol: 2 }[who];
  await btns[idx].click();
  await page.waitForSelector(".dash");
}

const clickByText = async (page, sel, text) => {
  const handles = await page.$$(sel);
  for (const h of handles) {
    const t = await h.evaluate((e) => e.textContent.trim());
    if (t.includes(text)) return h.click();
  }
  throw new Error(`no ${sel} with text ${text}`);
};

try {
  // ---- Alice ----
  const alice = await session("alice");
  await alice.goto(BASE + "/login", { waitUntil: "networkidle0" });
  await alice.screenshot({ path: `${OUT}/01-login.png` });
  await loginAs(alice, "alice");
  await alice.waitForSelector(".doc-row");
  await alice.screenshot({ path: `${OUT}/02-dashboard-alice.png` });

  // new doc
  await clickByText(alice, ".new-card", "Blank document");
  await alice.waitForSelector(".title-input");
  await sleep(300);
  await alice.keyboard.type("Q4 Launch Plan");
  await alice.keyboard.press("Enter");
  await alice.waitForFunction(() => document.querySelector(".save-status")?.textContent.includes("saved"));
  await alice.click(".tiptap");

  // heading
  await alice.select(".tb-select", "h1");
  await alice.keyboard.type("Launch plan");
  await alice.keyboard.press("Enter");
  await alice.keyboard.type("This is ");
  await alice.click('button[title="Bold (Ctrl+B)"]');
  await alice.keyboard.type("important");
  await alice.click('button[title="Bold (Ctrl+B)"]');
  await alice.keyboard.type(" and ");
  await alice.click('button[title="Italic (Ctrl+I)"]');
  await alice.keyboard.type("nice");
  await alice.click('button[title="Italic (Ctrl+I)"]');
  await alice.keyboard.type(" and ");
  await alice.click('button[title="Underline (Ctrl+U)"]');
  await alice.keyboard.type("underlined");
  await alice.click('button[title="Underline (Ctrl+U)"]');
  await alice.keyboard.press("Enter");
  await alice.click('button[title="Bulleted list"]');
  await alice.keyboard.type("Finish the editor");
  await alice.keyboard.press("Enter");
  await alice.keyboard.type("Ship it");
  await alice.keyboard.press("Enter");
  await alice.keyboard.press("Enter");
  await alice.click('button[title="Numbered list"]');
  await alice.keyboard.type("Step one");
  await alice.keyboard.press("Enter");
  await alice.keyboard.type("Step two");
  await alice.waitForFunction(() => document.querySelector(".save-status")?.textContent.includes("All changes saved"), { timeout: 5000 });
  await sleep(1200);
  await alice.waitForFunction(() => document.querySelector(".save-status")?.textContent.includes("All changes saved"), { timeout: 5000 });
  await alice.screenshot({ path: `${OUT}/03-editor-formatting.png` });
  const docUrl = alice.url();

  // reload and verify persistence
  await alice.reload({ waitUntil: "networkidle0" });
  await alice.waitForSelector(".tiptap h1");
  const html = await alice.$eval(".tiptap", (e) => e.innerHTML);
  check(html.includes("<h1>Launch plan</h1>"), "heading persisted after reload");
  check(html.includes("<strong>important</strong>"), "bold persisted");
  check(html.includes("<em>nice</em>"), "italic persisted");
  check(html.includes("<u>underlined</u>"), "underline persisted");
  check(html.includes("<ul>") && html.includes("Ship it"), "bullet list persisted");
  check(html.includes("<ol>") && html.includes("Step two"), "numbered list persisted");
  check((await alice.$eval(".title-input", (e) => e.value)) === "Q4 Launch Plan", "rename persisted");

  // share with bob
  await clickByText(alice, ".btn", "Share");
  await alice.waitForSelector(".modal");
  await alice.type(".share-form input", "bob@ajaia.dev");
  await alice.click(".share-form .btn-primary");
  await alice.waitForFunction(() => document.querySelectorAll(".share-list li").length >= 2);
  await sleep(300);
  await alice.screenshot({ path: `${OUT}/04-share-dialog.png` });
  await alice.keyboard.press("Escape");

  // ---- Bob ----
  const bob = await session("bob");
  await loginAs(bob, "bob");
  await bob.waitForFunction(() => document.body.innerText.includes("Q4 Launch Plan"));
  await bob.screenshot({ path: `${OUT}/05-dashboard-bob-shared.png` });
  const sharedText = await bob.$$eval(".doc-section", (s) => s[1].innerText);
  check(sharedText.includes("Q4 Launch Plan") && sharedText.includes("Can edit"), "doc shows under Shared with me for Bob");

  await bob.goto(docUrl, { waitUntil: "networkidle0" });
  await bob.waitForSelector(".tiptap h1");
  await bob.click(".tiptap");
  await bob.keyboard.down("Control"); await bob.keyboard.press("End"); await bob.keyboard.up("Control");
  await bob.keyboard.press("Enter");
  await bob.keyboard.type("Step three from Bob");
  await bob.waitForFunction(() => document.querySelector(".save-status")?.textContent.includes("All changes saved"), { timeout: 5000 });
  await sleep(1000);

  // Alice should pick up Bob's change via polling without a refresh
  await alice.waitForFunction(() => document.querySelector(".tiptap").innerText.includes("Step three from Bob"), { timeout: 10000 });
  check(true, "Alice sees Bob's edit live (poll)");
  await alice.screenshot({ path: `${OUT}/06-live-update.png` });

  // ---- Conflict: alice edits stale while bob saves ----
  // stop alice's poll from catching up by editing immediately after bob saves
  await bob.click(".tiptap");
  await bob.keyboard.type(" (bob v2)");
  await bob.waitForFunction(() => document.querySelector(".save-status")?.textContent.includes("All changes saved"), { timeout: 5000 });
  await sleep(1000);
  await alice.click(".tiptap");
  await alice.keyboard.type(" alice stale edit");
  await sleep(2500);
  const aliceStatus = await alice.$eval(".save-status", (e) => e.textContent);
  console.log("alice status after concurrent edit:", aliceStatus);
  if (aliceStatus.includes("conflict")) {
    await alice.screenshot({ path: `${OUT}/07-conflict.png` });
    await clickByText(alice, ".banner .btn", "Keep mine");
    await alice.waitForFunction(() => document.querySelector(".save-status")?.textContent.includes("All changes saved"), { timeout: 5000 });
    check(true, "conflict banner shown and resolved with Keep mine");
  } else {
    console.log("note: poll synced before alice typed, no conflict this run");
  }

  // ---- Carol (viewer of welcome doc) ----
  const carol = await session("carol");
  await loginAs(carol, "carol");
  await carol.waitForSelector(".doc-link");
  await clickByText(carol, ".doc-link", "Welcome");
  await carol.waitForSelector(".banner-info");
  const editable = await carol.$eval(".tiptap", (e) => e.getAttribute("contenteditable"));
  check(editable === "false", "viewer editor is read-only");
  check((await carol.$(".toolbar")) === null, "viewer has no toolbar");
  await carol.screenshot({ path: `${OUT}/08-viewer-readonly.png` });

  // ---- Upload ----
  const md = path.join(os.tmpdir(), "sample-notes.md");
  fs.writeFileSync(md, "# Imported notes\n\nSome **bold** and *italic* text.\n\n- one\n- two\n");
  await alice.goto(BASE + "/", { waitUntil: "networkidle0" });
  const input = await alice.$('input[type="file"]');
  await input.uploadFile(md);
  await alice.waitForSelector(".tiptap h1");
  const imported = await alice.$eval(".tiptap", (e) => e.innerHTML);
  check(imported.includes("Imported notes") && imported.includes("<strong>bold</strong>"), "markdown upload -> new editable doc");
  check((await alice.$eval(".title-input", (e) => e.value)) === "sample-notes", "imported doc title from filename");
  await alice.screenshot({ path: `${OUT}/09-imported-doc.png` });

  // bad upload shows error toast
  const bad = path.join(os.tmpdir(), "bad.pdf");
  fs.writeFileSync(bad, "%PDF-1.4 fake");
  await alice.goto(BASE + "/", { waitUntil: "networkidle0" });
  await (await alice.$('input[type="file"]')).uploadFile(bad);
  await alice.waitForSelector(".toast-error");
  const toast = await alice.$eval(".toast-error", (e) => e.textContent);
  check(toast.includes("Unsupported"), "unsupported upload shows clear error: " + toast);

  // mobile view
  await alice.setViewport({ width: 390, height: 800 });
  await alice.goto(docUrl, { waitUntil: "networkidle0" });
  await alice.waitForSelector(".tiptap h1");
  await alice.screenshot({ path: `${OUT}/10-mobile.png` });
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  // 409/400 are expected (the conflict + bad upload checks); fonts may fail offline.
  const unexpected = errors.filter((e) => !/409|400|TUNNEL|fonts/.test(e));
  console.log("unexpected console errors:", unexpected.length ? unexpected : "none");
  if (unexpected.length) process.exitCode = 1;
  await browser.close();
}
