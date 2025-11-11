import { describe, test, expect, beforeEach, mock, spyOn } from 'bun:test';
import {
  ApiClient,
  getApiClient,
  resetApiClient,
} from '../src/shared/api-client';
import {
  HelperNotFoundError,
  NetworkTimeoutError,
  InvalidResponseError,
} from '../src/shared/types';

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

// Mock fetch globally
const mockFetch = mock();
global.fetch = mockFetch as any;

describe('ApiClient', () => {
  let client: ApiClient;

  beforeEach(() => {
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
    mockFetch.mockImplementation(async (url: string, options: any) => {
      if (url.includes('/health')) {
        return {
          ok: true,
          json: async () => ({ status: 'ok', model: 'test', model_loaded: true, uptime_seconds: 10, requests_served: 1 }),
        };
      }
      throw new Error('Unexpected URL in default mock');
    });
  });

  describe('checkHealth()', () => {
    test('should return health response on success', async () => {
      const healthResponse = {
        status: 'ok',
        model: 'kokoro-v0_19',
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
      mockFetch.mockImplementation(async (url: string) => {
        // First call is config verification - succeed
        // Second call (actual checkHealth) - fail with 404
        if (mockFetch.mock.calls.length === 1) {
          return {
            ok: true,
            json: async () => ({ status: 'ok', model: 'test', model_loaded: true, uptime_seconds: 10, requests_served: 1 }),
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
      mockFetch.mockImplementation(async (url: string) => {
        // First call is config verification - succeed
        // Second call (actual checkHealth) - fail with 500
        if (mockFetch.mock.calls.length === 1) {
          return {
            ok: true,
            json: async () => ({ status: 'ok', model: 'test', model_loaded: true, uptime_seconds: 10, requests_served: 1 }),
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
      mockFetch.mockImplementation(async (url: string) => {
        callCount++;
        // First call: config verification - succeed
        if (callCount === 1) {
          return {
            ok: true,
            json: async () => ({ status: 'ok', model: 'test', model_loaded: true, uptime_seconds: 10, requests_served: 1 }),
          };
        }
        // Second call: actual request - fail with network error
        if (callCount === 2) {
          throw new Error('Network error');
        }
        // Third call: retry - succeed
        return {
          ok: true,
          json: async () => ({ status: 'ok', model: 'test', model_loaded: true, uptime_seconds: 10, requests_served: 1 }),
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

      mockFetch.mockResolvedValue({
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
      mockFetch.mockResolvedValue({
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

      mockFetch.mockResolvedValue({
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

      mockFetch.mockResolvedValue({
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
        return {
          ok: true,
          blob: async () => audioBlob,
        };
      });

      await client.speak({ text: 'Hello world' });
    });
  });

  describe('Configuration discovery', () => {
    test('should discover helper on default port when no config stored', async () => {
      // Mock no stored config
      (chrome.storage.local.get as any).mockResolvedValue({});

      // Mock successful health check on default port
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok', model: 'test', model_loaded: true, uptime_seconds: 10, requests_served: 1 }),
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
          json: async () => ({ status: 'ok', model: 'test', model_loaded: true, uptime_seconds: 10, requests_served: 1 }),
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
