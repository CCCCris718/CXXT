package redlib.backend.utils;

import org.springframework.util.Assert;
import redlib.backend.Constants;
import redlib.backend.model.Token;

public class NotebookSecurityUtils {
    private NotebookSecurityUtils() {
    }

    public static Token currentNotebookToken() {
        Token token = ThreadContextHolder.getToken();
        Assert.isTrue(Constants.ACCOUNT_TYPE_NOTEBOOK_USER.equals(token.getAccountType()), "当前登录账号不是笔记本用户");
        return token;
    }

    public static Integer currentNotebookUserId() {
        return currentNotebookToken().getUserId();
    }
}
