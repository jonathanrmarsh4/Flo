import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.flo.healthapp',
  appName: 'Flō',
  webDir: 'dist/public',
  server: {
    androidScheme: 'https'
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0f172a'
  },
  plugins: {
    CapacitorPlugins: {
      packageClassList: [
        'SignInWithApple',
        'PreferencesPlugin',
        'SocialLoginPlugin',
        'HealthPlugin',
        'SecureStoragePlugin',
        'HealthSyncPlugin'
      ]
    }
  }
};

export default config;
