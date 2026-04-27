package redlib.backend.dto.query;

import lombok.Data;
import lombok.EqualsAndHashCode;

@EqualsAndHashCode(callSuper = true)
@Data
public class NotebookNoteQueryDTO extends PageQueryDTO {
    private String keyword;
    private Integer categoryId;
}
