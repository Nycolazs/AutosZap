const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react-dom': path.resolve(projectRoot, 'node_modules/react-dom'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
  'react-native-screens': path.resolve(
    projectRoot,
    'node_modules/react-native-screens',
  ),
  'react-native-safe-area-context': path.resolve(
    projectRoot,
    'node_modules/react-native-safe-area-context',
  ),
  'react-native-gesture-handler': path.resolve(
    projectRoot,
    'node_modules/react-native-gesture-handler',
  ),
  'react-native-reanimated': path.resolve(
    projectRoot,
    'node_modules/react-native-reanimated',
  ),
};

module.exports = config;
