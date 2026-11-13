# VEX Game Engine

Çevrimdışı Android oyun geliştirme ortamı. Three.js sahne editörü, Rapier 3D çalışma zamanı ve yerel proje paketleri aynı proje biçimini kullanır.

Derleme için Node.js 22, JDK 17, Android SDK 35 ve Gradle 8.9 gerekir.

```sh
npm install
npm test
npm run build
gradle :app:assembleDebug
```

APK çıktısı `app/build/outputs/apk/debug/app-debug.apk` yolundadır. Web editörünü denemek için derleme sonrasında `python3 -m http.server 8080 --directory dist` komutunu kullanın ve `http://localhost:8080/editor.html` adresini açın.
