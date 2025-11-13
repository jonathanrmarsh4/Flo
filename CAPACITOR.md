# Capacitor iOS Setup Guide

This document explains how to build and deploy Flō as an iOS application using Capacitor.

## Prerequisites

- macOS with Xcode installed
- CocoaPods installed (`sudo gem install cocoapods`)
- Apple Developer account for deployment

## Development Workflow

### 1. Build Web Assets
```bash
npm run build
```

This builds the React frontend to `dist/public`.

### 2. Sync to iOS
```bash
npx cap sync ios
```

This copies the web assets to the iOS project and updates native dependencies.

### 3. Open in Xcode
```bash
npx cap open ios
```

This opens the iOS project in Xcode where you can:
- Run the app on simulator
- Run on physical device
- Configure signing & capabilities
- Submit to App Store

## Common Commands

### Update Capacitor Plugins
```bash
npx cap update ios
```

### Copy Web Assets Only
```bash
npx cap copy ios
```

### Run All Steps
```bash
npm run build && npx cap sync ios && npx cap open ios
```

## Configuration

The Capacitor configuration is in `capacitor.config.ts`:

- **App ID**: `com.flo.healthapp`
- **App Name**: Flō
- **Web Directory**: `dist/public`

iOS-specific settings are in `ios/App/App/Info.plist`, including:
- Camera permissions
- Photo library permissions
- App display name

## Troubleshooting

### "Skipping pod install because CocoaPods is not installed"
Install CocoaPods on macOS:
```bash
sudo gem install cocoapods
```

### Changes not appearing in iOS app
Run a full sync:
```bash
npm run build && npx cap sync ios
```

### Native plugin errors
Update Capacitor and plugins:
```bash
npx cap update ios
```

## Deployment to App Store

1. Open project in Xcode: `npx cap open ios`
2. Select your development team in Signing & Capabilities
3. Set build number and version in Xcode
4. Archive the app (Product > Archive)
5. Upload to App Store Connect
6. Submit for review

## Notes

- The iOS project is located in the `ios/` directory
- Native changes should be made in Xcode
- Web changes go through the normal build process
- Always sync after building: `npx cap sync ios`
