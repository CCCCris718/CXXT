package redlib.backend.dto;

import lombok.Data;

@Data
public class NotebookChangePasswordDTO {
    private String oldPassword;
    private String newPassword;
    private String confirmNewPassword;
}
