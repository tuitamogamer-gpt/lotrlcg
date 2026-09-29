// Older interaction suites explicitly acknowledge presentation steps so they
// keep testing card rules. The pacing suite does not install this helper.
export async function acknowledgeReviews(page) {
  for (let i = 0; i < 160; i++) {
    // Use the actual button's DOM click here so an explicitly requested drain
    // cannot trigger the locator handler and then wait on an already closed UI.
    // Real pointer, focus and keyboard behavior are tested in browser-presentation.
    const clicked = await page.evaluate(() => {
      const button = document.querySelector(
        ".resolution-dialog[open] .resolution-continue",
      );
      if (!button) return false;
      button.click();
      return true;
    });
    if (!clicked) return;
    await page.waitForTimeout(25);
  }
  throw Error("Resolution review did not settle");
}
// Existing suites were written against a pause for every event. Keep that
// behavior explicit so the default "hidden information" preference, the
// first-game tutorial and coaching tips do not change their expectations.
export async function legacyReviews(page) {
  await page.addInitScript(() => {
    localStorage.setItem("there-and-back-again.review-mode", "all");
    localStorage.setItem("there-and-back-again.tutorial", "seen");
    localStorage.setItem("there-and-back-again.coach", "off");
  });
}
export async function installReviewHandler(page) {
  await legacyReviews(page);
  await page.addLocatorHandler(
    page.locator(".resolution-dialog[open]"),
    async () => {
      await acknowledgeReviews(page);
    },
  );
}
export async function reviewedState(page) {
  await acknowledgeReviews(page);
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()));
}
