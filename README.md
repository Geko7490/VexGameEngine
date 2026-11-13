# VEX Game Engine

Çevrimdışı Android 3D oyun geliştirme ortamı. Android kabuğu Kotlin ve Jetpack Compose, görüntüleme Three.js/WebGL 2, fizik Rapier 3D kullanır. Editör ve bağımsız HTML5 oyunlar aynı sürümlü proje biçimi ile çalışır.

## Derle ve dene

Node.js 22, JDK 17, Android SDK 35 ve Gradle 8.9 kullanın. Bağımlılıkları edinmek için ilk derlemede internet gerekir. Kurulan uygulama ve oyun çıktısı çevrimdışı çalışır. Android cihazın WebView sürümü Chromium 110 ve WebGL 2 desteklemelidir.

```sh
npm install
npm test
npm run build
npx playwright install chromium
npm run smoke
gradle :app:assembleDebug
```

APK dosyası `app/build/outputs/apk/debug/app-debug.apk` yolunda oluşur. GitHub Actions aynı doğrulamaları çalıştırıp debug APK’yı derleme çıktısı olarak yükler. Web editörünü yerel denemek için `python3 -m http.server 8080 --directory dist` çalıştırın ve `http://localhost:8080/editor.html` adresini açın.

1. Projeler ekranından bir şablon veya boş proje seçin.
2. Sahne sekmesinden obje ekleyin. Obje seçip taşıma, döndürme veya ölçekleme aracını açın.
3. Bloklar sekmesinde olay ekleyin, eylemleri sıralayın ve girişlerini doldurun. Telefonda sıralama düğmeleri, masaüstünde sürükle bırak kullanılabilir.
4. Test ile oyunu çalıştırın. Bilgisayarda WASD, Space ve E, telefonda joystick ve tanımlanan butonlar kullanılır.
5. Dışa Aktar sekmesinden proje ZIP’i veya HTML5 oyun ZIP’i alın. Oyunu yerel galeriye de yayınlayabilirsiniz.

Oyun ZIP’ini açıp kökteki `index.html` dosyasını WebGL 2 destekleyen tarayıcıda açın. Kütüphaneler, fizik WASM’ı ve proje varlıkları HTML dosyasına gömülür. WebView entegrasyonunda paketi uygulamanızın yerel HTTPS varlık kökünden sunabilirsiniz. Oyun kayıtlarının tarayıcı oturumları arasında korunması için kalıcı bir origin kullanın. Bazı tarayıcılar `file://` sayfalarında kalıcı depolamayı sınırlayabilir.

## Modüller

| Dosya | Sorumluluk |
| --- | --- |
| `web/src/project.js` | Proje şeması ve tip doğrulaması |
| `web/src/editor.js`, `editor-stage.js` | Editör, geçmiş, kamera ve 3D gizmo |
| `web/src/stage.js` | Grafik, model, doku ve klip oynatma |
| `web/src/physics.js`, `runtime.js` | Sabit adımlı fizik, kontroller, sahne ve oyun durumu |
| `web/src/blocks.js` | Sınırlı yürütme bütçeli görsel kod yorumlayıcısı |
| `web/src/storage.js`, `archive.js`, `export.js` | Atomik IndexedDB işlemleri, doğrulanmış ZIP içe aktarma ve bağımsız çıktı |
| `app/` | Ağ izni gerektirmeyen WebView, dosya seçici ve SAF ZIP kaydetme |

Proje ZIP’i, sürümlü `project.json` içeren tek bir sıkıştırılmamış girdidir. Toplam proje sınırı 8 MB. GLTF dosyası kaynaklarını kendi içinde taşımalı. İlk sürümün kapsamına gelişmiş düğüm grafiği, tam UI oluşturucu, voxel fırçası, keyframe zaman çizelgesi, fizik eklemleri ve uygulama içinden bağımsız APK üretimi dahil değildir. Ayrı APK paketleme için bağımsız HTML5 çıktı, Android oynatıcı kabuğuna giriş olarak kullanılabilir.
