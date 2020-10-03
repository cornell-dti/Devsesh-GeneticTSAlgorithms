const path = require('path');

module.exports = {
  name: "genetic",
  mode: "development",
  devtool: "inline-source-map",
  entry: {
    main: "./src/test.ts",
  },
  output: {
    path: path.resolve(__dirname, 'public'),
    filename: "genetic-bundle.js",
  },
  resolve: {
    // Add ".ts" and ".tsx" as resolvable extensions.
    extensions: [".ts", ".tsx", ".js"],
  },
  module: {
    rules: [
      // all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
      { test: /\.tsx?$/, loader: "ts-loader" },
    ],
  },
  plugins: [
  ],
};