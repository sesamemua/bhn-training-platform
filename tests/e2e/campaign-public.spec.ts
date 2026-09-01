import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = ["engage", "experience", "venture-connect"] as const;

for (const route of routes) {
  test(`${route} campaign page is accessible and responsive`, async ({ page }) => {
    await page.goto(
      `/for-trainees/${route}?utm_source=google&utm_medium=cpc&utm_campaign=campaign-test&gclid=test-click`,
    );

    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.getByLabel("Institution or research organization")).toBeVisible();

    const secondSectionTop = await page.locator("main > section").nth(1).evaluate((section) =>
      section.getBoundingClientRect().top,
    );
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    expect(secondSectionTop).toBeLessThan(viewport!.height);

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(accessibility.violations).toEqual([]);
  });
}
