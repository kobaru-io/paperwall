import { describe, it, expect } from 'vitest';
import { parseMetaTag, parseScriptTag, parseInitCall } from './meta-tag.js';

/**
 * Helper to create a valid meta tag payload and encode it as base64.
 */
function makeMetaTagHtml(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString('base64');
  return `<html><head><meta name="x402-payment-required" content="${b64}"></head><body>Hello</body></html>`;
}

const VALID_PAYLOAD = {
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
      payTo: '0x1234567890abcdef1234567890abcdef12345678',
    },
  ],
};

describe('parseMetaTag', () => {
  it('should parse a valid client-mode meta tag', () => {
    const html = makeMetaTagHtml(VALID_PAYLOAD);
    const result = parseMetaTag(html);

    expect(result).not.toBeNull();
    expect(result?.x402Version).toBe(2);
    expect(result?.mode).toBe('client');
    expect(result?.facilitatorUrl).toBe('https://gateway.kobaru.io');
    expect(result?.siteKey).toBe('pwk_live_abc123');
    expect(result?.accepts).toHaveLength(1);
    expect(result?.accepts[0]?.scheme).toBe('exact');
    expect(result?.accepts[0]?.network).toBe('eip155:324705682');
    expect(result?.accepts[0]?.amount).toBe('10000');
    expect(result?.accepts[0]?.asset).toBe('0x2e08028E3C4c2356572E096d8EF835cD5C6030bD');
    expect(result?.accepts[0]?.payTo).toBe('0x1234567890abcdef1234567890abcdef12345678');
  });

  it('should parse a valid server-mode meta tag with paymentUrl', () => {
    const payload = {
      ...VALID_PAYLOAD,
      mode: 'server',
      paymentUrl: 'https://nature.com/api/paperwall/pay',
    };
    const html = makeMetaTagHtml(payload);
    const result = parseMetaTag(html);

    expect(result).not.toBeNull();
    expect(result?.mode).toBe('server');
    expect(result?.paymentUrl).toBe('https://nature.com/api/paperwall/pay');
  });

  it('should return null when no meta tag is present', () => {
    const html = '<html><head><title>No payment</title></head><body>Free content</body></html>';
    const result = parseMetaTag(html);
    expect(result).toBeNull();
  });

  it('should return null for malformed base64 content', () => {
    const html = '<html><head><meta name="x402-payment-required" content="!!!not-base64!!!"></head></html>';
    const result = parseMetaTag(html);
    expect(result).toBeNull();
  });

  it('should return null when x402Version is not 2', () => {
    const payload = { ...VALID_PAYLOAD, x402Version: 1 };
    const html = makeMetaTagHtml(payload);
    const result = parseMetaTag(html);
    expect(result).toBeNull();
  });

  it('should return null when mode is missing', () => {
    const { mode: _mode, ...rest } = VALID_PAYLOAD;
    const html = makeMetaTagHtml(rest);
    const result = parseMetaTag(html);
    expect(result).toBeNull();
  });

  it('should return null when facilitatorUrl is missing', () => {
    const { facilitatorUrl: _f, ...rest } = VALID_PAYLOAD;
    const html = makeMetaTagHtml(rest);
    const result = parseMetaTag(html);
    expect(result).toBeNull();
  });

  it('should parse successfully when siteKey is missing (optional)', () => {
    const { siteKey: _s, ...rest } = VALID_PAYLOAD;
    const html = makeMetaTagHtml(rest);
    const result = parseMetaTag(html);
    expect(result).not.toBeNull();
    expect(result?.siteKey).toBeUndefined();
    expect(result?.facilitatorUrl).toBe('https://gateway.kobaru.io');
  });

  it('should return null when accepts array is empty', () => {
    const payload = { ...VALID_PAYLOAD, accepts: [] };
    const html = makeMetaTagHtml(payload);
    const result = parseMetaTag(html);
    expect(result).toBeNull();
  });

  it('should return null when accepts[0] is missing required fields', () => {
    const payload = {
      ...VALID_PAYLOAD,
      accepts: [{ scheme: 'exact', network: 'eip155:324705682' }],
    };
    const html = makeMetaTagHtml(payload);
    const result = parseMetaTag(html);
    expect(result).toBeNull();
  });

  it('should handle meta tag with extra attributes in the tag', () => {
    const json = JSON.stringify(VALID_PAYLOAD);
    const b64 = Buffer.from(json).toString('base64');
    const html = `<html><head><meta name="x402-payment-required" data-extra="foo" content="${b64}"></head></html>`;
    // The regex expects name before content, so extra attrs between them should not match the simple regex.
    // But the alternate regex approach handles name+content in any order.
    // Per spec, the regex is: /<meta\s+name=["']x402-payment-required["']\s+content=["']([^"']+)["']/i
    // So extra attrs between name and content break the match — this should return null
    // unless we use a more permissive regex. Per the task spec, use the strict regex.
    const result = parseMetaTag(html);
    // The strict regex requires name immediately followed by content — extra attrs break the match
    expect(result).toBeNull();
  });

  it('should handle meta tag with content before name (reverse order)', () => {
    const json = JSON.stringify(VALID_PAYLOAD);
    const b64 = Buffer.from(json).toString('base64');
    const html = `<html><head><meta content="${b64}" name="x402-payment-required"></head></html>`;
    const result = parseMetaTag(html);
    // The strict regex requires name before content — reversed order won't match
    expect(result).toBeNull();
  });

  it('should be case-insensitive for the meta tag name', () => {
    const json = JSON.stringify(VALID_PAYLOAD);
    const b64 = Buffer.from(json).toString('base64');
    const html = `<html><head><META NAME="X402-Payment-Required" CONTENT="${b64}"></head></html>`;
    const result = parseMetaTag(html);
    expect(result).not.toBeNull();
    expect(result?.x402Version).toBe(2);
  });

  it('should handle single quotes in meta tag attributes', () => {
    const json = JSON.stringify(VALID_PAYLOAD);
    const b64 = Buffer.from(json).toString('base64');
    const html = `<html><head><meta name='x402-payment-required' content='${b64}'></head></html>`;
    const result = parseMetaTag(html);
    expect(result).not.toBeNull();
    expect(result?.x402Version).toBe(2);
  });

  it('should return null for non-JSON base64 content', () => {
    const b64 = Buffer.from('this is not json').toString('base64');
    const html = `<html><head><meta name="x402-payment-required" content="${b64}"></head></html>`;
    const result = parseMetaTag(html);
    expect(result).toBeNull();
  });

  it('should return null for invalid mode value', () => {
    const payload = { ...VALID_PAYLOAD, mode: 'unknown' };
    const html = makeMetaTagHtml(payload);
    const result = parseMetaTag(html);
    expect(result).toBeNull();
  });

  it('should return null when asset is not a valid Ethereum address', () => {
    const payload = {
      ...VALID_PAYLOAD,
      accepts: [
        {
          ...VALID_PAYLOAD.accepts[0],
          asset: 'USDC',
        },
      ],
    };
    const html = makeMetaTagHtml(payload);
    const result = parseMetaTag(html);
    expect(result).toBeNull();
  });
});

// -- parseScriptTag Tests ---

const VALID_SCRIPT_TAG = `<html><head>
<script src="https://cdn.paperwall.io/sdk/v1/paperwall-sdk.js"
  data-facilitator-url="https://gateway.kobaru.io"
  data-pay-to="0x1234567890abcdef1234567890abcdef12345678"
  data-price="10000"
  data-network="eip155:324705682"
  data-site-key="pwk_live_abc123">
</script>
</head><body>Content</body></html>`;

describe('parseScriptTag', () => {
  it('should parse a valid script tag with all attributes', () => {
    const result = parseScriptTag(VALID_SCRIPT_TAG);

    expect(result).not.toBeNull();
    expect(result?.x402Version).toBe(2);
    expect(result?.mode).toBe('client');
    expect(result?.facilitatorUrl).toBe('https://gateway.kobaru.io');
    expect(result?.siteKey).toBe('pwk_live_abc123');
    expect(result?.accepts).toHaveLength(1);
    expect(result?.accepts[0]?.network).toBe('eip155:324705682');
    expect(result?.accepts[0]?.amount).toBe('10000');
    expect(result?.accepts[0]?.asset).toBeUndefined();
    expect(result?.accepts[0]?.payTo).toBe('0x1234567890abcdef1234567890abcdef12345678');
  });

  it('should handle CDN-style src URL', () => {
    const html = `<script src="https://unpkg.com/@paperwall/sdk/dist/index.iife.js"
      data-facilitator-url="https://gateway.kobaru.io"
      data-pay-to="0x1234567890abcdef1234567890abcdef12345678"
      data-price="5000"
      data-network="eip155:324705682">
    </script>`;
    const result = parseScriptTag(html);
    expect(result).not.toBeNull();
    expect(result?.accepts[0]?.amount).toBe('5000');
  });

  it('should handle single-quoted attributes', () => {
    const html = `<script src='https://cdn.paperwall.io/sdk.js'
      data-facilitator-url='https://gateway.kobaru.io'
      data-pay-to='0x1234567890abcdef1234567890abcdef12345678'
      data-price='10000'
      data-network='eip155:324705682'>
    </script>`;
    const result = parseScriptTag(html);
    expect(result).not.toBeNull();
    expect(result?.accepts[0]?.amount).toBe('10000');
  });

  it('should return null when data-facilitator-url is missing', () => {
    const html = `<script src="https://cdn.paperwall.io/sdk.js"
      data-pay-to="0x1234567890abcdef1234567890abcdef12345678"
      data-price="10000"
      data-network="eip155:324705682">
    </script>`;
    expect(parseScriptTag(html)).toBeNull();
  });

  it('should return null when data-pay-to is missing', () => {
    const html = `<script src="https://cdn.paperwall.io/sdk.js"
      data-facilitator-url="https://gateway.kobaru.io"
      data-price="10000"
      data-network="eip155:324705682">
    </script>`;
    expect(parseScriptTag(html)).toBeNull();
  });

  it('should return null when data-price is missing', () => {
    const html = `<script src="https://cdn.paperwall.io/sdk.js"
      data-facilitator-url="https://gateway.kobaru.io"
      data-pay-to="0x1234567890abcdef1234567890abcdef12345678"
      data-network="eip155:324705682">
    </script>`;
    expect(parseScriptTag(html)).toBeNull();
  });

  it('should return null when data-network is missing', () => {
    const html = `<script src="https://cdn.paperwall.io/sdk.js"
      data-facilitator-url="https://gateway.kobaru.io"
      data-pay-to="0x1234567890abcdef1234567890abcdef12345678"
      data-price="10000">
    </script>`;
    expect(parseScriptTag(html)).toBeNull();
  });

  it('should return null for invalid payTo address', () => {
    const html = `<script src="https://cdn.paperwall.io/sdk.js"
      data-facilitator-url="https://gateway.kobaru.io"
      data-pay-to="not-an-address"
      data-price="10000"
      data-network="eip155:324705682">
    </script>`;
    expect(parseScriptTag(html)).toBeNull();
  });

  it('should return null for invalid facilitatorUrl', () => {
    const html = `<script src="https://cdn.paperwall.io/sdk.js"
      data-facilitator-url="not-a-url"
      data-pay-to="0x1234567890abcdef1234567890abcdef12345678"
      data-price="10000"
      data-network="eip155:324705682">
    </script>`;
    expect(parseScriptTag(html)).toBeNull();
  });

  it('should return null for zero price', () => {
    const html = `<script src="https://cdn.paperwall.io/sdk.js"
      data-facilitator-url="https://gateway.kobaru.io"
      data-pay-to="0x1234567890abcdef1234567890abcdef12345678"
      data-price="0"
      data-network="eip155:324705682">
    </script>`;
    expect(parseScriptTag(html)).toBeNull();
  });

  it('should return null for non-numeric price', () => {
    const html = `<script src="https://cdn.paperwall.io/sdk.js"
      data-facilitator-url="https://gateway.kobaru.io"
      data-pay-to="0x1234567890abcdef1234567890abcdef12345678"
      data-price="abc"
      data-network="eip155:324705682">
    </script>`;
    expect(parseScriptTag(html)).toBeNull();
  });

  it('should return null for invalid asset address', () => {
    const html = `<script src="https://cdn.paperwall.io/sdk.js"
      data-facilitator-url="https://gateway.kobaru.io"
      data-pay-to="0x1234567890abcdef1234567890abcdef12345678"
      data-price="10000"
      data-network="eip155:324705682"
      data-asset="USDC">
    </script>`;
    expect(parseScriptTag(html)).toBeNull();
  });

  it('should leave asset undefined when data-asset is absent', () => {
    const html = `<script src="https://cdn.paperwall.io/sdk.js"
      data-facilitator-url="https://gateway.kobaru.io"
      data-pay-to="0x1234567890abcdef1234567890abcdef12345678"
      data-price="10000"
      data-network="eip155:324705682">
    </script>`;
    const result = parseScriptTag(html);
    expect(result?.accepts[0]?.asset).toBeUndefined();
  });

  it('should default mode to client when data-mode is absent', () => {
    const html = `<script src="https://cdn.paperwall.io/sdk.js"
      data-facilitator-url="https://gateway.kobaru.io"
      data-pay-to="0x1234567890abcdef1234567890abcdef12345678"
      data-price="10000"
      data-network="eip155:324705682">
    </script>`;
    const result = parseScriptTag(html);
    expect(result?.mode).toBe('client');
  });

  it('should parse server mode with paymentUrl', () => {
    const html = `<script src="https://cdn.paperwall.io/sdk.js"
      data-facilitator-url="https://gateway.kobaru.io"
      data-pay-to="0x1234567890abcdef1234567890abcdef12345678"
      data-price="10000"
      data-network="eip155:324705682"
      data-mode="server"
      data-payment-url="https://example.com/api/pay">
    </script>`;
    const result = parseScriptTag(html);
    expect(result?.mode).toBe('server');
    expect(result?.paymentUrl).toBe('https://example.com/api/pay');
  });

  it('should not match non-paperwall script tags', () => {
    const html = `<script src="https://cdn.example.com/analytics.js"
      data-facilitator-url="https://gateway.kobaru.io"
      data-pay-to="0x1234567890abcdef1234567890abcdef12345678"
      data-price="10000"
      data-network="eip155:324705682">
    </script>`;
    expect(parseScriptTag(html)).toBeNull();
  });

  it('should not have siteKey when data-site-key is absent', () => {
    const html = `<script src="https://cdn.paperwall.io/sdk.js"
      data-facilitator-url="https://gateway.kobaru.io"
      data-pay-to="0x1234567890abcdef1234567890abcdef12345678"
      data-price="10000"
      data-network="eip155:324705682">
    </script>`;
    const result = parseScriptTag(html);
    expect(result).not.toBeNull();
    expect(result?.siteKey).toBeUndefined();
  });
});

// -- parseInitCall Tests ---

const VALID_INIT_CALL = `<html><head>
<script src="https://cdn.paperwall.io/sdk.js"></script>
<script>
Paperwall.init({
  facilitatorUrl: 'https://gateway.kobaru.io',
  payTo: '0x1234567890abcdef1234567890abcdef12345678',
  price: '10000',
  network: 'eip155:324705682',
  siteKey: 'pwk_live_abc123',
});
</script>
</head><body>Content</body></html>`;

describe('parseInitCall', () => {
  it('should parse a valid Paperwall.init() call', () => {
    const result = parseInitCall(VALID_INIT_CALL);

    expect(result).not.toBeNull();
    expect(result?.x402Version).toBe(2);
    expect(result?.mode).toBe('client');
    expect(result?.facilitatorUrl).toBe('https://gateway.kobaru.io');
    expect(result?.siteKey).toBe('pwk_live_abc123');
    expect(result?.accepts).toHaveLength(1);
    expect(result?.accepts[0]?.network).toBe('eip155:324705682');
    expect(result?.accepts[0]?.amount).toBe('10000');
    expect(result?.accepts[0]?.payTo).toBe('0x1234567890abcdef1234567890abcdef12345678');
  });

  it('should handle init call with callbacks (ignored)', () => {
    const html = `<script>
Paperwall.init({
  facilitatorUrl: 'https://gateway.kobaru.io',
  payTo: '0x1234567890abcdef1234567890abcdef12345678',
  price: '5000',
  network: 'eip155:324705682',
  onPaymentSuccess: function(receipt) { console.log(receipt); },
  onPaymentError: function(err) { console.error(err); },
});
</script>`;
    const result = parseInitCall(html);
    expect(result).not.toBeNull();
    expect(result?.accepts[0]?.amount).toBe('5000');
  });

  it('should return null when facilitatorUrl is missing', () => {
    const html = `<script>
Paperwall.init({
  payTo: '0x1234567890abcdef1234567890abcdef12345678',
  price: '10000',
  network: 'eip155:324705682',
});
</script>`;
    expect(parseInitCall(html)).toBeNull();
  });

  it('should return null when payTo is missing', () => {
    const html = `<script>
Paperwall.init({
  facilitatorUrl: 'https://gateway.kobaru.io',
  price: '10000',
  network: 'eip155:324705682',
});
</script>`;
    expect(parseInitCall(html)).toBeNull();
  });

  it('should return null when price is missing', () => {
    const html = `<script>
Paperwall.init({
  facilitatorUrl: 'https://gateway.kobaru.io',
  payTo: '0x1234567890abcdef1234567890abcdef12345678',
  network: 'eip155:324705682',
});
</script>`;
    expect(parseInitCall(html)).toBeNull();
  });

  it('should return null when network is missing', () => {
    const html = `<script>
Paperwall.init({
  facilitatorUrl: 'https://gateway.kobaru.io',
  payTo: '0x1234567890abcdef1234567890abcdef12345678',
  price: '10000',
});
</script>`;
    expect(parseInitCall(html)).toBeNull();
  });

  it('should return null for invalid payTo', () => {
    const html = `<script>
Paperwall.init({
  facilitatorUrl: 'https://gateway.kobaru.io',
  payTo: 'invalid-address',
  price: '10000',
  network: 'eip155:324705682',
});
</script>`;
    expect(parseInitCall(html)).toBeNull();
  });

  it('should return null for invalid price', () => {
    const html = `<script>
Paperwall.init({
  facilitatorUrl: 'https://gateway.kobaru.io',
  payTo: '0x1234567890abcdef1234567890abcdef12345678',
  price: 'free',
  network: 'eip155:324705682',
});
</script>`;
    expect(parseInitCall(html)).toBeNull();
  });

  it('should default mode to client and leave asset undefined when not specified', () => {
    const html = `<script>
Paperwall.init({
  facilitatorUrl: 'https://gateway.kobaru.io',
  payTo: '0x1234567890abcdef1234567890abcdef12345678',
  price: '10000',
  network: 'eip155:324705682',
});
</script>`;
    const result = parseInitCall(html);
    expect(result?.mode).toBe('client');
    expect(result?.accepts[0]?.asset).toBeUndefined();
  });

  it('should parse server mode with paymentUrl', () => {
    const html = `<script>
Paperwall.init({
  facilitatorUrl: 'https://gateway.kobaru.io',
  payTo: '0x1234567890abcdef1234567890abcdef12345678',
  price: '10000',
  network: 'eip155:324705682',
  mode: 'server',
  paymentUrl: 'https://example.com/api/pay',
});
</script>`;
    const result = parseInitCall(html);
    expect(result?.mode).toBe('server');
    expect(result?.paymentUrl).toBe('https://example.com/api/pay');
  });

  it('should return null when no Paperwall.init call is present', () => {
    const html = '<html><body>No SDK here</body></html>';
    expect(parseInitCall(html)).toBeNull();
  });

  it('should parse double-quoted property values', () => {
    const html = `<script>
Paperwall.init({
  facilitatorUrl: "https://gateway.kobaru.io",
  payTo: "0x1234567890abcdef1234567890abcdef12345678",
  price: "10000",
  network: "eip155:324705682",
});
</script>`;
    const result = parseInitCall(html);
    expect(result).not.toBeNull();
    expect(result?.facilitatorUrl).toBe('https://gateway.kobaru.io');
  });

  it('should handle demo page HTML with surrounding content', () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>My Blog - Premium Article</title>
  <link rel="stylesheet" href="/styles.css">
  <script src="https://cdn.paperwall.io/sdk/v1/paperwall-sdk.js"></script>
  <script>
    Paperwall.init({
      facilitatorUrl: 'https://gateway.kobaru.io',
      payTo: '0xABCDEF1234567890abcdef1234567890ABCDEF12',
      price: '25000',
      network: 'eip155:324705682',
      siteKey: 'pwk_live_myblog',
    });
  </script>
</head>
<body>
  <h1>Premium Article</h1>
  <p>This is the teaser content...</p>
</body>
</html>`;
    const result = parseInitCall(html);
    expect(result).not.toBeNull();
    expect(result?.accepts[0]?.amount).toBe('25000');
    expect(result?.accepts[0]?.payTo).toBe('0xABCDEF1234567890abcdef1234567890ABCDEF12');
    expect(result?.siteKey).toBe('pwk_live_myblog');
  });
});

// -- Mode B: data-accepts / accepts:[] multi-network tests ---

describe('parseScriptTag Mode B (data-accepts)', () => {
  it('should parse a script tag with data-accepts JSON attribute', () => {
    const accepts = JSON.stringify([
      { network: 'eip155:324705682', amount: '10000', payTo: '0x1234567890abcdef1234567890abcdef12345678' },
      { network: 'eip155:84532', amount: '10000', payTo: '0x1234567890abcdef1234567890abcdef12345678' },
    ]);
    const html = `<script src="https://cdn.paperwall.io/sdk.js"
      data-facilitator-url="https://gateway.kobaru.io"
      data-accepts='${accepts}'>
    </script>`;
    const result = parseScriptTag(html);

    expect(result).not.toBeNull();
    expect(result?.x402Version).toBe(2);
    expect(result?.facilitatorUrl).toBe('https://gateway.kobaru.io');
    expect(result?.accepts).toHaveLength(2);
    expect(result?.accepts[0]?.network).toBe('eip155:324705682');
    expect(result?.accepts[1]?.network).toBe('eip155:84532');
  });

  it('should return null for data-accepts without facilitatorUrl', () => {
    const accepts = JSON.stringify([
      { network: 'eip155:324705682', amount: '10000' },
    ]);
    const html = `<script src="https://cdn.paperwall.io/sdk.js"
      data-accepts='${accepts}'>
    </script>`;
    expect(parseScriptTag(html)).toBeNull();
  });

  it('should prefer Mode A (data-network) when both present', () => {
    const accepts = JSON.stringify([
      { network: 'eip155:84532', amount: '5000', payTo: '0x1234567890abcdef1234567890abcdef12345678' },
    ]);
    const html = `<script src="https://cdn.paperwall.io/sdk.js"
      data-facilitator-url="https://gateway.kobaru.io"
      data-pay-to="0x1234567890abcdef1234567890abcdef12345678"
      data-price="10000"
      data-network="eip155:324705682"
      data-accepts='${accepts}'>
    </script>`;
    const result = parseScriptTag(html);
    // Mode A takes precedence since data-network is present
    expect(result).not.toBeNull();
    expect(result?.accepts).toHaveLength(1);
    expect(result?.accepts[0]?.network).toBe('eip155:324705682');
    expect(result?.accepts[0]?.amount).toBe('10000');
  });
});

describe('parseInitCall Mode B (accepts array)', () => {
  it('should parse Paperwall.init() with accepts array', () => {
    const html = `<script>
Paperwall.init({
  facilitatorUrl: 'https://gateway.kobaru.io',
  accepts: [
    { network: 'eip155:324705682', amount: '10000', payTo: '0x1234567890abcdef1234567890abcdef12345678' },
    { network: 'eip155:84532', amount: '10000', payTo: '0x1234567890abcdef1234567890abcdef12345678' },
  ],
});
</script>`;
    const result = parseInitCall(html);

    expect(result).not.toBeNull();
    expect(result?.x402Version).toBe(2);
    expect(result?.facilitatorUrl).toBe('https://gateway.kobaru.io');
    expect(result?.accepts).toHaveLength(2);
    expect(result?.accepts[0]?.network).toBe('eip155:324705682');
    expect(result?.accepts[1]?.network).toBe('eip155:84532');
  });

  it('should return null for accepts array without facilitatorUrl', () => {
    const html = `<script>
Paperwall.init({
  accepts: [
    { network: 'eip155:324705682', amount: '10000' },
  ],
});
</script>`;
    expect(parseInitCall(html)).toBeNull();
  });

  it('should prefer Mode A (network) over Mode B (accepts) when both present', () => {
    const html = `<script>
Paperwall.init({
  facilitatorUrl: 'https://gateway.kobaru.io',
  payTo: '0x1234567890abcdef1234567890abcdef12345678',
  price: '10000',
  network: 'eip155:324705682',
  accepts: [
    { network: 'eip155:84532', amount: '5000', payTo: '0x1234567890abcdef1234567890abcdef12345678' },
  ],
});
</script>`;
    const result = parseInitCall(html);
    expect(result).not.toBeNull();
    expect(result?.accepts).toHaveLength(1);
    expect(result?.accepts[0]?.network).toBe('eip155:324705682');
    expect(result?.accepts[0]?.amount).toBe('10000');
  });
});

// -- Multi-network / optional asset+payTo tests ---

describe('parseMetaTag multi-network support', () => {
  it('should parse signal with explicit asset correctly', () => {
    const payload = {
      x402Version: 2,
      mode: 'client',
      facilitatorUrl: 'https://gateway.kobaru.io',
      accepts: [
        {
          scheme: 'exact',
          network: 'eip155:324705682',
          amount: '10000',
          asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
          payTo: '0x1234567890abcdef1234567890abcdef12345678',
        },
      ],
    };
    const html = makeMetaTagHtml(payload);
    const result = parseMetaTag(html);
    expect(result).not.toBeNull();
    expect(result?.accepts[0]?.asset).toBe('0x2e08028E3C4c2356572E096d8EF835cD5C6030bD');
  });

  it('should parse signal without asset (asset is undefined, not a default address)', () => {
    const payload = {
      x402Version: 2,
      mode: 'client',
      facilitatorUrl: 'https://gateway.kobaru.io',
      accepts: [
        {
          scheme: 'exact',
          network: 'eip155:324705682',
          amount: '10000',
          payTo: '0x1234567890abcdef1234567890abcdef12345678',
        },
      ],
    };
    const html = makeMetaTagHtml(payload);
    const result = parseMetaTag(html);
    expect(result).not.toBeNull();
    expect(result?.accepts[0]?.asset).toBeUndefined();
  });

  it('should parse signal with explicit payTo per entry', () => {
    const payload = {
      x402Version: 2,
      mode: 'client',
      facilitatorUrl: 'https://gateway.kobaru.io',
      accepts: [
        {
          scheme: 'exact',
          network: 'eip155:324705682',
          amount: '10000',
          payTo: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        },
        {
          scheme: 'exact',
          network: 'eip155:84532',
          amount: '10000',
          payTo: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        },
      ],
    };
    const html = makeMetaTagHtml(payload);
    const result = parseMetaTag(html);
    expect(result).not.toBeNull();
    expect(result?.accepts).toHaveLength(2);
    expect(result?.accepts[0]?.payTo).toBe('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect(result?.accepts[1]?.payTo).toBe('0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB');
  });

  it('should parse signal without payTo (payTo is undefined)', () => {
    const payload = {
      x402Version: 2,
      mode: 'client',
      facilitatorUrl: 'https://gateway.kobaru.io',
      accepts: [
        {
          scheme: 'exact',
          network: 'eip155:324705682',
          amount: '10000',
          asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
        },
      ],
    };
    const html = makeMetaTagHtml(payload);
    const result = parseMetaTag(html);
    expect(result).not.toBeNull();
    expect(result?.accepts[0]?.payTo).toBeUndefined();
  });

  it('should parse multi-network accepts array', () => {
    const payload = {
      x402Version: 2,
      mode: 'client',
      facilitatorUrl: 'https://gateway.kobaru.io',
      accepts: [
        {
          scheme: 'exact',
          network: 'eip155:324705682',
          amount: '10000',
          asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
          payTo: '0x1234567890abcdef1234567890abcdef12345678',
        },
        {
          scheme: 'exact',
          network: 'eip155:84532',
          amount: '10000',
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          payTo: '0x1234567890abcdef1234567890abcdef12345678',
        },
      ],
    };
    const html = makeMetaTagHtml(payload);
    const result = parseMetaTag(html);
    expect(result).not.toBeNull();
    expect(result?.accepts).toHaveLength(2);
    expect(result?.accepts[0]?.network).toBe('eip155:324705682');
    expect(result?.accepts[1]?.network).toBe('eip155:84532');
  });
});
