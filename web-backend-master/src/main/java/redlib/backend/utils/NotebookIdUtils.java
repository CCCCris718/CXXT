package redlib.backend.utils;

import org.springframework.util.StringUtils;

/**
 * Notebook 登录/展示 ID 规则，需与前端 {@code isValidNotebookId} 一致。
 */
public final class NotebookIdUtils {
    private static final int MIN_LEN = 6;
    private static final int MAX_LEN = 20;

    private NotebookIdUtils() {
    }

    public static boolean isValid(String raw) {
        if (!StringUtils.hasText(raw)) {
            return false;
        }
        String s = raw.trim();
        if (s.length() < MIN_LEN || s.length() > MAX_LEN) {
            return false;
        }
        return s.matches("^[a-zA-Z][a-zA-Z0-9_-]{" + (MIN_LEN - 1) + "," + (MAX_LEN - 1) + "}$");
    }
}
