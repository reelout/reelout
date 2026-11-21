import { nodeExternals } from 'rollup-plugin-node-externals'
import { defineConfig } from 'vite'

export default defineConfig({
  build: { lib: { entry: ['./src', './src/cli.ts'], formats: ['es'] } },
  plugins: [nodeExternals()],
})
