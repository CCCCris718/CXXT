package redlib.backend.vo;

import lombok.Data;

import java.util.Date;
import java.util.List;

@Data
public class NotebookNoteVO {
    private Integer id;
    private String title;
    private String content;
    private String richContent;
    private Date createdAt;
    private Date updatedAt;
    private List<NotebookCategoryVO> categories;
    private Boolean favorite;
}
