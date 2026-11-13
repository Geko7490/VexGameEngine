package com.vex.gameengine

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.lifecycleScope
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.io.ByteArrayInputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    private data class Export(val name: String, val base64: String)

    private var web: WebView? = null
    private var pickerCallback: ValueCallback<Array<Uri>>? = null
    private var pendingExport: Export? = null
    private var exportInProgress = false

    private val picker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val uri = result.data?.data?.takeIf { result.resultCode == RESULT_OK && it.scheme == "content" }
        pickerCallback?.onReceiveValue(uri?.let { arrayOf(it) })
        pickerCallback = null
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
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(primary = Color(0xFFA98AF8))) {
                Box(
                    Modifier.fillMaxSize().background(Color(0xFF10111B))
                        .windowInsetsPadding(WindowInsets.safeDrawing).imePadding()
                ) {
                    AndroidView(
                        factory = { createWebView().also { web = it } },
                        modifier = Modifier.fillMaxSize()
                    )
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
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
            settings.mediaPlaybackRequiresUserGesture = false
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                    !request.isForMainFrame || request.url.toString() != ENTRY

                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                    val uri = request.url
                    if (uri.scheme in setOf("data", "blob")) return null
                    return assets.shouldInterceptRequest(uri) ?: WebResourceResponse(
                        "text/plain", "UTF-8", 403, "Blocked", emptyMap(), ByteArrayInputStream(byteArrayOf())
                    )
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    view: WebView,
                    callback: ValueCallback<Array<Uri>>,
                    params: FileChooserParams
                ): Boolean {
                    if (view.url != ENTRY) return false
                    pickerCallback?.onReceiveValue(null)
                    pickerCallback = callback
                    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        type = "*/*"
                        addCategory(Intent.CATEGORY_OPENABLE)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    try {
                        picker.launch(intent)
                    } catch (_: Exception) {
                        callback.onReceiveValue(null)
                        pickerCallback = null
                    }
                    return true
                }
            }
            if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
                WebViewCompat.addWebMessageListener(this, "VexFiles", setOf(ORIGIN)) { view, message, _, isMainFrame, _ ->
                    if (isMainFrame && view.url == ENTRY) requestExport(message.data)
                }
            }
            loadUrl(ENTRY)
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
        pickerCallback?.onReceiveValue(null)
        pickerCallback = null
        web?.let {
            (it.parent as? android.view.ViewGroup)?.removeView(it)
            it.destroy()
        }
        web = null
        super.onDestroy()
    }

    private companion object {
        const val ORIGIN = "https://appassets.androidplatform.net"
        const val ENTRY = "$ORIGIN/assets/editor.html"
        const val MAX_ZIP_BYTES = 16 * 1024 * 1024
    }
}
