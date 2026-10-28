import { TestBed } from '@angular/core/testing';
import { findProduct } from '../../shared/products';
import { CartStore } from './cart.store';

describe('CartStore bulk discount', () => {
  let cart: CartStore;
  const product = (id: string) => findProduct(id)!;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    cart = TestBed.inject(CartStore);
  });

  it('gives no discount below quantity 3', () => {
    cart.add(product('ceramic-coffee-mug'), 2);

    expect(cart.subtotal()).toBe(28);
    expect(cart.discount()).toBe(0);
    expect(cart.total()).toBe(28);
  });

  it('gives 10% off a single line with quantity 3', () => {
    cart.add(product('wireless-headphones'), 3);

    expect(cart.subtotal()).toBe(267);
    expect(cart.discount()).toBe(26.7);
    expect(cart.total()).toBe(240.3);
  });

  it('gives no discount for three different products with quantity 1', () => {
    cart.add(product('wireless-headphones'));
    cart.add(product('ceramic-coffee-mug'));
    cart.add(product('french-press'));

    expect(cart.subtotal()).toBe(135);
    expect(cart.discount()).toBe(0);
    expect(cart.total()).toBe(135);
  });

  it('only discounts the qualifying line in a mixed cart', () => {
    cart.add(product('ceramic-coffee-mug'), 3);
    cart.add(product('wireless-headphones'), 1);

    expect(cart.subtotal()).toBe(131);
    expect(cart.discount()).toBe(4.2);
    expect(cart.total()).toBe(126.8);
  });

  it('computes total as subtotal minus discount rounded to cents', () => {
    cart.add(product('resistance-bands'), 3);
    cart.add(product('ceramic-coffee-mug'), 4);
    cart.add(product('water-bottle'), 2);

    expect(cart.subtotal()).toBe(137);
    expect(cart.discount()).toBe(11.3);
    expect(cart.total()).toBe(125.7);
    expect(cart.total()).toBe(Math.round((cart.subtotal() - cart.discount()) * 100) / 100);
  });
});
