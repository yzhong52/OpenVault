import { defineConfig } from 'drizzle-kit';
import * as path from 'path';
import * as os from 'os';

export default defineConfig({
  schema:  './src/db/schema.ts',
  out:     './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: path.join(os.homedir(), '.openvault', 'data.db'),
  },
});
