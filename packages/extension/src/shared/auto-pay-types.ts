// ── Shared Auto-Pay Types ────────────────────────────────────────
// Shared between background (auto-pay-storage) and popup (budget) bundles.
// Kept in src/shared/ so both esbuild entry points can import independently.

export interface SiteRule {
  origin: string;
  maxAmountRaw: string;
  monthlyBudgetRaw: string;
  monthlySpentRaw: string;
  monthlyPeriodStart: number;
  createdAt: number;
}

export interface AutoPayRules {
  globalEnabled: boolean;
  dailyLimitRaw: string;
  monthlyLimitRaw: string;
  dailySpentRaw: string;
  monthlySpentRaw: string;
  dailyPeriodStart: number;
  monthlyPeriodStart: number;
  defaultSiteBudgetRaw: string;
  defaultMaxAmountRaw: string;
  sites: Record<string, SiteRule>;
  denylist: string[];
  onboardingCompleted: boolean;
  explainerDismissed: boolean;
}
