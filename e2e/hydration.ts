import { expect, Page } from '@playwright/test';

/** Navigates to `path` and waits until Angular has hydrated every server-rendered component. */
export async function gotoHydrated(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator('[ngh]')).toHaveCount(0);
}
