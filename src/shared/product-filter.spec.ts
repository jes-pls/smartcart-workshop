import { filterProducts } from './product-filter';
import { Product } from './product';
import { PRODUCTS } from './products';

const ids = (products: readonly Product[]) => products.map((product) => product.id);
const ALL_IDS = ids(PRODUCTS);

describe('filterProducts', () => {
  it('returns every product for an empty filter', () => {
    expect(ids(filterProducts(PRODUCTS, {}))).toEqual(ALL_IDS);
    expect(ids(filterProducts(PRODUCTS, { query: '   ' }))).toEqual(ALL_IDS);
  });

  it('matches the query case-insensitively', () => {
    expect(ids(filterProducts(PRODUCTS, { query: 'HeadPhones' }))).toEqual([
      'wireless-headphones',
      'kids-headphones',
      'noise-cancelling-headphones',
    ]);
  });

  it('requires every query token to match', () => {
    const expected = ['wireless-headphones', 'noise-cancelling-headphones'];

    expect(ids(filterProducts(PRODUCTS, { query: 'wireless headphones' }))).toEqual(expected);
    expect(ids(filterProducts(PRODUCTS, { query: '  WIRELESS   headphones ' }))).toEqual(expected);
  });

  it('filters by category', () => {
    expect(ids(filterProducts(PRODUCTS, { category: 'kitchen' }))).toEqual([
      'ceramic-coffee-mug',
      'insulated-travel-mug',
      'french-press',
      'chef-knife',
      'bamboo-cutting-board',
    ]);
  });

  it("treats category 'all' as no category filter", () => {
    expect(ids(filterProducts(PRODUCTS, { category: 'all' }))).toEqual(ALL_IDS);
  });

  it('includes products priced exactly at maxPrice', () => {
    expect(ids(filterProducts(PRODUCTS, { maxPrice: 19 }))).toEqual([
      'ceramic-coffee-mug',
      'scented-candle',
      'water-bottle',
      'resistance-bands',
    ]);
    expect(ids(filterProducts(PRODUCTS, { maxPrice: 18 }))).toEqual([
      'ceramic-coffee-mug',
      'scented-candle',
      'water-bottle',
    ]);
  });

  it('combines query, category and maxPrice', () => {
    expect(
      ids(filterProducts(PRODUCTS, { query: 'coffee', category: 'kitchen', maxPrice: 24 })),
    ).toEqual(['ceramic-coffee-mug', 'insulated-travel-mug']);
    expect(ids(filterProducts(PRODUCTS, { query: 'ceramic', category: 'home' }))).toEqual([
      'indoor-plant-pot',
    ]);
  });

  it('returns an empty array when nothing matches the query', () => {
    expect(filterProducts(PRODUCTS, { query: 'submarine' })).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const input = [...PRODUCTS];
    const snapshot = structuredClone(input);

    const result = filterProducts(input, { query: 'mug', category: 'kitchen', maxPrice: 20 });

    expect(ids(result)).toEqual(['ceramic-coffee-mug']);
    expect(result).not.toBe(input);
    expect(input).toEqual(snapshot);
  });
});
