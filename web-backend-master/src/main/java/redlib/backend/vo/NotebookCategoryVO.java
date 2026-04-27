package redlib.backend.vo;

import lombok.Data;

import java.util.Date;

@Data
public class NotebookCategoryVO {
    private Integer id;
    private String name;
    private Date createdAt;
    private Date updatedAt;
}
