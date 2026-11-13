package com.vex.gameengine

import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.net.Uri
import android.os.Bundle
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.util.Base64
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.lifecycleScope
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    private data class Export(val name: String, val base64: String)

    private var web: WebView? = null
    private val startupError = mutableStateOf<String?>(null)
    private val webGeneration = mutableStateOf(0)

    private var importReply: JavaScriptReplyProxy? = null
    private val selectedFiles = ConcurrentHashMap<String, ByteArray>()
    private var pendingExport: Export? = null
    private var exportInProgress = false

    private val picker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val reply = importReply ?: return@registerForActivityResult
        val uri = result.data?.data?.takeIf { result.resultCode == RESULT_OK && it.scheme == "content" }
        if (uri == null) {
            importReply = null
            reply.postMessage("{}")
            return@registerForActivityResult
        }
        lifecycleScope.launch {
            var token: String? = null
            try {
                val picked = withContext(Dispatchers.IO) {
                    val name = contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME),
                        null, null, null)?.use { if (it.moveToFirst()) it.getString(0) else null }
                        ?: throw IllegalArgumentException("Dosya adı okunamadı.")
                    val bytes = ByteArrayOutputStream()
                    checkNotNull(contentResolver.openInputStream(uri)).use { input ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            if (bytes.size() + count > MAX_IMPORT_BYTES) {
                                throw IllegalArgumentException("Dosya çok büyük.")
                            }
                            bytes.write(buffer, 0, count)
                        }
                    }
                    name.takeLast(180) to bytes.toByteArray()
                }
                val path = UUID.randomUUID().toString()
                token = path
                selectedFiles.clear()
                selectedFiles[path] = picked.second
                reply.postMessage(JSONObject().put("name", picked.first).put("path", path).toString())
            } catch (error: Exception) {
                token?.let { selectedFiles.remove(it) }
                if (error is kotlinx.coroutines.CancellationException) throw error
                runCatching { reply.postMessage(JSONObject().put("error", "Dosya okunamadı veya çok büyük.").toString()) }
            } finally {
                importReply = null
            }
        }
    }

    private val exporter = registerForActivityResult(ActivityResultContracts.CreateDocument("application/zip")) { uri ->
        val export = pendingExport
        pendingExport = null
        if (uri == null || export == null) {
            exportInProgress = false
            return@registerForActivityResult
        }
        lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val bytes = Base64.decode(export.base64, Base64.NO_WRAP)
                    check(bytes.size in 4..MAX_ZIP_BYTES &&
                        bytes[0] == 0x50.toByte() && bytes[1] == 0x4b.toByte() &&
                        bytes[2] == 0x03.toByte() && bytes[3] == 0x04.toByte())
                    val stream = checkNotNull(contentResolver.openOutputStream(uri, "wt"))
                    stream.use { it.write(bytes) }
                }
                toast("ZIP kaydedildi.")
            } catch (error: Exception) {
                if (error is kotlinx.coroutines.CancellationException) throw error
                toast("ZIP kaydedilemedi.")
            } finally {
                exportInProgress = false
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(primary = Color(0xFFA98AF8))) {
                Box(
                    Modifier.fillMaxSize().background(Color(0xFF10111B))
                        .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Vertical)).imePadding()
                ) {
                    val error = startupError.value
                    if (error == null) {
                        key(webGeneration.value) {
                            AndroidView(
                                factory = { createWebView().also { web = it } },
                                modifier = Modifier.fillMaxSize(),
                                onRelease = { view ->
                                    if (web === view) web = null
                                    view.destroy()
                                }
                            )
                        }
                    } else {
                        Column(
                            Modifier.align(Alignment.Center).padding(24.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Text("VEX Game Engine", style = MaterialTheme.typography.headlineSmall)
                            Text(error)
                            Button(onClick = {
                                webGeneration.value++
                                startupError.value = null
                            }) { Text("Yeniden dene") }
                        }
                    }
                }
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(): WebView {
        val assets = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        return WebView(this).apply {
            setBackgroundColor(android.graphics.Color.rgb(16, 17, 27))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            // Chromium checks this flag before dispatching local HTTPS requests to our interceptor.
            settings.blockNetworkLoads = false
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
            settings.mediaPlaybackRequiresUserGesture = false
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                    !request.isForMainFrame || request.url.toString() != ENTRY

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (request.isForMainFrame || request.url.toString() == "$ORIGIN/assets/editor.js") {
                        startupError.value = "Yerel editör açılamadı (WebView hata kodu ${error.errorCode})."
                    }
                }

                override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                    startupError.value = "Android System WebView durdu. Tekrar deneyin."
                    return true
                }

                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                    val uri = request.url
                    if (uri.scheme in setOf("data", "blob")) return null
                    val path = uri.encodedPath.orEmpty()
                    if (uri.scheme == "https" && uri.host == "appassets.androidplatform.net" &&
                        request.method == "GET" && path.startsWith("/picked/")) {
                        val bytes = selectedFiles.remove(path.removePrefix("/picked/"))
                        if (bytes != null) return WebResourceResponse(
                            "application/octet-stream", null, 200, "OK",
                            mapOf("Cache-Control" to "no-store"), ByteArrayInputStream(bytes)
                        )
                    }
                    return assets.shouldInterceptRequest(uri)?.apply {
                        if (path == "/assets/editor.js") mimeType = "text/javascript"
                        if (path == "/assets/editor.css") mimeType = "text/css"
                        encoding = "UTF-8"
                    } ?: WebResourceResponse(
                        "text/plain", "UTF-8", 403, "Blocked", emptyMap(), ByteArrayInputStream(byteArrayOf())
                    )
                }
            }
            if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
                WebViewCompat.addWebMessageListener(this, "VexImport", setOf(ORIGIN)) { view, _, _, isMainFrame, reply ->
                    if (isMainFrame && view.url == ENTRY) requestImport(reply)
                }
                WebViewCompat.addWebMessageListener(this, "VexFiles", setOf(ORIGIN)) { view, message, _, isMainFrame, _ ->
                    if (isMainFrame && view.url == ENTRY) requestExport(message.data)
                }
            }
            loadUrl(ENTRY)
        }
    }

    private fun requestImport(reply: JavaScriptReplyProxy) {
        if (importReply != null) return
        importReply = reply
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            type = "*/*"
            addCategory(Intent.CATEGORY_OPENABLE)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        try {
            picker.launch(intent)
        } catch (_: Exception) {
            importReply = null
            reply.postMessage(JSONObject().put("error", "Dosya seçici açılamadı.").toString())
        }
    }

    private fun requestExport(payload: String?) {
        if (exportInProgress || payload == null || payload.length > MAX_ZIP_BYTES * 4 / 3 + 1024) return
        val export = runCatching {
            val request = JSONObject(payload)
            val name = request.getString("name")
            val base64 = request.getString("base64")
            require(name.length in 5..100 && name.endsWith(".zip", ignoreCase = true))
            require(name.none { it == '/' || it == '\\' || it.isISOControl() })
            require(base64.isNotEmpty())
            Export(name, base64)
        }.getOrNull() ?: return
        pendingExport = export
        exportInProgress = true
        try {
            exporter.launch(export.name)
        } catch (_: Exception) {
            pendingExport = null
            exportInProgress = false
            toast("Dosya kaydedici açılamadı.")
        }
    }

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()

    override fun onPause() {
        web?.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        web?.onResume()
    }

    override fun onDestroy() {
        importReply = null
        selectedFiles.clear()
        super.onDestroy()
    }

    private companion object {
        const val ORIGIN = "https://appassets.androidplatform.net"
        const val ENTRY = "$ORIGIN/assets/editor.html"
        const val MAX_IMPORT_BYTES = 8 * 1024 * 1024 + 1024
        const val MAX_ZIP_BYTES = 16 * 1024 * 1024
    }
}
