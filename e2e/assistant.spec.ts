import { expect, Page, test } from '@playwright/test';
import { gotoHydrated } from './hydration';

const sse = (...events: object[]) =>
  events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');

async function openAssistant(page: Page): Promise<void> {
  await gotoHydrated(page, '/');
  await page.getByTestId('assistant-toggle').click();
  await expect(page.getByTestId('assistant-panel')).toBeVisible();
}

async function ask(page: Page, message: string): Promise<void> {
  await page.getByTestId('assistant-input').fill(message);
  await page.getByTestId('assistant-send').click();
}

test.describe('shopping assistant', () => {
  test('shows product cards for a search', async ({ page }) => {
    await openAssistant(page);

    await ask(page, 'show me headphones under $100');

    const products = page.getByTestId('assistant-product');
    await expect(products).toHaveCount(2);
    await expect(products.nth(0)).toContainText('Wireless Headphones');
    await expect(products.nth(1)).toContainText('Kids Headphones');
  });

  test('adds the cheapest mug to the cart', async ({ page }) => {
    await openAssistant(page);
    await expect(page.getByTestId('cart-count')).toHaveText('0');

    await ask(page, 'add the cheapest mug to my cart');

    await expect(page.getByTestId('cart-count')).toHaveText('1');
  });

  test('shows an error when the server fails', async ({ page }) => {
    await page.route('**/api/chat', (route) => route.fulfill({ status: 500 }));
    await openAssistant(page);

    await ask(page, 'show me mugs');

    await expect(page.getByTestId('assistant-error')).toBeVisible();
  });

  test('keeps partial text when the stream errors', async ({ page }) => {
    await page.route('**/api/chat', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sse(
          { type: 'text', delta: 'Let me look for mugs' },
          { type: 'error', message: 'The assistant is unavailable right now. Please try again.' },
        ),
      }),
    );
    await openAssistant(page);

    await ask(page, 'show me mugs');

    const reply = page.locator('[data-testid="assistant-message"][data-role="assistant"]');
    await expect(reply).toContainText('Let me look for mugs');
    await expect(reply.getByTestId('assistant-error')).toHaveText(
      'The assistant is unavailable right now. Please try again.',
    );
  });

  test('disables sending and shows the typing indicator while streaming', async ({ page }) => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/chat', async (route) => {
      await released;
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sse({ type: 'text', delta: 'Here you go.' }, { type: 'done' }),
      });
    });
    await openAssistant(page);

    await ask(page, 'show me mugs');
    await page.getByTestId('assistant-input').fill('and some candles');

    await expect(page.getByTestId('typing-indicator')).toBeVisible();
    await expect(page.getByTestId('assistant-send')).toBeDisabled();

    release();

    await expect(page.getByTestId('typing-indicator')).toBeHidden();
    await expect(page.getByTestId('assistant-send')).toBeEnabled();
  });
});
