import { TestBed } from '@angular/core/testing';
import { AgentEvent } from '../../shared/agent-events';
import { findProduct } from '../../shared/products';
import { CartStore } from '../cart/cart.store';
import { ChatService, FETCH } from './chat.service';

const GENERIC_ERROR = 'Sorry, something went wrong. Please try again.';

const sse = (events: AgentEvent[]) =>
  events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');

/** Splits text into fixed-size chunks so frame boundaries land mid-chunk. */
const chunked = (text: string, size = 7) =>
  Array.from({ length: Math.ceil(text.length / size) }, (_, i) =>
    text.slice(i * size, (i + 1) * size),
  );

function sseResponse(chunks: string[], init: ResponseInit = {}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    ...init,
    headers: {
      'content-type': 'text/event-stream',
      'x-smartcart-provider': 'mock',
      ...init.headers,
    },
  });
}

describe('ChatService', () => {
  let fakeFetch: ReturnType<typeof vi.fn<typeof fetch>>;
  let chat: ChatService;
  let cart: CartStore;

  const reply = (events: AgentEvent[], init?: ResponseInit) =>
    fakeFetch.mockResolvedValueOnce(sseResponse(chunked(sse(events)), init));

  beforeEach(() => {
    localStorage.clear();
    fakeFetch = vi.fn<typeof fetch>();
    TestBed.configureTestingModule({ providers: [{ provide: FETCH, useValue: fakeFetch }] });
    chat = TestBed.inject(ChatService);
    cart = TestBed.inject(CartStore);
  });

  it('adds the user message and the streamed assistant reply', async () => {
    reply([{ type: 'text', delta: 'Hi!' }, { type: 'done' }]);

    await chat.send('  hello  ');

    expect(chat.messages()).toEqual([
      { id: 1, role: 'user', text: 'hello', products: [] },
      { id: 2, role: 'assistant', text: 'Hi!', products: [] },
    ]);
    expect(chat.streaming()).toBe(false);
  });

  it('accumulates text deltas split across chunks', async () => {
    reply([
      { type: 'text', delta: 'I found ' },
      { type: 'text', delta: 'two mugs ' },
      { type: 'text', delta: 'for you.' },
      { type: 'done' },
    ]);

    await chat.send('mugs');

    expect(chat.messages()[1].text).toBe('I found two mugs for you.');
  });

  it('attaches products to the assistant message', async () => {
    const mugs = [findProduct('ceramic-coffee-mug')!, findProduct('insulated-travel-mug')!];
    reply([
      { type: 'text', delta: 'Here you go:' },
      { type: 'products', items: mugs },
      { type: 'done' },
    ]);

    await chat.send('mugs');

    expect(chat.messages()[1]).toEqual({
      id: 2,
      role: 'assistant',
      text: 'Here you go:',
      products: mugs,
    });
  });

  it('applies an addToCart action to the CartStore', async () => {
    reply([
      { type: 'action', action: 'addToCart', productId: 'yoga-mat', quantity: 2 },
      { type: 'text', delta: 'Added.' },
      { type: 'done' },
    ]);

    await chat.send('add 2 yoga mats');

    expect(cart.count()).toBe(2);
    expect(cart.lines().map((line) => [line.product.id, line.quantity])).toEqual([['yoga-mat', 2]]);
  });

  it('sets a generic error for a non-OK response', async () => {
    fakeFetch.mockResolvedValueOnce(
      Response.json({ error: 'messages must be an array of 1 to 20 items.' }, { status: 400 }),
    );

    await chat.send('hello');

    expect(chat.messages()[1]).toEqual({
      id: 2,
      role: 'assistant',
      text: '',
      products: [],
      error: GENERIC_ERROR,
    });
    expect(chat.streaming()).toBe(false);
  });

  it('keeps the partial text when an error event arrives mid-stream', async () => {
    reply([
      { type: 'text', delta: 'Let me look ' },
      { type: 'error', message: 'The assistant is unavailable right now. Please try again.' },
      { type: 'done' },
    ]);

    await chat.send('mugs');

    expect(chat.messages()[1]).toEqual({
      id: 2,
      role: 'assistant',
      text: 'Let me look ',
      products: [],
      error: 'The assistant is unavailable right now. Please try again.',
    });
  });

  it('sets the demo-mode flag from the x-smartcart-provider header', async () => {
    expect(chat.provider()).toBeNull();

    reply([{ type: 'done' }], { headers: { 'x-smartcart-provider': 'mock' } });
    await chat.send('one');
    expect(chat.provider()).toBe('mock');

    reply([{ type: 'done' }], { headers: { 'x-smartcart-provider': 'gemini' } });
    await chat.send('two');
    expect(chat.provider()).toBe('gemini');

    reply([{ type: 'done' }], { headers: { 'x-smartcart-provider': 'something-else' } });
    await chat.send('three');
    expect(chat.provider()).toBeNull();
  });

  it('POSTs the conversation to /api/chat', async () => {
    reply([{ type: 'text', delta: 'Hi!' }, { type: 'done' }]);
    reply([{ type: 'done' }]);

    await chat.send('hello');
    await chat.send('show me mugs');

    expect(fakeFetch).toHaveBeenCalledTimes(2);
    expect(fakeFetch).toHaveBeenNthCalledWith(1, '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
    });
    const [, init] = fakeFetch.mock.calls[1];
    expect(JSON.parse(String(init?.body))).toEqual({
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'Hi!' },
        { role: 'user', content: 'show me mugs' },
      ],
    });
  });
});
