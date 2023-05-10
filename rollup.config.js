import typescript from 'rollup-plugin-typescript2';
import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';
import { nodeResolve } from '@rollup/plugin-node-resolve';

const production = !process.env.ROLLUP_WATCH;

export default {
  input: 'src/app.ts',
  output: {
    file: 'dist/app.js',
    format: 'es',
    sourcemap: false,
  },
  plugins: [
    typescript(),
    nodeResolve(),
    !production && serve({ contentBase: 'dist', port: 8080 }),
    !production && livereload('dist'),
  ],
};