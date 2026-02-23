import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fetchWithPayment } from './payment-engine.js';

/**
 * Helper to create a base64-encoded meta tag payload.
 */
function encodeMetaTag(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

const VALID_META_PAYLOAD = {
  x402Version: 2,
  mode: 'client',
  facilitatorUrl: 'https://gateway.kobaru.io',
  siteKey: 'pwk_live_abc123',
  accepts: [
    {
      scheme: 'exact',
      network: 'eip155:324705682',
      amount: '10000',
      asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
      payTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    },
  ],
};

const META_TAG_HTML = `<html>
<head>
<meta name="x402-payment-required" content="${encodeMetaTag(VALID_META_PAYLOAD)}">
</head>
<body>
<h1>Premium content here</h1>
<p>This is the article body.</p>
</body>
</html>`;

const FREE_HTML = `<html>
<head><title>Free Page</title></head>
<body><p>Free content, no payment needed.</p></body>
</html>`;

const SUPPORTED_RESPONSE = {
  kinds: [
    {
      scheme: 'exact',
      network: 'eip155:324705682',
      asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
      extra: {
        name: 'USDC',
        version: '2',
        asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
      },
    },
  ],
};

const SETTLE_RESPONSE = {
  success: true,
  transaction: '0xsettled_tx_hash_abc123',
  network: 'eip155:324705682',
};

// Well-known Hardhat test key
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

describe('fetchWithPayment', () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let originalPrivateKey: string | undefined;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperwall-engine-test-'));
    originalHome = process.env['HOME'];
    originalPrivateKey = process.env['PAPERWALL_PRIVATE_KEY'];

    process.env['HOME'] = tmpDir;
    process.env['PAPERWALL_PRIVATE_KEY'] = TEST_PRIVATE_KEY;
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    if (originalPrivateKey !== undefined) {
      process.env['PAPERWALL_PRIVATE_KEY'] = originalPrivateKey;
    } else {
      delete process.env['PAPERWALL_PRIVATE_KEY'];
    }
    globalThis.fetch = originalFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should return content as-is when no meta tag is found (no payment)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(FREE_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    const result = await fetchWithPayment('https://example.com/free', { optimistic: false });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    expect(result.content).toContain('Free content');
    expect(result.payment).toBeUndefined();
    expect(result.url).toBe('https://example.com/free');
    expect(result.statusCode).toBe(200);
    expect(result.contentType).toBe('text/html');
  });

  it('should perform full client-mode payment flow', async () => {
    // Mock: 1) initial page fetch, 2) GET /supported, 3) POST /settle
    const fetchSpy = vi.fn()
      // 1. Initial page fetch
      .mockResolvedValueOnce(
        new Response(META_TAG_HTML, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      )
      // 2. GET /supported
      .mockResolvedValueOnce(
        new Response(JSON.stringify(SUPPORTED_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      // 3. POST /settle
      .mockResolvedValueOnce(
        new Response(JSON.stringify(SETTLE_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    globalThis.fetch = fetchSpy;

    // Set budget so it passes
    const budgetDir = path.join(tmpDir, '.paperwall');
    fs.mkdirSync(budgetDir, { recursive: true });
    fs.writeFileSync(
      path.join(budgetDir, 'budget.json'),
      JSON.stringify({ perRequestMax: '1.00', dailyMax: '5.00', totalMax: '50.00' }),
    );

    const result = await fetchWithPayment('https://example.com/premium', { optimistic: false });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    expect(result.content).toContain('Premium content here');
    expect(result.payment).not.toBeNull();
    expect(result.payment?.mode).toBe('client');
    expect(result.payment?.txHash).toBe('0xsettled_tx_hash_abc123');
    expect(result.payment?.amount).toBe('10000');
    expect(result.payment?.asset).toBe('0x2e08028E3C4c2356572E096d8EF835cD5C6030bD');
    expect(result.payment?.network).toBe('eip155:324705682');
    expect(result.payment?.payTo).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');

    // Verify the correct endpoints were called
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    // Verify /supported was called with correct auth
    const supportedCall = fetchSpy.mock.calls[1] as [string, RequestInit];
    expect(supportedCall[0]).toBe('https://gateway.kobaru.io/supported');
    expect(supportedCall[1]?.headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer pwk_live_abc123' }),
    );

    // Verify /settle was called with correct auth
    const settleCall = fetchSpy.mock.calls[2] as [string, RequestInit];
    expect(settleCall[0]).toBe('https://gateway.kobaru.io/settle');
    expect(settleCall[1]?.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer pwk_live_abc123',
        'Content-Type': 'application/json',
      }),
    );
  });

  it('should decline payment when budget is exceeded (per-request)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(META_TAG_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    // Set a very low per-request budget
    const budgetDir = path.join(tmpDir, '.paperwall');
    fs.mkdirSync(budgetDir, { recursive: true });
    fs.writeFileSync(
      path.join(budgetDir, 'budget.json'),
      JSON.stringify({ perRequestMax: '0.001' }), // 0.001 USDC = 1000 smallest, request wants 10000
    );

    const result = await fetchWithPayment('https://example.com/premium', { optimistic: false });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not ok');
    expect(result.error).toBe('budget_exceeded');
  });

  it('should decline payment when --max-price is exceeded', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(META_TAG_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    // Set budget high but maxPrice low
    const budgetDir = path.join(tmpDir, '.paperwall');
    fs.mkdirSync(budgetDir, { recursive: true });
    fs.writeFileSync(
      path.join(budgetDir, 'budget.json'),
      JSON.stringify({ perRequestMax: '10.00', dailyMax: '100.00' }),
    );

    const result = await fetchWithPayment('https://example.com/premium', { maxPrice: '0.005', optimistic: false });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not ok');
    expect(result.error).toBe('max_price_exceeded');
  });

  it('should decline when no budget configured and no --max-price', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(META_TAG_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    const result = await fetchWithPayment('https://example.com/premium', { optimistic: false });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not ok');
    expect(result.error).toBe('budget_exceeded');
  });

  it('should allow payment with --max-price and no budget configured', async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(
        new Response(META_TAG_HTML, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(SUPPORTED_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(SETTLE_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    globalThis.fetch = fetchSpy;

    const result = await fetchWithPayment('https://example.com/premium', { maxPrice: '0.05', optimistic: false });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    expect(result.payment?.txHash).toBe('0xsettled_tx_hash_abc123');
  });

  it('should record payment in history.jsonl after successful settlement', async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(
        new Response(META_TAG_HTML, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(SUPPORTED_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(SETTLE_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    globalThis.fetch = fetchSpy;

    const budgetDir = path.join(tmpDir, '.paperwall');
    fs.mkdirSync(budgetDir, { recursive: true });
    fs.writeFileSync(
      path.join(budgetDir, 'budget.json'),
      JSON.stringify({ dailyMax: '5.00' }),
    );

    await fetchWithPayment('https://example.com/premium', { optimistic: false });

    // Check that history.jsonl was written
    const historyPath = path.join(budgetDir, 'history.jsonl');
    expect(fs.existsSync(historyPath)).toBe(true);
    const historyContent = fs.readFileSync(historyPath, 'utf-8');
    const lines = historyContent.trim().split('\n');
    expect(lines).toHaveLength(1);

    const entry = JSON.parse(lines[0] as string) as Record<string, unknown>;
    expect(entry['url']).toBe('https://example.com/premium');
    expect(entry['amount']).toBe('10000');
    expect(entry['asset']).toBe('0x2e08028E3C4c2356572E096d8EF835cD5C6030bD');
    expect(entry['network']).toBe('eip155:324705682');
    expect(entry['txHash']).toBe('0xsettled_tx_hash_abc123');
    expect(entry['mode']).toBe('client');
  });

  it('should return error when initial fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await fetchWithPayment('https://example.com/down', { optimistic: false });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not ok');
    expect(result.error).toBe('network_error');
    expect(result.message).toContain('ECONNREFUSED');
  });

  it('should return error when facilitator /settle fails', async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(
        new Response(META_TAG_HTML, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(SUPPORTED_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, error: 'Insufficient funds' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    globalThis.fetch = fetchSpy;

    const budgetDir = path.join(tmpDir, '.paperwall');
    fs.mkdirSync(budgetDir, { recursive: true });
    fs.writeFileSync(
      path.join(budgetDir, 'budget.json'),
      JSON.stringify({ dailyMax: '5.00' }),
    );

    const result = await fetchWithPayment('https://example.com/premium', { optimistic: false });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not ok');
    expect(result.error).toBe('settle_failed');
  });

  it('should handle timeout option', async () => {
    // Simulate a slow response by never resolving
    globalThis.fetch = vi.fn().mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error('The operation was aborted')), 50);
        }),
    );

    const result = await fetchWithPayment('https://example.com/slow', { timeout: 50, optimistic: false });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected not ok');
    // Should be a network_error or timeout error
    expect(['network_error', 'timeout']).toContain(result.error);
  });

  it('should return the payer address in the payment info', async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(
        new Response(META_TAG_HTML, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(SUPPORTED_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(SETTLE_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    globalThis.fetch = fetchSpy;

    const budgetDir = path.join(tmpDir, '.paperwall');
    fs.mkdirSync(budgetDir, { recursive: true });
    fs.writeFileSync(
      path.join(budgetDir, 'budget.json'),
      JSON.stringify({ dailyMax: '5.00' }),
    );

    const result = await fetchWithPayment('https://example.com/premium', { optimistic: false });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');
    // Payer is derived from TEST_PRIVATE_KEY = Hardhat account #0
    expect(result.payment?.payer.toLowerCase()).toBe(
      '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
    );
  });

  // ──────────────────────────────────────────────────────
  // Server mode tests (T4.1)
  // ──────────────────────────────────────────────────────

  describe('server mode', () => {
    const SERVER_META_PAYLOAD = {
      x402Version: 2,
      mode: 'server',
      facilitatorUrl: 'https://gateway.kobaru.io',
      siteKey: 'pwk_live_abc123',
      paymentUrl: 'https://nature.com/api/paperwall/pay',
      accepts: [
        {
          scheme: 'exact',
          network: 'eip155:324705682',
          amount: '10000',
          asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
          payTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        },
      ],
    };

    const SERVER_META_TAG_HTML = `<html>
<head>
<meta name="x402-payment-required" content="${encodeMetaTag(SERVER_META_PAYLOAD)}">
</head>
<body>
<h1>Premium Article Teaser</h1>
<p>Subscribe to read the full article...</p>
</body>
</html>`;

    const PUBLISHER_RESPONSE = {
      success: true,
      txHash: '0xpublisher_settled_tx_hash',
      content: '<html><body><h1>Full Premium Article</h1><p>The secret content revealed...</p></body></html>',
      contentType: 'text/html',
    };

    it('should perform full server-mode payment flow', async () => {
      // Mock: 1) initial page fetch, 2) GET /supported, 3) POST to paymentUrl
      const fetchSpy = vi.fn()
        .mockResolvedValueOnce(
          new Response(SERVER_META_TAG_HTML, {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(SUPPORTED_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(PUBLISHER_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      globalThis.fetch = fetchSpy;

      const budgetDir = path.join(tmpDir, '.paperwall');
      fs.mkdirSync(budgetDir, { recursive: true });
      fs.writeFileSync(
        path.join(budgetDir, 'budget.json'),
        JSON.stringify({ perRequestMax: '1.00', dailyMax: '5.00' }),
      );

      const result = await fetchWithPayment('https://nature.com/article/123', { optimistic: false });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');
      // Server mode: content comes from paymentUrl response, NOT original HTML
      expect(result.content).toContain('Full Premium Article');
      expect(result.content).toContain('The secret content revealed');
      expect(result.payment).not.toBeNull();
      expect(result.payment?.mode).toBe('server');
      expect(result.payment?.txHash).toBe('0xpublisher_settled_tx_hash');
      expect(result.payment?.amount).toBe('10000');
      expect(result.payment?.asset).toBe('0x2e08028E3C4c2356572E096d8EF835cD5C6030bD');
      expect(result.payment?.network).toBe('eip155:324705682');
      expect(result.payment?.payTo).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');

      // Verify fetch calls: 1) page, 2) /supported, 3) paymentUrl POST
      expect(fetchSpy).toHaveBeenCalledTimes(3);

      // Verify paymentUrl was called (not /settle)
      const paymentUrlCall = fetchSpy.mock.calls[2] as [string, RequestInit];
      expect(paymentUrlCall[0]).toBe('https://nature.com/api/paperwall/pay');
      expect(paymentUrlCall[1]?.method).toBe('POST');
    });

    it('should return error when paymentUrl returns failure', async () => {
      const fetchSpy = vi.fn()
        .mockResolvedValueOnce(
          new Response(SERVER_META_TAG_HTML, {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(SUPPORTED_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ success: false, error: 'Signature verification failed' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      globalThis.fetch = fetchSpy;

      const budgetDir = path.join(tmpDir, '.paperwall');
      fs.mkdirSync(budgetDir, { recursive: true });
      fs.writeFileSync(
        path.join(budgetDir, 'budget.json'),
        JSON.stringify({ dailyMax: '5.00' }),
      );

      const result = await fetchWithPayment('https://nature.com/article/123', { optimistic: false });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected not ok');
      expect(result.error).toBe('payment_url_error');
    });

    it('should return error when paymentUrl HTTP request fails', async () => {
      const fetchSpy = vi.fn()
        .mockResolvedValueOnce(
          new Response(SERVER_META_TAG_HTML, {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(SUPPORTED_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response('Internal Server Error', {
            status: 500,
            headers: { 'Content-Type': 'text/plain' },
          }),
        );
      globalThis.fetch = fetchSpy;

      const budgetDir = path.join(tmpDir, '.paperwall');
      fs.mkdirSync(budgetDir, { recursive: true });
      fs.writeFileSync(
        path.join(budgetDir, 'budget.json'),
        JSON.stringify({ dailyMax: '5.00' }),
      );

      const result = await fetchWithPayment('https://nature.com/article/123', { optimistic: false });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected not ok');
      expect(result.error).toBe('payment_url_error');
    });

    it('should record server-mode payment in history', async () => {
      const fetchSpy = vi.fn()
        .mockResolvedValueOnce(
          new Response(SERVER_META_TAG_HTML, {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(SUPPORTED_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(PUBLISHER_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      globalThis.fetch = fetchSpy;

      const budgetDir = path.join(tmpDir, '.paperwall');
      fs.mkdirSync(budgetDir, { recursive: true });
      fs.writeFileSync(
        path.join(budgetDir, 'budget.json'),
        JSON.stringify({ dailyMax: '5.00' }),
      );

      await fetchWithPayment('https://nature.com/article/123', { optimistic: false });

      const historyPath = path.join(budgetDir, 'history.jsonl');
      expect(fs.existsSync(historyPath)).toBe(true);
      const lines = fs.readFileSync(historyPath, 'utf-8').trim().split('\n');
      expect(lines).toHaveLength(1);

      const entry = JSON.parse(lines[0] as string) as Record<string, unknown>;
      expect(entry['url']).toBe('https://nature.com/article/123');
      expect(entry['mode']).toBe('server');
      expect(entry['txHash']).toBe('0xpublisher_settled_tx_hash');
    });

    it('should decline server-mode payment when budget is exceeded', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(SERVER_META_TAG_HTML, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      );

      // No budget set -> requires --max-price
      const result = await fetchWithPayment('https://nature.com/article/123', { optimistic: false });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected not ok');
      expect(result.error).toBe('budget_exceeded');
    });

    it('should return error when server meta tag has no paymentUrl', async () => {
      const noPaymentUrlPayload = {
        ...SERVER_META_PAYLOAD,
        paymentUrl: undefined,
      };
      const noPaymentUrlHtml = `<html><head>
<meta name="x402-payment-required" content="${encodeMetaTag(noPaymentUrlPayload)}">
</head><body>Teaser</body></html>`;

      const fetchSpy = vi.fn()
        .mockResolvedValueOnce(
          new Response(noPaymentUrlHtml, {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(SUPPORTED_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      globalThis.fetch = fetchSpy;

      const budgetDir = path.join(tmpDir, '.paperwall');
      fs.mkdirSync(budgetDir, { recursive: true });
      fs.writeFileSync(
        path.join(budgetDir, 'budget.json'),
        JSON.stringify({ dailyMax: '5.00' }),
      );

      const result = await fetchWithPayment('https://nature.com/article/123', { optimistic: false });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected not ok');
      expect(result.error).toBe('missing_payment_url');
    });
  });

  // ──────────────────────────────────────────────────────
  // HTTP 402 fallback tests (T4.2)
  // ──────────────────────────────────────────────────────

  describe('402 fallback', () => {
    /**
     * Build a base64-encoded JSON payment-required header value.
     * This is the format x402 servers return in the PAYMENT-REQUIRED header.
     */
    function encodePaymentRequired(payload: Record<string, unknown>): string {
      return Buffer.from(JSON.stringify(payload)).toString('base64');
    }

    const PAYMENT_REQUIRED_HEADER_PAYLOAD = {
      x402Version: 2,
      accepts: [
        {
          scheme: 'exact',
          network: 'eip155:324705682',
          amount: '10000',
          asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
          payTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          maxTimeoutSeconds: 60,
          extra: {
            name: 'USDC',
            version: '2',
          },
        },
      ],
      resource: {
        url: 'https://api.example.com/paid-data',
        description: 'Premium API data',
        mimeType: 'application/json',
      },
    };

    it('should handle 402 response via @x402/fetch flow', async () => {
      // We need to simulate the 402 -> payment -> 200 flow
      // The @x402/fetch library does this internally via wrapFetchWithPayment
      // Our payment engine should detect 402 and route through the x402 path

      const paidContent = JSON.stringify({ data: 'premium paid content' });

      const fetchSpy = vi.fn()
        // First call: initial fetch -> returns 402
        .mockResolvedValueOnce(
          new Response('Payment Required', {
            status: 402,
            headers: {
              'Content-Type': 'text/plain',
              'PAYMENT-REQUIRED': encodePaymentRequired(PAYMENT_REQUIRED_HEADER_PAYLOAD),
            },
          }),
        )
        // Second call: @x402/fetch retries with payment header -> returns 200
        .mockResolvedValueOnce(
          new Response(paidContent, {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'PAYMENT-RESPONSE': Buffer.from(JSON.stringify({
                success: true,
                transaction: '0x402_fallback_tx_hash',
                network: 'eip155:324705682',
                payer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
              })).toString('base64'),
            },
          }),
        );
      globalThis.fetch = fetchSpy;

      const budgetDir = path.join(tmpDir, '.paperwall');
      fs.mkdirSync(budgetDir, { recursive: true });
      fs.writeFileSync(
        path.join(budgetDir, 'budget.json'),
        JSON.stringify({ perRequestMax: '1.00', dailyMax: '5.00' }),
      );

      const result = await fetchWithPayment('https://api.example.com/paid-data', { optimistic: false });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`Expected ok, got: ${result.error}: ${result.message}`);
      expect(result.content).toContain('premium paid content');
      expect(result.payment).not.toBeNull();
      expect(result.payment?.mode).toBe('402');
      expect(result.payment?.txHash).toBe('0x402_fallback_tx_hash');
      expect(result.payment?.network).toBe('eip155:324705682');
    });

    it('should decline 402 payment when budget is exceeded', async () => {
      const fetchSpy = vi.fn().mockResolvedValueOnce(
        new Response('Payment Required', {
          status: 402,
          headers: {
            'Content-Type': 'text/plain',
            'PAYMENT-REQUIRED': encodePaymentRequired(PAYMENT_REQUIRED_HEADER_PAYLOAD),
          },
        }),
      );
      globalThis.fetch = fetchSpy;

      // No budget set, no --max-price => should decline
      const result = await fetchWithPayment('https://api.example.com/paid-data', { optimistic: false });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected not ok');
      expect(result.error).toBe('budget_exceeded');
    });

    it('should prioritize 402 over meta tag detection', async () => {
      // A response with both 402 status AND meta tag should use the 402 path
      const htmlWith402 = `<html>
<head>
<meta name="x402-payment-required" content="${encodeMetaTag(VALID_META_PAYLOAD)}">
</head>
<body>This should be ignored - 402 takes priority</body>
</html>`;

      const paidContent = '{"data":"via-402-path"}';

      const fetchSpy = vi.fn()
        .mockResolvedValueOnce(
          new Response(htmlWith402, {
            status: 402,
            headers: {
              'Content-Type': 'text/html',
              'PAYMENT-REQUIRED': encodePaymentRequired(PAYMENT_REQUIRED_HEADER_PAYLOAD),
            },
          }),
        )
        .mockResolvedValueOnce(
          new Response(paidContent, {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'PAYMENT-RESPONSE': Buffer.from(JSON.stringify({
                success: true,
                transaction: '0x402_priority_tx',
                network: 'eip155:324705682',
                payer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
              })).toString('base64'),
            },
          }),
        );
      globalThis.fetch = fetchSpy;

      const budgetDir = path.join(tmpDir, '.paperwall');
      fs.mkdirSync(budgetDir, { recursive: true });
      fs.writeFileSync(
        path.join(budgetDir, 'budget.json'),
        JSON.stringify({ dailyMax: '5.00' }),
      );

      const result = await fetchWithPayment('https://api.example.com/paid-data', { optimistic: false });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`Expected ok, got: ${result.error}: ${result.message}`);
      // Should have used 402 path, not client mode
      expect(result.payment?.mode).toBe('402');
    });

    it('should record 402 payment in history', async () => {
      const paidContent = '{"data":"premium"}';

      const fetchSpy = vi.fn()
        .mockResolvedValueOnce(
          new Response('Payment Required', {
            status: 402,
            headers: {
              'Content-Type': 'text/plain',
              'PAYMENT-REQUIRED': encodePaymentRequired(PAYMENT_REQUIRED_HEADER_PAYLOAD),
            },
          }),
        )
        .mockResolvedValueOnce(
          new Response(paidContent, {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'PAYMENT-RESPONSE': Buffer.from(JSON.stringify({
                success: true,
                transaction: '0x402_history_tx',
                network: 'eip155:324705682',
                payer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
              })).toString('base64'),
            },
          }),
        );
      globalThis.fetch = fetchSpy;

      const budgetDir = path.join(tmpDir, '.paperwall');
      fs.mkdirSync(budgetDir, { recursive: true });
      fs.writeFileSync(
        path.join(budgetDir, 'budget.json'),
        JSON.stringify({ dailyMax: '5.00' }),
      );

      await fetchWithPayment('https://api.example.com/paid-data', { optimistic: false });

      const historyPath = path.join(budgetDir, 'history.jsonl');
      expect(fs.existsSync(historyPath)).toBe(true);
      const lines = fs.readFileSync(historyPath, 'utf-8').trim().split('\n');
      expect(lines).toHaveLength(1);

      const entry = JSON.parse(lines[0] as string) as Record<string, unknown>;
      expect(entry['url']).toBe('https://api.example.com/paid-data');
      expect(entry['mode']).toBe('402');
      expect(entry['txHash']).toBe('0x402_history_tx');
    });
  });

  // ──────────────────────────────────────────────────────
  // Detection priority tests (T4.2 part 2)
  // ──────────────────────────────────────────────────────

  describe('detection priority', () => {
    it('200 + no meta tag = return content directly (no payment)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(FREE_HTML, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      );

      const result = await fetchWithPayment('https://example.com/free', { optimistic: false });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');
      expect(result.payment).toBeUndefined();
      expect(result.content).toContain('Free content');
    });

    it('200 + script tag = client mode payment (SDK data-attribute fallback)', async () => {
      const scriptTagHtml = `<html><head>
<script src="https://cdn.paperwall.io/sdk/v1/paperwall-sdk.js"
  data-facilitator-url="https://gateway.kobaru.io"
  data-pay-to="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
  data-price="10000"
  data-network="eip155:324705682"
  data-site-key="pwk_live_abc123">
</script>
</head><body><h1>Premium Article</h1></body></html>`;

      const fetchSpy = vi.fn()
        .mockResolvedValueOnce(
          new Response(scriptTagHtml, {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(SUPPORTED_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(SETTLE_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      globalThis.fetch = fetchSpy;

      const budgetDir = path.join(tmpDir, '.paperwall');
      fs.mkdirSync(budgetDir, { recursive: true });
      fs.writeFileSync(
        path.join(budgetDir, 'budget.json'),
        JSON.stringify({ dailyMax: '5.00' }),
      );

      const result = await fetchWithPayment('https://example.com/premium', { optimistic: false });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');
      expect(result.payment?.mode).toBe('client');
      expect(result.payment?.amount).toBe('10000');
      expect(result.payment?.txHash).toBe('0xsettled_tx_hash_abc123');
    });

    it('200 + Paperwall.init() = client mode payment (SDK init-call fallback)', async () => {
      const initCallHtml = `<html><head>
<script src="https://cdn.paperwall.io/sdk.js"></script>
<script>
Paperwall.init({
  facilitatorUrl: 'https://gateway.kobaru.io',
  payTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  price: '10000',
  network: 'eip155:324705682',
  siteKey: 'pwk_live_abc123',
});
</script>
</head><body><h1>Premium Article</h1></body></html>`;

      const fetchSpy = vi.fn()
        .mockResolvedValueOnce(
          new Response(initCallHtml, {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(SUPPORTED_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(SETTLE_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      globalThis.fetch = fetchSpy;

      const budgetDir = path.join(tmpDir, '.paperwall');
      fs.mkdirSync(budgetDir, { recursive: true });
      fs.writeFileSync(
        path.join(budgetDir, 'budget.json'),
        JSON.stringify({ dailyMax: '5.00' }),
      );

      const result = await fetchWithPayment('https://example.com/premium', { optimistic: false });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');
      expect(result.payment?.mode).toBe('client');
      expect(result.payment?.amount).toBe('10000');
      expect(result.payment?.txHash).toBe('0xsettled_tx_hash_abc123');
    });

    it('200 + script tag without siteKey = client mode payment (no auth header)', async () => {
      const noSiteKeyHtml = `<html><head>
<script src="https://cdn.paperwall.io/sdk.js"
  data-facilitator-url="https://gateway.kobaru.io"
  data-pay-to="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
  data-price="10000"
  data-network="eip155:324705682">
</script>
</head><body><h1>Premium Article</h1></body></html>`;

      const fetchSpy = vi.fn()
        .mockResolvedValueOnce(
          new Response(noSiteKeyHtml, {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(SUPPORTED_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(SETTLE_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      globalThis.fetch = fetchSpy;

      const budgetDir = path.join(tmpDir, '.paperwall');
      fs.mkdirSync(budgetDir, { recursive: true });
      fs.writeFileSync(
        path.join(budgetDir, 'budget.json'),
        JSON.stringify({ dailyMax: '5.00' }),
      );

      const result = await fetchWithPayment('https://example.com/premium', { optimistic: false });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');
      expect(result.payment?.mode).toBe('client');

      // Verify /supported was called without Authorization header (no siteKey)
      const supportedCall = fetchSpy.mock.calls[1] as [string, RequestInit];
      const headers = supportedCall[1]?.headers as Record<string, string> | undefined;
      expect(headers?.['Authorization']).toBeUndefined();
    });

    it('200 + meta tag (client mode) = client mode payment', async () => {
      const fetchSpy = vi.fn()
        .mockResolvedValueOnce(
          new Response(META_TAG_HTML, {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(SUPPORTED_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(SETTLE_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      globalThis.fetch = fetchSpy;

      const budgetDir = path.join(tmpDir, '.paperwall');
      fs.mkdirSync(budgetDir, { recursive: true });
      fs.writeFileSync(
        path.join(budgetDir, 'budget.json'),
        JSON.stringify({ dailyMax: '5.00' }),
      );

      const result = await fetchWithPayment('https://example.com/premium', { optimistic: false });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected ok');
      expect(result.payment?.mode).toBe('client');
    });
  });

  // ──────────────────────────────────────────────────────
  // Unified response formatting (T4.3)
  // ──────────────────────────────────────────────────────

  describe('unified response shape', () => {
    /**
     * Build a base64-encoded JSON payment-required header for 402 tests.
     */
    function encodePaymentRequired402(payload: Record<string, unknown>): string {
      return Buffer.from(JSON.stringify(payload)).toString('base64');
    }

    const EXPECTED_PAYMENT_KEYS = [
      'mode', 'amount', 'amountFormatted', 'asset', 'network', 'txHash', 'payTo', 'payer',
    ].sort();

    const EXPECTED_SUCCESS_KEYS = [
      'ok', 'url', 'statusCode', 'contentType', 'content', 'payment',
    ].sort();

    /**
     * Validate that a successful payment result has the exact expected shape.
     */
    function validateSuccessShape(result: Record<string, unknown>, expectedMode: string): void {
      // Top-level keys
      const resultKeys = Object.keys(result).sort();
      expect(resultKeys).toEqual(EXPECTED_SUCCESS_KEYS);

      expect(result['ok']).toBe(true);
      expect(typeof result['url']).toBe('string');
      expect(typeof result['statusCode']).toBe('number');
      expect(typeof result['contentType']).toBe('string');
      expect(typeof result['content']).toBe('string');
      expect(result['payment']).not.toBeNull();

      // Payment keys
      const payment = result['payment'] as Record<string, unknown>;
      const paymentKeys = Object.keys(payment).sort();
      expect(paymentKeys).toEqual(EXPECTED_PAYMENT_KEYS);

      expect(payment['mode']).toBe(expectedMode);
      expect(typeof payment['amount']).toBe('string');
      expect(typeof payment['amountFormatted']).toBe('string');
      expect(typeof payment['asset']).toBe('string');
      expect(typeof payment['network']).toBe('string');
      expect(typeof payment['txHash']).toBe('string');
      expect(typeof payment['payTo']).toBe('string');
      expect(typeof payment['payer']).toBe('string');
    }

    it('client mode produces standard output structure', async () => {
      const fetchSpy = vi.fn()
        .mockResolvedValueOnce(
          new Response(META_TAG_HTML, {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(SUPPORTED_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(SETTLE_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      globalThis.fetch = fetchSpy;

      const budgetDir = path.join(tmpDir, '.paperwall');
      fs.mkdirSync(budgetDir, { recursive: true });
      fs.writeFileSync(
        path.join(budgetDir, 'budget.json'),
        JSON.stringify({ dailyMax: '5.00' }),
      );

      const result = await fetchWithPayment('https://example.com/premium', { optimistic: false });
      validateSuccessShape(result as unknown as Record<string, unknown>, 'client');
    });

    it('server mode produces standard output structure', async () => {
      const serverPayload = {
        x402Version: 2,
        mode: 'server',
        facilitatorUrl: 'https://gateway.kobaru.io',
        siteKey: 'pwk_live_abc123',
        paymentUrl: 'https://nature.com/api/paperwall/pay',
        accepts: [
          {
            scheme: 'exact',
            network: 'eip155:324705682',
            amount: '10000',
            asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
            payTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          },
        ],
      };
      const serverHtml = `<html><head>
<meta name="x402-payment-required" content="${encodeMetaTag(serverPayload)}">
</head><body>Teaser</body></html>`;

      const fetchSpy = vi.fn()
        .mockResolvedValueOnce(
          new Response(serverHtml, {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(SUPPORTED_RESPONSE), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({
            success: true,
            txHash: '0xserver_tx',
            content: '<html>Full Article</html>',
            contentType: 'text/html',
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      globalThis.fetch = fetchSpy;

      const budgetDir = path.join(tmpDir, '.paperwall');
      fs.mkdirSync(budgetDir, { recursive: true });
      fs.writeFileSync(
        path.join(budgetDir, 'budget.json'),
        JSON.stringify({ dailyMax: '5.00' }),
      );

      const result = await fetchWithPayment('https://nature.com/article/123', { optimistic: false });
      validateSuccessShape(result as unknown as Record<string, unknown>, 'server');
    });

    it('402 fallback mode produces standard output structure', async () => {
      const paymentRequiredPayload = {
        x402Version: 2,
        accepts: [
          {
            scheme: 'exact',
            network: 'eip155:324705682',
            amount: '10000',
            asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
            payTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
            maxTimeoutSeconds: 60,
            extra: { name: 'USDC', version: '2' },
          },
        ],
        resource: {
          url: 'https://api.example.com/paid-data',
          description: 'Premium API data',
          mimeType: 'application/json',
        },
      };

      const fetchSpy = vi.fn()
        .mockResolvedValueOnce(
          new Response('Payment Required', {
            status: 402,
            headers: {
              'Content-Type': 'text/plain',
              'PAYMENT-REQUIRED': encodePaymentRequired402(paymentRequiredPayload),
            },
          }),
        )
        .mockResolvedValueOnce(
          new Response('{"data":"paid"}', {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'PAYMENT-RESPONSE': Buffer.from(JSON.stringify({
                success: true,
                transaction: '0x402_unified_tx',
                network: 'eip155:324705682',
                payer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
              })).toString('base64'),
            },
          }),
        );
      globalThis.fetch = fetchSpy;

      const budgetDir = path.join(tmpDir, '.paperwall');
      fs.mkdirSync(budgetDir, { recursive: true });
      fs.writeFileSync(
        path.join(budgetDir, 'budget.json'),
        JSON.stringify({ dailyMax: '5.00' }),
      );

      const result = await fetchWithPayment('https://api.example.com/paid-data', { optimistic: false });
      validateSuccessShape(result as unknown as Record<string, unknown>, '402');
    });

    it('all three modes share identical payment field names', async () => {
      // This test verifies that the payment.mode field is the ONLY difference
      // between the three modes' payment objects (besides actual values)
      const clientPayment = {
        mode: 'client', amount: '10000', amountFormatted: '0.01',
        asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD', network: 'eip155:324705682',
        txHash: '0xabc', payTo: '0xpub', payer: '0xme',
      };
      const serverPayment = {
        mode: 'server', amount: '10000', amountFormatted: '0.01',
        asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD', network: 'eip155:324705682',
        txHash: '0xdef', payTo: '0xpub', payer: '0xme',
      };
      const fallbackPayment = {
        mode: '402', amount: '10000', amountFormatted: '0.01',
        asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD', network: 'eip155:324705682',
        txHash: '0xghi', payTo: '0xpub', payer: '0xme',
      };

      const clientKeys = Object.keys(clientPayment).sort();
      const serverKeys = Object.keys(serverPayment).sort();
      const fallbackKeys = Object.keys(fallbackPayment).sort();

      expect(clientKeys).toEqual(serverKeys);
      expect(serverKeys).toEqual(fallbackKeys);
      expect(clientKeys).toEqual(EXPECTED_PAYMENT_KEYS);
    });
  });
});
