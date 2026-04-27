package redlib.backend.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("note_category")
public class NotebookNoteCategory {
    @TableId(type = IdType.AUTO)
    private Integer id;

    @TableField("note_id")
    private Integer noteId;

    @TableField("category_id")
    private Integer categoryId;
}
