package redlib.backend.model;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.util.Date;

@Data
@TableName("note")
public class Note {
    @TableId(type = IdType.AUTO)
    private Integer id;
    private String title;
    private String content;
    private Integer categoryId;

    // 自动记录创建时间
    @TableField(fill = FieldFill.INSERT)
    private Date createTime;

    // 自动更新最后更新时间
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Date updateTime;
}
