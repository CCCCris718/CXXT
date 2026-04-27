package redlib.backend.dto;

import lombok.Data;

@Data
public class NotebookTranslateRequestDTO {
    private Integer noteId;
    private String text;
    private String sourceLanguage;
    private String targetLanguage;
}
