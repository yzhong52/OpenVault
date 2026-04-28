import { Command } from 'commander';
import { keychainSave } from '../keychain';
import { prompt, promptPassword, readInstitutions, writeInstitutions } from './utils';

export function makeInstitutionCommand(): Command {
  const cmd = new Command('institution').description('Manage saved institutions');

  cmd
    .command('add')
    .description('Add a new institution and save credentials to Keychain')
    .action(async () => {
      const name     = await prompt('Institution name (e.g. Wealthsimple): ');
      const url      = await prompt('Login URL: ');
      const username = await prompt('Username or email: ');
      const password = await promptPassword('Password: ');

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
