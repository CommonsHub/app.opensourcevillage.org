/**
 * Token Balance Types and Utilities
 *
 * Types and formatting utilities for token balances.
 */

export interface TokenBalance {
  confirmed: number;      // Confirmed on blockchain
  total: number;          // Total balance
  lastUpdated: string;    // ISO timestamp
}

/**
 * Token economics configuration from specs
 */
export const TOKEN_ECONOMICS = {
  INITIAL_BALANCE: 50,
  OFFER_CREATION_COST: 1,
  RSVP_COST: 1,
  CLAIM_COST: 1,
  TOKEN_SYMBOL: 'CHT',  // Community Helper Token
} as const;

/**
 * Format balance for display
 *
 * @param balance - Token balance object
 * @param showSymbol - Include token symbol (default: true)
 * @returns Formatted balance string
 */
export function formatBalance(
  balance: TokenBalance,
  showSymbol: boolean = true
): string {
  const symbol = showSymbol ? ` ${TOKEN_ECONOMICS.TOKEN_SYMBOL}` : '';
  return `${balance.confirmed}${symbol}`;
}

/**
 * Check if user has sufficient balance for an operation
 *
 * @param balance - User's token balance
 * @param amount - Amount needed
 * @returns True if user has sufficient balance
 */
export function hasSufficientBalance(
  balance: TokenBalance,
  amount: number
): boolean {
  return balance.total >= amount;
}
