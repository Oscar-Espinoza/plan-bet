/**
 * The header chip reads layout data. A placement updates this first so the
 * balance moves before `refreshAll()` replaces the layout load.
 */
let balance = $state<number | undefined>(undefined);

export const accountChip = {
  get balance() {
    return balance;
  },
  setBalance(next: number) {
    balance = next;
  },
  clear() {
    balance = undefined;
  },
};
