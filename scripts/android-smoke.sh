#!/usr/bin/env bash
set -euo pipefail

apk=$1
package=com.vex.gameengine
adb install -r "$apk"
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard
adb shell am start -W -n "$package/.MainActivity"

for attempt in {1..10}; do
  if adb shell uiautomator dump /sdcard/vex-smoke.xml >/dev/null 2>&1; then
    screen=$(adb shell cat /sdcard/vex-smoke.xml)
    if [[ "$screen" == *"Yeni proje"* && "$screen" == *"Örnek oyunu aç"* ]]; then
      pid=$(adb shell pidof "$package" | tr -d '\r')
      adb forward tcp:9222 "localabstract:webview_devtools_remote_$pid"
      trap 'adb forward --remove tcp:9222 >/dev/null 2>&1 || true' EXIT
      node scripts/android-editor-smoke.mjs
      exit 0
    fi
    if [[ "$screen" == *"Yerel editör açılamadı"* || "$screen" == *"Proje galerisi açılamadı"* ]]; then
      break
    fi
  fi
  sleep 3
done

adb shell cat /sdcard/vex-smoke.xml || true
adb logcat -d -s chromium AndroidRuntime || true
echo "Project gallery did not open on Android." >&2
exit 1
