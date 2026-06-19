const puppeteer = require("puppeteer");
const { execSync, spawn } = require("child_process");
const fs = require("fs");

const COOKIE_PATH = "reddit_cookies.json";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// ================================
//      EDIT THESE BASED ON YOU
// ================================
const subreddits = [
  "https://www.reddit.com/r/SipsTea/",
  "https://www.reddit.com/r/reddeadredemption2/",
  "https://www.reddit.com/r/CuratedTumblr/",
  "https://www.reddit.com/r/criterion/",
  "https://www.reddit.com/r/meirl/"
];

const UPVOTE_LIMIT = 1;
const MIN_DELAY = 4000;
const MAX_DELAY = 12000;
const SCROLL_MIN = 800;
const SCROLL_MAX = 1600;

// Port for Chrome's remote debugging
const DEBUG_PORT = 9222;

function randomDelay() {
  return MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
}

function randomScrollAmount() {
  return SCROLL_MIN + Math.random() * (SCROLL_MAX - SCROLL_MIN);
}

// ------------------------
// Launch Chrome independently
// (not owned by Node — so Node exiting won't kill it)
// ------------------------
function launchChrome() {
  // Common Chrome paths on Windows
  const chromePaths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe"
  ];

  let chromePath = null;
  for (const p of chromePaths) {
    if (fs.existsSync(p)) {
      chromePath = p;
      break;
    }
  }

  if (!chromePath) {
    console.error("❌ Chrome not found. Update chromePaths in the script.");
    process.exit(1);
  }

  console.log("🚀 Launching Chrome independently...");

  // spawn with detached:true so Chrome is its own process group
  const chrome = spawn(
    chromePath,
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\chrome-bot-profile`
    ],
    {
      detached: true,
      stdio: "ignore"
    }
  );

  chrome.unref(); // 👈 key — Node won't wait for Chrome to exit
  console.log(`✅ Chrome launched on port ${DEBUG_PORT}`);
}

// ------------------------
// Random slow scrolling
// ------------------------
async function humanScroll(page) {
  const scrollTimes = 10 + Math.floor(Math.random() * 10);

  for (let i = 0; i < scrollTimes; i++) {
    const scrollAmount = randomScrollAmount();
    await page.evaluate((y) => window.scrollBy(0, y), scrollAmount);
    console.log(`↕ Scrolled ${Math.floor(scrollAmount)} px`);
    await sleep(1500 + Math.random() * 3500);
  }

  await sleep(2000 + Math.random() * 4000);
}

// ------------------------
// Start Bot
// ------------------------
async function start() {
  // Step 1 — launch Chrome as a detached independent process
  launchChrome();

  // Step 2 — wait for Chrome to be ready
  console.log("⏳ Waiting 5 seconds for Chrome to start...");
  await sleep(5000);

  // Step 3 — connect to it via CDP (we don't own the process)
  console.log("🔗 Connecting to Chrome via CDP...");
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
    defaultViewport: null
  });

  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();

  console.log("✅ Connected to Chrome.");

  // No special SIGINT handler needed — since we used connect() not launch(),
  // Node has no handle on Chrome. Ctrl+C kills Node, Chrome stays open.

  // Load cookies
  if (fs.existsSync(COOKIE_PATH)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, "utf8"));
    await page.setCookie(...cookies);
    console.log("✅ Loaded saved cookies.");
  }

  await page.goto("https://www.reddit.com/");
  console.log("🌍 Opened Reddit homepage.");

  console.log("⏳ Waiting 20 seconds for login (first run)...");
  await sleep(20000);

  const cookies = await page.cookies();
  fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
  console.log("💾 Cookies saved.");

  for (const sub of subreddits) {
    console.log(`\n===============================`);
    console.log(`🎯 Working on: ${sub}`);
    console.log(`===============================\n`);

    await sleep(randomDelay());

    await autoUpvote(page, sub, UPVOTE_LIMIT);
    await sleep(randomDelay() + 2000);

    await autoSave(page, sub);
    await sleep(randomDelay() + 2000);

    console.log("🕒 Taking a short break before next subreddit...");
    await sleep(10000 + Math.random() * 15000);
  }

  console.log("\n🎉 COMPLETED FULL SESSION!");
  console.log("🖥️  Browser stays open — close it manually when done.");

  // Just exit Node — Chrome keeps running since we never owned it
  process.exit(0);
}

// ------------------------
// Auto-upvote function
// ------------------------
async function autoUpvote(page, subredditUrl, limit) {
  console.log(`⬆ Starting auto-upvote (limit: ${limit})...`);

  await page.goto(subredditUrl);
  await sleep(randomDelay());
  await humanScroll(page);

  const posts = await page.$$(`div[data-testid="post-container"]`);
  let count = 0;

  for (const post of posts) {
    if (count >= limit) break;

    const isAd = await post.$('span:contains("promoted")');
    if (isAd) {
      console.log("⏭ Skipping an ad...");
      continue;
    }

    const upvoteBtn = await post.$('button[aria-label="upvote"]');
    if (!upvoteBtn) continue;

    await upvoteBtn.click();
    count++;
    console.log(`⬆ Upvoted post #${count}`);

    await sleep(randomDelay() + Math.random() * 3000);
  }

  console.log("✔ Finished auto-upvoting.");
}

// ------------------------
// Auto-save function
// ------------------------
async function autoSave(page, subredditUrl) {
  console.log("🔖 Saving one post...");

  await page.goto(subredditUrl);
  await sleep(randomDelay());
  await humanScroll(page);

  const posts = await page.$$(`div[data-testid="post-container"]`);

  for (const post of posts) {
    const isAd = await post.$('span:contains("promoted")');
    if (isAd) continue;

    const saveBtn = await post.$('button[aria-label="save"]');
    if (saveBtn) {
      await saveBtn.click();
      console.log("✔ Saved a post.");
      await sleep(randomDelay());
      return;
    }
  }

  console.log("❌ No saveable post found.");
}

start();