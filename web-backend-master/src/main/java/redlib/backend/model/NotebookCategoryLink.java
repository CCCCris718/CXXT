package redlib.backend.model;

import lombok.Data;

@Data
public class NotebookCategoryLink {
    private Integer noteId;
    private Integer categoryId;
    private String categoryName;
}
