package redlib.backend.dto;

import lombok.Data;

@Data
public class NotebookSummarizeRequestDTO {
    private Integer noteId;
    private String text;
    private Integer maxLength;
}
