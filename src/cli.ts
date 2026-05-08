import { Command } from 'commander';
import { makeInstitutionCommand } from './commands/institution';
import { makeSyncCommand } from './commands/sync';
import { makeAccountsCommand } from './commands/accounts';
import { makeTransactionsCommand } from './commands/transactions';
import { makeConfigCommand } from './commands/config';
import { makeBrowserCommand } from './commands/browser';

const program = new Command();

program
  .name('openvault')
  .description('Agentic financial data aggregator');

program.addCommand(makeInstitutionCommand());
program.addCommand(makeSyncCommand());
program.addCommand(makeAccountsCommand());
program.addCommand(makeTransactionsCommand());
program.addCommand(makeConfigCommand());
program.addCommand(makeBrowserCommand());

program.parse();
