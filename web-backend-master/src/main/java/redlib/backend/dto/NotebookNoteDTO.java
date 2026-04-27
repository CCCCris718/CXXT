package redlib.backend.dto;

import lombok.Data;

import java.util.List;

@Data
public class NotebookNoteDTO {
    private Integer id;
    private String title;
    private String content;
    private String richContent;
    private List<Integer> categoryIds;
    /** 为 null 表示更新时不改收藏状态 */
    private Boolean favorite;
}
