plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.vex.gameengine"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.vex.gameengine"
        minSdk = 26
        targetSdk = 35
        versionCode = 5
        versionName = "0.2.0"
    }
    buildFeatures { compose = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/offlineAssets"))
}

val verifyOfflineAssets by tasks.registering {
    val editor = layout.buildDirectory.file("generated/offlineAssets/editor.js")
    doLast {
        check(editor.get().asFile.isFile) { "Run npm install and npm run build before assembling the Android application." }
    }
}
tasks.named("preBuild") { dependsOn(verifyOfflineAssets) }

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.10.01"))
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.webkit:webkit:1.12.1")
}
