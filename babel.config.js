module.exports = function (api) {
  const isProd = api.env('production');
  const plugins = [];
  if (isProd) {
    plugins.push(['babel-plugin-transform-remove-console', { exclude: ['error'] }]);
  }
  plugins.push('react-native-reanimated/plugin');
  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
