"use strict";

import { default as puppeteer } from "puppeteer";
import { exec } from "child_process";

// Check ENV
if (!process.env.BRD_CUSTOMER || !process.env.ZONE || !process.env.PASSWORD || !process.env.TARGET) {
  console.error("Missing environment variables");
  process.exit(1);
}

/**
 * Get a Scraping Browser instance
 * @param {String} [country]
 */
async function getScrapingBrowser(country) {
  const BROWSER_AUTH = `brd-customer-${process.env.BRD_CUSTOMER}-zone-${process.env.ZONE}${
    country ? `-country-${country}` : ""
  }:${process.env.PASSWORD}`;
  const BROWSER_WS_ENDPOINT = `wss://${BROWSER_AUTH}@${process.env.TARGET}`;

  const browser = await puppeteer.connect({
    browserWSEndpoint: BROWSER_WS_ENDPOINT,
  });

  return browser;
}

/**
 * @typedef {Object} Settings
 * @property {boolean} [loadImages]
 * @property {boolean} [loadCSS]
 */

/**
 * Block endpoints
 * @param {import('puppeteer').Page} page
 * @param {Settings} [settings]
 */
const blockEndpoints = async (page, settings) => {
  let blockedEndpoints = [
    "*fsispin360.js",
    "*fsitouchzoom.js",
    "*google.com/recaptcha*",
    "*maps.google.com*",
    "*accounts.google.com*",
    "*fonts.googleapis*",
    "*google-analytics*",
    "*googletagservices*",
    "*googleadservices*",
    "*adservice.google*",
    "*pagead2.googlesyndication*",
    "*static.criteo.net*",
    "*rtax.criteo.com*",
    "*t.contentsquare.net*",
    "*newrelic.com",
    "*datadome.co*",
    "*gstatic.com*",
    "*xiti.com*",
    "*howtank.com*",
    "*aticdn.net*",
    "*demdex.net*",
    "*abtasty.com*",
    "*doubleclick.net*",
    "*font-awesome*",
    "*fontawesome*",
    "*onesignal*",
    "*chatra*",
    "*visualstudio*",
    "*.mp4*",
    "*.avi*",
    "*.webm*",
    "*.mov*",
    "*.mp3*",
    "*.wav*",
    "*.jpg*",
    "*.jpeg*",
    "*.png*",
    "*.gif*",
    "*.svg*",
    "*.woff*",
    "*.woff2*",
    "*.ttf*",
    "*.eot*",
    "*.ico*",
    "*.css*",
  ];

  if (settings?.loadImages) {
    blockedEndpoints = blockedEndpoints.filter(
      (endpoint) => !endpoint.match(/\.jpg$|\.jpeg$|\.png$|\.gif$|\.svg$/)
    );
  }
  if (settings?.loadCSS) {
    blockedEndpoints = blockedEndpoints.filter(
      (endpoint) => !endpoint.match(/\.css$/)
    );
  }

  const client = await page.createCDPSession();
  await client.send("Network.enable");
  await client.send("Network.setBlockedURLs", { urls: blockedEndpoints });

  return { client };
};

/**
 * Save bandwidth
 * @param {import('puppeteer').Page} page
 * @param {Settings} [settings]
 */
const saveBandwidth = async (page, settings) => {
  // Enable request interception
  await page.setRequestInterception(true);

  // Listen for requests
  page.on("request", (request) => {
    const type = request.resourceType();
    let blockedTypes = ["image", "media", "font", "stylesheet"];

    if (settings?.loadImages) {
      blockedTypes = blockedTypes.filter(
        (type) => type !== "image" && type !== "media"
      );
    }
    if (settings?.loadCSS) {
      blockedTypes = blockedTypes.filter(
        (type) => type !== "stylesheet" && type !== "font"
      );
    }

    if (blockedTypes.includes(type)) {
      // If the request is for a video, an audio, an image, a stylesheet or a font, block it
      request.abort();
    } else {
      if (type === "fetch") {
        const media =
          /\.(mp4|avi|webm|mov|mp3|wav|jpg|jpeg|png|gif|svg|woff|woff2|ttf|eot)\??.*$/;
        const mediaWithImages =
          /\.(mp4|avi|webm|mov|mp3|wav|woff|woff2|ttf|eot)\??.*$/;
        const regex = settings?.loadImages ? media : mediaWithImages;

        // Block all media
        if (request.url().match(regex)) {
          request.abort();
          return;
        }
      }

      // If it's not a blocked request, allow it to continue
      request.continue();
    }
  });
};

/**
 * Get a page instance
 * @param {import('puppeteer').Browser} browser
 * @param {Settings} [settings]
 * @returns
 */
export async function getPage(browser, settings) {
  const page = await browser.newPage();

  const { client } = await blockEndpoints(page, settings);
  await saveBandwidth(page, settings);

  return { page, client };
}

/**
 * Open Chrome devtools (debug locally only)
 * @param {import('puppeteer').Page} page
 * @param {import('puppeteer').CDPSession} client
 */
export async function openDebugger(page, client) {
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

export async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Main
const url = 'https://www.secure-hotel-booking.com/d-edge/redirect/2DSI/RoomSelection';

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
  
    await page.waitForSelector("#app");
  
    // Wait for loading spinner to disappear
    await page.waitForSelector("#app>div[style]", {
      hidden: true,
    });
  
    // Wait for date button to be displayed
    await page.waitForSelector('[data-testid="arrival-date-display"]');
  
    // Scroll to the date button
    await page.evaluate(() => {
      document
        .querySelector('[data-testid="arrival-date-display"]')
        .scrollIntoView();
    });
  
    // Click on the date button
    await page.click('[data-testid="arrival-date-display"]');
  
    // Wait 10sec or until geo captcha is displayed
    try {
      await page.waitForSelector("iframe[src*='geo.captcha-delivery.com']", {
        timeout: 10000,
      });
    } catch (e) {
      console.log("No captcha found");
    }
  
    if (await page.$("iframe[src*='geo.captcha-delivery.com']")) {
      console.log("Captcha found");
      const { status } = await client.send("Captcha.solve", {
        detectTimeout: 30 * 1000,
      });
      console.log(`Captcha solve status: ${status}`);
    }
  
    // End for now
    await browser.close();
    process.exit(0);
  } catch (e) {
    console.error(e);
    browser?.close();
    process.exit
  }
})();