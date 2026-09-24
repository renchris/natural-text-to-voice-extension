import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import {
  ApiClient,
  getApiClient,
  resetApiClient,
  speakTimeoutMs,
  userMessageForError,
} from '../src/shared/api-client';
import { discoverConfig, isHelperHealth } from '../src/shared/config';
import {
  HelperNotFoundError,
  InvalidResponseError,
  RequestAbortedError,
} from '../src/shared/types';

// Save original fetch before any mocking (for integration tests)
const originalFetch = globalThis.fetch;

// Mock chrome.storage API
global.chrome = {
  storage: {
    local: {
      get: mock(async () => ({})),
      set: mock(async () => {}),
      remove: mock(async () => {}),
    },
  },
} as any;

// Create mock fetch (but don't assign to global yet)
const mockFetch = mock();

/** /health answers as the helper; every other endpoint answers `response`. */
function answerWith(response: unknown): void {
  mockFetch.mockImplementation(async (url: string) => String(url).endsWith('/health')
    ? { ok: true, json: async () => ({ status: 'ok', model: 'kokoro-82m', model_loaded: true }) }
    : response);
}

describe('ApiClient', () => {
  let client: ApiClient;

  beforeEach(() => {
    // Set up fetch mock for unit tests
    global.fetch = mockFetch as any;

    // Reset mocks
    mockFetch.mockReset();
    (chrome.storage.local.get as any).mockReset();
    (chrome.storage.local.set as any).mockReset();

    // Reset client
    resetApiClient();
    client = new ApiClient();

    // Default chrome.storage mock to return config with port 8249
    (chrome.storage.local.get as any).mockImplementation(async () => ({
      native_tts_helper_config: {
        port: 8249,
        secret: 'test-secret',
        default_voice: 'af_bella',
      },
    }));

    // Default mockFetch to succeed for health checks during config verification
    // Individual tests will override this as needed
    mockFetch.mockImplementation(async (url: string, _options: any) => {
      if (url.includes('/health')) {
        return {
          ok: true,
          json: async () => ({ status: 'ok', model: 'kokoro-82m', model_loaded: true, uptime_seconds: 10, requests_served: 1 }),
        };
      }
      throw new Error('Unexpected URL in default mock');
    });
  });

  afterEach(() => {
    // Restore original fetch after each test (for integration tests)
    global.fetch = originalFetch;
  });

  describe('checkHealth()', () => {
    test('should return health response on success', async () => {
      const healthResponse = {
        status: 'ok',
        model: 'kokoro-82m',
        model_loaded: true,
        uptime_seconds: 100,
        requests_served: 5,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => healthResponse,
      });

      const result = await client.checkHealth();

      expect(result).toEqual(healthResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:8249/health',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Accept': 'application/json',
            'X-Secret': 'test-secret',
          }),
        })
      );
    });

    test('should throw HelperNotFoundError on connection refused', async () => {
      // Mock all fetch calls to fail (including config verification)
      mockFetch.mockImplementation(async () => {
        throw new Error('fetch failed');
      });

      await expect(client.checkHealth()).rejects.toThrow(HelperNotFoundError);
    });

    test('should throw InvalidResponseError on 404', async () => {
      mockFetch.mockImplementation(async (_url: string) => {
        // First call is config verification - succeed
        // Second call (actual checkHealth) - fail with 404
        if (mockFetch.mock.calls.length === 1) {
          return {
            ok: true,
            json: async () => ({ status: 'ok', model: 'kokoro-82m', model_loaded: true, uptime_seconds: 10, requests_served: 1 }),
          };
        }
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
        };
      });

      await expect(client.checkHealth()).rejects.toThrow(InvalidResponseError);
    });

    test('should throw InvalidResponseError on 500', async () => {
      mockFetch.mockImplementation(async (_url: string) => {
        // First call is config verification - succeed
        // Second call (actual checkHealth) - fail with 500
        if (mockFetch.mock.calls.length === 1) {
          return {
            ok: true,
            json: async () => ({ status: 'ok', model: 'kokoro-82m', model_loaded: true, uptime_seconds: 10, requests_served: 1 }),
          };
        }
        return {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        };
      });

      await expect(client.checkHealth()).rejects.toThrow(InvalidResponseError);
    });

    test('should retry on network error', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(async (_url: string) => {
        callCount++;
        // First call: config verification - succeed
        if (callCount === 1) {
          return {
            ok: true,
            json: async () => ({ status: 'ok', model: 'kokoro-82m', model_loaded: true, uptime_seconds: 10, requests_served: 1 }),
          };
        }
        // Second call: actual request - fail with network error
        if (callCount === 2) {
          throw new Error('Network error');
        }
        // Third call: retry - succeed
        return {
          ok: true,
          json: async () => ({ status: 'ok', model: 'kokoro-82m', model_loaded: true, uptime_seconds: 10, requests_served: 1 }),
        };
      });

      const result = await client.checkHealth();

      expect(result.status).toBe('ok');
      expect(callCount).toBe(3); // Config verification + initial attempt + 1 retry
    });
  });

  describe('getVoices()', () => {
    test('should return list of voices', async () => {
      const voices = [
        { id: 'af_bella', name: 'Bella (US)', language: 'en-US' },
        { id: 'am_adam', name: 'Adam (US)', language: 'en-US' },
      ];

      answerWith({
        ok: true,
        json: async () => ({ voices }),
      });

      const result = await client.getVoices();

      expect(result).toEqual(voices);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:8249/voices',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    test('should include secret header if configured', async () => {
      answerWith({
        ok: true,
        json: async () => ({ voices: [] }),
      });

      await client.getVoices();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Secret': 'test-secret',
          }),
        })
      );
    });
  });

  describe('speak()', () => {
    test('should generate speech with default parameters', async () => {
      const audioBlob = new Blob(['audio data'], { type: 'audio/wav' });

      answerWith({
        ok: true,
        blob: async () => audioBlob,
      });

      const result = await client.speak({ text: 'Hello world' });

      expect(result).toBeInstanceOf(Blob);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:8249/speak',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            text: 'Hello world',
            voice: 'af_bella',
            speed: 1.0,
          }),
        })
      );
    });

    test('should use custom voice and speed', async () => {
      const audioBlob = new Blob(['audio data']);

      answerWith({
        ok: true,
        blob: async () => audioBlob,
      });

      await client.speak({
        text: 'Hello world',
        voice: 'am_adam',
        speed: 1.5,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            text: 'Hello world',
            voice: 'am_adam',
            speed: 1.5,
          }),
        })
      );
    });

    test('should throw error for empty text', async () => {
      await expect(client.speak({ text: '' })).rejects.toThrow(
        'Text is required for speech generation'
      );
    });

    test('should throw error for invalid speed', async () => {
      await expect(client.speak({ text: 'Hello', speed: 3.0 })).rejects.toThrow(
        'Speed must be between 0.5 and 2.0'
      );
    });

    test('should use longer timeout for speak requests', async () => {
      const audioBlob = new Blob(['audio data']);

      mockFetch.mockImplementation(async (url, options: any) => {
        // Verify timeout is set (we can't directly check AbortSignal timeout)
        expect(options.signal).toBeDefined();
        if (String(url).endsWith('/health')) {
          return { ok: true, json: async () => ({ status: 'ok', model: 'kokoro-82m', model_loaded: true }) };
        }
        return {
          ok: true,
          blob: async () => audioBlob,
        };
      });

      await client.speak({ text: 'Hello world' });
    });
  });

  describe('speak() robustness (IN-09)', () => {
    test('the /speak timeout scales with text length and caps at 120 s', () => {
      expect(speakTimeoutMs('Hi')).toBe(30030);
      expect(speakTimeoutMs('x'.repeat(1000))).toBe(45000);
      expect(speakTimeoutMs('x'.repeat(4985))).toBe(104775);
      expect(speakTimeoutMs('x'.repeat(6000))).toBe(120000);
      expect(speakTimeoutMs('x'.repeat(100000))).toBe(120000);
    });

    test('speak() arms its abort timer with the scaled timeout', async () => {
      const delays: number[] = [];
      const realSetTimeout = globalThis.setTimeout;
      (globalThis as any).setTimeout = (_fn: () => void, ms?: number) => {
        delays.push(ms ?? 0);
        return realSetTimeout(() => {}, 0);
      };
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/health')) {
          return { ok: true, json: async () => ({ status: 'ok', model: 'kokoro-82m', model_loaded: true }) };
        }
        return { ok: true, blob: async () => new Blob(['wav']) };
      });
      try {
        await client.speak({ text: 'x'.repeat(2000) });
      } finally {
        globalThis.setTimeout = realSetTimeout;
      }
      expect(delays).toContain(60000);
    });

    test('a POST /speak that fails at the network is not retried', async () => {
      let speakCalls = 0;
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/health')) {
          return { ok: true, json: async () => ({ status: 'ok', model: 'kokoro-82m', model_loaded: true }) };
        }
        speakCalls++;
        throw new TypeError('Failed to fetch');
      });

      await expect(client.speak({ text: 'Hello world' })).rejects.toThrow(HelperNotFoundError);
      expect(speakCalls).toBe(1);
    });

    test('the caller\'s signal aborts an in-flight /speak as RequestAbortedError, not a timeout (EXT-5)', async () => {
      let speakSignal: AbortSignal | undefined;
      mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/health')) {
          return { ok: true, json: async () => ({ status: 'ok', model: 'kokoro-82m', model_loaded: true }) };
        }
        speakSignal = init?.signal ?? undefined;
        return new Promise((_resolve, reject) => {
          speakSignal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        });
      });
      const stop = new AbortController();
      const pending = client.speak({ text: 'Hello world' }, stop.signal);
      for (let i = 0; i < 50 && !speakSignal; i++) await new Promise(r => setTimeout(r, 1));
      expect(speakSignal?.aborted).toBe(false);
      stop.abort();
      await expect(pending).rejects.toThrow(RequestAbortedError);
      expect(speakSignal?.aborted).toBe(true);
      // An already-aborted signal never reaches the helper.
      const speaksBefore = mockFetch.mock.calls.filter(c => String(c[0]).endsWith('/speak')).length;
      await expect(client.speak({ text: 'Hello again' }, stop.signal)).rejects.toThrow(RequestAbortedError);
      expect(mockFetch.mock.calls.filter(c => String(c[0]).endsWith('/speak')).length).toBe(speaksBefore);
    });

    test('GET requests are still retried on network errors', async () => {
      let healthCalls = 0;
      mockFetch.mockImplementation(async () => {
        healthCalls++;
        // 1: config verification, 2: first attempt fails, 3: retry succeeds
        if (healthCalls === 2) throw new TypeError('Failed to fetch');
        return { ok: true, json: async () => ({ status: 'ok', model: 'kokoro-82m', model_loaded: true }) };
      });

      await client.checkHealth();
      expect(healthCalls).toBe(3);
    });
  });

  describe('a failed discovery is not cached (EXT-2, EXT-4)', () => {
    let helperUp = false;
    let helperPort = 8249;
    beforeEach(() => {
      helperUp = false;
      helperPort = 8249;
      (chrome.storage.local.get as any).mockImplementation(async () => ({}));
      mockFetch.mockImplementation(async (url: string) => {
        if (!helperUp || !url.startsWith(`http://127.0.0.1:${helperPort}/`)) throw new TypeError('Failed to fetch');
        if (url.endsWith('/health')) return { ok: true, json: async () => ({ status: 'ok', model: 'kokoro-82m', model_loaded: true }) };
        return { ok: true, blob: async () => new Blob(['wav']) };
      });
    });

    test('helper down, then started: the same client speaks on the next try', async () => {
      await expect(client.speak({ text: 'Hello' })).rejects.toThrow(HelperNotFoundError);
      helperUp = true;
      const blob = await client.speak({ text: 'Hello' });
      expect(blob).toBeInstanceOf(Blob);
    });

    test('a failed discovery from speak() reads as "helper not running", not the raw port list', async () => {
      const error = await client.speak({ text: 'Hello' }).catch(e => e);
      expect(error).toBeInstanceOf(HelperNotFoundError);
      expect(userMessageForError(error)).toBe('The Natural TTS helper is not running. Start it, then try again.');
      // Discovery's own error type maps to the same sentence wherever it surfaces.
      const raw = Object.assign(new Error('Native TTS Helper not found on ports: 8249, 8250'), { name: 'ConfigNotFoundError' });
      expect(userMessageForError(raw)).toBe('The Natural TTS helper is not running. Start it, then try again.');
    });

    test('a helper that moved to another port is rediscovered after one failed request', async () => {
      helperUp = true;
      await client.speak({ text: 'Hello' });
      helperPort = 8250;
      await expect(client.speak({ text: 'Hello' })).rejects.toThrow(HelperNotFoundError);
      const blob = await client.speak({ text: 'Hello' });
      expect(blob).toBeInstanceOf(Blob);
      const lastSpeak = mockFetch.mock.calls.map(c => String(c[0])).filter(u => u.endsWith('/speak')).pop();
      expect(lastSpeak).toBe('http://127.0.0.1:8250/speak');
    });
  });

  describe('only the helper is treated as the helper (SEC-03)', () => {
    test('a service answering 200 on /health at 8249 never receives the selection', async () => {
      (chrome.storage.local.get as any).mockImplementation(async () => ({}));
      const posted: string[] = [];
      mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.startsWith('http://127.0.0.1:8249/')) {
          if (init?.method === 'POST') posted.push(url);
          // An unrelated dev service (or a tunnel) with a conventional /health.
          return { ok: true, json: async () => ({ status: 'ok', service: 'some-dev-api' }), blob: async () => new Blob(['x']) };
        }
        if (url === 'http://127.0.0.1:8250/health') {
          return { ok: true, json: async () => ({ status: 'ok', model: 'kokoro-82m', model_loaded: true }) };
        }
        if (url === 'http://127.0.0.1:8250/speak') return { ok: true, blob: async () => new Blob(['wav']) };
        throw new TypeError('Failed to fetch');
      });

      await client.speak({ text: 'PRIVATE selected text' });

      expect(posted).toEqual([]);
      const speaks = mockFetch.mock.calls.map(c => String(c[0])).filter(u => u.endsWith('/speak'));
      expect(speaks).toEqual(['http://127.0.0.1:8250/speak']);
    });

    test('isHelperHealth needs the helper\'s model and a status, from a 2xx', async () => {
      const res = (ok: boolean, body: unknown) => ({ ok, json: async () => body });
      expect(await isHelperHealth(res(true, { status: 'ok', model: 'kokoro-82m' }))).toBe(true);
      expect(await isHelperHealth(res(true, { status: 'warming', model: 'kokoro-82m' }))).toBe(true);
      expect(await isHelperHealth(res(true, { status: 'ok' }))).toBe(false);
      expect(await isHelperHealth(res(true, { status: 'ok', model: 'other' }))).toBe(false);
      expect(await isHelperHealth(res(false, { status: 'ok', model: 'kokoro-82m' }))).toBe(false);
      expect(await isHelperHealth({ ok: true, json: async () => { throw new SyntaxError('not JSON'); } })).toBe(false);
    });
  });

  describe('discoverConfig() without chrome.storage (D1)', () => {
    test('returns the port it found even when saving the config fails', async () => {
      (chrome.storage.local.set as any).mockImplementation(async () => {
        throw new Error('chrome.storage is not available in this context');
      });
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes(':18250/')) {
          return { ok: true, json: async () => ({ status: 'ok', model: 'kokoro-82m' }) };
        }
        throw new TypeError('Failed to fetch');
      });

      const config = await discoverConfig([18249, 18250, 18251]);

      expect(config.port).toBe(18250);
      expect(mockFetch.mock.calls.map(call => String(call[0]))).toEqual([
        'http://127.0.0.1:18249/health',
        'http://127.0.0.1:18250/health',
      ]);
    });
  });

  describe('Configuration discovery', () => {
    test('should discover helper on default port when no config stored', async () => {
      // Mock no stored config
      (chrome.storage.local.get as any).mockResolvedValue({});

      // Mock successful health check on default port
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok', model: 'kokoro-82m', model_loaded: true, uptime_seconds: 10, requests_served: 1 }),
      });

      const result = await client.checkHealth();

      expect(result.status).toBe('ok');
      // Should have called config discovery
      expect(mockFetch).toHaveBeenCalled();
    });

    test('should try multiple ports during discovery', async () => {
      // Mock no stored config
      (chrome.storage.local.get as any).mockResolvedValue({});

      let callCount = 0;
      mockFetch.mockImplementation(async (url: string) => {
        callCount++;
        // Fail first port, succeed on second
        if (url.includes(':8249')) {
          throw new Error('Connection refused');
        }
        return {
          ok: true,
          json: async () => ({ status: 'ok', model: 'kokoro-82m', model_loaded: true, uptime_seconds: 10, requests_served: 1 }),
        };
      });

      // This will trigger discovery which tries multiple ports
      try {
        await client.checkHealth();
      } catch (e) {
        // May fail if all ports are tried
      }

      expect(callCount).toBeGreaterThan(1);
    });
  });

  describe('Singleton pattern', () => {
    test('getApiClient should return same instance', () => {
      const instance1 = getApiClient();
      const instance2 = getApiClient();

      expect(instance1).toBe(instance2);
    });

    test('resetApiClient should create new instance', () => {
      const instance1 = getApiClient();
      resetApiClient();
      const instance2 = getApiClient();

      expect(instance1).not.toBe(instance2);
    });
  });
});
