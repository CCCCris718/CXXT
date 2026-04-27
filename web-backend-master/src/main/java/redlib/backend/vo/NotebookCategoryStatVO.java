package redlib.backend.vo;

import lombok.Data;

@Data
public class NotebookCategoryStatVO {
    private Integer categoryId;
    private String categoryName;
    private Long noteCount;
}
