package redlib.backend.dto;

import lombok.Data;

@Data
public class NotebookRegisterDTO {
    private String username;
    private String password;
    private String confirmPassword;
    private Boolean agreeToTerms;
}
