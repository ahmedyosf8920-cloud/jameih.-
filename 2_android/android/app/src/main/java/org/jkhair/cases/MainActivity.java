package org.jkhair.cases;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.ContactsContract;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.View;
import android.view.WindowInsets;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;

public class MainActivity extends Activity {
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int CONTACTS_REQUEST = 1002;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String u = request.getUrl().toString();
                // روابط واتساب والاتصال تُفتح في التطبيقات الخارجية
                if (u.startsWith("https://wa.me/") || u.startsWith("https://api.whatsapp.com/")
                        || u.startsWith("whatsapp:") || u.startsWith("tel:") || u.startsWith("mailto:")) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u)));
                    } catch (Exception e) { }
                    return true;
                }
                return false;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback,
                    FileChooserParams fileChooserParams) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    Intent intent = fileChooserParams.createIntent();
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
            }
        });
        web.addJavascriptInterface(new NativeBridge(), "JKHNative");
        web.loadUrl("file:///android_asset/www/index.html");
        // Android 15 (targetSdk 35) يرسم المحتوى خلف شريط الحالة؛ نضيف حشوة بقدر الشريطين
        web.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets in) {
                v.setPadding(in.getSystemWindowInsetLeft(), in.getSystemWindowInsetTop(),
                        in.getSystemWindowInsetRight(), in.getSystemWindowInsetBottom());
                return in;
            }
        });
        setContentView(web);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (fileCallback == null) return;
            Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            fileCallback.onReceiveValue(results);
            fileCallback = null;
        }
    }


    /** جسر قراءة جهات الاتصال للواجهة (استيراد الأسماء من الهاتف) */
    public class NativeBridge {
        /** طباعة مستند HTML أو حفظه PDF عبر نافذة الطباعة في أندرويد */
        @JavascriptInterface
        public void printHtml(final String html, final String title) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { doPrint(html, title); }
            });
        }

        @JavascriptInterface
        public void requestContacts() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { startContacts(); }
            });
        }
    }

    private final ArrayList<WebView> printViews = new ArrayList<WebView>();

    private void doPrint(String html, String title) {
        while (printViews.size() > 2) { try { printViews.remove(0).destroy(); } catch (Exception e) { } }
        final String name = (title == null || title.length() == 0) ? "مستند" : title;
        final boolean[] done = new boolean[]{false};
        final WebView w = new WebView(this);
        w.getSettings().setAllowFileAccess(true);
        printViews.add(w);
        w.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView v, String url) {
                if (done[0]) return;
                done[0] = true;
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter adapter = v.createPrintDocumentAdapter(name);
                pm.print(name, adapter, new PrintAttributes.Builder().build());
            }
        });
        w.loadDataWithBaseURL("file:///android_asset/www/", html, "text/html", "UTF-8", null);
    }

    private void startContacts() {
        if (Build.VERSION.SDK_INT >= 23
                && checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.READ_CONTACTS}, CONTACTS_REQUEST);
            return;
        }
        sendContacts();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CONTACTS_REQUEST) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) sendContacts();
            else deliverContacts("");
        }
    }

    private void sendContacts() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                String out = "";
                try {
                    JSONArray arr = new JSONArray();
                    Cursor c = getContentResolver().query(
                            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                            new String[]{ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                                    ContactsContract.CommonDataKinds.Phone.NUMBER},
                            null, null, ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC");
                    if (c != null) {
                        while (c.moveToNext()) {
                            JSONObject o = new JSONObject();
                            String n = c.getString(0), p = c.getString(1);
                            o.put("name", n == null ? "" : n);
                            o.put("phone", p == null ? "" : p);
                            arr.put(o);
                        }
                        c.close();
                    }
                    out = Base64.encodeToString(arr.toString().getBytes("UTF-8"), Base64.NO_WRAP);
                } catch (Exception e) {
                    out = "";
                }
                deliverContacts(out);
            }
        }).start();
    }

    private void deliverContacts(final String b64) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (web != null) web.evaluateJavascript("window.__nativeContacts&&window.__nativeContacts('" + b64 + "')", null);
            }
        });
    }

    @Override
    public void onBackPressed() {
        // الرجوع داخل البرنامج فقط ولا يغلق التطبيق
        if (web != null) web.evaluateJavascript("window.__appBack&&window.__appBack()", null);
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
