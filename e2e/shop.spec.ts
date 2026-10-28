import { expect, test } from '@playwright/test';
import { gotoHydrated } from './hydration';

test.describe('shop', () => {
  test('home page lists the full catalog', async ({ page }) => {
    await gotoHydrated(page, '/');

    await expect(page.getByTestId('product-card')).toHaveCount(20);
  });

  test('typing in the search box narrows the list', async ({ page }) => {
    await gotoHydrated(page, '/');

    await page.getByTestId('search').fill('headphones');

    const cards = page.getByTestId('product-card');
    await expect(cards).toHaveCount(3);
    for (const card of await cards.all()) {
      await expect(card).toContainText(/headphones/i);
    }
  });

  test('add to cart updates the badge and the cart page', async ({ page }) => {
    await gotoHydrated(page, '/');
    await expect(page.getByTestId('cart-count')).toHaveText('0');

    const mug = page.getByTestId('product-card').filter({ hasText: 'Ceramic Coffee Mug' });
    await mug.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('cart-count')).toHaveText('1');

    await page.getByTestId('cart-count').click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
    await expect(page.getByTestId('cart-line')).toContainText('Ceramic Coffee Mug');
    await expect(page.getByTestId('cart-total')).toHaveText('$14.00');
  });

  test('product detail page is server-rendered', async ({ page }) => {
    const response = await page.request.get('/product/wireless-headphones');

    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain('Wireless Headphones');
  });
});
