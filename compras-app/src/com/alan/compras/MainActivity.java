package com.alan.compras;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.util.Base64;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.WebSettings;
import android.webkit.WebViewClient;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;

public class MainActivity extends Activity {
    WebView wv;
    ValueCallback<Uri[]> cb;
    String importar;

    private static String ler(InputStream is) throws IOException {
        if (is == null) return "";
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
        is.close();
        return bo.toString("UTF-8");
    }

    public class Bridge {
        @JavascriptInterface
        public void share(String texto) {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("text/plain");
            i.putExtra(Intent.EXTRA_TEXT, texto);
            startActivity(Intent.createChooser(i, "Salvar / compartilhar JSON"));
        }

        // HTTP feito aqui (e nao no WebView) para nao depender de CORS. A resposta volta em window.__resp(id, status, texto).
        @JavascriptInterface
        public void request(final String id, final String method, final String url, final String headersJson, final String body) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    int status = 0;
                    String resp = "";
                    try {
                        // so rede local (dev no Pi) e HTTPS (producao)
                        if (!(url.startsWith("https://") || url.startsWith("http://192.168."))) {
                            throw new IOException("endereco nao permitido");
                        }
                        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                        c.setRequestMethod(method);
                        c.setConnectTimeout(12000);
                        c.setReadTimeout(30000);
                        JSONObject h = new JSONObject(headersJson);
                        Iterator<String> it = h.keys();
                        while (it.hasNext()) {
                            String k = it.next();
                            c.setRequestProperty(k, h.getString(k));
                        }
                        if (body != null && body.length() > 0 && !"GET".equals(method)) {
                            c.setDoOutput(true);
                            OutputStream os = c.getOutputStream();
                            os.write(body.getBytes("UTF-8"));
                            os.close();
                        }
                        status = c.getResponseCode();
                        resp = ler(status >= 400 ? c.getErrorStream() : c.getInputStream());
                        c.disconnect();
                    } catch (Exception e) {
                        status = 0;
                        resp = String.valueOf(e.getMessage());
                    }
                    final int st = status;
                    final String rs = resp;
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            wv.evaluateJavascript("window.__resp(" + JSONObject.quote(id) + "," + st + "," + JSONObject.quote(rs) + ")", null);
                        }
                    });
                }
            }).start();
        }
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        wv = new WebView(this);
        setContentView(wv);
        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        wv.addJavascriptInterface(new Bridge(), "Android");
        // importacao pelo adb: am start -n com.alan.compras/.MainActivity --es b64 <json em base64>
        String b64 = getIntent().getStringExtra("b64");
        if (b64 != null) {
            try {
                importar = new String(Base64.decode(b64, Base64.DEFAULT), "UTF-8");
            } catch (Exception e) {
                importar = null;
            }
        }
        wv.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView v, String u) {
                Log.d("compras", "pagina carregada; importar=" + (importar == null ? "nao" : importar.length() + " bytes"));
                if (importar != null) {
                    v.evaluateJavascript("window.importarExterno&&window.importarExterno(" + JSONObject.quote(importar) + ")", null);
                    importar = null;
                }
            }
        });
        wv.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                Log.d("compras-js", m.message() + " (" + m.lineNumber() + ")");
                return true;
            }
            @Override
            public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> c, FileChooserParams p) {
                if (cb != null) cb.onReceiveValue(null);
                cb = c;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(i, "Escolha o JSON"), 1);
                } catch (Exception e) {
                    cb = null;
                    return false;
                }
                return true;
            }
        });
        wv.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onActivityResult(int rq, int rs, Intent d) {
        if (rq == 1 && cb != null) {
            Uri[] r = null;
            if (rs == RESULT_OK && d != null && d.getData() != null) r = new Uri[]{d.getData()};
            cb.onReceiveValue(r);
            cb = null;
        }
    }

    @Override
    public void onBackPressed() {
        wv.evaluateJavascript("(window.voltar?window.voltar():false)", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String v) {
                if (!"true".equals(v)) finish();
            }
        });
    }
}
