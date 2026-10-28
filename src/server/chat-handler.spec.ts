import { AgentEvent, ChatMessage } from '../shared/agent-events';
import { handleChat } from './chat-handler';
import { LlmProvider } from './llm/provider';
import { encodeSse } from './sse';

const UNAVAILABLE_MESSAGE = 'The assistant is unavailable right now. Please try again.';

const post = (body: unknown) =>
  new Request('http://localhost/api/chat', { method: 'POST', body: JSON.stringify(body) });

const fakeProvider = (
  name: LlmProvider['name'],
  run: () => AsyncGenerator<AgentEvent>,
): LlmProvider => ({ name, run });

const scripted = (events: AgentEvent[]) =>
  async function* () {
    yield* events;
  };

const userMessage = (content = 'hello'): ChatMessage => ({ role: 'user', content });
const sse = (events: AgentEvent[]) => events.map(encodeSse).join('');

describe('handleChat', () => {
  let createProviderFn: ReturnType<typeof vi.fn<(env: object) => LlmProvider>>;

  beforeEach(() => {
    createProviderFn = vi.fn(() => fakeProvider('mock', scripted([{ type: 'done' }])));
  });

  it('returns 405 for GET', async () => {
    const res = await handleChat(new Request('http://localhost/api/chat'), {}, createProviderFn);

    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect(createProviderFn).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await handleChat(
      new Request('http://localhost/api/chat', { method: 'POST', body: '{not json' }),
      {},
      createProviderFn,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Request body must be valid JSON.' });
    expect(createProviderFn).not.toHaveBeenCalled();
  });

  it.each([
    ['missing messages', {}],
    ['null body', null],
    ['empty messages', { messages: [] }],
    ['more than 20 messages', { messages: Array.from({ length: 21 }, () => userMessage()) }],
  ])('returns 400 for %s', async (_label, body) => {
    const res = await handleChat(post(body), {}, createProviderFn);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'messages must be an array of 1 to 20 items.' });
    expect(createProviderFn).not.toHaveBeenCalled();
  });

  it('accepts exactly 20 messages', async () => {
    const res = await handleChat(
      post({ messages: Array.from({ length: 20 }, () => userMessage()) }),
      {},
      createProviderFn,
    );

    expect(res.status).toBe(200);
  });

  it.each([
    ['a message over 2000 characters', [userMessage('x'.repeat(2001))]],
    ['an empty message', [userMessage('')]],
    ['an unknown role', [{ role: 'system', content: 'hi' }]],
  ])('returns 400 for %s', async (_label, messages) => {
    const res = await handleChat(post({ messages }), {}, createProviderFn);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error:
        'Each message needs a role of "user" or "assistant" and content of 1 to 2000 characters.',
    });
    expect(createProviderFn).not.toHaveBeenCalled();
  });

  it('returns 400 when the last message is not from the user', async () => {
    const res = await handleChat(
      post({ messages: [userMessage(), { role: 'assistant', content: 'Hi!' }] }),
      {},
      createProviderFn,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'The last message must come from the user.' });
  });

  it('streams provider events as SSE with the provider header', async () => {
    const events: AgentEvent[] = [
      { type: 'text', delta: 'Hello ' },
      { type: 'text', delta: 'there' },
      { type: 'done' },
    ];
    createProviderFn.mockReturnValue(fakeProvider('gemini', scripted(events)));

    const res = await handleChat(post({ messages: [userMessage()] }), {}, createProviderFn);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(res.headers.get('x-smartcart-provider')).toBe('gemini');
    expect(await new Response(res.body).text()).toBe(sse(events));
  });

  it('passes the validated messages and env to the provider', async () => {
    const run = vi.fn(scripted([{ type: 'done' }]));
    createProviderFn.mockReturnValue({ name: 'mock', run });
    const env = { SMARTCART_PROVIDER: 'mock' };
    const messages = [userMessage('hi'), { role: 'assistant', content: 'Hello!' }, userMessage()];

    const res = await handleChat(post({ messages }), env, createProviderFn);
    await new Response(res.body).text();

    expect(createProviderFn).toHaveBeenCalledWith(env);
    expect(run).toHaveBeenCalledWith(messages);
  });

  it('sends a generic error then done when the provider throws mid-stream', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    createProviderFn.mockReturnValue(
      fakeProvider('gemini', async function* () {
        yield { type: 'text', delta: 'Let me check' };
        throw new Error('upstream 401: invalid key sk-secret-123');
      }),
    );

    const res = await handleChat(post({ messages: [userMessage()] }), {}, createProviderFn);
    const body = await new Response(res.body).text();

    expect(body).toBe(
      sse([
        { type: 'text', delta: 'Let me check' },
        { type: 'error', message: UNAVAILABLE_MESSAGE },
        { type: 'done' },
      ]),
    );
    expect(body).not.toContain('sk-secret-123');
    expect(body).not.toContain('upstream');
    consoleError.mockRestore();
  });

  it('does not send a second done when the provider throws after done', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    createProviderFn.mockReturnValue(
      fakeProvider('mock', async function* () {
        yield { type: 'done' };
        throw new Error('late failure');
      }),
    );

    const res = await handleChat(post({ messages: [userMessage()] }), {}, createProviderFn);

    expect(await new Response(res.body).text()).toBe(sse([{ type: 'done' }]));
    consoleError.mockRestore();
  });
});
