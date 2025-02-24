var path = require('path');

module.exports = {
    entry: './bson.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bson.js',
        library: {
            type: 'module'
        }
    },
    experiments: {
        outputModule: true
    },
    mode: "production",
};