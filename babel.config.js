module.exports = function (api) {
  api.cache(true);
  const plugins = [];
  if (api.env('production')) {
    plugins.push(['babel-plugin-transform-remove-console', { exclude: ['error'] }]);
  }
  plugins.push('react-native-reanimated/plugin');
  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
