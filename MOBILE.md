# Wrapping with Capacitor for App Store / Play Store

Capacitor is already installed (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`, `@capacitor/haptics`) and `capacitor.config.ts` is configured.

Run these locally (you need Xcode for iOS and Android Studio for Android):

```bash
# 1. Build the web app
bun run build

# 2. Add native platforms (one-time)
bunx cap add android
bunx cap add ios

# 3. Sync after every web build
bunx cap sync

# 4. Open in IDE
bunx cap open android   # Android Studio → run / generate signed APK / AAB
bunx cap open ios       # Xcode → run / archive for App Store
```

The app uses `navigator.vibrate` in the browser and `@capacitor/haptics` automatically when running natively (see `src/lib/haptics.ts`).
