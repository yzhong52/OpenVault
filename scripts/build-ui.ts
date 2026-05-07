import * as esbuild from 'esbuild';
import { spawn, ChildProcess } from 'child_process';

const args = process.argv.slice(2);
const isWatch = args.includes('--watch');
const demoFlags = args.includes('--demo') ? ['--demo'] : [];

let serverProcess: ChildProcess | null = null;

function startServer() {
  if (serverProcess) return; // Only start once; let tsx handle server watching if needed
  
  const serverArgs = ['tsx', ...(isWatch ? ['--watch'] : []), 'src/ui/server.ts', ...demoFlags];
  
  serverProcess = spawn('npx', serverArgs, {
    stdio: 'inherit',
    shell: true,
  });

  serverProcess.on('close', (code) => {
    if (code !== null && code !== 0) {
      console.log(`Server exited with code ${code}`);
    }
  });
}

async function buildUI() {
  const buildOptions: esbuild.BuildOptions = {
    entryPoints: ['src/ui/client/index.tsx'],
    bundle: true,
    outfile: 'src/ui/dist/bundle.js',
    minify: !isWatch,
    sourcemap: isWatch,
    platform: 'browser',
    target: ['es2020'],
  };

  if (isWatch) {
    const ctx = await esbuild.context({
      ...buildOptions,
      plugins: [
        {
          name: 'rebuild-notify',
          setup(build) {
            build.onEnd((result) => {
              if (result.errors.length > 0) {
                console.error('ui: build failed:', result.errors);
              } else {
                console.log('ui: built successfully');
              }
            });
          },
        },
      ],
    });

    await ctx.watch();
    console.log('ui: watching for frontend changes...');
    startServer();
  } else {
    await esbuild.build(buildOptions);
    console.log('ui: built successfully');
    startServer();
  }
}

buildUI().catch((err) => {
  console.error(err);
  process.exit(1);
});
