import { Command } from 'commander';
import { prompt, launchBrowser } from './utils';

export function makeBrowserCommand(): Command {
  return new Command('browser')
    .description('Open a browser using the saved profile (for manual setup, extensions, etc.)')
    .action(async () => {
      const context = await launchBrowser();

      console.log('Browser open. Configure extensions, profiles, or anything else you need.');
      await prompt('\nPress Enter to close... ');
      await context.close();
    });
}
