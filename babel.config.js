module.exports = function (api) {
    api.cache(true)

    return {
        presets: [
            '@babel/preset-typescript',
            '@babel/preset-env'
            // ['@babel/preset-env', {
            //     'modules': false,
            //     'useBuiltIns': 'entry',
            //     'targets': {
            //         'browsers': ['chrome >= 61', 'safari >= 10', 'firefox >= 44', 'ios >= 10']
            //     }
            // }]
        ]
    }
}

