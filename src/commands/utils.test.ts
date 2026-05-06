import { describe, it, expect, vi, beforeEach } from 'vitest';
import { printAccountsTable } from './utils';

describe('printAccountsTable', () => {
  let output: string[];

  beforeEach(() => {
    output = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => { output.push(args.join(' ')); });
  });

  it('prefixes foreign currency in the balance column and omits a separate currency column', () => {
    printAccountsTable([
      { institution: 'TD',          account: 'Chequing',              type: 'Chequing', balance: '$26,726.27' },
      { institution: 'TD',          account: 'US Dollar Savings',     type: 'Savings',  balance: '$0.00', currency: 'USD' },
      { institution: 'Wealthsimple', account: 'TFSA',                 type: 'TFSA',     balance: '$38,774.98' },
    ], false);

    expect(output.join('\n')).toMatchInlineSnapshot(`
      "
        Institution   Account            Type         Balance
        ------------  -----------------  --------  ----------
        TD            Chequing           Chequing  $26,726.27
        TD            US Dollar Savings  Savings    USD $0.00
        Wealthsimple  TFSA               TFSA      $38,774.98
      "
    `);
  });
});
