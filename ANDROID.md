# NoteAI v3.6 Android preparation

NoteAI uses Capacitor 8 as the native shell around the Vite client. Model/API keys stay on the HTTPS gateway; the Android app contains the local workspace, Source Vault/index and a revocable account session credential.

## Preparation

```bash
npm install
npm run android:prepare
```

The preparation script:

1. requires a Vite-8-compatible Node runtime;
2. runs the production Vite build;
3. creates `android/` with Capacitor when missing;
4. adds `android.permission.RECORD_AUDIO`;
5. sets min SDK 24 and compile/target SDK 36;
6. sets Java source/target compatibility to 21;
7. replaces the obsolete default ProGuard file reference where necessary;
8. disables Android application backup;
9. installs and registers the native `SecureCredentials` Capacitor plugin;
10. performs `cap sync android` and reapplies the required patches.

After preparation:

```bash
cd android
./gradlew assembleDebug
```

## Secure session credential

The native bridge source is:

```text
native/android/SecureCredentialsPlugin.java
```

The generated Android project receives it under the Java package from `capacitor.config.json`.

The plugin creates an AES-256 key in `AndroidKeyStore`, encrypts the account session token using AES/GCM/NoPadding, and stores only IV+ciphertext in app-private SharedPreferences. The JavaScript client never receives or exports the Keystore key itself.

For web/PWA, NoteAI intentionally falls back to `sessionStorage` instead of persistent browser storage.

## Remote gateway

A packaged Android app does not run on the same origin as the remote Node gateway. In Settings configure absolute HTTPS endpoints, for example:

```text
https://gateway.example/api/ai
https://gateway.example/api/embed
https://gateway.example/api/vision
https://gateway.example/api/transcribe
https://gateway.example/api/youtube
https://gateway.example/api/account
```

URL ingestion derives `/api/source-url` from the AI gateway origin automatically.

The production gateway should include the Capacitor Android local origin in `CORS_ORIGINS`; the current configuration/test profile uses:

```text
https://localhost
```

When `REQUIRE_ACCOUNT_AUTH=true`, sign in under **Settings → Account & device sync** before using protected AI/ingestion routes. The app only injects the bearer token into requests sent to the same origin as the configured account gateway.

## Device QA gates

Do not call the Android build release-ready until all of these have been tested on an actual device/emulator:

- first-run account login and session persistence across app restarts;
- session removal after revoke from another device;
- microphone permission denial/allow flows;
- recorder and large-media background/interruption behaviour;
- Android 16 status/navigation bar insets and keyboard resizing;
- offline local note/source use;
- remote gateway CORS and TLS;
- 500 MB+ resumable media interruption/resume;
- process death during queued and active transcription;
- debug APK and release AAB signing paths.

The current execution environment has no installed npm dependency tree or Android/Gradle project, so v3.6 includes the native scaffold and preparation automation but does not claim that an APK has been generated here.
