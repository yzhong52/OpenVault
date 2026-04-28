import { Command } from 'commander';
import { makeInstitutionCommand } from './commands/institution';
import { makeSyncCommand } from './commands/sync';
import { makeAccountsCommand } from './commands/accounts';
import { makeConfigCommand } from './commands/config';

const program = new Command();

program
  .name('openvault')
  .description('Agentic financial data aggregator');

program.addCommand(makeInstitutionCommand());
program.addCommand(makeSyncCommand());
program.addCommand(makeAccountsCommand());
program.addCommand(makeConfigCommand());

program.parse();
