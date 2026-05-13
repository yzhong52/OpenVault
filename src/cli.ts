import { Command } from 'commander';
import { makeInstitutionCommand } from './commands/institution';
import { makeAccountsCommand } from './commands/accounts';
import { makeTransactionsCommand } from './commands/transactions';
import { makeConfigCommand } from './commands/config';
import { makeBrowserCommand } from './commands/browser';
import { makeSyncCommand } from './commands/sync';

const program = new Command();

program
  .name('ledgeragent')
  .description('Agentic financial data aggregator');

program.addCommand(makeInstitutionCommand());
program.addCommand(makeAccountsCommand());
program.addCommand(makeTransactionsCommand());
program.addCommand(makeSyncCommand());
program.addCommand(makeConfigCommand());
program.addCommand(makeBrowserCommand());

program.parse();
