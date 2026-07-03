import { AppRegistry } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from './app/index';

// Expo Router used to provide the SafeAreaProvider automatically. In bare RN we
// wrap the root ourselves so SettingsScreen's SafeAreaView has a provider.
const Root = () => (
  <SafeAreaProvider>
    <App />
  </SafeAreaProvider>
);

// Component name matches MainActivity.getMainComponentName() ("main").
AppRegistry.registerComponent('main', () => Root);
