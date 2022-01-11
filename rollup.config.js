import babel from 'rollup-plugin-babel'
import commonjs from 'rollup-plugin-commonjs'
import resolve from 'rollup-plugin-node-resolve'
import { uglify } from 'rollup-plugin-uglify'
import path from 'path'

// console.log('resolve', path.resolve('src', 'index.ts'))
const extensions = ['.js', '.jsx', '.ts', '.tsx']
module.exports = {
    input: path.resolve('src', 'index.ts'),
    output: {
        file: './dist/index.js',
        format: 'umd',
        sourcemap: false,
        name: 'Legato',
        exports: 'named'
    },
    plugins: [
        babel({
            extensions,
            include: ['src/**/*']
            // exclude: 'node_modules/**'
        }),
        resolve({ browser: true, extensions }),
        commonjs({ extensions }),
        uglify()
    ]
}
