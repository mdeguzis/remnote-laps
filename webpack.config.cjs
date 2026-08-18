const path = require('path');
const { resolve } = require('path');
const { globSync } = require('glob');

const { EsbuildPlugin } = require('esbuild-loader');
const { ProvidePlugin, BannerPlugin } = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

const isProd = process.env.NODE_ENV === 'production';

/**
 * Retag a manifest as a development build.
 *
 * RemNote keys installed plugins by manifest id and refuses a second one with
 * an id it already has, so anyone running the released Laps cannot also point
 * at the dev server without uninstalling first. The suffix is applied here, on
 * the way into the bundle, so the checked in manifest keeps the real id and no
 * build step can forget to undo it. The visible name changes too, or you end up
 * driving one copy while reading the settings of the other.
 */
function devManifest(content) {
  const manifest = JSON.parse(content.toString());
  manifest.id = `${manifest.id}-dev`;
  manifest.name = `${manifest.name} (dev)`;
  return Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
}

// RemNote loads each widget twice: once directly and once inside a sandboxed
// iframe. Both bundles come from the same entry file.
//
// public/index.html hardcodes this same suffix when it picks a bundle to load.
// If it changes here it has to change there too.
const SANDBOX_SUFFIX = '-sandbox';

const DEV_PORT = Number(process.env.PORT || 8080);
const DEV_HOST = process.env.HOST || 'localhost';

const config = {
  mode: isProd ? 'production' : 'development',
  devtool: isProd ? false : 'eval-cheap-module-source-map',

  // glob v11 returns paths without a leading "./", which webpack would treat as
  // a request into node_modules, so make each one explicitly relative.
  entry: globSync('src/widgets/*.tsx').reduce(function (obj, el) {
    const entryPath = './' + el.split(path.sep).join('/');
    obj[path.parse(el).name] = entryPath;
    obj[path.parse(el).name + SANDBOX_SUFFIX] = entryPath;
    return obj;
  }, {}),

  output: {
    path: resolve(__dirname, 'dist'),
    filename: '[name].js',
    publicPath: '',
  },

  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    // src/ imports carry explicit .ts / .tsx extensions so that node --test can
    // load the same modules directly. Webpack has to be told to strip them
    // back to the real files rather than looking for "format.ts.ts".
    extensionAlias: {
      '.ts': ['.ts', '.tsx'],
      '.tsx': ['.tsx'],
      '.js': ['.js', '.ts', '.tsx'],
    },
  },

  module: {
    rules: [
      // .ts and .tsx get DIFFERENT esbuild loaders on purpose.
      //
      // Running plain TypeScript through the `tsx` loader makes `<T>` in a
      // generic arrow function ambiguous with a JSX tag, and esbuild resolves
      // it as JSX: `const read = async <T>(id: string) => ...` fails with
      // "Expected ) but found :", pointing at a line that is perfectly valid
      // TypeScript. Splitting the rule is the fix; the `<T,>` trailing comma
      // trick works too but leaves the trap armed for the next file.
      {
        test: /\.tsx$/,
        loader: 'esbuild-loader',
        options: { loader: 'tsx', target: 'es2020', minify: false },
      },
      {
        test: /\.(ts|jsx|js)$/,
        loader: 'esbuild-loader',
        options: { loader: 'ts', target: 'es2020', minify: false },
      },
    ],
  },

  plugins: [
    new ProvidePlugin({
      React: 'react',
      reactDOM: 'react-dom',
    }),
    new BannerPlugin({
      banner: (file) => (!file.chunk.name.includes(SANDBOX_SUFFIX) ? 'const IMPORT_META=import.meta;' : ''),
      raw: true,
    }),
    // manifest.json has to land at the server root. RemNote's "Develop from
    // localhost" dialog fetches http://localhost:8080/manifest.json first, and
    // reports a network error if it is missing.
    new CopyPlugin({
      patterns: [
        {
          from: 'public',
          to: '',
          transform: (content, absolutePath) =>
            isProd || !absolutePath.endsWith('manifest.json') ? content : devManifest(content),
        },
        { from: 'README.md', to: '' },
      ],
    }),
  ].filter(Boolean),
};

if (isProd) {
  config.optimization = {
    minimize: true,
    minimizer: [new EsbuildPlugin({ target: 'es2020' })],
  };
} else {
  config.devServer = {
    host: DEV_HOST,
    port: DEV_PORT,
    open: false,
    hot: true,
    compress: true,
    watchFiles: ['src/**/*', 'public/**/*'],
    // RemNote runs on remnote.com (or in Electron) and fetches this server
    // cross-origin, so both of these are required or the manifest fetch fails.
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    allowedHosts: 'all',
    // Belt and braces: CopyPlugin already emits public/ into the compilation,
    // but serving the directory too means a stale build still resolves.
    static: [{ directory: resolve(__dirname, 'public'), publicPath: '/' }],
    client: {
      overlay: { errors: true, warnings: false },
    },
  };
}

module.exports = config;
