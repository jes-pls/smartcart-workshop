import { AgentEvent } from '../../shared/agent-events';
import { PRODUCTS } from '../../shared/products';
import { MockProvider } from './mock-provider';

async function collect(provider: MockProvider, content: string): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of provider.run([{ role: 'user', content }])) {
    events.push(event);
  }
  return events;
}

const text = (events: AgentEvent[]) =>
  events.map((event) => (event.type === 'text' ? event.delta : '')).join('');

describe('MockProvider', () => {
  let provider: MockProvider;

  beforeEach(() => {
    provider = new MockProvider({ delayMs: 0 });
  });

  it("is named 'mock'", () => {
    expect(provider.name).toBe('mock');
  });

  it('shows only headphones priced at or under $100', async () => {
    const events = await collect(provider, 'show me headphones under $100');
    const products = events.filter((event) => event.type === 'products');

    expect(products).toHaveLength(1);
    const items = products[0].items;
    expect(items.map((item) => item.id)).toEqual(['wireless-headphones', 'kids-headphones']);
    for (const item of items) {
      expect(item.name).toMatch(/headphones/i);
      expect(item.price).toBeLessThanOrEqual(100);
    }
    expect(text(events)).toBe('I found 2 products for you:');
  });

  it('adds the cheapest mug to the cart', async () => {
    const mugs = PRODUCTS.filter((product) => product.tags.includes('mug'));
    const cheapestMug = mugs.reduce((best, mug) => (mug.price < best.price ? mug : best));
    expect(cheapestMug.id).toBe('ceramic-coffee-mug');

    const events = await collect(provider, 'add the cheapest mug to my cart');

    expect(events.filter((event) => event.type === 'action')).toEqual([
      { type: 'action', action: 'addToCart', productId: cheapestMug.id, quantity: 1 },
    ]);
    expect(text(events)).toBe('Added 1 × Ceramic Coffee Mug to your cart.');
  });

  it.each(['hello', 'tell me a joke'])('replies to %o with text only', async (message) => {
    const events = await collect(provider, message);
    const body = events.slice(0, -1);

    expect(body.length).toBeGreaterThan(0);
    expect(body.every((event) => event.type === 'text')).toBe(true);
  });

  it.each([
    'show me headphones under $100',
    'add the cheapest mug to my cart',
    'hello',
    'tell me a joke',
  ])('ends %o with exactly one done event', async (message) => {
    const events = await collect(provider, message);

    expect(events.at(-1)).toEqual({ type: 'done' });
    expect(events.filter((event) => event.type === 'done')).toHaveLength(1);
  });
});
