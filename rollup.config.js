import commonjs from '@rollup/plugin-commonjs'
// import babel from '@rollup/plugin-babel'
import { minify } from 'rollup-plugin-esbuild'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import path from 'path'
import typescript from '@rollup/plugin-typescript'
// console.log('resolve', path.resolve('src', 'index.ts'))
const extensions = ['.js', '.jsx', '.ts', '.tsx']

function createBase () {
    return {
        input: path.resolve('index.ts'),
        external: ['eventemitter3'],
        plugins: [
            typescript({
                tsconfig: 'tsconfig.json',
                sourceMap: false,
                target: 'es6'
            }),
            nodeResolve({ extensions }),
            commonjs({ extensions })
        ]
    }
}

function createOutput (format, ext) {
    return {
        file: `./dist/index${ext}`,
        format,
        sourcemap: false,
        name: 'Legato',
        exports: 'named',
        globals: {
            'eventemitter3': 'EventEmitter'
        }
    }
}

const umd = createBase()
umd.output = createOutput('umd', '.js')

const esm = createBase()
esm.output = createOutput('es', '.esm.js')

const min = createBase()
min.output = createOutput('umd', '.min.js')
min.plugins.push(minify())
min.external = []
min.output.globals = undefined
export default [
    umd,
    esm,
    min
]
