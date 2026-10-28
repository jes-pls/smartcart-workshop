import { Product } from '../shared/product';
import { PRODUCTS, findProduct } from '../shared/products';
import { ToolResult, executeTool, toolDeclarations } from './tools';

const product = (id: string) => findProduct(id)!;
const summary = ({ id, name, price, category, rating }: Product) => ({
  id,
  name,
  price,
  category,
  rating,
});
const searchResult = (ids: string[]): ToolResult => {
  const items = ids.map(product);
  return {
    response: { count: items.length, products: items.map(summary) },
    events: items.length > 0 ? [{ type: 'products', items }] : [],
  };
};
const failure = (error: string): ToolResult => ({ response: { error }, events: [] });
const QUANTITY_ERROR = 'Quantity must be a whole number from 1 to 10.';
const FIRST_FIVE_IDS = PRODUCTS.slice(0, 5).map((p) => p.id);

describe('executeTool', () => {
  describe('searchProducts', () => {
    it('matches the query and returns summaries plus a products event', () => {
      expect(executeTool('searchProducts', { query: 'headphones' })).toEqual(
        searchResult(['wireless-headphones', 'kids-headphones', 'noise-cancelling-headphones']),
      );
    });

    it('filters by category and caps results at 5', () => {
      expect(executeTool('searchProducts', { category: 'home' })).toEqual(
        searchResult(['scented-candle', 'desk-lamp', 'throw-blanket', 'indoor-plant-pot']),
      );
      expect(executeTool('searchProducts', {})).toEqual(searchResult(FIRST_FIVE_IDS));
    });

    it('filters by maxPrice inclusively', () => {
      expect(executeTool('searchProducts', { maxPrice: 19 })).toEqual(
        searchResult(['ceramic-coffee-mug', 'scented-candle', 'water-bottle', 'resistance-bands']),
      );
    });

    it('returns an empty result and no events when nothing matches', () => {
      expect(executeTool('searchProducts', { query: 'submarine' })).toEqual(searchResult([]));
    });

    it.each([
      { query: 42 },
      { query: ['headphones'] },
      { category: 'garden' },
      { category: 7 },
      { maxPrice: '20' },
      { maxPrice: Number.NaN },
      { maxPrice: Number.POSITIVE_INFINITY },
      { query: null, category: {}, maxPrice: true },
    ])('ignores arguments with the wrong type or value: %o', (args) => {
      expect(executeTool('searchProducts', args)).toEqual(searchResult(FIRST_FIVE_IDS));
    });
  });

  describe('getProduct', () => {
    it('returns the full product for a known id', () => {
      expect(executeTool('getProduct', { productId: 'french-press' })).toEqual({
        response: { product: product('french-press') },
        events: [],
      });
    });

    it('returns an error for an unknown id', () => {
      expect(executeTool('getProduct', { productId: 'flux-capacitor' })).toEqual(
        failure('Unknown product: flux-capacitor'),
      );
    });

    it('returns an error for a missing or non-string id', () => {
      expect(executeTool('getProduct', {})).toEqual(failure('Unknown product: '));
      expect(executeTool('getProduct', { productId: 123 })).toEqual(failure('Unknown product: '));
    });
  });

  describe('addToCart', () => {
    it('defaults quantity to 1', () => {
      expect(executeTool('addToCart', { productId: 'ceramic-coffee-mug' })).toEqual({
        response: {
          added: true,
          productId: 'ceramic-coffee-mug',
          quantity: 1,
          name: 'Ceramic Coffee Mug',
        },
        events: [
          { type: 'action', action: 'addToCart', productId: 'ceramic-coffee-mug', quantity: 1 },
        ],
      });
    });

    it('accepts the maximum quantity of 10', () => {
      expect(executeTool('addToCart', { productId: 'yoga-mat', quantity: 10 })).toEqual({
        response: { added: true, productId: 'yoga-mat', quantity: 10, name: 'Yoga Mat' },
        events: [{ type: 'action', action: 'addToCart', productId: 'yoga-mat', quantity: 10 }],
      });
    });

    it('rejects a quantity above 10', () => {
      expect(executeTool('addToCart', { productId: 'yoga-mat', quantity: 11 })).toEqual(
        failure(QUANTITY_ERROR),
      );
    });

    it.each([0, -1, 2.5, Number.NaN, '3', true])('rejects quantity %o', (quantity) => {
      expect(executeTool('addToCart', { productId: 'yoga-mat', quantity })).toEqual(
        failure(QUANTITY_ERROR),
      );
    });

    it('rejects an unknown product', () => {
      expect(executeTool('addToCart', { productId: 'flux-capacitor', quantity: 2 })).toEqual(
        failure('Unknown product: flux-capacitor'),
      );
      expect(executeTool('addToCart', { productId: 42 })).toEqual(failure('Unknown product: '));
    });
  });

  it('returns an error for an unknown tool name', () => {
    expect(executeTool('deleteEverything', { productId: 'yoga-mat' })).toEqual(
      failure('Unknown tool: deleteEverything'),
    );
  });
});

describe('toolDeclarations', () => {
  it('declares the expected tools', () => {
    expect(toolDeclarations.map((tool) => tool.name)).toEqual([
      'searchProducts',
      'getProduct',
      'addToCart',
    ]);
  });

  it.each(toolDeclarations.map((tool) => tool.name))('%s is handled by executeTool', (name) => {
    expect(executeTool(name, {}).response).not.toEqual({ error: `Unknown tool: ${name}` });
  });
});
