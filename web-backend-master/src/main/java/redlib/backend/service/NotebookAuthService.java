package redlib.backend.service;

import redlib.backend.model.Token;

public interface NotebookAuthService {
    Token login(String username, String password, String ipAddress, String userAgent);

    Integer register(String username, String password, String confirmPassword, Boolean agreeToTerms);

    Token currentUser();

    Token changeNotebookId(String newNotebookId, String password);

    void verifyCurrentPassword(String password);

    void changePassword(String oldPassword, String newPassword, String confirmNewPassword);
}
