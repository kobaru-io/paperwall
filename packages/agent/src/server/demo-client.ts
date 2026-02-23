// -- Types ---

interface DemoAuthorization {
  readonly perRequestLimit: string | null;
  readonly dailyLimit: string | null;
  readonly totalLimit: string | null;
  readonly dailySpent: string;
  readonly totalSpent: string;
  readonly requestedAmount: string;
}

interface DemoDecline {
  readonly reason: string;
  readonly limit: string;
  readonly limitValue: string;
  readonly requestedAmount: string | null;
}

interface DemoVerification {
  readonly explorerUrl: string;
  readonly network: string;
}

interface DemoStepResult {
  readonly url: string;
  readonly outcome: 'fetched' | 'declined' | 'error';
  readonly payment?: {
    readonly amountFormatted: string;
    readonly txHash: string;
    readonly network: string;
    readonly payer?: string;
    readonly payee?: string;
  };
  readonly error?: string;
  readonly receipt: {
    readonly id: string;
    readonly ap2Stage: 'intent' | 'settled' | 'declined';
  };
  readonly authorization?: DemoAuthorization;
  readonly decline?: DemoDecline;
  readonly verification?: DemoVerification;
  readonly content?: string;
  readonly contentType?: string;
}

interface DemoSummary {
  readonly totalRequests: number;
  readonly successfulFetches: number;
  readonly declinedFetches: number;
  readonly totalUsdcSpent: string;
  readonly explorerLinks: string[];
}

// -- Internal Helpers ---

const BRANCH = '\u251C\u2500\u2500';
const CORNER = '\u2514\u2500\u2500';
const ARROW = '\u2192';
const DASH = '\u2014';

function truncateAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatAmount(amount: string): string {
  return `$${amount}`;
}

function formatAuthLine(result: DemoStepResult, verbose?: boolean): string {
  const auth = result.authorization;
  if (!auth) return `  ${BRANCH} AP2 Authorization: budget check passed`;

  const dailyPart =
    auth.dailyLimit != null
      ? `daily ${formatAmount(auth.dailySpent)}/${formatAmount(auth.dailyLimit)}`
      : null;

  if (verbose) {
    const parts: string[] = [];
    if (auth.perRequestLimit != null) {
      parts.push(`per-request: ${formatAmount(auth.perRequestLimit)}`);
    }
    if (auth.dailyLimit != null) {
      parts.push(
        `daily: ${formatAmount(auth.dailySpent)}/${formatAmount(auth.dailyLimit)}`,
      );
    }
    if (auth.totalLimit != null) {
      parts.push(
        `total: ${formatAmount(auth.totalSpent)}/${formatAmount(auth.totalLimit)}`,
      );
    }
    return parts.length > 0
      ? `  ${BRANCH} AP2 Authorization: passed (${parts.join(', ')})`
      : `  ${BRANCH} AP2 Authorization: passed`;
  }

  return dailyPart != null
    ? `  ${BRANCH} AP2 Authorization: passed (${dailyPart})`
    : `  ${BRANCH} AP2 Authorization: passed`;
}

function formatDeclineLine(result: DemoStepResult, verbose?: boolean): string {
  const decline = result.decline;
  if (!decline) {
    return `  ${BRANCH} AP2 Authorization: DENIED (${result.error ?? 'budget_exceeded'})`;
  }

  const limitLabel = decline.limit.replace(/_/g, ' ');
  let line = `  ${BRANCH} AP2 Authorization: DENIED ${DASH} ${limitLabel} (${formatAmount(decline.limitValue)}) exceeded`;

  if (verbose) {
    const extra: string[] = [];
    if (decline.requestedAmount != null) {
      extra.push(`requested: ${formatAmount(decline.requestedAmount)}`);
    }
    const auth = result.authorization;
    if (auth) {
      if (decline.limit === 'daily' && auth.dailyLimit != null) {
        extra.push(`daily spent: ${formatAmount(auth.dailySpent)}`);
      } else if (decline.limit === 'total' && auth.totalLimit != null) {
        extra.push(`total spent: ${formatAmount(auth.totalSpent)}`);
      }
    }
    if (extra.length > 0) {
      line += ` (${extra.join(', ')})`;
    }
  }

  return line;
}

// -- Public API ---

export function formatDemoStep(
  result: DemoStepResult,
  verbose?: boolean,
): string {
  const lines: string[] = [];

  if (result.outcome === 'fetched' && result.payment) {
    const amount = formatAmount(result.payment.amountFormatted);
    lines.push(`  ${BRANCH} AP2 Intent: requesting ${amount} USDC`);
    lines.push(formatAuthLine(result, verbose));
    lines.push(
      `  ${BRANCH} AP2 Settlement: ${amount} USDC ${DASH} tx ${result.payment.txHash.slice(0, 12)}...`,
    );
    if (verbose && result.payment.payer && result.payment.payee) {
      lines.push(
        `  ${BRANCH}   ${truncateAddress(result.payment.payer)} ${ARROW} ${truncateAddress(result.payment.payee)}`,
      );
    }
    if (verbose && result.verification?.explorerUrl) {
      lines.push(`  ${BRANCH} AP2 Verification: ${result.verification.explorerUrl}`);
    }
    lines.push(
      `  ${BRANCH} AP2 Receipt: ${result.receipt.id.slice(0, 12)}... [${result.receipt.ap2Stage}]`,
    );
  } else if (result.outcome === 'fetched') {
    lines.push(`  ${BRANCH} Content: free (no payment required)`);
    lines.push(
      `  ${BRANCH} AP2 Receipt: ${result.receipt.id.slice(0, 12)}... [${result.receipt.ap2Stage}]`,
    );
  } else if (result.outcome === 'declined') {
    const reqAmount =
      result.decline?.requestedAmount ?? result.authorization?.requestedAmount;
    lines.push(
      `  ${BRANCH} AP2 Intent: requesting ${reqAmount ? `${formatAmount(reqAmount)} USDC` : 'content...'}`,
    );
    lines.push(formatDeclineLine(result, verbose));
    lines.push(
      `  ${CORNER} AP2 Receipt: ${result.receipt.id.slice(0, 12)}... [${result.receipt.ap2Stage}]`,
    );
    return lines.join('\n');
  } else {
    lines.push(`  ${CORNER} Error: ${result.error ?? 'unknown'}`);
    return lines.join('\n');
  }

  if (verbose && result.content) {
    const preview = stripHtml(result.content).slice(0, 200);
    const suffix = result.content.length > 200 ? '...' : '';
    lines.push(`  ${CORNER} Preview: ${preview}${suffix}`);
  } else {
    // Replace last BRANCH with CORNER since there's no preview line after
    const lastIdx = lines.length - 1;
    lines[lastIdx] = lines[lastIdx]!.replace(BRANCH, CORNER);
  }

  return lines.join('\n');
}

export function buildDemoSummary(results: DemoStepResult[]): DemoSummary {
  const successfulFetches = results.filter(
    (r) => r.outcome === 'fetched',
  ).length;
  const declinedFetches = results.filter(
    (r) => r.outcome === 'declined',
  ).length;

  // Sum payments using smallest-unit BigInt math to preserve full 6-decimal precision
  let totalSmallest = 0n;
  for (const r of results) {
    if (r.payment?.amountFormatted) {
      const parts = r.payment.amountFormatted.split('.');
      const whole = BigInt(parts[0] ?? '0');
      const fracStr = (parts[1] ?? '').padEnd(6, '0').slice(0, 6);
      totalSmallest += whole * 1_000_000n + BigInt(fracStr);
    }
  }
  const totalWhole = totalSmallest / 1_000_000n;
  const totalFrac = totalSmallest % 1_000_000n;
  const fullDec = totalFrac.toString().padStart(6, '0');
  const trimmedDec = fullDec.replace(/0+$/, '');
  const decPart = trimmedDec.length < 2 ? fullDec.slice(0, 2) : trimmedDec;
  const totalUsdcSpent = `${totalWhole}.${decPart}`;

  // Collect explorer URLs from verification, fall back to tx hashes
  const explorerLinks: string[] = [];
  for (const r of results) {
    if (r.verification?.explorerUrl) {
      explorerLinks.push(r.verification.explorerUrl);
    } else if (r.payment?.txHash) {
      explorerLinks.push(r.payment.txHash);
    }
  }

  return {
    totalRequests: results.length,
    successfulFetches,
    declinedFetches,
    totalUsdcSpent,
    explorerLinks,
  };
}

interface DemoOptions {
  readonly server: string;
  readonly articles?: string[];
  readonly agentKey?: string;
  readonly verbose?: boolean;
}

const DEFAULT_ARTICLES = [
  'https://example.com/article-1',
  'https://example.com/article-2',
  'https://example.com/article-3',
  'https://example.com/article-4',
];

export async function runDemo(options: DemoOptions): Promise<void> {
  const serverUrl = options.server.replace(/\/$/, '');
  const articles = options.articles ?? DEFAULT_ARTICLES;

  console.error(`[paperwall demo] Connecting to ${serverUrl}...`);

  // Step 1: Discover Agent Card
  const cardRes = await fetch(
    `${serverUrl}/.well-known/agent-card.json`,
  );
  if (!cardRes.ok) {
    throw new Error(
      `Failed to discover agent at ${serverUrl}: HTTP ${cardRes.status}`,
    );
  }
  const card = (await cardRes.json()) as Record<string, unknown>;
  console.error(
    `[paperwall demo] Discovered: ${card['name']} (protocol ${card['protocolVersion']})`,
  );

  const results: DemoStepResult[] = [];

  // Step 2-N: Fetch articles via A2A JSON-RPC
  for (let i = 0; i < articles.length; i++) {
    const url = articles[i]!;
    console.error(`\n${formatStepHeader(i + 1, articles.length, url)}`);

    try {
      const rpcResponse = await fetch(`${serverUrl}/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(options.agentKey
            ? { Authorization: `Bearer ${options.agentKey}` }
            : {}),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: i + 1,
          method: 'message/send',
          params: {
            message: {
              kind: 'message',
              messageId: crypto.randomUUID(),
              role: 'user',
              parts: [
                {
                  kind: 'data',
                  data: {
                    url,
                    maxPrice: '0.10',
                    agentId: 'demo-agent',
                  },
                },
              ],
            },
          },
        }),
      });

      const rpcResult = (await rpcResponse.json()) as Record<
        string,
        unknown
      >;
      const result = extractDemoResult(url, rpcResult);
      results.push(result);

      console.error(formatDemoStep(result, options.verbose));
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      const errorResult: DemoStepResult = {
        url,
        outcome: 'error',
        error: message,
        receipt: { id: 'error', ap2Stage: 'intent' },
      };
      results.push(errorResult);
      console.error(
        `  ${CORNER} Error: ${message}`,
      );
    }
  }

  // Output summary
  const summary = buildDemoSummary(results);
  console.error('\n--- Demo Summary ---');
  console.error(`Total requests: ${summary.totalRequests}`);
  console.error(`Successful: ${summary.successfulFetches}`);
  console.error(`Declined: ${summary.declinedFetches}`);
  console.error(`Total spent: $${summary.totalUsdcSpent} USDC`);
  if (summary.explorerLinks.length > 0) {
    console.error('Explorer links:');
    for (const link of summary.explorerLinks) {
      console.error(`  ${link}`);
    }
  }

  // JSON audit trail to stdout
  const output = JSON.stringify(
    {
      ok: true,
      summary,
      results: results.map((r) => ({
        url: r.url,
        outcome: r.outcome,
        payment: r.payment ?? null,
        receipt: r.receipt,
        authorization: r.authorization ?? null,
        decline: r.decline ?? null,
        verification: r.verification ?? null,
        ...(options.verbose && r.content != null
          ? { content: stripHtml(r.content), contentType: r.contentType ?? null }
          : {}),
      })),
    },
    null,
    2,
  );
  console.log(output);
}

// -- Internal Helpers ---

function formatStepHeader(
  step: number,
  total: number,
  url: string,
): string {
  return `[${step}/${total}] Fetching ${url}`;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function extractAuthorization(
  receipt: Record<string, unknown>,
): DemoAuthorization | undefined {
  const auth = receipt['authorization'] as Record<string, unknown> | undefined;
  if (!auth) return undefined;
  return {
    perRequestLimit: nullableString(auth['perRequestLimit']),
    dailyLimit: nullableString(auth['dailyLimit']),
    totalLimit: nullableString(auth['totalLimit']),
    dailySpent: String(auth['dailySpent'] ?? '0.00'),
    totalSpent: String(auth['totalSpent'] ?? '0.00'),
    requestedAmount: String(auth['requestedAmount'] ?? '0.00'),
  };
}

function extractDecline(
  receipt: Record<string, unknown>,
): DemoDecline | undefined {
  const decline = receipt['decline'] as Record<string, unknown> | undefined;
  if (!decline) return undefined;
  return {
    reason: String(decline['reason'] ?? 'unknown'),
    limit: String(decline['limit'] ?? 'unknown'),
    limitValue: String(decline['limitValue'] ?? '0.00'),
    requestedAmount: nullableString(decline['requestedAmount']),
  };
}

function extractVerification(
  receipt: Record<string, unknown>,
): DemoVerification | undefined {
  const verification = receipt['verification'] as Record<string, unknown> | undefined;
  if (!verification) return undefined;
  return {
    explorerUrl: String(verification['explorerUrl'] ?? ''),
    network: String(verification['network'] ?? ''),
  };
}

function extractDemoResult(
  url: string,
  rpcResult: Record<string, unknown>,
): DemoStepResult {
  // The JSON-RPC response has result which can be a Message or Task
  const result = rpcResult['result'] as Record<string, unknown> | undefined;
  if (!result) {
    const error = rpcResult['error'] as Record<string, unknown> | undefined;
    return {
      url,
      outcome: 'error',
      error: error
        ? String(error['message'] ?? 'Unknown RPC error')
        : 'No result in response',
      receipt: { id: 'error', ap2Stage: 'intent' },
    };
  }

  // Extract data part — handle both Task (history) and Message (parts) formats
  const parts = extractResponseParts(result);
  const status = result['status'] as Record<string, unknown> | undefined;
  const dataPart = parts.find((p) => p['kind'] === 'data');
  const data = (dataPart?.['data'] as Record<string, unknown>) ?? {};

  if (data['ok'] === true) {
    const payment = data['payment'] as Record<string, unknown> | null;
    const receipt = data['receipt'] as Record<string, unknown> | undefined;
    return {
      url,
      outcome: 'fetched',
      payment: payment
        ? {
            amountFormatted: String(payment['amountFormatted'] ?? '0'),
            txHash: String(payment['txHash'] ?? ''),
            network: String(payment['network'] ?? ''),
            payer: nullableString(payment['payer']) ?? undefined,
            payee: nullableString(payment['payee']) ?? undefined,
          }
        : undefined,
      receipt: {
        id: String(receipt?.['id'] ?? crypto.randomUUID()),
        ap2Stage: (receipt?.['ap2Stage'] as DemoStepResult['receipt']['ap2Stage']) ?? 'settled',
      },
      authorization: receipt ? extractAuthorization(receipt) : undefined,
      verification: receipt ? extractVerification(receipt) : undefined,
      content: typeof data['content'] === 'string' ? data['content'] : undefined,
      contentType: typeof data['contentType'] === 'string' ? data['contentType'] : undefined,
    };
  }

  // Failed (declined or error)
  const errorCode = String(data['error'] ?? status?.['state'] ?? 'unknown');
  const receipt = data['receipt'] as Record<string, unknown> | undefined;
  const isDecline =
    errorCode === 'budget_exceeded' || errorCode === 'max_price_exceeded';

  return {
    url,
    outcome: isDecline ? 'declined' : 'error',
    error: errorCode,
    receipt: {
      id: String(receipt?.['id'] ?? crypto.randomUUID()),
      ap2Stage:
        (receipt?.['ap2Stage'] as DemoStepResult['receipt']['ap2Stage']) ??
        (isDecline ? 'declined' : 'intent'),
    },
    authorization: receipt ? extractAuthorization(receipt) : undefined,
    decline: receipt ? extractDecline(receipt) : undefined,
  };
}

/**
 * Extract response parts from either a Task or Message result.
 *
 * Task format:  result.history[-1].parts (last message in history)
 * Message format: result.parts (parts directly on the message)
 */
function extractResponseParts(
  result: Record<string, unknown>,
): Array<Record<string, unknown>> {
  if (result['kind'] === 'task') {
    const history = result['history'] as Array<Record<string, unknown>> | undefined;
    const lastMessage = history?.at(-1);
    return (lastMessage?.['parts'] as Array<Record<string, unknown>>) ?? [];
  }

  if (result['kind'] === 'message') {
    return (result['parts'] as Array<Record<string, unknown>>) ?? [];
  }

  // Fallback: try history first, then parts
  const history = result['history'] as Array<Record<string, unknown>> | undefined;
  if (history?.length) {
    const lastMessage = history.at(-1);
    return (lastMessage?.['parts'] as Array<Record<string, unknown>>) ?? [];
  }
  return (result['parts'] as Array<Record<string, unknown>>) ?? [];
}

/**
 * Strip HTML tags and collapse whitespace for plain-text preview.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
