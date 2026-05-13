import { Command } from 'commander';
import { keychainSave } from '../keychain';
import { prompt, promptPassword, readInstitutions, writeInstitutions } from './utils';

export function makeInstitutionCommand(): Command {
  const cmd = new Command('institution').description('Manage saved institutions');

  cmd
    .command('add')
    .description('Add a new institution and save credentials to Keychain')
    .option('--name <name>', 'Institution name')
    .option('--url <url>', 'Login URL')
    .option('--username <username>', 'Username or email')
    .option('--password <password>', 'Password')
    .action(async (opts) => {
      const name     = opts.name     ?? await prompt('Institution name (e.g. Wealthsimple): ');
      const url      = opts.url      ?? await prompt('Login URL: ');
      const username = opts.username ?? await prompt('Username or email: ');
      const password = opts.password ?? await promptPassword('Password: ');

      const institutions = await readInstitutions();
      const existing = institutions.findIndex(i => i.name === name && i.username === username);
      if (existing >= 0) {
        institutions[existing] = { name, url, username };
      } else {
        institutions.push({ name, url, username });
      }

      await writeInstitutions(institutions);
      keychainSave(name, username, password);
      console.log(`Saved ${name} (${username})`);
    });

  return cmd;
}
