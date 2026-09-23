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
export async function installReviewHandler(page) {
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
