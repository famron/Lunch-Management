/**
 * config.js — THE ONE FILE YOU NEED TO EDIT.
 *
 * 1. Deploy the Apps Script project as a Web App
 *    (Deploy > New deployment > Web app > Execute as "Me" > Who has access "Anyone").
 * 2. Copy the Web App URL it gives you and paste it below as API_URL.
 * 3. Set ORG_NAME to your office's name (this also becomes the default print heading).
 *
 * Until you do step 2, the app runs in DEMO MODE with fake in-memory data so
 * you can see the whole design and flow immediately — nothing you do in demo
 * mode is saved anywhere.
 */
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbwzSpKDluHXCwwYZ0qUAsHafzOd9J8lychRwBKn56paSXAxYAHaHiuY7PiJ03RUdYLb5g/exec',
  ORG_NAME: 'Our Office Lunch'
};

CONFIG.DEMO_MODE = !CONFIG.API_URL || CONFIG.API_URL.indexOf('PASTE_YOUR') !== -1;
