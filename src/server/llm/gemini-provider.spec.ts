import { GenerateContentResponse, Part } from '@google/genai';
import { AgentEvent, ChatMessage } from '../../shared/agent-events';
import { findProduct } from '../../shared/products';
import { executeTool } from '../tools';
import {
  DEFAULT_GEMINI_MODEL,
  GeminiClient,
  GeminiProvider,
  SYSTEM_INSTRUCTION,
} from './gemini-provider';

type Params = Parameters<GeminiClient['models']['generateContentStream']>[0];

const FALLBACK_TEXT = "I wasn't able to finish that request. Please try rephrasing.";

/** Each round is a list of chunks; each chunk is the parts of one streamed response. */
function fakeClient(script: Part[][][]) {
  const calls: Params[] = [];
  const client: GeminiClient = {
    models: {
      async generateContentStream(params) {
        const chunks = script[calls.length] ?? [];
        calls.push(structuredClone(params));
        return (async function* () {
          for (const parts of chunks) {
            yield {
              candidates: [{ content: { role: 'model', parts } }],
            } as unknown as GenerateContentResponse;
          }
        })();
      },
    },
  };
  return { client, calls };
}

async function collect(
  provider: GeminiProvider,
  messages: ChatMessage[] = [{ role: 'user', content: 'hello' }],
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of provider.run(messages)) events.push(event);
  return events;
}

const provider = (client: GeminiClient, model?: string) =>
  new GeminiProvider({ apiKey: 'test-key', model, client });

describe('GeminiProvider', () => {
  it("is named 'gemini'", () => {
    expect(provider(fakeClient([]).client).name).toBe('gemini');
  });

  it('streams text parts as text events and skips thoughts', async () => {
    const { client, calls } = fakeClient([
      [[{ text: 'thinking...', thought: true }], [{ text: 'Hello ' }], [{ text: 'there' }]],
    ]);

    expect(await collect(provider(client))).toEqual([
      { type: 'text', delta: 'Hello ' },
      { type: 'text', delta: 'there' },
      { type: 'done' },
    ]);
    expect(calls).toHaveLength(1);
  });

  it('runs searchProducts and sends the functionResponse in a second round', async () => {
    const call: Part = {
      functionCall: { id: 'call-1', name: 'searchProducts', args: { query: 'mug' } },
    };
    const { client, calls } = fakeClient([[[call]], [[{ text: 'Here are two mugs.' }]]]);

    const events = await collect(provider(client));

    expect(events).toEqual([
      {
        type: 'products',
        items: [findProduct('ceramic-coffee-mug'), findProduct('insulated-travel-mug')],
      },
      { type: 'text', delta: 'Here are two mugs.' },
      { type: 'done' },
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[1].contents).toEqual([
      { role: 'user', parts: [{ text: 'hello' }] },
      { role: 'model', parts: [call] },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'call-1',
              name: 'searchProducts',
              response: executeTool('searchProducts', { query: 'mug' }).response,
            },
          },
        ],
      },
    ]);
  });

  it('turns an addToCart call into an action event', async () => {
    const { client } = fakeClient([
      [[{ functionCall: { name: 'addToCart', args: { productId: 'yoga-mat', quantity: 2 } } }]],
      [[{ text: 'Added 2 yoga mats.' }]],
    ]);

    expect(await collect(provider(client))).toEqual([
      { type: 'action', action: 'addToCart', productId: 'yoga-mat', quantity: 2 },
      { type: 'text', delta: 'Added 2 yoga mats.' },
      { type: 'done' },
    ]);
  });

  it('stops after 3 tool rounds with a fallback message', async () => {
    const round: Part[][] = [
      [{ functionCall: { name: 'getProduct', args: { productId: 'french-press' } } }],
    ];
    const { client, calls } = fakeClient([round, round, round, round]);

    expect(await collect(provider(client))).toEqual([
      { type: 'text', delta: FALLBACK_TEXT },
      { type: 'done' },
    ]);
    expect(calls).toHaveLength(3);
  });

  it('sends SYSTEM_INSTRUCTION, the tools and DEFAULT_GEMINI_MODEL by default', async () => {
    const { client, calls } = fakeClient([[[{ text: 'Hi' }]]]);

    await collect(provider(client), [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'mugs?' },
    ]);

    expect(calls[0].model).toBe(DEFAULT_GEMINI_MODEL);
    expect(calls[0].config?.systemInstruction).toBe(SYSTEM_INSTRUCTION);
    expect(
      calls[0].config?.tools?.flatMap((tool) =>
        'functionDeclarations' in tool
          ? (tool.functionDeclarations ?? []).map((declaration) => declaration.name)
          : [],
      ),
    ).toEqual(['searchProducts', 'getProduct', 'addToCart']);
    expect(calls[0].contents).toEqual([
      { role: 'user', parts: [{ text: 'hi' }] },
      { role: 'model', parts: [{ text: 'Hello!' }] },
      { role: 'user', parts: [{ text: 'mugs?' }] },
    ]);
  });

  it('uses the model option when given', async () => {
    const { client, calls } = fakeClient([[[{ text: 'Hi' }]]]);

    await collect(provider(client, 'gemini-test-model'));

    expect(calls[0].model).toBe('gemini-test-model');
  });

  it('turns a client failure into an error event without leaking the message', async () => {
    const client: GeminiClient = {
      models: {
        generateContentStream: () =>
          Promise.reject(new Error('API key not valid: test-key-secret')),
      },
    };

    const events = await collect(provider(client));

    expect(events).toEqual([{ type: 'error', message: expect.any(String) }, { type: 'done' }]);
    expect(JSON.stringify(events)).not.toContain('test-key-secret');
    expect(JSON.stringify(events)).not.toContain('API key not valid');
  });
});
