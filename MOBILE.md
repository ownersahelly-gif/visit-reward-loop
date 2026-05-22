# Building the iOS / Android app with Capacitor

The web app is a plain Vite SPA, so it produces a static `dist/index.html`
that Capacitor can bundle directly into a native app — no server required.

## Prerequisites (one-time, on your Mac)
- Xcode 15+ from the App Store
- Apple ID configured in Xcode (Settings → Accounts)
- Node 20+, `bun` or `npm`

## First-time setup

```bash
bun install
bun run build           # outputs dist/index.html
npx cap add ios         # only the first time
npx cap sync ios        # copies dist/ into the iOS app
npx cap open ios        # opens Xcode
```

In Xcode:
1. Select the **App** target.
2. Open the **Signing & Capabilities** tab.
3. Set **Team** to your Apple ID (free personal team is fine for local testing).
4. Plug in your iPhone, pick it as the run destination, hit **Run** ⌘R.

## Iterating after web changes

```bash
bun run build
npx cap sync ios
# then re-run from Xcode
```

## Android (same idea)

```bash
npx cap add android
npx cap sync android
npx cap open android   # Android Studio
```

## Enabling NFC on iOS (one-time, in Xcode)

The NFC plugin is `@exxili/capacitor-nfc`. After `npx cap sync ios`:

1. In Xcode, open the **App** target → **Signing & Capabilities**.
2. Click **+ Capability** and add **Near Field Communication Tag Reading**.
   Your Apple Developer account must be enrolled in the paid program — the
   free personal team **cannot** sign apps with NFC entitlements.
3. Open `ios/App/App/Info.plist` and add:
   ```xml
   <key>NFCReaderUsageDescription</key>
   <string>Stamp uses NFC to read the branch loyalty card.</string>
   ```
4. Rebuild from Xcode and tap **Hold the branch's NFC card** in the app —
   iOS shows its native NFC scan sheet.

> iOS supports **reading** NFC cards in the customer flow. **Writing** NFC
> cards (admin tool) still requires Chrome on Android — that screen will
> say so on iOS.

## Notes
- The app talks to Lovable Cloud (Supabase) over HTTPS from inside the
  native shell. No additional configuration is needed — `src/integrations/supabase/client.ts`
  already points at the production project.
- All backend logic lives in the `app-api` Edge Function
  (`supabase/functions/app-api/`). It deploys automatically when you push
  through Lovable; outside Lovable, deploy with `npx supabase functions deploy app-api`.
- Haptics use `@capacitor/haptics` natively and `navigator.vibrate` in the browser
  (see `src/lib/haptics.ts`).

