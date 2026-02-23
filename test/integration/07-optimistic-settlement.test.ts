/**
 * Integration Test: Optimistic Settlement
 *
 * Tests cross-package optimistic settlement features:
 * - SDK emits data-optimistic attribute on meta tag
 * - Agent parses data-optimistic from meta tag
 * - Agent optimistic flow returns content before settlement
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Agent's meta-tag parser (import from source — vitest handles TS)
import { parseMetaTag, parseScriptTag } from '../../packages/agent/src/meta-tag.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '../..');

describe('Optimistic Settlement Integration', () => {
  let sdkCode: string;

  beforeAll(async () => {
    sdkCode = await readFile(
      join(ROOT_DIR, 'packages/sdk/dist/index.iife.js'),
      'utf-8',
    );
  });

  // -- SDK Signal Tests ---

  it('SDK should emit data-optimistic="true" by default', async () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <head></head>
        <body>
          <script
            data-facilitator-url="https://gateway.kobaru.io"
            data-pay-to="0x1234567890123456789012345678901234567890"
            data-price="10000"
            data-network="eip155:324705682"
          >${sdkCode}</script>
        </body>
      </html>
    `, {
      url: 'https://example.com/article',
      runScripts: 'dangerously',
      resources: 'usable',
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    const metaTag = dom.window.document.querySelector('meta[name="x402-payment-required"]');
    expect(metaTag).toBeTruthy();
    expect(metaTag?.getAttribute('data-optimistic')).toBe('true');

    dom.window.close();
  });

  it('SDK should emit data-optimistic="false" when configured', async () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <head></head>
        <body>
          <script
            data-facilitator-url="https://gateway.kobaru.io"
            data-pay-to="0x1234567890123456789012345678901234567890"
            data-price="10000"
            data-network="eip155:324705682"
            data-optimistic="false"
          >${sdkCode}</script>
        </body>
      </html>
    `, {
      url: 'https://example.com/article',
      runScripts: 'dangerously',
      resources: 'usable',
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    const metaTag = dom.window.document.querySelector('meta[name="x402-payment-required"]');
    expect(metaTag).toBeTruthy();
    expect(metaTag?.getAttribute('data-optimistic')).toBe('false');

    dom.window.close();
  });

  // -- Agent Parser Tests ---

  it('Agent should parse data-optimistic="true" from meta tag', () => {
    const signal = {
      x402Version: 2,
      mode: 'client',
      facilitatorUrl: 'https://gateway.kobaru.io',
      accepts: [{
        scheme: 'exact',
        network: 'eip155:324705682',
        amount: '10000',
        asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
        payTo: '0x1234567890123456789012345678901234567890',
      }],
    };
    const b64 = Buffer.from(JSON.stringify(signal)).toString('base64');
    const html = `<meta name="x402-payment-required" content="${b64}" data-optimistic="true">`;

    const result = parseMetaTag(html);
    expect(result).toBeTruthy();
    expect(result?.optimistic).toBe(true);
  });

  it('Agent should parse data-optimistic="false" from meta tag', () => {
    const signal = {
      x402Version: 2,
      mode: 'client',
      facilitatorUrl: 'https://gateway.kobaru.io',
      accepts: [{
        scheme: 'exact',
        network: 'eip155:324705682',
        amount: '10000',
        asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
        payTo: '0x1234567890123456789012345678901234567890',
      }],
    };
    const b64 = Buffer.from(JSON.stringify(signal)).toString('base64');
    const html = `<meta name="x402-payment-required" content="${b64}" data-optimistic="false">`;

    const result = parseMetaTag(html);
    expect(result).toBeTruthy();
    expect(result?.optimistic).toBe(false);
  });

  it('Agent should default optimistic to true when attribute absent', () => {
    const signal = {
      x402Version: 2,
      mode: 'client',
      facilitatorUrl: 'https://gateway.kobaru.io',
      accepts: [{
        scheme: 'exact',
        network: 'eip155:324705682',
        amount: '10000',
        asset: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
        payTo: '0x1234567890123456789012345678901234567890',
      }],
    };
    const b64 = Buffer.from(JSON.stringify(signal)).toString('base64');
    const html = `<meta name="x402-payment-required" content="${b64}">`;

    const result = parseMetaTag(html);
    expect(result).toBeTruthy();
    expect(result?.optimistic).toBe(true);
  });

  // -- SDK → Agent round-trip ---

  it('SDK-emitted HTML should be parseable by agent script tag parser with optimistic field', () => {
    // Simulate the HTML that the SDK would produce (script tag with data attributes)
    // The agent parses this HTML when fetching a page
    const html = `
      <html>
        <head>
          <meta name="x402-payment-required" content="..." data-optimistic="true"
                data-facilitator-url="https://gateway.kobaru.io" data-mode="client">
        </head>
        <body>
          <script
            src="https://cdn.example.com/paperwall.js"
            data-facilitator-url="https://gateway.kobaru.io"
            data-pay-to="0x1234567890123456789012345678901234567890"
            data-price="10000"
            data-network="eip155:324705682"
            data-optimistic="true"
          ></script>
        </body>
      </html>
    `;

    // Agent uses parseScriptTag for SDK-embedded pages
    const result = parseScriptTag(html);
    expect(result).toBeTruthy();
    expect(result?.optimistic).toBe(true);
    expect(result?.accepts[0]?.amount).toBe('10000');
    expect(result?.facilitatorUrl).toBe('https://gateway.kobaru.io');
  });

  // -- Script tag parser ---

  it('Agent should parse optimistic from script tag data attributes', () => {
    const html = `
      <script
        src="https://cdn.example.com/paperwall.js"
        data-facilitator-url="https://gateway.kobaru.io"
        data-pay-to="0x1234567890123456789012345678901234567890"
        data-price="5000"
        data-network="eip155:324705682"
        data-optimistic="false"
      ></script>
    `;

    const result = parseScriptTag(html);
    expect(result).toBeTruthy();
    expect(result?.optimistic).toBe(false);
  });
});
