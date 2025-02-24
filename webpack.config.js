module.exports = {
    entry: './bson.js',
    output: {
        path: __dirname,
        filename: 'bson.min.js',
        library: {
            type: 'module'
        }
    },
    experiments: {
        outputModule: true
    },
    mode: "production",
};