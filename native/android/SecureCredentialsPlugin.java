package app.noteai.workspace;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.Map;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureCredentials")
public class SecureCredentialsPlugin extends Plugin {
    private static final String KEY_ALIAS = "noteai_secure_credentials_v1";
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String PREFS = "noteai_secure_credentials";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance(KEYSTORE);
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) store.getEntry(KEY_ALIAS, null)).getSecretKey();
        }

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return generator.generateKey();
    }

    private String encrypt(String value) throws Exception {
        byte[] iv = new byte[IV_BYTES];
        new SecureRandom().nextBytes(iv);
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, key(), new GCMParameterSpec(TAG_BITS, iv));
        byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(iv, Base64.NO_WRAP) + "." + Base64.encodeToString(encrypted, Base64.NO_WRAP);
    }

    private String decrypt(String payload) throws Exception {
        int split = payload.indexOf('.');
        if (split <= 0) return "";
        byte[] iv = Base64.decode(payload.substring(0, split), Base64.NO_WRAP);
        byte[] encrypted = Base64.decode(payload.substring(split + 1), Base64.NO_WRAP);
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(TAG_BITS, iv));
        return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
    }

    private String requireKey(PluginCall call) {
        String key = call.getString("key", "").trim();
        if (key.isEmpty()) call.reject("Credential key is required");
        return key;
    }

    @PluginMethod
    public void set(PluginCall call) {
        String name = requireKey(call);
        if (name.isEmpty()) return;
        try {
            String value = call.getString("value", "");
            prefs().edit().putString(name, encrypt(value)).apply();
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to store credential", error);
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String name = requireKey(call);
        if (name.isEmpty()) return;
        try {
            String payload = prefs().getString(name, null);
            JSObject result = new JSObject();
            result.put("value", payload == null ? "" : decrypt(payload));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to read credential", error);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String name = requireKey(call);
        if (name.isEmpty()) return;
        prefs().edit().remove(name).apply();
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        prefs().edit().clear().apply();
        call.resolve();
    }
}
