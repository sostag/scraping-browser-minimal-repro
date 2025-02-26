"use strict";

import { default as puppeteer } from "puppeteer";
import { exec } from "child_process";

// Check ENV
if (
  !process.env.BRD_CUSTOMER ||
  !process.env.ZONE ||
  !process.env.PASSWORD ||
  !process.env.TARGET
) {
  console.error("Missing environment variables");
  process.exit(1);
}

/**
 * Get a Scraping Browser instance
 * @param {String} [country]
 */
async function getScrapingBrowser(country) {
  const BROWSER_AUTH = `brd-customer-${process.env.BRD_CUSTOMER}-zone-${
    process.env.ZONE
  }${country ? `-country-${country}` : ""}:${process.env.PASSWORD}`;
  const BROWSER_WS_ENDPOINT = `wss://${BROWSER_AUTH}@${process.env.TARGET}`;

  const browser = await puppeteer.connect({
    browserWSEndpoint: BROWSER_WS_ENDPOINT,
  });

  return browser;
}

/**
 * Get a page instance
 * @param {import('puppeteer').Browser} browser
 * @returns
 */
async function getPage(browser) {
  const page = await browser.newPage();

  const client = await page.createCDPSession();

  return { page, client };
}

/**
 * Open Chrome devtools (debug locally only)
 * @param {import('puppeteer').Page} page
 * @param {import('puppeteer').CDPSession} client
 */
async function openDebugger(page, client) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const openDevtools = async (page, client) => {
    // get current frameId
    const frameId = page.mainFrame()._id;
    // get URL for devtools from scraping browser
    const { url: inspectUrl } = await client.send("Page.inspect", { frameId });

    // open devtools URL in local chrome
    exec(`start chrome "${inspectUrl}"`, (error) => {
      if (error) console.error("Unable to open devtools: " + error);
    });
    // wait for devtools ui to load
    await delay(5000);
  };

  await openDevtools(page, client);
}

// Main
const url =
  "https://www.vvf.fr/villages-vacances/vacances-moliets-vvf-villages.html?startDate=2025-07-05&endDate=2025-07-12&adult=2&children=0&baby=0&animal=0";

let browser;

(async () => {
  try {
    browser = await getScrapingBrowser();
    const { page, client } = await getPage(browser);
    await openDebugger(page, client);

    const pageResponse = await page.goto(url, {
      timeout: 120000,
      waitUntil: "domcontentloaded",
    });

    console.log(pageResponse.status());

    // Wait for the page to load
    await page.waitForSelector(".searchBar-submitBtn:not(.isLoading)");

    log("Search button found");

    // End for now
    await browser.close();
    process.exit(0);
  } catch (e) {
    console.error(e);
    browser?.close();
    process.exit;
  }
})();
